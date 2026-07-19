//! Backend del quark Editor (recorte de audio/video) — desktop-only.
//!
//! El modelo de edición es no-destructivo: el frontend mantiene una lista de
//! segmentos a CONSERVAR sobre la duración original y solo acá, al exportar,
//! se procesa el archivo. El motor es **ffmpeg** (el mismo binario que usa el
//! quark Música para descargas): se resuelve primero en el `PATH` del sistema y
//! si no, en `<AppData>/bin/` (donde lo deja el auto-download del quark Música).
//!
//! Comandos:
//!   - `editor_list_songs`: lista los audios de la carpeta de Música (la fuente
//!     principal del editor). Es un acoplamiento SUAVE — toca la carpeta en
//!     disco, no el código del quark Música.
//!   - `editor_import`: copia un archivo externo a `packages/editor/imports/`
//!     para tener una copia de trabajo estable dentro del sandbox de AppData.
//!   - `editor_probe`: duración + si tiene pista de video (ffprobe).
//!   - `editor_suggest_song_dest`: ruta destino "… (editado)" dentro de la
//!     carpeta de Música, para "guardar como copia nueva" de una canción.
//!   - `editor_export`: corta cada segmento y los reconcatena (un solo ffmpeg
//!     con `filter_complex`), escribiendo a un temporal y moviéndolo al destino
//!     (soporta sobrescribir el archivo de entrada).

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[cfg(windows)]
const FFMPEG_BIN: &str = "ffmpeg.exe";
#[cfg(not(windows))]
const FFMPEG_BIN: &str = "ffmpeg";

#[cfg(windows)]
const FFPROBE_BIN: &str = "ffprobe.exe";
#[cfg(not(windows))]
const FFPROBE_BIN: &str = "ffprobe";

/// Extensiones de audio que el editor ofrece desde la carpeta de Música.
const AUDIO_EXTS: &[&str] = &["mp3", "wav", "flac", "ogg", "m4a", "opus"];

// ── Resolución de binarios (espejo del helper de `download.rs`) ───────────────

fn which_in_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("bin");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Resuelve un binario: primero en el `PATH` del sistema, luego en `<AppData>/bin/`
/// (donde lo deja el auto-download del quark Música). `None` = no está instalado.
fn resolve_tool(app: &AppHandle, bin_name: &str) -> Option<PathBuf> {
    if let Some(p) = which_in_path(bin_name) {
        return Some(p);
    }
    let local = bin_dir(app).ok()?.join(bin_name);
    local.exists().then_some(local)
}

fn resolve_ffmpeg(app: &AppHandle) -> Result<PathBuf, String> {
    resolve_tool(app, FFMPEG_BIN).ok_or_else(|| {
        "No se encontró ffmpeg. Instalalo desde el sistema o usá la descarga de Música.".into()
    })
}

fn resolve_ffprobe(app: &AppHandle) -> Result<PathBuf, String> {
    resolve_tool(app, FFPROBE_BIN).ok_or_else(|| {
        "No se encontró ffprobe. Instalalo desde el sistema o usá la descarga de Música.".into()
    })
}

