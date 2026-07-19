//! Binario helper del quark consola: hostea un PTY en su propio proceso (que
//! corre con elevación cuando lo lanza la app vía UAC `runas`) y se comunica
//! con la app principal por named pipe usando el protocolo de `protocol.rs`.
//!
//! Argumentos:
//!   `--pipe \\.\pipe\quarks-pty-<uuid>`
//!
//! Vida del proceso:
//!   1. Conectar al pipe (CreateFile, cliente).
//!   2. Leer frames; el primero esperado es SPAWN.
//!   3. Crear el PTY con portable-pty y arrancar 2 hilos:
//!      - lectura del master → frames OUTPUT por el pipe.
//!      - wait del child → frame EXIT y cierre del pipe.
//!   4. Loop principal: leer frames de la app (INPUT/RESIZE/KILL) y aplicarlos.
//!
//! Solo Windows. En otras plataformas el `main` es un stub.

#[cfg(target_os = "windows")]
fn main() {
    // Logging a archivo: el helper corre sin consola (SW_HIDE) y elevado, así
    // que stderr no llega a ningún lado. Sin esto, cualquier fallo (panic,
    // shell inexistente, openpty roto) muere silencioso. El log va a
    // %TEMP%\quark-pty-host.log para no requerir permisos especiales.
    log_init();
    log_line(&format!("=== start pid={} ===", std::process::id()));
    // Cualquier panic se anota antes de explotar.
    std::panic::set_hook(Box::new(|info| {
        log_line(&format!("PANIC: {info}"));
    }));
    match imp::run() {
        Ok(()) => log_line("=== exit ok ==="),
        Err(e) => {
            log_line(&format!("=== exit err: {e} ==="));
            eprintln!("quark-pty-host: {e}");
            std::process::exit(1);
        }
    }
}

#[cfg(target_os = "windows")]
fn log_init() {
    // Trunca el log al arrancar; solo nos interesa la sesión actual.
    if let Some(path) = log_path() {
        let _ = std::fs::write(&path, b"");
    }
}

#[cfg(target_os = "windows")]
pub fn log_line(msg: &str) {
    if let Some(path) = log_path() {
        use std::io::Write as _;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        {
            let _ = writeln!(f, "{msg}");
        }
    }
}

#[cfg(target_os = "windows")]
fn log_path() -> Option<std::path::PathBuf> {
    std::env::var_os("TEMP")
        .or_else(|| std::env::var_os("TMP"))
        .map(|d| std::path::PathBuf::from(d).join("quark-pty-host.log"))
}

#[cfg(not(target_os = "windows"))]
fn main() {
    eprintln!("quark-pty-host: este helper solo aplica en Windows.");
    std::process::exit(1);
}

#[cfg(target_os = "windows")]
mod imp {
    use std::ffi::OsStr;
    use std::io::{Read, Write};
    use std::os::windows::ffi::OsStrExt;
    use std::sync::Arc;

    use std::io::Write as _;

    use parking_lot::Mutex;
    use portable_pty::{native_pty_system, Child, CommandBuilder, PtySize};
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{
        CloseHandle, GetLastError, GENERIC_READ, GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE,
        WAIT_OBJECT_0,
    };
    use windows::Win32::Storage::FileSystem::{
        CreateFileW, FILE_ATTRIBUTE_NORMAL, FILE_FLAG_OVERLAPPED, FILE_SHARE_NONE, OPEN_EXISTING,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE,
    };

    use app_lib::console::overlapped::{OverlappedReader, OverlappedWriter};
    use app_lib::console::protocol::{
        self, ExitPayload, ResizePayload, SpawnPayload, TAG_ERROR, TAG_EXIT, TAG_INPUT, TAG_KILL,
        TAG_OUTPUT, TAG_RESIZE, TAG_SPAWN,
    };

