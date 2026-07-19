//! Transporte **local** del quark consola: PTY in-process via `portable-pty`.
//!
//! Cada sesión arma un `PtyPair` con su shell, un hilo de lectura que vuelca
//! los bytes a la app (`output_cb`) y otro de wait del child para emitir el
//! exit code. La escritura, resize y kill van por handles `Send` que viven en
//! `LocalSession`. Sin tokio: el ritmo del PTY no lo justifica y nos ahorramos
//! la dependencia.

use std::io::{Read, Write};
use std::sync::Arc;

use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};

use super::ShellSpec;

/// Maneja una sesión local activa. Drop = los hilos terminan al cerrar el
/// master / morir el child (no hace falta join explícito).
pub struct LocalSession {
    /// Writer al master del PTY (lo que escribe el frontend va al stdin del shell).
    writer: Mutex<Box<dyn Write + Send>>,
    /// Master del PTY: lo guardamos solo para poder hacer resize. El reader vive
    /// dentro del hilo de output (no se puede compartir).
    master: Mutex<Box<dyn MasterPty + Send>>,
    /// Child del shell — para poder matarlo. `kill()` requiere `&mut`, así que
    /// vive bajo `Mutex`.
    child: Mutex<Box<dyn Child + Send + Sync>>,
}

impl LocalSession {
    pub fn spawn(
        spec: &ShellSpec,
        on_output: impl Fn(&[u8]) + Send + 'static,
        on_exit: impl FnOnce(i32) + Send + 'static,
    ) -> Result<Arc<Self>, String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: spec.rows,
                cols: spec.cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("openpty: {e}"))?;

        // Build del comando con shell + cwd + env. portable-pty hereda env del
        // proceso padre, así que solo agregamos los extras del caller.
        let mut cmd = CommandBuilder::new(&spec.program);
        for a in &spec.args {
            cmd.arg(a);
        }
        if let Some(cwd) = &spec.cwd {
            cmd.cwd(cwd);
        }
        for (k, v) in &spec.env {
            cmd.env(k, v);
        }
        // TERM por defecto: xterm-256color (xterm.js lo entiende y los shells
        // modernos saben emitir secuencias compatibles).
        cmd.env("TERM", "xterm-256color");

        let child: Box<dyn Child + Send + Sync> = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("spawn: {e}"))?;

        // El reader del master es exclusivo: lo extraemos antes de mover el
        // master al struct (el writer es otro handle independiente).
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("clone reader: {e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("take writer: {e}"))?;

        let session = Arc::new(LocalSession {
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
            child: Mutex::new(child),
        });

        // Hilo de lectura: blocking read loop hasta EOF. Cada chunk se entrega
        // intacto al callback (incluye OSC 7 si el shell los emite). Tope de
        // 4 KB: suficiente para PTY normales y limita la latencia de paint.
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => on_output(&buf[..n]),
                    Err(_) => break,
                }
            }
        });

        // Hilo de wait del child: emite el exit code cuando muere.
        let session_for_wait = Arc::clone(&session);
        std::thread::spawn(move || {
            // wait() devuelve ExitStatus; lo convertimos a i32. Si el wait
            // falla devolvemos -1.
            let code = {
                let mut c = session_for_wait.child.lock();
                match c.wait() {
                    Ok(s) => s.exit_code() as i32,
                    Err(_) => -1,
                }
            };
            on_exit(code);
        });

        Ok(session)
    }

    pub fn write(&self, bytes: &[u8]) -> Result<(), String> {
        let mut w = self.writer.lock();
        w.write_all(bytes).map_err(|e| format!("write: {e}"))?;
        w.flush().map_err(|e| format!("flush: {e}"))
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        let m = self.master.lock();
        m.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize: {e}"))
    }

    pub fn kill(&self) -> Result<(), String> {
        let mut c = self.child.lock();
        c.kill().map_err(|e| format!("kill: {e}"))
    }
}
