//! Binarios externos del quark Música (yt-dlp, ffmpeg, ffprobe) — desktop-only.
//! Dónde se buscan y cómo se spawnean; lo comparten `download.rs` y `trim.rs`.
//!
//! Asimetría a propósito: ffmpeg/ffprobe se aceptan del `PATH` del sistema (son
//! estables), yt-dlp sale SIEMPRE del bin propio porque es el único que hay que
//! mantener actualizado (ver el doc de `download.rs`).

use std::path::PathBuf;
use std::process::Command;

use tauri::AppHandle;

use crate::paths::bin_dir;

#[cfg(windows)]
pub const YTDLP_BIN: &str = "yt-dlp.exe";
#[cfg(windows)]
pub const FFMPEG_BIN: &str = "ffmpeg.exe";
#[cfg(windows)]
pub const FFPROBE_BIN: &str = "ffprobe.exe";

#[cfg(not(windows))]
pub const YTDLP_BIN: &str = "yt-dlp";
#[cfg(not(windows))]
pub const FFMPEG_BIN: &str = "ffmpeg";
#[cfg(not(windows))]
pub const FFPROBE_BIN: &str = "ffprobe";

/// Mini-`which`: busca `name` en el `PATH` del sistema.
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

/// Resuelve SOLO en el bin propio (`<AppData>/bin/`), sin mirar el `PATH`.
pub fn resolve_own(app: &AppHandle, bin_name: &str) -> Option<PathBuf> {
    let local = bin_dir(app).ok()?.join(bin_name);
    local.exists().then_some(local)
}

/// Resuelve un binario: primero en el `PATH` del sistema, luego en el bin
/// propio. `None` = no está instalado.
pub fn resolve_tool(app: &AppHandle, bin_name: &str) -> Option<PathBuf> {
    which_in_path(bin_name).or_else(|| resolve_own(app, bin_name))
}

/// Deja un `Command` listo para spawnear un binario externo: sin ventana de
/// consola en Windows y sin el entorno que inyecta la AppImage en Linux.
pub fn prepare_child(cmd: &mut Command) {
    hide_console(cmd);
    clean_child_env(cmd);
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