    pub fn run() -> Result<(), String> {
        // Parseo trivial de args:
        //   --pipe <name>        nombre del named pipe creado por la app.
        //   --parent-pid <pid>   PID del proceso padre; si muere, nos suicidamos.
        let mut args = std::env::args();
        let _ = args.next();
        let mut pipe_name: Option<String> = None;
        let mut parent_pid: Option<u32> = None;
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--pipe" => pipe_name = args.next(),
                "--parent-pid" => parent_pid = args.next().and_then(|s| s.parse().ok()),
                _ => {}
            }
        }
        let pipe_name = pipe_name.ok_or_else(|| "falta --pipe <name>".to_string())?;
        super::log_line(&format!(
            "pipe name: {pipe_name} parent_pid={:?}",
            parent_pid
        ));

        // Watchdog del padre. Si la app muere sin cerrar el pipe limpio (kill,
        // crash, recompilación en dev), el handle al proceso padre queda
        // signaled y ahí nos auto-matamos. Si parent-pid no vino o el
        // OpenProcess falla, seguimos sin watchdog.
        if let Some(pid) = parent_pid {
            spawn_parent_watchdog(pid);
        }

        // Conectar al pipe creado por la app (server side).
        let pipe = connect_pipe(&pipe_name)?;
        super::log_line("connected to pipe");
        let pipe = Arc::new(pipe);

        // El primer frame DEBE ser SPAWN. Cualquier otra cosa es error fatal.
        let mut reader = OverlappedReader::new(pipe.0);
        let (tag, payload) = match protocol::read_frame(&mut reader)
            .map_err(|e| format!("read SPAWN: {e}"))?
        {
            Some(t) => t,
            None => return Err("pipe cerrado antes del SPAWN".into()),
        };
        if tag != TAG_SPAWN {
            return Err(format!("primer frame esperado SPAWN, llegó 0x{tag:02x}"));
        }
        let spawn: SpawnPayload =
            serde_json::from_slice(&payload).map_err(|e| format!("SPAWN payload: {e}"))?;
        super::log_line(&format!(
            "SPAWN payload: shell={:?} cwd={:?} cols={} rows={} envlen={}",
            spawn.shell,
            spawn.cwd,
            spawn.cols,
            spawn.rows,
            spawn.env.len()
        ));

        // Armar y spawnear el PTY.
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: spawn.rows.max(1),
                cols: spawn.cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| {
                super::log_line(&format!("openpty err: {e}"));
                let _ = send_error(pipe.0, &format!("openpty: {e}"));
                format!("openpty: {e}")
            })?;
        super::log_line("openpty ok");

        let program = spawn
            .shell
            .clone()
            .unwrap_or_else(|| default_shell().to_string());
        let mut cmd = CommandBuilder::new(&program);
        for a in &spawn.args {
            cmd.arg(a);
        }
        if let Some(cwd) = spawn.cwd.as_deref() {
            cmd.cwd(cwd);
        }
        for (k, v) in &spawn.env {
            cmd.env(k, v);
        }
        cmd.env("TERM", "xterm-256color");
        super::log_line(&format!(
            "spawning shell: {program} args={:?}",
            spawn.args
        ));

        let child: Arc<Mutex<Box<dyn Child + Send + Sync>>> = Arc::new(Mutex::new(
            pair.slave
                .spawn_command(cmd)
                .map_err(|e| {
                    super::log_line(&format!("spawn_command err: {e}"));
                    let _ = send_error(pipe.0, &format!("spawn '{program}': {e}"));
                    format!("spawn: {e}")
                })?,
        ));
        super::log_line("spawn_command ok");

        let pty_reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("clone reader: {e}"))?;
        let pty_writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("take writer: {e}"))?;
        let pty_writer = Arc::new(Mutex::new(pty_writer));
        let master = Arc::new(Mutex::new(pair.master));

        // Hilo PTY → pipe (frames OUTPUT). El send_frame_locked usa un mutex
        // para que dos writers no entrelacen frames en el pipe.
        let pipe_for_out = Arc::clone(&pipe);
        let write_lock = Arc::new(Mutex::new(()));
        let write_lock_for_out = Arc::clone(&write_lock);
        std::thread::spawn(move || {
            super::log_line("pty_reader: started");
            let mut reader = pty_reader;
            let mut buf = [0u8; 4096];
            let mut total = 0usize;
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        super::log_line(&format!(
                            "pty_reader: EOF tras {total} bytes"
                        ));
                        break;
                    }
                    Ok(n) => {
                        total += n;
                        if total <= 4096 {
                            super::log_line(&format!(
                                "pty_reader: read {n} bytes (total {total})"
                            ));
                        }
                        match send_frame_locked(
                            pipe_for_out.0,
                            &write_lock_for_out,
                            TAG_OUTPUT,
                            &buf[..n],
                        ) {
                            Ok(()) => {
                                if total <= 4096 {
                                    super::log_line(&format!(
                                        "pty_reader: send_frame OUTPUT {n} bytes ok"
                                    ));
                                }
                            }
                            Err(e) => {
                                super::log_line(&format!("pty_reader: send err: {e}"));
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        super::log_line(&format!("pty_reader: read err: {e}"));
                        break;
                    }
                }
            }
        });

        // Hilo wait → frame EXIT. Cuando el child muere, mandamos EXIT y
        // cerramos el pipe. CloseHandle del pipe acá despierta también el
        // ReadFile del loop principal abajo.
        let pipe_for_exit = Arc::clone(&pipe);
        let child_for_exit = Arc::clone(&child);
        let write_lock_for_exit = Arc::clone(&write_lock);
        std::thread::spawn(move || {
            let code = {
                let mut c = child_for_exit.lock();
                match c.wait() {
                    Ok(s) => s.exit_code() as i32,
                    Err(_) => -1,
                }
            };
            let payload =
                serde_json::to_vec(&ExitPayload { code }).unwrap_or_else(|_| b"{}".to_vec());
            let _ = send_frame_locked(pipe_for_exit.0, &write_lock_for_exit, TAG_EXIT, &payload);
            // Pequeño delay para que el frame EXIT salga antes de cerrar.
            // Es feo pero el pipe no tiene flush sincrónico nativo cross-API.
            std::thread::sleep(std::time::Duration::from_millis(50));
            unsafe {
                let _ = CloseHandle(pipe_for_exit.0);
            }
            std::process::exit(0);
        });

        // Loop principal: leer frames de la app y dispatchear.
        super::log_line("main_loop: started");
        loop {
            match protocol::read_frame(&mut reader) {
                Ok(None) => {
                    super::log_line("main_loop: EOF, killing child");
                    let _ = child.lock().kill();
                    break;
                }
                Ok(Some((tag, payload))) => {
                    super::log_line(&format!(
                        "main_loop: frame tag=0x{tag:02x} len={}",
                        payload.len()
                    ));
                    match tag {
                        TAG_INPUT => {
                            let mut w = pty_writer.lock();
                            if w.write_all(&payload).is_err() {
                                break;
                            }
                            let _ = w.flush();
                        }
                        TAG_RESIZE => {
                            if let Ok(r) = serde_json::from_slice::<ResizePayload>(&payload) {
                                let _ = master.lock().resize(PtySize {
                                    cols: r.cols.max(1),
                                    rows: r.rows.max(1),
                                    pixel_width: 0,
                                    pixel_height: 0,
                                });
                            }
                        }
                        TAG_KILL => {
                            let _ = child.lock().kill();
                            break;
                        }
                        _ => {}
                    }
                }
                Err(e) => {
                    super::log_line(&format!("main_loop: read err: {e}"));
                    let _ = child.lock().kill();
                    break;
                }
            }
        }

        Ok(())
    }

    fn default_shell() -> &'static str {
        "powershell.exe"
    }

    /// Abre un handle al proceso padre con SYNCHRONIZE y arranca un hilo que
    /// hace `WaitForSingleObject(INFINITE)`. Cuando el padre muere, el handle
    /// queda signaled y nos auto-matamos con `process::exit(0)` — más confiable
    /// que esperar al EOF del pipe (que no llega si el padre crashea).
    ///
    /// `HANDLE` envuelve `*mut c_void` que no es Send. Lo movemos como `isize`
    /// (puntero crudo serializado) a través del thread boundary y lo
    /// reconstruimos del otro lado. Es lo que hace internamente el `windows`
    /// crate cuando expone APIs Send-friendly.
    fn spawn_parent_watchdog(parent_pid: u32) {
        let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, false, parent_pid) };
        let handle = match handle {
            Ok(h) if !h.is_invalid() => h,
            _ => {
                super::log_line(&format!(
                    "watchdog: OpenProcess({parent_pid}) falló; sigo sin watchdog"
                ));
                return;
            }
        };
        let raw = handle.0 as isize;
        std::thread::spawn(move || {
            let h = HANDLE(raw as *mut std::ffi::c_void);
            let res = unsafe { WaitForSingleObject(h, INFINITE) };
            if res == WAIT_OBJECT_0 {
                super::log_line("watchdog: padre murió, saliendo");
            } else {
                super::log_line(&format!("watchdog: WaitForSingleObject inesperado: {res:?}"));
            }
            unsafe {
                let _ = CloseHandle(h);
            }
            std::process::exit(0);
        });
    }

    // ── Handle + utilidades de pipe ──────────────────────────────────────────

    pub struct OwnedHandle(pub HANDLE);
    impl Drop for OwnedHandle {
        fn drop(&mut self) {
            if !self.0.is_invalid() {
                unsafe {
                    let _ = CloseHandle(self.0);
                }
            }
        }
    }
    unsafe impl Send for OwnedHandle {}
    unsafe impl Sync for OwnedHandle {}

    fn connect_pipe(name: &str) -> Result<OwnedHandle, String> {
        let wide: Vec<u16> = OsStr::new(name)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        // `FILE_FLAG_OVERLAPPED` para coincidir con el servidor (la app abre el
        // pipe con OVERLAPPED). Sin esto las operaciones se serializarían y
        // deadlock entre el reader del main_loop y el writer del pty_reader.
        let handle = unsafe {
            CreateFileW(
                PCWSTR(wide.as_ptr()),
                (GENERIC_READ | GENERIC_WRITE).0,
                FILE_SHARE_NONE,
                None,
                OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OVERLAPPED,
                None,
            )
        }
        .map_err(|e| format!("CreateFileW '{name}': {e:?}"))?;
        if handle == INVALID_HANDLE_VALUE {
            return Err(format!(
                "CreateFileW '{name}' devolvió INVALID_HANDLE_VALUE: {:?}",
                unsafe { GetLastError() }
            ));
        }
        Ok(OwnedHandle(handle))
    }

    fn send_frame_locked(
        handle: HANDLE,
        lock: &Mutex<()>,
        tag: u8,
        payload: &[u8],
    ) -> std::io::Result<()> {
        let _g = lock.lock();
        let mut buf = Vec::with_capacity(5 + payload.len());
        buf.push(tag);
        buf.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        buf.extend_from_slice(payload);
        let mut w = OverlappedWriter::new(handle);
        w.write_all(&buf)
    }

    fn send_error(handle: HANDLE, msg: &str) -> std::io::Result<()> {
        let lock = Mutex::new(());
        send_frame_locked(handle, &lock, TAG_ERROR, msg.as_bytes())
    }
}
