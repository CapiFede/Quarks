//! Descarga de música desde URLs (YouTube y otros sitios soportados por yt-dlp).
//!
//! Orquesta dos binarios externos descargados en runtime a `<AppData>/Quarks/bin/`
//! (device-local, NO sincroniza con Drive — son binarios de plataforma):
//!  - **yt-dlp.exe**: descarga + extrae audio.
//!  - **ffmpeg.exe** / **ffprobe.exe**: conversión a MP3 y normalización loudnorm.
//!
//! Diseño de comandos: bloqueantes (Tauri los corre en su pool sin congelar UI).
//! El error vuelve por `Result<_, String>` (convención del repo). El progreso
//! vuelve por `Channel` para que el frontend lo pinte en vivo.
//!
//! Detección de archivos creados: usamos `--print "after_move:filepath"` de
//! yt-dlp, que dispara DESPUÉS del postprocesado y movimiento al destino final
//! — devuelve la ruta absoluta DEFINITIVA del `.mp3`, mucho más robusto que
//! parsear el output humano `[ExtractAudio] Destination:` que cambia entre
//! versiones.
//!
//! **Cross-platform (Windows / Linux / macOS).** Resolución de binarios
//! híbrida: primero buscamos `yt-dlp`/`ffmpeg` en el `PATH` del sistema (lo
//! normal en Linux/macOS, donde vienen del gestor de paquetes), y si no están
//! caemos a `<AppData>/Quarks/bin/` donde el setup los auto-descarga. Así
//! "abrir y usar" sigue funcionando sin instalar nada, pero respetamos los
//! binarios del sistema cuando existen (más actualizados, menos disco).

use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

// ── Constantes de plataforma ──────────────────────────────────────────────────
//
// Nombres de los ejecutables (con `.exe` solo en Windows) y URLs de las builds
// oficiales que el setup auto-descarga cuando faltan en el sistema:
//   - yt-dlp: binario único por plataforma (Releases de yt-dlp/yt-dlp).
//   - ffmpeg: Windows = zip de BtbN; Linux = tar.xz estático de John Van
//     Sickle; macOS = zips por binario de evermeet.cx.

#[cfg(windows)]
const YTDLP_BIN: &str = "yt-dlp.exe";
#[cfg(windows)]
const FFMPEG_BIN: &str = "ffmpeg.exe";
#[cfg(windows)]
const FFPROBE_BIN: &str = "ffprobe.exe";

#[cfg(not(windows))]
const YTDLP_BIN: &str = "yt-dlp";
#[cfg(not(windows))]
const FFMPEG_BIN: &str = "ffmpeg";
#[cfg(not(windows))]
const FFPROBE_BIN: &str = "ffprobe";

#[cfg(windows)]
const YTDLP_URL: &str = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
#[cfg(windows)]
const FFMPEG_URL: &str =
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";

#[cfg(target_os = "linux")]
const YTDLP_URL: &str = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
#[cfg(target_os = "linux")]
const FFMPEG_URL: &str =
    "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz";

#[cfg(target_os = "macos")]
const YTDLP_URL: &str = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";
#[cfg(target_os = "macos")]
const FFMPEG_URL: &str = "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip";
#[cfg(target_os = "macos")]
const FFPROBE_URL: &str = "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip";

// ── Helpers de rutas ──────────────────────────────────────────────────────────

/// `<AppData>/Quarks/bin/`. Device-local (no sincroniza con Drive: el motor
/// solo espeja `settings.json` + `spaces/` + `packages/`).
fn bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("bin");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Mini-`which`: busca `name` en el `PATH` del sistema. Lo usamos para preferir
/// los binarios del gestor de paquetes (Linux/macOS) antes que los descargados.
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

/// Resuelve un binario de música: primero en el `PATH` del sistema, luego en
/// `<AppData>/Quarks/bin/` (donde lo deja el auto-download). `None` = no está.
fn resolve_tool(app: &AppHandle, bin_name: &str) -> Option<PathBuf> {
    if let Some(p) = which_in_path(bin_name) {
        return Some(p);
    }
    let local = bin_dir(app).ok()?.join(bin_name);
    local.exists().then_some(local)
}

fn resolve_ytdlp(app: &AppHandle) -> Option<PathBuf> {
    resolve_tool(app, YTDLP_BIN)
}

