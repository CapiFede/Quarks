//! Backend del quark Música.
//!
//! Dos capas:
//! - **IO de archivos (cross-platform, incluido Android):** escaneo recursivo
//!   con walkdir + tags y portadas con lofty + gestión de archivos (borrar,
//!   renombrar) y de las playlists referenciantes.
//! - **Reproducción (desktop-only):** rodio mantiene un `OutputStream` que es
//!   `!Send`, así que no puede vivir en el estado de Tauri (`Send + Sync`).
//!   La solución es un thread de audio dedicado: posee el stream y el sink
//!   durante toda la vida del proceso y recibe comandos por un canal; el
//!   estado de Tauri solo guarda el `Sender`. En Android la reproducción se
//!   hace en el frontend con `HTMLAudioElement` (ver `packages/quark-music/
//!   src/services/androidPlayer.ts`), por lo que toda esta sección queda
//!   detrás de `#[cfg(not(target_os = "android"))]`.

use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use lofty::config::WriteOptions;
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::prelude::*;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

// Imports usados solo por la capa de reproducción (rodio + audio thread).
#[cfg(not(target_os = "android"))]
use std::fs::File;
#[cfg(not(target_os = "android"))]
use std::io::BufReader;
#[cfg(not(target_os = "android"))]
use std::sync::mpsc::{self, Sender};
#[cfg(not(target_os = "android"))]
use std::sync::Mutex;
#[cfg(not(target_os = "android"))]
use std::thread;
#[cfg(not(target_os = "android"))]
use std::time::Duration;
#[cfg(not(target_os = "android"))]
use tauri::State;

const AUDIO_EXTS: &[&str] = &["mp3", "wav", "flac", "ogg", "m4a"];

/// Carpeta fija de canciones: `<AppData>/Quarks/packages/music/songs`. Cuelga del
/// árbol gestionado del core (carpeta `packages/`), así que sincroniza con Drive.
/// Las playlists referencian tracks por ruta RELATIVA a esta carpeta (portables
/// entre máquinas). Se crea si no existe.
fn songs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("packages")
        .join("music")
        .join("songs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackDto {
    path: String,
    title: String,
    artist: String,
    duration_sec: f64,
}

// ── Thread de audio (desktop-only: rodio no tiene backend Android viable) ─────

#[cfg(not(target_os = "android"))]
enum AudioCmd {
    Play {
        path: PathBuf,
        volume: f32,
        reply: Sender<Result<(), String>>,
    },
    Pause,
    Resume,
    Stop,
    Seek(f64),
    SetVolume(f32),
}

/// Estado de audio gestionado por Tauri: solo el extremo emisor del canal.
#[cfg(not(target_os = "android"))]
pub struct AudioState {
    tx: Mutex<Sender<AudioCmd>>,
}

#[cfg(not(target_os = "android"))]
impl AudioState {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<AudioCmd>();
        thread::spawn(move || audio_thread(rx));
        AudioState { tx: Mutex::new(tx) }
    }

    fn send(&self, cmd: AudioCmd) -> Result<(), String> {
        self.tx
            .lock()
            .map_err(|e| e.to_string())?
            .send(cmd)
            .map_err(|e| e.to_string())
    }
}

#[cfg(not(target_os = "android"))]
fn audio_thread(rx: mpsc::Receiver<AudioCmd>) {
    // `OutputStream` es !Send: vive acá, en su propio thread, toda la vida del
    // proceso. Sin dispositivo de audio el thread termina y los comandos pasan
    // a fallar (canal cerrado), lo que el frontend refleja como error.
    let (_stream, handle) = match rodio::OutputStream::try_default() {
        Ok(v) => v,
        Err(_) => return,
    };
    let mut sink: Option<rodio::Sink> = None;

    while let Ok(cmd) = rx.recv() {
        match cmd {
            AudioCmd::Play {
                path,
                volume: v,
                reply,
            } => {
                let res = build_sink(&handle, &path, v);
                match res {
                    Ok(s) => {
                        if let Some(old) = sink.take() {
                            old.stop();
                        }
                        sink = Some(s);
                        let _ = reply.send(Ok(()));
                    }
                    Err(e) => {
                        let _ = reply.send(Err(e));
                    }
                }
            }
            AudioCmd::Pause => {
                if let Some(s) = &sink {
                    s.pause();
                }
            }
            AudioCmd::Resume => {
                if let Some(s) = &sink {
                    s.play();
                }
            }
            AudioCmd::Stop => {
                if let Some(s) = sink.take() {
                    s.stop();
                }
            }
            AudioCmd::Seek(secs) => {
                if let Some(s) = &sink {
                    let _ = s.try_seek(Duration::from_secs_f64(secs.max(0.0)));
                }
            }
            AudioCmd::SetVolume(v) => {
                if let Some(s) = &sink {
                    s.set_volume(v);
                }
            }
        }
    }
}

