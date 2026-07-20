//! Recorte de canciones del quark Música (trim de inicio/fin) — desktop-only.
//!
//! El frontend elige un rango a CONSERVAR sobre la duración original y solo
//! acá, al exportar, se procesa el archivo. El motor es **ffmpeg** (el mismo
//! binario que usan las descargas de Música): se resuelve primero en el `PATH`
//! del sistema y si no, en `<AppData>/bin/` (donde lo deja el auto-download).
//!
//! Comandos:
//!   - `music_trim_probe`: duración exacta del archivo (ffprobe) — es la línea
//!     de tiempo sobre la que ffmpeg corta, puede diferir de la de los tags.
//!   - `music_trim_suggest_dest`: ruta destino "… (editado)" dentro de la
//!     carpeta de canciones, para "guardar como copia".
//!   - `music_trim_export`: corta el rango re-encodeando (corte exacto, no
//!     depende de keyframes), escribe a un temporal y lo mueve al destino —
//!     eso permite sobrescribir el propio archivo de entrada.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use tauri::{AppHandle, Manager};

#[cfg(windows)]
const FFMPEG_BIN: &str = "ffmpeg.exe";
#[cfg(not(windows))]
const FFMPEG_BIN: &str = "ffmpeg";

#[cfg(windows)]
const FFPROBE_BIN: &str = "ffprobe.exe";
#[cfg(not(windows))]
const FFPROBE_BIN: &str = "ffprobe";

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

/// Esconde la ventana de consola al spawnear ffmpeg en Windows.
#[cfg(windows)]
fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
fn hide_console(_: &mut Command) {}

// ── Comandos ──────────────────────────────────────────────────────────────────

/// Duración del archivo en segundos, vía ffprobe.
// `(async)`: corre en el pool de Tauri — sin esto un subproceso bloqueante en
// un `#[tauri::command]` pelado congela la ventana entera (main thread).
#[tauri::command(async)]
pub fn music_trim_probe(app: AppHandle, path: String) -> Result<f64, String> {
    let ffprobe = resolve_ffprobe(&app)?;
    let mut cmd = Command::new(&ffprobe);
    cmd.args(["-v", "quiet", "-print_format", "json", "-show_format"])
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

    Ok(json
        .get("format")
        .and_then(|f| f.get("duration"))
        .and_then(|d| d.as_str())
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0))
}

/// Ruta destino "… (editado)" dentro de la carpeta de canciones, para guardar
/// el recorte como copia nueva (aparece en Música tras el próximo escaneo).
#[tauri::command]
pub fn music_trim_suggest_dest(app: AppHandle, src_path: String) -> Result<String, String> {
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

/// Recorta `src_path` al rango [start, end] y lo escribe en `dest_path`.
///
/// Re-encodea con `atrim` para que el corte sea exacto. Escribe a un temporal
/// y lo mueve al destino, lo que permite sobrescribir el archivo de entrada.
#[tauri::command(async)]
pub fn music_trim_export(
    app: AppHandle,
    src_path: String,
    start: f64,
    end: f64,
    dest_path: String,
) -> Result<String, String> {
    if !(end > start) {
        return Err("El rango a conservar está vacío.".into());
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
    let tmp = unique_path(parent, ".trim-tmp", &ext);

    let filter = format!("[0:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS[outa]");

    let mut cmd = Command::new(&ffmpeg);
    cmd.arg("-y")
        .args(["-i", &src_path])
        .args(["-filter_complex", &filter])
        .args(["-map", "[outa]"])
        .arg(&tmp);
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