fn resolve_ffmpeg(app: &AppHandle) -> Option<PathBuf> {
    resolve_tool(app, FFMPEG_BIN)
}

/// Carpeta fija de canciones (espejo de `music::songs_dir`, copiada acá para
/// evitar exponer un helper crate-internal). Vive en el árbol gestionado del
/// core, así que sincroniza.
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

/// Esconde la ventana de consola al spawnear procesos hijos en Windows.
#[cfg(windows)]
fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
fn hide_console(_: &mut Command) {}

/// Limpia del entorno del proceso hijo las variables que inyecta el `AppRun` de
/// la AppImage (`PYTHONHOME`, `PYTHONPATH`, `LD_LIBRARY_PATH`, etc.), que apuntan
/// al mount `/tmp/.mount_…`. Sin esto, al spawnear `/usr/bin/yt-dlp` (un script
/// `#!/usr/bin/python`) el Python del sistema hereda un `PYTHONHOME` inválido, no
/// encuentra su stdlib y crashea con `<no Python frame>`. yt-dlp y ffmpeg deben
/// correr con el entorno del sistema, no con el de la AppImage. No-op fuera de la
/// AppImage (las vars no existen).
fn clean_child_env(cmd: &mut Command) {
    const APPIMAGE_VARS: &[&str] = &[
        "PYTHONHOME",
        "PYTHONPATH",
        "LD_LIBRARY_PATH",
        "LD_PRELOAD",
        "GTK_PATH",
        "GST_PLUGIN_SYSTEM_PATH",
        "GST_PLUGIN_PATH",
        "QT_PLUGIN_PATH",
        "GDK_PIXBUF_MODULE_FILE",
        "GDK_PIXBUF_MODULEDIR",
        "GI_TYPELIB_PATH",
        "GSETTINGS_SCHEMA_DIR",
        "PERLLIB",
    ];
    for var in APPIMAGE_VARS {
        cmd.env_remove(var);
    }
}

/// Sanitiza un nombre de archivo (solo el stem, sin extensión). Quita los
/// caracteres prohibidos por Windows y trims de espacios/puntos al final.
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

// ── HTTP: descarga a archivo con progreso ──────────────────────────────────────

/// Descarga `url` a `dest` reportando `pct` (0..1) por `on_pct`. Sigue
/// redirects (ureq lo hace por defecto). Si la respuesta no tiene
/// `Content-Length`, reporta `pct` indeterminado (siempre 0.0) hasta el final.
fn download_file(url: &str, dest: &Path, mut on_pct: impl FnMut(f64)) -> Result<(), String> {
    let resp = ureq::get(url).call().map_err(|e| e.to_string())?;
    let total: Option<u64> = resp
        .header("Content-Length")
        .and_then(|v| v.parse::<u64>().ok());

    let mut reader = resp.into_reader();
    let mut file = File::create(dest).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 64 * 1024];
    let mut read_total: u64 = 0;
    let mut last_pct = -1.0_f64;

    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        read_total += n as u64;

        if let Some(t) = total {
            let p = (read_total as f64 / t as f64).clamp(0.0, 1.0);
            // throttle: reporta cada cambio de 0.5%
            if p - last_pct >= 0.005 || p >= 1.0 {
                last_pct = p;
                on_pct(p);
            }
        }
    }
    Ok(())
}

/// En Unix marca el archivo como ejecutable (0o755). yt-dlp y los binarios de
/// ffmpeg vienen sin el bit `+x` al descargarlos por HTTP. No-op en Windows.
#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path).map_err(|e| e.to_string())?.permissions();
    perms.set_mode(0o755);
    fs::set_permissions(path, perms).map_err(|e| e.to_string())
}
#[cfg(not(unix))]
fn set_executable(_: &Path) -> Result<(), String> {
    Ok(())
}

/// Extrae de un zip SOLO las entradas cuyo `file_name()` final coincide con
/// alguno de `wanted`, aplanándolas a `dest_dir`. Los zips de BtbN/evermeet
/// tienen una carpeta interna con versión variable, por eso filtramos por
/// nombre final. Marca lo extraído como ejecutable (no-op en Windows).
#[cfg(not(target_os = "linux"))]
fn extract_named(zip_path: &Path, dest_dir: &Path, wanted: &[&str]) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let name = match entry.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => continue,
        };
        let base = match name.file_name().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => continue,
        };
        if !wanted.iter().any(|w| *w == base) {
            continue;
        }
        let out_path = dest_dir.join(base);
        let mut out = File::create(&out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        set_executable(&out_path)?;
    }
    Ok(())
}