#[cfg(not(target_os = "android"))]
fn build_sink(
    handle: &rodio::OutputStreamHandle,
    path: &Path,
    volume: f32,
) -> Result<rodio::Sink, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let decoder = rodio::Decoder::new(BufReader::new(file)).map_err(|e| e.to_string())?;
    let sink = rodio::Sink::try_new(handle).map_err(|e| e.to_string())?;
    sink.set_volume(volume);
    sink.append(decoder);
    Ok(sink)
}

// ── Escaneo de la biblioteca ──────────────────────────────────────────────────

/// `abs`: ruta real en disco (para abrir y leer tags). `rel`: ruta relativa a
/// la carpeta de canciones, que es el id estable y portable del track.
fn read_track(abs: &Path, rel: String) -> TrackDto {
    let filename = abs
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Desconocido")
        .to_string();

    let mut artist: Option<String> = None;
    let mut duration_sec = 0.0_f64;

    if let Ok(tagged) = lofty::read_from_path(abs) {
        duration_sec = tagged.properties().duration().as_secs_f64();
        if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
            artist = tag.artist().map(|s| s.to_string());
        }
    }

    // El título mostrado sale SIEMPRE del nombre de archivo: es lo que el usuario
    // edita al renombrar (`music_rename_track` renombra el archivo) y la fuente de
    // verdad de la biblioteca. No usamos el tag `title` embebido porque las
    // descargas de YouTube traen el título largo del video y renombrar no lo
    // tocaría — además evitamos reescribir el archivo (lofty 0.21 paniquea al
    // truncar campos ID3v1 multibyte).
    TrackDto {
        path: rel,
        title: filename,
        artist: artist.unwrap_or_default(),
        duration_sec,
    }
}

// ── Comandos Tauri ─────────────────────────────────────────────────────────────

/// Ruta absoluta de la carpeta de canciones (la crea si falta). La usa el
/// frontend para abrirla en el explorador.
#[tauri::command]
pub fn music_songs_dir(app: AppHandle) -> Result<String, String> {
    Ok(songs_dir(&app)?.to_string_lossy().to_string())
}

