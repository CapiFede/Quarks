//! Framing común entre la app y el helper `quark-pty-host` (sesiones admin).
//!
//! El canal es un named pipe bidireccional (Windows). Sobre él viajan frames
//! con el formato:
//!
//! ```text
//! [u8 tag][u32 LE length][length bytes payload]
//! ```
//!
//! Tags app → helper:
//!   - `0x01 SPAWN`   payload = JSON `SpawnPayload`
//!   - `0x02 INPUT`   payload = bytes crudos hacia stdin del PTY
//!   - `0x03 RESIZE`  payload = JSON `ResizePayload`
//!   - `0x04 KILL`    payload = vacío (helper mata el PTY y cierra)
//!
//! Tags helper → app:
//!   - `0x10 OUTPUT`  payload = bytes crudos del PTY (incluye OSC 7)
//!   - `0x11 EXIT`    payload = JSON `ExitPayload`
//!   - `0x12 ERROR`   payload = UTF-8 (string) — error fatal del helper
//!
//! Mantenemos JSON en los frames de control para iterar el contrato sin
//! romper el framing binario (input/output siguen siendo bytes crudos).

use std::io::{Read, Write};

use serde::{Deserialize, Serialize};

pub const TAG_SPAWN: u8 = 0x01;
pub const TAG_INPUT: u8 = 0x02;
pub const TAG_RESIZE: u8 = 0x03;
pub const TAG_KILL: u8 = 0x04;

pub const TAG_OUTPUT: u8 = 0x10;
pub const TAG_EXIT: u8 = 0x11;
pub const TAG_ERROR: u8 = 0x12;

/// Tope blando del payload de un frame (1 MiB). Evita que un cliente roto
/// haga al receptor alocar GB. El PTY normal emite chunks de pocos KB.
pub const MAX_PAYLOAD: usize = 1024 * 1024;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SpawnPayload {
    /// Comando del shell (p. ej. `pwsh.exe`, `bash`). Si es `None`, el helper
    /// elige el default de la plataforma.
    pub shell: Option<String>,
    /// Argumentos del shell (`-NoLogo` para suprimir el banner, etc.).
    #[serde(default)]
    pub args: Vec<String>,
    /// Working directory inicial; `None` = el del helper.
    pub cwd: Option<String>,
    pub cols: u16,
    pub rows: u16,
    /// Variables de entorno extra a inyectar (además de heredar las del helper).
    #[serde(default)]
    pub env: Vec<(String, String)>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct ResizePayload {
    pub cols: u16,
    pub rows: u16,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct ExitPayload {
    pub code: i32,
}

/// Escribe un frame `[tag][u32 LE length][bytes]` al stream.
pub fn write_frame<W: Write>(w: &mut W, tag: u8, payload: &[u8]) -> std::io::Result<()> {
    if payload.len() > MAX_PAYLOAD {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "payload demasiado grande",
        ));
    }
    let len = (payload.len() as u32).to_le_bytes();
    let header = [tag, len[0], len[1], len[2], len[3]];
    w.write_all(&header)?;
    if !payload.is_empty() {
        w.write_all(payload)?;
    }
    w.flush()?;
    Ok(())
}

/// Lee un frame del stream. Devuelve `Ok(None)` en EOF limpio (pipe cerrado).
pub fn read_frame<R: Read>(r: &mut R) -> std::io::Result<Option<(u8, Vec<u8>)>> {
    let mut header = [0u8; 5];
    // EOF en el primer byte es cierre limpio (no error).
    if let Err(e) = r.read_exact(&mut header[..1]) {
        if e.kind() == std::io::ErrorKind::UnexpectedEof {
            return Ok(None);
        }
        return Err(e);
    }
    r.read_exact(&mut header[1..])?;
    let tag = header[0];
    let len = u32::from_le_bytes([header[1], header[2], header[3], header[4]]) as usize;
    if len > MAX_PAYLOAD {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "payload demasiado grande",
        ));
    }
    let mut payload = vec![0u8; len];
    if len > 0 {
        r.read_exact(&mut payload)?;
    }
    Ok(Some((tag, payload)))
}