/// Carpeta fija de canciones del quark Música (espejo de `music::songs_dir`).
fn songs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("packages")
        .join("music")
        .join("songs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Carpeta de copias de trabajo del editor (archivos importados de afuera).
fn imports_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("packages")
        .join("editor")
        .join("imports");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Esconde la ventana de consola al spawnear ffmpeg en Windows.
#[cfg(windows)]
fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
fn hide_console(_: &mut Command) {}

/// Sanitiza un nombre de archivo (quita los prohibidos por Windows y trims).
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

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongDto {
    /// Ruta absoluta (la entrada para ffmpeg y la preview).
    path: String,
    /// Nombre visible (stem del archivo).
    name: String,
    /// Extensión en minúscula, sin punto.
    ext: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeDto {
    duration_sec: f64,
    has_video: bool,
}

#[derive(Deserialize)]
pub struct Segment {
    start: f64,
    end: f64,
}

// ── Comandos ──────────────────────────────────────────────────────────────────

/// Lista los audios de la carpeta de Música (recursivo), ordenados por nombre.
#[tauri::command]
pub fn editor_list_songs(app: AppHandle) -> Result<Vec<SongDto>, String> {
    let root = songs_dir(&app)?;
    let mut out: Vec<SongDto> = Vec::new();
    for entry in walkdir::WalkDir::new(&root).into_iter().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        if !AUDIO_EXTS.contains(&ext.as_str()) {
            continue;
        }
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("(sin nombre)")
            .to_string();
        out.push(SongDto {
            path: path.to_string_lossy().into_owned(),
            name,
            ext,
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

/// Copia un archivo externo a la carpeta de imports del editor y devuelve la
/// ruta absoluta de la copia de trabajo (estable dentro de AppData).
#[tauri::command]
pub fn editor_import(app: AppHandle, src_path: String) -> Result<String, String> {
    let src = PathBuf::from(&src_path);
    if !src.is_file() {
        return Err("El archivo no existe.".into());
    }
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .map(sanitize_filename)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "import".into());
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_ascii_lowercase();

    let dir = imports_dir(&app)?;
    let dest = unique_path(&dir, &stem, &ext);
    fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

/// Duración (segundos) y si el archivo tiene pista de video, vía ffprobe.
#[tauri::command]
pub fn editor_probe(app: AppHandle, path: String) -> Result<ProbeDto, String> {
    let ffprobe = resolve_ffprobe(&app)?;
    let mut cmd = Command::new(&ffprobe);
    cmd.args([
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
    ])
    .arg(&path)
    .stdout(Stdio::piped())
    .stderr(Stdio::null());
    hide_console(&mut cmd);

    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("ffprobe no pudo leer el archivo.".into());
    }
    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

    let duration_sec = json
        .get("format")
        .and_then(|f| f.get("duration"))
        .and_then(|d| d.as_str())
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);

    let has_video = json
        .get("streams")
        .and_then(|s| s.as_array())
        .map(|streams| {
            streams.iter().any(|st| {
                st.get("codec_type").and_then(|t| t.as_str()) == Some("video")
                    // Las portadas embebidas aparecen como stream de video con
                    // disposición `attached_pic`: no son una pista real.
                    && st
                        .get("disposition")
                        .and_then(|d| d.get("attached_pic"))
                        .and_then(|v| v.as_i64())
                        != Some(1)
            })
        })
        .unwrap_or(false);

    Ok(ProbeDto {
        duration_sec,
        has_video,
    })
}

/// Ruta destino "… (editado)" dentro de la carpeta de Música, para guardar una
/// canción editada como copia nueva (aparece en Música tras el próximo escaneo).
#[tauri::command]
pub fn editor_suggest_song_dest(app: AppHandle, src_path: String) -> Result<String, String> {
    let src = PathBuf::from(&src_path);
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio")
        .to_string();
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp3")
        .to_ascii_lowercase();
    let dir = songs_dir(&app)?;
    let dest = unique_path(&dir, &format!("{stem} (editado)"), &ext);
    Ok(dest.to_string_lossy().into_owned())
}

/// Corta cada segmento de `src_path` y los reconcatena en `dest_path`.
///
/// Un solo ffmpeg con `filter_complex` (trim + concat) re-encodea, así los
/// cortes son exactos (no dependen de keyframes) y rejuntar tramos del medio
/// "pega" las puntas sin huecos. Escribe a un temporal y lo mueve al destino,
/// lo que permite sobrescribir el propio archivo de entrada.
#[tauri::command]
pub fn editor_export(
    app: AppHandle,
    src_path: String,
    segments: Vec<Segment>,
    dest_path: String,
    has_video: bool,
) -> Result<String, String> {
    if segments.is_empty() {
        return Err("No queda nada para exportar (borraste todo el clip).".into());
    }
    let ffmpeg = resolve_ffmpeg(&app)?;

    let dest = PathBuf::from(&dest_path);
    let parent = dest
        .parent()
        .ok_or_else(|| "Destino inválido.".to_string())?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    let ext = dest
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp3")
        .to_ascii_lowercase();
    // Temporal junto al destino (mismo filesystem → el rename es atómico).
    let tmp = unique_path(parent, ".editor-tmp", &ext);

    let filter = build_filter(&segments, has_video);

    let mut cmd = Command::new(&ffmpeg);
    cmd.arg("-y")
        .args(["-i", &src_path])
        .args(["-filter_complex", &filter]);
    if has_video {
        cmd.args(["-map", "[outv]"]);
    }
    cmd.args(["-map", "[outa]"]).arg(&tmp);
    cmd.stdout(Stdio::null()).stderr(Stdio::piped());
    hide_console(&mut cmd);

    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let _ = fs::remove_file(&tmp);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail: String = stderr.lines().rev().take(4).collect::<Vec<_>>().join(" | ");
        return Err(format!("ffmpeg falló: {tail}"));
    }

    // Mover el temporal al destino (sobrescribe si hace falta).
    fs::rename(&tmp, &dest).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;
    Ok(dest.to_string_lossy().into_owned())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// `filter_complex` que recorta cada segmento y concatena los tramos restantes.
fn build_filter(segments: &[Segment], has_video: bool) -> String {
    let n = segments.len();
    let mut parts = String::new();
    for (i, s) in segments.iter().enumerate() {
        if has_video {
            parts.push_str(&format!(
                "[0:v]trim=start={}:end={},setpts=PTS-STARTPTS[v{i}];",
                s.start, s.end
            ));
        }
        parts.push_str(&format!(
            "[0:a]atrim=start={}:end={},asetpts=PTS-STARTPTS[a{i}];",
            s.start, s.end
        ));
    }
    for i in 0..n {
        if has_video {
            parts.push_str(&format!("[v{i}]"));
        }
        parts.push_str(&format!("[a{i}]"));
    }
    if has_video {
        parts.push_str(&format!("concat=n={n}:v=1:a=1[outv][outa]"));
    } else {
        parts.push_str(&format!("concat=n={n}:v=0:a=1[outa]"));
    }
    parts
}

/// Primer `<dir>/<stem>.<ext>` libre, agregando " (2)", " (3)"… si ya existe.
fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.{ext}"));
    if !first.exists() {
        return first;
    }
    let mut i = 2;
    loop {
        let candidate = dir.join(format!("{stem} ({i}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
        i += 1;
    }
}