/// Variante para Linux: el ffmpeg estático de John Van Sickle viene como
/// `.tar.xz` con una carpeta `ffmpeg-<ver>-amd64-static/` adentro. Descomprime
/// xz (pure-Rust, `lzma-rs`) a memoria y extrae del tar SOLO las entradas cuyo
/// nombre final está en `wanted`, aplanándolas a `dest_dir` y marcándolas `+x`.
#[cfg(target_os = "linux")]
fn extract_named(xz_path: &Path, dest_dir: &Path, wanted: &[&str]) -> Result<(), String> {
    let file = File::open(xz_path).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(file);
    let mut tar_bytes: Vec<u8> = Vec::new();
    lzma_rs::xz_decompress(&mut reader, &mut tar_bytes).map_err(|e| e.to_string())?;

    let mut archive = tar::Archive::new(std::io::Cursor::new(tar_bytes));
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?.into_owned();
        let base = match path.file_name().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => continue,
        };
        if !wanted.iter().any(|w| *w == base) {
            continue;
        }
        let out_path = dest_dir.join(base);
        let mut out = File::create(&out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        set_executable(&out_path)?;
    }
    Ok(())
}

// ── Estado de binarios ─────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolsStatus {
    yt_dlp: bool,
    ffmpeg: bool,
    ready: bool,
}

#[tauri::command]
pub fn music_tools_status(app: AppHandle) -> Result<ToolsStatus, String> {
    let yt = resolve_ytdlp(&app).is_some();
    let ff = resolve_ffmpeg(&app).is_some();
    Ok(ToolsStatus {
        yt_dlp: yt,
        ffmpeg: ff,
        ready: yt && ff,
    })
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "phase")]
pub enum SetupProgress {
    Started,
    Tool { name: String, pct: f64 },
    Done,
}

/// Descarga yt-dlp y ffmpeg si faltan (tanto en `PATH` como en el bin local).
/// El error sale por `Result`; el progreso por `Channel`. Bloqueante: corre en
/// el pool de Tauri. Cross-platform: cada plataforma resuelve su URL/formato en
/// los helpers `download_ytdlp`/`download_ffmpeg`.
#[tauri::command]
pub fn music_tools_setup(app: AppHandle, on: Channel<SetupProgress>) -> Result<(), String> {
    let _ = on.send(SetupProgress::Started);

    let bin = bin_dir(&app)?;

    // Solo descargamos lo que no esté ya disponible (sistema o bin local).
    if resolve_ytdlp(&app).is_none() {
        download_ytdlp(&bin, &on)?;
    }
    if resolve_ffmpeg(&app).is_none() {
        download_ffmpeg(&bin, &on)?;
    }

    let _ = on.send(SetupProgress::Done);
    Ok(())
}

/// yt-dlp es un binario único por plataforma (la URL ya está cfg-eada). Lo
/// bajamos al bin local y lo marcamos ejecutable (no-op en Windows).
fn download_ytdlp(bin: &Path, on: &Channel<SetupProgress>) -> Result<(), String> {
    let dest = bin.join(YTDLP_BIN);
    let on_clone = on.clone();
    download_file(YTDLP_URL, &dest, move |p| {
        let _ = on_clone.send(SetupProgress::Tool {
            name: "yt-dlp".into(),
            pct: p,
        });
    })?;
    set_executable(&dest)?;
    Ok(())
}

/// ffmpeg en Windows (zip de BtbN) y Linux (tar.xz de John Van Sickle) viene
/// como un único archivo con ffmpeg + ffprobe adentro: bajamos, extraemos los
/// dos por nombre y limpiamos el archivo intermedio.
#[cfg(not(target_os = "macos"))]
fn download_ffmpeg(bin: &Path, on: &Channel<SetupProgress>) -> Result<(), String> {
    let archive = bin.join("ffmpeg-dl.archive");
    let on_clone = on.clone();
    download_file(FFMPEG_URL, &archive, move |p| {
        let _ = on_clone.send(SetupProgress::Tool {
            name: "ffmpeg".into(),
            pct: p,
        });
    })?;
    let _ = on.send(SetupProgress::Tool {
        name: "extracting".into(),
        pct: 1.0,
    });
    extract_named(&archive, bin, &[FFMPEG_BIN, FFPROBE_BIN])?;
    let _ = fs::remove_file(&archive);
    if !bin.join(FFMPEG_BIN).exists() {
        return Err("No se encontró ffmpeg dentro del paquete descargado.".into());
    }
    Ok(())
}