/// Escaneo recursivo de la carpeta fija de canciones. Devuelve cada track con
/// su ruta RELATIVA (normalizada con `/`).
#[tauri::command]
pub fn music_scan(app: AppHandle) -> Result<Vec<TrackDto>, String> {
    let root = songs_dir(&app)?;
    let tracks = WalkDir::new(&root)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| AUDIO_EXTS.contains(&x.to_ascii_lowercase().as_str()))
                .unwrap_or(false)
        })
        .map(|e| {
            let abs = e.path();
            let rel = abs
                .strip_prefix(&root)
                .unwrap_or(abs)
                .to_string_lossy()
                .replace('\\', "/");
            read_track(abs, rel)
        })
        .collect();
    Ok(tracks)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn music_play(
    app: AppHandle,
    state: State<AudioState>,
    path: String,
    volume: f32,
) -> Result<(), String> {
    // `path` viene relativo a la carpeta de canciones; lo resolvemos a absoluto.
    let abs = songs_dir(&app)?.join(path.replace('/', std::path::MAIN_SEPARATOR_STR));
    let (reply_tx, reply_rx) = mpsc::channel();
    state.send(AudioCmd::Play {
        path: abs,
        volume,
        reply: reply_tx,
    })?;
    reply_rx.recv().map_err(|e| e.to_string())?
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn music_pause(state: State<AudioState>) -> Result<(), String> {
    state.send(AudioCmd::Pause)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn music_resume(state: State<AudioState>) -> Result<(), String> {
    state.send(AudioCmd::Resume)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn music_stop(state: State<AudioState>) -> Result<(), String> {
    state.send(AudioCmd::Stop)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn music_seek(state: State<AudioState>, secs: f64) -> Result<(), String> {
    state.send(AudioCmd::Seek(secs))
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn music_set_volume(state: State<AudioState>, v: f32) -> Result<(), String> {
    state.send(AudioCmd::SetVolume(v))
}

// ── Gestión de archivos: borrar, renombrar, portada ────────────────────────────

/// Carpeta de playlists del quark música, hermana de `songs/`. Cuelga del
/// árbol gestionado, así que sincroniza con Drive. Estructura del archivo:
/// `{ "trackPaths": ["a.mp3", "b.mp3", ...] }`.
fn playlists_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("packages")
        .join("music")
        .join("playlists");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Resuelve una ruta RELATIVA del track a su ruta ABSOLUTA, validando que cae
/// dentro de `songs_dir` (evita path traversal: `../etc/passwd`).
fn resolve_track(app: &AppHandle, rel: &str) -> Result<PathBuf, String> {
    let songs = songs_dir(app)?;
    let abs = songs.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
    let canon_songs = songs.canonicalize().map_err(|e| e.to_string())?;
    let canon_abs = abs
        .canonicalize()
        .map_err(|e| format!("no se encontró el archivo: {}", e))?;
    if !canon_abs.starts_with(&canon_songs) {
        return Err("ruta inválida".into());
    }
    Ok(canon_abs)
}

/// Aplica `mutate` a cada `trackPaths` de cada playlist `.json`. Si `mutate`
/// devuelve `Some(new)`, reemplaza por `new`; si devuelve `None`, lo quita.
/// Reescribe el archivo solo si cambió.
fn update_playlists(
    app: &AppHandle,
    mut mutate: impl FnMut(&str) -> PlaylistAction,
) -> Result<(), String> {
    let dir = playlists_dir(app)?;
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let raw = match fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let mut v: serde_json::Value = match serde_json::from_str(&raw) {
            Ok(x) => x,
            Err(_) => continue,
        };
        let Some(arr) = v.get_mut("trackPaths").and_then(|x| x.as_array_mut()) else {
            continue;
        };
        let mut changed = false;
        let mut out: Vec<serde_json::Value> = Vec::with_capacity(arr.len());
        for item in arr.iter() {
            let Some(s) = item.as_str() else {
                out.push(item.clone());
                continue;
            };
            match mutate(s) {
                PlaylistAction::Keep => out.push(item.clone()),
                PlaylistAction::Replace(new) => {
                    if new != s {
                        changed = true;
                    }
                    out.push(serde_json::Value::String(new));
                }
                PlaylistAction::Remove => {
                    changed = true;
                }
            }
        }
        if changed {
            *arr = out;
            let pretty = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
            fs::write(&path, pretty).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

enum PlaylistAction {
    Keep,
    Replace(String),
    Remove,
}

/// Sanitiza un nombre de archivo (sin extensión). Igual criterio que en download.rs.
fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();
    cleaned.trim().trim_end_matches('.').to_string()
}

#[tauri::command]
pub fn music_delete_track(app: AppHandle, path: String) -> Result<(), String> {
    let abs = resolve_track(&app, &path)?;
    fs::remove_file(&abs).map_err(|e| e.to_string())?;
    update_playlists(&app, |p| {
        if p == path {
            PlaylistAction::Remove
        } else {
            PlaylistAction::Keep
        }
    })?;
    Ok(())
}

/// Renombra el archivo del track. Mantiene la extensión y la subcarpeta
/// original. Actualiza todas las playlists que lo referencian. Devuelve la
/// nueva ruta RELATIVA.
#[tauri::command]
pub fn music_rename_track(
    app: AppHandle,
    path: String,
    new_name: String,
) -> Result<String, String> {
    let stem = sanitize_filename(&new_name);
    if stem.is_empty() {
        return Err("Nombre vacío.".into());
    }
    let abs = resolve_track(&app, &path)?;
    let songs = songs_dir(&app)?.canonicalize().map_err(|e| e.to_string())?;
    let parent = abs.parent().ok_or_else(|| "sin carpeta padre".to_string())?;
    let ext = abs
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let new_filename = if ext.is_empty() {
        stem.clone()
    } else {
        format!("{}.{}", stem, ext)
    };
    let new_abs = parent.join(&new_filename);
    if new_abs == abs {
        return Ok(path);
    }
    if new_abs.exists() {
        return Err(format!("Ya existe un archivo con ese nombre."));
    }
    fs::rename(&abs, &new_abs).map_err(|e| e.to_string())?;
    let new_rel = new_abs
        .strip_prefix(&songs)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let target_rel = new_rel.clone();
    update_playlists(&app, |p| {
        if p == path {
            PlaylistAction::Replace(target_rel.clone())
        } else {
            PlaylistAction::Keep
        }
    })?;
    Ok(new_rel)
}

/// Lee la portada embebida en los tags del archivo y la devuelve como data URL
/// (`data:image/jpeg;base64,…`). Devuelve `None` si no hay portada.
#[tauri::command]
pub fn music_get_cover(app: AppHandle, path: String) -> Result<Option<String>, String> {
    let abs = resolve_track(&app, &path)?;
    let tagged = match lofty::read_from_path(&abs) {
        Ok(t) => t,
        Err(_) => return Ok(None),
    };
    let tag = match tagged.primary_tag().or_else(|| tagged.first_tag()) {
        Some(t) => t,
        None => return Ok(None),
    };
    let pic = match tag
        .pictures()
        .iter()
        .find(|p| p.pic_type() == PictureType::CoverFront)
        .or_else(|| tag.pictures().first())
    {
        Some(p) => p,
        None => return Ok(None),
    };
    let mime = pic
        .mime_type()
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| "image/jpeg".into());
    let b64 = base64::engine::general_purpose::STANDARD.encode(pic.data());
    Ok(Some(format!("data:{};base64,{}", mime, b64)))
}

/// Embebe la imagen en `image_path` como portada (CoverFront) del archivo de
/// audio. Reemplaza cualquier portada anterior. Soporta JPG y PNG.
#[tauri::command]
pub fn music_set_cover(
    app: AppHandle,
    path: String,
    image_path: String,
) -> Result<(), String> {
    let abs = resolve_track(&app, &path)?;
    let img_path = Path::new(&image_path);
    if !img_path.exists() {
        return Err("La imagen seleccionada no existe.".into());
    }
    let bytes = fs::read(img_path).map_err(|e| e.to_string())?;
    let mime = match img_path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => MimeType::Png,
        Some("jpg") | Some("jpeg") => MimeType::Jpeg,
        Some("webp") => MimeType::Unknown("image/webp".into()),
        _ => MimeType::Jpeg,
    };
    let picture = Picture::new_unchecked(PictureType::CoverFront, Some(mime), None, bytes);

    let mut tagged = lofty::read_from_path(&abs).map_err(|e| e.to_string())?;
    // Si no hay tag primario, crear uno del tipo correcto para este archivo.
    if tagged.primary_tag_mut().is_none() {
        let tag_type = tagged.primary_tag_type();
        tagged.insert_tag(lofty::tag::Tag::new(tag_type));
    }
    let tag = tagged
        .primary_tag_mut()
        .ok_or_else(|| "no se pudo crear el tag".to_string())?;
    // Quitar portadas anteriores (todas las del tipo CoverFront) y agregar la nueva.
    tag.remove_picture_type(PictureType::CoverFront);
    tag.push_picture(picture);
    tagged
        .save_to_path(&abs, WriteOptions::default())
        .map_err(|e| e.to_string())?;
    Ok(())
}
