//! Transporte **elevado** del quark consola: la app no corre como admin, así
//! que para una sesión admin lanzamos el binario `quark-pty-host` con UAC
//! (`ShellExecuteExW + verbo "runas"`) y nos comunicamos con él por named
//! pipe. El protocolo de framing está en `super::protocol`.
//!
//! Flujo:
//!   1. `ElevatedSession::spawn` genera un nombre de pipe único, crea el
//!      server (CreateNamedPipeW) y arranca el hilo de IO que va a esperar
//!      la conexión del helper.
//!   2. ShellExecuteExW con `lpVerb = "runas"` lanza el helper elevado
//!      pasándole `--pipe <nombre>` por args. Aparece la UAC.
//!   3. Si el usuario acepta: el helper conecta como cliente, mandamos
//!      `SPAWN`, y a partir de ahí los frames OUTPUT/EXIT/ERROR llegan por
//!      el pipe.
//!   4. Si cancela: la espera del pipe corta con error y la sesión se da
//!      por fallida.
//!
//! Windows-only. En otras plataformas devolvemos un error claro al construir.

#[cfg(target_os = "windows")]
mod imp {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::sync::Arc;

    use std::io::Write as _;

    use parking_lot::Mutex;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_CANCELLED, HANDLE, INVALID_HANDLE_VALUE,
    };
    use windows::Win32::Storage::FileSystem::{FILE_FLAG_OVERLAPPED, PIPE_ACCESS_DUPLEX};
    use windows::Win32::System::Pipes::{
        ConnectNamedPipe, CreateNamedPipeW, PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS,
        PIPE_TYPE_BYTE, PIPE_WAIT,
    };
    use windows::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
    use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;

    use crate::console::overlapped::{OverlappedReader, OverlappedWriter};
    use crate::console::protocol::{
        self, ExitPayload, ResizePayload, SpawnPayload, TAG_ERROR, TAG_EXIT, TAG_INPUT, TAG_KILL,
        TAG_OUTPUT, TAG_RESIZE, TAG_SPAWN,
    };
    use crate::console::ShellSpec;

    /// Handle Windows que cierra solo al hacer Drop. Hacemos `unsafe impl Send`
    /// porque los HANDLEs nombrados de Windows son safe-to-move entre hilos.
    struct OwnedHandle(HANDLE);
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

    /// Sesión elevada. El `pipe` es el server-side del named pipe; lo cierra
    /// `Drop`, lo que despierta cualquier ReadFile pendiente con error.
    pub struct ElevatedSession {
        pipe: Arc<OwnedHandle>,
        write_lock: Mutex<()>,
    }

    impl ElevatedSession {
        pub fn spawn(
            spec: &ShellSpec,
            helper_exe: &std::path::Path,
            on_output: impl Fn(&[u8]) + Send + 'static,
            on_exit: impl FnOnce(i32) + Send + 'static,
        ) -> Result<Arc<Self>, String> {
            // Pipe único por sesión. UUID v4 dificulta squatting por otro
            // proceso (un atacante tendría que adivinar 122 bits).
            let pipe_name = format!(r"\\.\pipe\quarks-pty-{}", uuid::Uuid::new_v4());
            let wide_name = wide(&pipe_name);

            // Server side del pipe: byte-mode, bloqueante, una instancia, sin
            // clientes remotos (rechazamos conexiones por red), 64 KB de
            // buffer por dirección. `FILE_FLAG_OVERLAPPED` es crítico: sin él
            // el kernel serializa ReadFile/WriteFile concurrentes sobre el
            // mismo HANDLE → deadlock entre el read_loop y los console_write.
            let pipe_handle = unsafe {
                CreateNamedPipeW(
                    PCWSTR(wide_name.as_ptr()),
                    PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
                    PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                    1,
                    64 * 1024,
                    64 * 1024,
                    0,
                    None,
                )
            };
            if pipe_handle == INVALID_HANDLE_VALUE {
                return Err(format!(
                    "CreateNamedPipeW falló: {:?}",
                    unsafe { GetLastError() }
                ));
            }
            let pipe = Arc::new(OwnedHandle(pipe_handle));

            // Lanzar el helper con UAC. Bloquea hasta que el usuario responde.
            // Si acepta, el helper arranca y abre el pipe como cliente. Le
            // pasamos nuestro PID para que se autodestruya si la app muere
            // abrupto (cierre forzado, crash, recompilación en dev…). Sin
            // esto el helper queda zombie y lockea el `.exe` de la siguiente
            // build.
            launch_helper_elevated(helper_exe, &pipe_name, std::process::id())?;

            // ConnectNamedPipe + send_spawn van INLINE (no en el hilo de IO).
            // Si los hiciéramos en el hilo, el caller podría volver al frontend
            // ANTES de que SPAWN salga por el pipe; cuando el frontend dispara
            // su primer `resize`/`input`, esos frames le ganarían a SPAWN y el
            // helper los rechazaría (`primer frame esperado SPAWN, llegó 0x..`).
            // Bloquear acá es OK: ya bloqueamos en ShellExecuteExW por UAC; el
            // helper conecta en pocos ms apenas arranca.
            log_line("spawn: waiting for client connect (overlapped)");
            connect_overlapped(pipe.0).map_err(|e| {
                log_line(&format!("spawn: connect_overlapped err: {e}"));
                format!("ConnectNamedPipe falló: {e}")
            })?;
            log_line("spawn: client connected");

            let session = Arc::new(ElevatedSession {
                pipe: Arc::clone(&pipe),
                write_lock: Mutex::new(()),
            });

            // SPAWN inline: cuando esta función retorne, el helper ya lo tiene.
            if let Err(e) = session.send_spawn(spec) {
                log_line(&format!("spawn: send_spawn err {e}"));
                return Err(format!("send SPAWN: {e}"));
            }
            log_line("spawn: SPAWN sent");

            // El hilo de IO solo lee frames (OUTPUT/EXIT/ERROR).
            let session_for_thread = Arc::clone(&session);
            std::thread::spawn(move || {
                read_loop(&session_for_thread, on_output, on_exit);
            });

            Ok(session)
        }

        pub fn write(&self, bytes: &[u8]) -> Result<(), String> {
            self.send_frame(TAG_INPUT, bytes)
        }

        pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
            let json = serde_json::to_vec(&ResizePayload { cols, rows })
                .map_err(|e| format!("resize json: {e}"))?;
            self.send_frame(TAG_RESIZE, &json)
        }

        pub fn kill(&self) -> Result<(), String> {
            // Best-effort: si el pipe ya está cerrado el frame falla y no
            // pasa nada — Drop cierra el handle igual.
            let _ = self.send_frame(TAG_KILL, &[]);
            Ok(())
        }

        fn send_spawn(&self, spec: &ShellSpec) -> Result<(), String> {
            let payload = SpawnPayload {
                shell: spec.program_for_spawn(),
                args: spec.args.clone(),
                cwd: spec.cwd.clone(),
                cols: spec.cols,
                rows: spec.rows,
                env: spec.env.clone(),
            };
            let json = serde_json::to_vec(&payload).map_err(|e| format!("spawn json: {e}"))?;
            self.send_frame(TAG_SPAWN, &json)
        }

        fn send_frame(&self, tag: u8, payload: &[u8]) -> Result<(), String> {
            let _guard = self.write_lock.lock();
            // Header de 5 bytes + payload en un solo write para que el helper
            // reciba el frame entero sin fragmentación a nivel API.
            let mut buf = Vec::with_capacity(5 + payload.len());
            buf.push(tag);
            buf.extend_from_slice(&(payload.len() as u32).to_le_bytes());
            buf.extend_from_slice(payload);
            let mut w = OverlappedWriter::new(self.pipe.0);
            w.write_all(&buf).map_err(|e| format!("pipe write: {e}"))?;
            Ok(())
        }
    }

    fn read_loop(
        session: &Arc<ElevatedSession>,
        on_output: impl Fn(&[u8]) + Send + 'static,
        on_exit: impl FnOnce(i32) + Send + 'static,
    ) {
        // Parseamos frames y dispatcheamos. ConnectNamedPipe y SPAWN ya pasaron
        // en `ElevatedSession::spawn` (inline) antes de spawnear este hilo.
        log_line("read_loop: started");
        let mut reader = OverlappedReader::new(session.pipe.0);
        let mut output_count = 0usize;
        loop {
            match protocol::read_frame(&mut reader) {
                Ok(None) => {
                    // EOF del pipe: el helper cerró sin EXIT. Asumimos -1.
                    log_line("read_loop: EOF, helper cerró sin EXIT");
                    on_exit(-1);
                    return;
                }
                Ok(Some((tag, payload))) => match tag {
                    TAG_OUTPUT => {
                        output_count += 1;
                        if output_count <= 5 {
                            log_line(&format!(
                                "read_loop: OUTPUT #{output_count} ({} bytes)",
                                payload.len()
                            ));
                        }
                        on_output(&payload);
                    }
                    TAG_EXIT => {
                        let code = serde_json::from_slice::<ExitPayload>(&payload)
                            .map(|p| p.code)
                            .unwrap_or(-1);
                        log_line(&format!("read_loop: EXIT code={code}"));
                        on_exit(code);
                        return;
                    }
                    TAG_ERROR => {
                        // El helper avisa un error fatal: lo mandamos como
                        // output para que el usuario lo vea en la terminal.
                        log_line(&format!(
                            "read_loop: ERROR from helper: {}",
                            String::from_utf8_lossy(&payload)
                        ));
                        let mut msg = b"\r\n\x1b[31m[quark-console] ".to_vec();
                        msg.extend_from_slice(&payload);
                        msg.extend_from_slice(b"\x1b[0m\r\n");
                        on_output(&msg);
                        on_exit(-1);
                        return;
                    }
                    _ => {
                        log_line(&format!("read_loop: tag desconocido 0x{tag:02x}"));
                    }
                },
                Err(e) => {
                    log_line(&format!("read_loop: read_frame err {e}"));
                    on_exit(-1);
                    return;
                }
            }
        }
    }

    /// `ConnectNamedPipe` con pipe FILE_FLAG_OVERLAPPED: armar OVERLAPPED con
    /// evento y esperar al cliente. Tres casos de retorno:
    ///   - Ok(()) sync: cliente ya conectado al volver (raro).
    ///   - Err(ERROR_PIPE_CONNECTED 535): cliente conectó antes que llamáramos.
    ///   - Err(ERROR_IO_PENDING 997): conexión en progreso, esperamos al evento.
    fn connect_overlapped(handle: HANDLE) -> Result<(), String> {
        use windows::Win32::System::Threading::{
            CreateEventW, WaitForSingleObject, INFINITE,
        };
        use windows::Win32::Foundation::WAIT_OBJECT_0;
        use windows::Win32::System::IO::{GetOverlappedResult, OVERLAPPED};

        let event = unsafe { CreateEventW(None, true, false, None) }
            .map_err(|e| format!("CreateEventW: {e}"))?;
        if event.is_invalid() {
            return Err("CreateEventW devolvió INVALID_HANDLE".into());
        }
        let mut overlapped: OVERLAPPED = unsafe { std::mem::zeroed() };
        overlapped.hEvent = event;

        let initial = unsafe { ConnectNamedPipe(handle, Some(&mut overlapped)) };
        let result = match initial {
            Ok(()) => Ok(()),
            Err(_) => {
                let err = unsafe { GetLastError().0 };
                if err == 535 {
                    Ok(()) // ERROR_PIPE_CONNECTED: cliente se nos adelantó
                } else if err == 997 {
                    // ERROR_IO_PENDING: esperar a que el cliente conecte.
                    let wait = unsafe { WaitForSingleObject(event, INFINITE) };
                    if wait != WAIT_OBJECT_0 {
                        Err(format!("WaitForSingleObject connect: {wait:?}"))
                    } else {
                        let mut bytes = 0u32;
                        match unsafe {
                            GetOverlappedResult(handle, &overlapped, &mut bytes, false)
                        } {
                            Ok(()) => Ok(()),
                            Err(_) => Err(format!(
                                "GetOverlappedResult connect: {:?}",
                                unsafe { GetLastError() }
                            )),
                        }
                    }
                } else {
                    Err(format!("ConnectNamedPipe sync: {err}"))
                }
            }
        };
        unsafe {
            let _ = CloseHandle(event);
        }
        result
    }

    fn launch_helper_elevated(
        exe: &std::path::Path,
        pipe_name: &str,
        parent_pid: u32,
    ) -> Result<(), String> {
        log_line(&format!(
            "launching helper: exe={} pipe={} parent_pid={}",
            exe.display(),
            pipe_name,
            parent_pid
        ));
        if !exe.exists() {
            return Err(format!("helper exe no existe: {}", exe.display()));
        }
        let exe_wide = wide(exe.as_os_str());
        let verb_wide = wide("runas");
        // El helper acepta `--pipe <nombre> --parent-pid <pid>`.
        let params = format!("--pipe \"{}\" --parent-pid {}", pipe_name, parent_pid);
        let params_wide = wide(&params);

        let mut info = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_NOCLOSEPROCESS,
            lpVerb: PCWSTR(verb_wide.as_ptr()),
            lpFile: PCWSTR(exe_wide.as_ptr()),
            lpParameters: PCWSTR(params_wide.as_ptr()),
            nShow: SW_HIDE.0,
            ..Default::default()
        };

        // ShellExecuteExW bloquea hasta que la UAC se resuelve. Si el usuario
        // cancela, GetLastError() == ERROR_CANCELLED.
        let ok = unsafe { ShellExecuteExW(&mut info) };
        if ok.is_err() {
            let err = unsafe { GetLastError() };
            log_line(&format!("ShellExecuteExW err: {err:?}"));
            if err == ERROR_CANCELLED {
                return Err("UAC cancelado por el usuario".into());
            }
            return Err(format!("ShellExecuteExW falló: {err:?}"));
        }
        log_line("ShellExecuteExW ok");

        // No esperamos el proceso: la vida del helper la gobierna el pipe
        // (cuando cerramos el pipe, el helper recibe EOF y termina).
        if !info.hProcess.is_invalid() {
            unsafe {
                let _ = CloseHandle(info.hProcess);
            }
        }
        Ok(())
    }

    /// Append-only log al mismo archivo que el helper (`%TEMP%\quark-pty-host.log`).
    /// Así app + helper comparten una sola línea de tiempo para debuggear.
    fn log_line(msg: &str) {
        if let Some(path) = std::env::var_os("TEMP")
            .or_else(|| std::env::var_os("TMP"))
            .map(|d| std::path::PathBuf::from(d).join("quark-pty-host.log"))
        {
            use std::io::Write as _;
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&path)
            {
                let _ = writeln!(f, "[app] {msg}");
            }
        }
    }

    /// Convierte a wide string (NUL-terminated) para las APIs Win32.
    fn wide<S: AsRef<OsStr>>(s: S) -> Vec<u16> {
        s.as_ref().encode_wide().chain(std::iter::once(0)).collect()
    }
}

#[cfg(target_os = "windows")]
pub use imp::ElevatedSession;

#[cfg(not(target_os = "windows"))]
pub struct ElevatedSession;

#[cfg(not(target_os = "windows"))]
impl ElevatedSession {
    pub fn spawn(
        _spec: &super::ShellSpec,
        _helper_exe: &std::path::Path,
        _on_output: impl Fn(&[u8]) + Send + 'static,
        _on_exit: impl FnOnce(i32) + Send + 'static,
    ) -> Result<std::sync::Arc<Self>, String> {
        Err("Sesiones admin solo están soportadas en Windows.".into())
    }

    pub fn write(&self, _bytes: &[u8]) -> Result<(), String> {
        Err("stub".into())
    }

    pub fn resize(&self, _cols: u16, _rows: u16) -> Result<(), String> {
        Err("stub".into())
    }

    pub fn kill(&self) -> Result<(), String> {
        Err("stub".into())
    }
}