/// macOS: evermeet.cx entrega un zip por binario (ffmpeg y ffprobe separados),
/// así que bajamos y extraemos cada uno por su lado.
#[cfg(target_os = "macos")]
fn download_ffmpeg(bin: &Path, on: &Channel<SetupProgress>) -> Result<(), String> {
    for (url, bin_name) in [(FFMPEG_URL, FFMPEG_BIN), (FFPROBE_URL, FFPROBE_BIN)] {
        let zip_path = bin.join(format!("{bin_name}-dl.zip"));
        let on_clone = on.clone();
        let label = bin_name.to_string();
        download_file(url, &zip_path, move |p| {
            let _ = on_clone.send(SetupProgress::Tool {
                name: label.clone(),
                pct: p,
            });
        })?;
        extract_named(&zip_path, bin, &[bin_name])?;
        let _ = fs::remove_file(&zip_path);
    }
    if !bin.join(FFMPEG_BIN).exists() {
        return Err("No se encontró ffmpeg dentro del paquete descargado.".into());
    }
    Ok(())
}

// ── Probe (yt-dlp -J) ──────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    title: String,
    thumbnail: Option<String>,
    is_playlist: bool,
    count: u32,
    duration_sec: Option<f64>,
    uploader: Option<String>,
}

#[tauri::command]
pub fn music_probe_url(app: AppHandle, url: String) -> Result<ProbeResult, String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("URL vacía.".into());
    }
    let yt = resolve_ytdlp(&app).ok_or("yt-dlp no está instalado.")?;

    let mut cmd = Command::new(&yt);
    cmd.args([
        "--dump-single-json",
        "--flat-playlist",
        "--no-warnings",
        "--no-call-home",
        url,
    ]);
    hide_console(&mut cmd);
    clean_child_env(&mut cmd);

    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.lines().last().unwrap_or("yt-dlp falló").to_string();
        return Err(msg);
    }

    let v: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

    let is_playlist = v.get("_type").and_then(|x| x.as_str()) == Some("playlist");

    if is_playlist {
        let entries = v.get("entries").and_then(|x| x.as_array());
        let count = entries.map(|a| a.len() as u32).unwrap_or(0);
        let title = v
            .get("title")
            .and_then(|x| x.as_str())
            .unwrap_or("Playlist")
            .to_string();
        let thumbnail = pick_thumbnail(&v).or_else(|| entries.and_then(|a| a.first()).and_then(pick_thumbnail));
        let uploader = v
            .get("uploader")
            .and_then(|x| x.as_str())
            .map(str::to_string);
        Ok(ProbeResult {
            title,
            thumbnail,
            is_playlist: true,
            count,
            duration_sec: None,
            uploader,
        })
    } else {
        let title = v
            .get("title")
            .and_then(|x| x.as_str())
            .unwrap_or("Sin título")
            .to_string();
        let thumbnail = pick_thumbnail(&v);
        let duration_sec = v.get("duration").and_then(|x| x.as_f64());
        let uploader = v
            .get("uploader")
            .and_then(|x| x.as_str())
            .map(str::to_string);
        Ok(ProbeResult {
            title,
            thumbnail,
            is_playlist: false,
            count: 1,
            duration_sec,
            uploader,
        })
    }
}

/// Elige la thumbnail de mayor resolución del JSON de yt-dlp (campo `thumbnails`
/// es un array de objetos `{url, width?, height?}`; fallback al campo `thumbnail`).
fn pick_thumbnail(v: &serde_json::Value) -> Option<String> {
    if let Some(arr) = v.get("thumbnails").and_then(|x| x.as_array()) {
        let best = arr
            .iter()
            .filter_map(|t| {
                let u = t.get("url").and_then(|x| x.as_str())?;
                let w = t.get("width").and_then(|x| x.as_u64()).unwrap_or(0);
                Some((w, u.to_string()))
            })
            .max_by_key(|(w, _)| *w);
        if let Some((_, u)) = best {
            return Some(u);
        }
    }
    v.get("thumbnail")
        .and_then(|x| x.as_str())
        .map(str::to_string)
}

