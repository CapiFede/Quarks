//! Rutas dentro de `<AppData>/com.quarks.app/` que comparten los módulos del
//! quark Música (escaneo, descargas, recorte). Cada helper crea la carpeta si
//! falta, así los callers no repiten el `create_dir_all`.
//!
//! Qué sincroniza con Drive y qué no lo decide el core (allowlist `settings.json`
//! + `packages/` + `quarky/`): `songs/` y `playlists/` cuelgan de `packages/music/`
//! y sincronizan; `bin/` y `tmp/` quedan device-local a propósito.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// `<AppData>/<parts...>`, creada si no existe.
fn app_subdir(app: &AppHandle, parts: &[&str]) -> Result<PathBuf, String> {
    let mut dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    for p in parts {
        dir.push(p);
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Carpeta fija de canciones. Las playlists referencian tracks por ruta
/// RELATIVA a esta carpeta (portables entre máquinas).
pub fn songs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app_subdir(app, &["packages", "music", "songs"])
}

/// Un JSON por playlist: `{ "trackPaths": ["a.mp3", "b.mp3", ...] }`.
pub fn playlists_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app_subdir(app, &["packages", "music", "playlists"])
}

/// Binarios auto-descargados (yt-dlp, ffmpeg). Device-local.
#[cfg(not(target_os = "android"))]
pub fn bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app_subdir(app, &["bin"])
}

/// Intermedios de yt-dlp (`.part`, `.webm`, el audio antes de convertir). A
/// propósito NO en `songs/`: esa carpeta sincroniza y `music_scan` la barre, así
/// que un crash a mitad de descarga dejaba basura en la biblioteca. Tampoco en
/// `/tmp`: en varias distros es tmpfs (RAM).
#[cfg(not(target_os = "android"))]
pub fn tmp_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app_subdir(app, &["tmp"])
}

/// Sanitiza un nombre de archivo (solo el stem, sin extensión): reemplaza los
/// caracteres prohibidos por Windows y recorta espacios/puntos al final.
pub fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();
    cleaned.trim().trim_end_matches('.').to_string()
}