// ── Download ───────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOpts {
    url: String,
    custom_name: Option<String>,
    normalize: bool,
    /// `true` si el probe detectó playlist (para elegir `--yes-playlist` vs `--no-playlist`).
    is_playlist: bool,
    /// Si `true`, embebe la miniatura del video como portada (ID3v2 APIC) del MP3.
    embed_thumbnail: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "phase")]
pub enum DownloadProgress {
    Item {
        index: u32,
        total: u32,
        title: String,
    },
    Progress {
        pct: f64,
        speed: Option<String>,
        eta: Option<String>,
    },
    Converting,
    Saved {
        rel_path: String,
    },
    Done {
        rel_paths: Vec<String>,
    },
}

#[tauri::command]
pub fn music_download(
    app: AppHandle,
    opts: DownloadOpts,
    on: Channel<DownloadProgress>,
) -> Result<Vec<String>, String> {
    let yt = resolve_ytdlp(&app).ok_or("yt-dlp no está instalado.")?;
    let ffmpeg = resolve_ffmpeg(&app).ok_or("ffmpeg no está instalado.")?;
    // `--ffmpeg-location` quiere la CARPETA que contiene ffmpeg/ffprobe; puede
    // ser la del sistema (`/usr/bin`) o el bin local del auto-download.
    let ffmpeg_dir = ffmpeg
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| bin_dir(&app).unwrap_or_default());
    let songs = songs_dir(&app)?;
    if opts.url.trim().is_empty() {
        return Err("URL vacía.".into());
    }

    // Plantilla de salida: archivo directo en songs_dir.
    // Para video único con nombre custom, fijamos el stem; si no, %(title)s.
    let output_template = if !opts.is_playlist {
        let stem = opts
            .custom_name
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(sanitize_filename);
        match stem {
            Some(s) if !s.is_empty() => format!("{}/{}.%(ext)s", songs.to_string_lossy(), s),
            _ => format!("{}/%(title)s.%(ext)s", songs.to_string_lossy()),
        }
    } else {
        format!("{}/%(title)s.%(ext)s", songs.to_string_lossy())
    };

    let mut cmd = Command::new(&yt);
    cmd.args([
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "--ffmpeg-location",
    ])
    .arg(&ffmpeg_dir)
    .args(["-o", &output_template])
    .args([
        "--newline",
        "--no-warnings",
        "--no-call-home",
        "--ignore-errors",
        "--no-abort-on-error",
    ])
    .args([
        "--progress-template",
        "download:DLPCT %(progress._percent_str)s SPEED %(progress._speed_str)s ETA %(progress._eta_str)s",
    ])
    .args([
        "--print",
        "before_dl:ITEM %(playlist_index|1)s/%(n_entries|1)s %(title)s",
    ])
    .args(["--print", "after_move:SAVED %(filepath)s"]);

    if opts.is_playlist {
        cmd.arg("--yes-playlist");
    } else {
        cmd.arg("--no-playlist");
    }

    if opts.normalize {
        // Scopeado a `ExtractAudio`: si pasáramos `ffmpeg:…` (todos los PP),
        // yt-dlp aplicaría `-af loudnorm` también al embedder de thumbnail
        // (que procesa un JPG, no audio) → "Postprocessing: Error opening
        // output files: Invalid argument".
        cmd.args([
            "--postprocessor-args",
            "ExtractAudio:-af loudnorm=I=-16:TP=-1.5:LRA=11",
        ]);
    }

    if opts.embed_thumbnail {
        // `--convert-thumbnails jpg` fuerza conversión (YT entrega webp por
        // defecto y el embedder de ID3 quiere jpg/png). `--add-metadata` deja
        // los tags básicos por si la fuente los trae.
        cmd.args([
            "--embed-thumbnail",
            "--convert-thumbnails",
            "jpg",
            "--add-metadata",
        ]);
    }

    cmd.arg(&opts.url);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    hide_console(&mut cmd);
    clean_child_env(&mut cmd);

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "no se pudo capturar stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "no se pudo capturar stderr".to_string())?;

    // Drena stderr en un thread para no bloquear el pipe.
    let stderr_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let stderr_clone = Arc::clone(&stderr_buf);
    let stderr_thread = thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            if let Ok(mut buf) = stderr_clone.lock() {
                buf.push_str(&line);
                buf.push('\n');
            }
        }
    });

    let mut rel_paths: Vec<String> = Vec::new();

    let reader = BufReader::new(stdout);
    for raw in reader.lines().map_while(Result::ok) {
        let line = raw.trim_end();
        if let Some(rest) = line.strip_prefix("DLPCT ") {
            if let Some((pct, speed, eta)) = parse_progress(rest) {
                let _ = on.send(DownloadProgress::Progress { pct, speed, eta });
            }
        } else if let Some(rest) = line.strip_prefix("ITEM ") {
            if let Some((index, total, title)) = parse_item(rest) {
                let _ = on.send(DownloadProgress::Item {
                    index,
                    total,
                    title,
                });
            }
        } else if let Some(rest) = line.strip_prefix("SAVED ") {
            // `Path::strip_prefix` puede fallar por mezcla de separadores `/`
            // vs `\` o por diferencias de case en Windows entre lo que devuelve
            // app_data_dir() y lo que imprime yt-dlp. Comparamos a mano sobre
            // strings normalizados; con fallback al nombre del archivo (válido
            // porque nuestro output template no crea subcarpetas).
            let songs_norm = songs.to_string_lossy().replace('\\', "/");
            let abs_norm = rest.replace('\\', "/");
            let rel = if abs_norm
                .to_lowercase()
                .starts_with(&songs_norm.to_lowercase())
            {
                abs_norm[songs_norm.len()..]
                    .trim_start_matches('/')
                    .to_string()
            } else {
                Path::new(rest)
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or(rest)
                    .to_string()
            };
            rel_paths.push(rel.clone());
            let _ = on.send(DownloadProgress::Saved { rel_path: rel });
        } else if line.starts_with("[ExtractAudio]")
            || line.starts_with("[Metadata]")
            || line.starts_with("[ffmpeg]")
        {
            let _ = on.send(DownloadProgress::Converting);
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    let _ = stderr_thread.join();

    if !status.success() && rel_paths.is_empty() {
        let err = stderr_buf.lock().map(|s| s.clone()).unwrap_or_default();
        let msg = err
            .lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("yt-dlp falló")
            .to_string();
        return Err(msg);
    }

    let _ = on.send(DownloadProgress::Done {
        rel_paths: rel_paths.clone(),
    });
    Ok(rel_paths)
}

/// Parsea `" 42.0% SPEED  1.20MiB/s ETA 00:30"` → (0.42, Some("1.20MiB/s"), Some("00:30")).
fn parse_progress(s: &str) -> Option<(f64, Option<String>, Option<String>)> {
    // Formato emitido por nuestro `--progress-template`:
    //   "<pct_str> SPEED <speed_str> ETA <eta_str>"
    // donde `_percent_str` ya incluye '%'. Hacemos un split tolerante.
    let mut pct: Option<f64> = None;
    let mut speed: Option<String> = None;
    let mut eta: Option<String> = None;

    // primer token = pct
    let mut parts = s.splitn(2, " SPEED ");
    let pct_str = parts.next()?.trim();
    let rest = parts.next().unwrap_or("");
    let pct_val = pct_str
        .trim_end_matches('%')
        .trim()
        .parse::<f64>()
        .ok()
        .map(|v| (v / 100.0).clamp(0.0, 1.0));
    if let Some(p) = pct_val {
        pct = Some(p);
    }

    let mut parts = rest.splitn(2, " ETA ");
    if let Some(sp) = parts.next() {
        let sp = sp.trim();
        if !sp.is_empty() && sp != "N/A" {
            speed = Some(sp.to_string());
        }
    }
    if let Some(et) = parts.next() {
        let et = et.trim();
        if !et.is_empty() && et != "N/A" {
            eta = Some(et.to_string());
        }
    }

    pct.map(|p| (p, speed, eta))
}

/// Parsea `"3/12 Some Song Title"` → (3, 12, "Some Song Title").
fn parse_item(s: &str) -> Option<(u32, u32, String)> {
    let mut sp = s.splitn(2, ' ');
    let nums = sp.next()?;
    let title = sp.next().unwrap_or("").trim().to_string();
    let mut np = nums.splitn(2, '/');
    let index: u32 = np.next()?.parse().ok()?;
    let total: u32 = np.next()?.parse().ok()?;
    Some((index, total, title))
}
