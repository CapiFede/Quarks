//! Backend del quark **consola**.
//!
//! Expone comandos Tauri para manejar PTYs (apertura, input, resize, cierre)
//! y emite el output como **eventos** Tauri por sesión:
//!
//!   - `console:output:<id>`  → `{ b64: string }` con un chunk de bytes del PTY.
//!   - `console:exit:<id>`    → `{ code: i32 }` cuando el shell termina.
//!   - `console:cwd:<id>`     → `{ cwd: string }` cuando el shell anunció uno
//!     vía OSC 7 (ver `osc7.rs`). El frontend usa esto para el nombre del tab.
//!
//! Dos transportes:
//!   - **Local** (`local.rs`): PTY in-process con `portable-pty`, para sesiones
//!     normales (sin elevación).
//!   - **Elevada** (`elevated.rs`): la app NO corre como admin; spawnea
//!     `quark-pty-host.exe` con UAC y se comunica por named pipe. Windows-only.
//!
//! Los eventos van por nombre por sesión (no payload con id) para que cada
//! componente xterm.js suscriba SOLO su stream. Los bytes se mandan en base64
//! porque Tauri serializa el payload del evento como JSON: `Vec<u8>` ahí
//! quedaría como array de números (3-4× el tamaño); base64 es ~1.33×.

mod elevated;
mod local;
mod osc7;
pub mod protocol;
#[cfg(target_os = "windows")]
pub mod overlapped;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use base64::Engine;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use elevated::ElevatedSession;
use local::LocalSession;
use osc7::Osc7Parser;

/// Spec de qué shell levantar. Resuelta en el app side antes de mandar a
/// `LocalSession` o `ElevatedSession`.
#[derive(Clone, Debug)]
pub struct ShellSpec {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub env: Vec<(String, String)>,
    pub cols: u16,
    pub rows: u16,
}

impl ShellSpec {
    /// Para el frame `SPAWN` del transporte elevado: enviamos `Some(program)`
    /// porque resolvemos del lado app.
    pub fn program_for_spawn(&self) -> Option<String> {
        Some(self.program.clone())
    }
}

/// Una sesión registrada. Drop = los recursos se liberan (hilos terminan al
/// cerrar handles).
enum Session {
    Local(Arc<LocalSession>),
    Elevated(Arc<ElevatedSession>),
}

impl Session {
    fn write(&self, bytes: &[u8]) -> Result<(), String> {
        match self {
            Session::Local(s) => s.write(bytes),
            Session::Elevated(s) => s.write(bytes),
        }
    }
    fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        match self {
            Session::Local(s) => s.resize(cols, rows),
            Session::Elevated(s) => s.resize(cols, rows),
        }
    }
    fn kill(&self) -> Result<(), String> {
        match self {
            Session::Local(s) => s.kill(),
            Session::Elevated(s) => s.kill(),
        }
    }
}

#[derive(Default)]
pub struct ConsoleState {
    sessions: Mutex<HashMap<String, Session>>,
}

impl ConsoleState {
    pub fn new() -> Self {
        Self::default()
    }
}

// ── Comandos Tauri ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenArgs {
    pub id: String,
    /// Shell program. Si es `None`/empty, usamos el default de la plataforma.
    #[serde(default)]
    pub shell: Option<String>,
    /// Argumentos extra para el shell (p. ej. `-NoLogo`).
    #[serde(default)]
    pub args: Vec<String>,
    /// CWD inicial. Si es `None`/empty, el del proceso padre (la app).
    #[serde(default)]
    pub cwd: Option<String>,
    pub cols: u16,
    pub rows: u16,
    /// Si true, lanzamos un PTY elevado por UAC (Windows-only).
    #[serde(default)]
    pub elevated: bool,
    /// Variables de entorno extra (además de heredar las del proceso).
    /// Útil para `POWERSHELL_UPDATECHECK=Off` y similares.
    #[serde(default)]
    pub env: Vec<(String, String)>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenResult {
    /// Shell efectivamente lanzado (útil para el frontend mostrar el nombre).
    pub shell: String,
}

/// Async para que Tauri lo despache a un worker thread. La rama elevada hace
/// `ShellExecuteExW` (UAC bloqueante) + `ConnectNamedPipe` (espera al helper)
/// INLINE — si esto corriera en el main thread la UI se congela ("No
/// responde") hasta que el helper conecte. El body no usa `.await`: el
/// cómputo es sync, solo queremos no estar en el main.
#[tauri::command]
pub async fn console_open(
    app: AppHandle,
    state: State<'_, ConsoleState>,
    args: OpenArgs,
) -> Result<OpenResult, String> {
    // No permitir IDs duplicados — eso indicaría un bug del frontend.
    {
        let s = state.sessions.lock();
        if s.contains_key(&args.id) {
            return Err(format!("sesión '{}' ya existe", args.id));
        }
    }

    let program = resolve_shell(args.shell.as_deref());
    let shell_args = inject_osc7_init(&program, args.args);
    let spec = ShellSpec {
        program: program.clone(),
        args: shell_args,
        cwd: args.cwd.filter(|s| !s.is_empty()),
        env: args.env,
        cols: args.cols.max(1),
        rows: args.rows.max(1),
    };

    // Emisores: capturan el AppHandle por clone y emiten al canal por sesión.
    // El parser de OSC 7 vive en un Arc<Mutex<>> compartido por todos los
    // chunks de esta sesión, así una secuencia partida entre chunks se cierra
    // correctamente.
    let id = args.id.clone();
    let app_for_out = app.clone();
    let parser = Arc::new(Mutex::new(Osc7Parser::new()));
    let parser_for_out = Arc::clone(&parser);
    let id_for_out = id.clone();
    let on_output = move |bytes: &[u8]| {
        debug_log(&format!("on_output called len={}", bytes.len()));
        // 1) Enviar los bytes al frontend (xterm los renderea íntegros).
        let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
        let r = app_for_out.emit(
            &format!("console:output:{}", id_for_out),
            OutputEvent { b64 },
        );
        debug_log(&format!("on_output emit result: {:?}", r.as_ref().err()));
        // 2) Buscar OSC 7 y emitir un evento de cwd si lo hay.
        let cwds = parser_for_out.lock().feed(bytes);
        for cwd in cwds {
            let _ = app_for_out.emit(
                &format!("console:cwd:{}", id_for_out),
                CwdEvent { cwd },
            );
        }
    };

    let app_for_exit = app.clone();
    let id_for_exit = id.clone();
    let on_exit = move |code: i32| {
        // Solo emitimos el evento; NO removemos del mapa. Si lo hiciéramos acá
        // podríamos pisar la inserción (carrera: child que muere al toque,
        // wait thread emite antes de que `console_open` termine de insertar).
        // El frontend marca la sesión como "muerta" y la limpia con
        // `console_close` cuando el usuario aprieta la X — kill sobre una
        // sesión ya terminada es no-op.
        let _ = app_for_exit.emit(
            &format!("console:exit:{}", id_for_exit),
            ExitEvent { code },
        );
    };

    let session = if args.elevated {
        let helper = helper_exe_path(&app)
            .ok_or_else(|| "No encuentro el binario quark-pty-host".to_string())?;
        Session::Elevated(ElevatedSession::spawn(
            &spec, &helper, on_output, on_exit,
        )?)
    } else {
        Session::Local(LocalSession::spawn(&spec, on_output, on_exit)?)
    };

    state.sessions.lock().insert(args.id, session);
    Ok(OpenResult { shell: program })
}

/// Async — `WriteFile` sobre un named pipe puede bloquear (buffer lleno,
/// otro extremo lento). Si esto corriera en el main thread, una sola escritura
/// trabada cuelga la UI ("No responde"). Mismo motivo para los otros writes
/// abajo.
#[tauri::command]
pub async fn console_write(
    state: State<'_, ConsoleState>,
    id: String,
    data_b64: String,
) -> Result<(), String> {
    let data = base64::engine::general_purpose::STANDARD
        .decode(&data_b64)
        .map_err(|e| format!("base64: {e}"))?;
    debug_log(&format!("console_write {id} len={}", data.len()));
    let sessions = state.sessions.lock();
    let s = sessions
        .get(&id)
        .ok_or_else(|| format!("sesión '{id}' no existe"))?;
    let r = s.write(&data);
    debug_log(&format!("console_write {id} done: {:?}", r.as_ref().err()));
    r
}

#[tauri::command]
pub async fn console_resize(
    state: State<'_, ConsoleState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    debug_log(&format!("console_resize {id} {cols}x{rows}"));
    let sessions = state.sessions.lock();
    let s = sessions
        .get(&id)
        .ok_or_else(|| format!("sesión '{id}' no existe"))?;
    let r = s.resize(cols.max(1), rows.max(1));
    debug_log(&format!("console_resize {id} done: {:?}", r.as_ref().err()));
    r
}

/// Mismo log file que helper/elevated.rs para tener todo en una sola línea
/// de tiempo. Prefijo `[cmd]` para distinguir de `[app]` (read_loop) y los
/// del helper.
fn debug_log(msg: &str) {
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
            let _ = writeln!(f, "[cmd] {msg}");
        }
    }
}

#[tauri::command]
pub async fn console_close(state: State<'_, ConsoleState>, id: String) -> Result<(), String> {
    let session = state.sessions.lock().remove(&id);
    if let Some(s) = session {
        // Best-effort: si el shell ya murió, kill devuelve error y lo ignoramos.
        let _ = s.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn console_default_shell() -> String {
    resolve_shell(None)
}

/// Descriptor de un shell ofrecido en el selector del frontend. `args` y `env`
/// vienen pre-armados con lo que tenga sentido para ese shell (p. ej. `-NoLogo`
/// + `POWERSHELL_UPDATECHECK=Off` para `pwsh.exe`); el frontend solo elige uno
/// y lo manda tal cual a `console_open`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellOption {
    pub id: String,
    pub label: String,
    pub program: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    /// Si está realmente disponible (encontrado en `PATH`).
    pub available: bool,
}

/// Lista de shells "conocidos" por plataforma, con `available` calculado por
/// `which`. El frontend filtra y muestra solo los disponibles.
#[tauri::command]
pub fn console_list_shells() -> Vec<ShellOption> {
    if cfg!(windows) {
        vec![
            ShellOption {
                id: "pwsh".into(),
                label: "PowerShell 7".into(),
                program: "pwsh.exe".into(),
                // `-NoLogo` saca el banner "PowerShell 7.x.y";
                // `POWERSHELL_UPDATECHECK=Off` saca el aviso "A new release
                // is available". Quedan los dos = consola limpia al arrancar.
                args: vec!["-NoLogo".into()],
                env: vec![("POWERSHELL_UPDATECHECK".into(), "Off".into())],
                available: which("pwsh.exe").is_some(),
            },
            ShellOption {
                id: "powershell".into(),
                label: "PowerShell 5".into(),
                program: "powershell.exe".into(),
                args: vec!["-NoLogo".into()],
                env: vec![],
                available: which("powershell.exe").is_some(),
            },
        ]
    } else {
        // Unix: $SHELL + un fallback razonable. Para portar más adelante.
        let mut out = Vec::new();
        if let Ok(shell) = std::env::var("SHELL") {
            let label = shell.rsplit('/').next().unwrap_or(&shell).to_string();
            out.push(ShellOption {
                id: "default".into(),
                label,
                program: shell.clone(),
                args: vec![],
                env: vec![],
                available: which(&shell).is_some(),
            });
        }
        for name in ["bash", "zsh", "fish"] {
            if which(name).is_some() {
                out.push(ShellOption {
                    id: name.into(),
                    label: name.into(),
                    program: name.into(),
                    args: vec![],
                    env: vec![],
                    available: true,
                });
            }
        }
        out
    }
}

// ── Payloads de eventos ────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OutputEvent {
    b64: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExitEvent {
    code: i32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CwdEvent {
    cwd: String,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/// Wrapper de `prompt` para PowerShell: antes de cada prompt, emite OSC 7 con
/// el cwd. Sin esto la consola arranca y nunca anuncia su cwd, así que el
/// frontend no puede persistir la ruta del tab. Se inyecta vía `-NoExit
/// -Command`, que corre DESPUÉS del profile del usuario — así envolvemos su
/// `prompt` custom si lo tiene. Mantenemos el wrapping en `try`/`catch` porque
/// si el prompt tira excepción el shell queda mudo.
const OSC7_POWERSHELL_INIT: &str = "$global:__qOldPrompt=$function:prompt;function global:prompt{try{$l=Get-Location;if($l.Provider.Name -eq 'FileSystem'){$u=[Uri]::EscapeUriString(($l.ProviderPath -replace '\\\\','/'));[Console]::Write([char]27+']7;file:///'+$u+[char]7)}}catch{};& $global:__qOldPrompt}";

/// Inyecta `-NoExit -Command <wrapper>` en los args si el shell es PowerShell
/// y no tiene ya un `-Command`/`-File` que mataría nuestro init. Para otros
/// shells (bash, zsh, fish) no hacemos nada por ahora — habría que setear
/// `PROMPT_COMMAND`/`precmd_functions`/`fish_prompt` vía init file.
fn inject_osc7_init(program: &str, mut args: Vec<String>) -> Vec<String> {
    if !is_powershell(program) {
        return args;
    }
    // Si el caller ya pasó -Command/-File, no pisamos su intención.
    if args.iter().any(|a| {
        let l = a.to_ascii_lowercase();
        matches!(l.as_str(), "-command" | "-c" | "-file" | "-f")
    }) {
        return args;
    }
    args.push("-NoExit".into());
    args.push("-Command".into());
    args.push(OSC7_POWERSHELL_INIT.into());
    args
}

fn is_powershell(program: &str) -> bool {
    let p = program.to_ascii_lowercase();
    let name = std::path::Path::new(&p)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&p);
    matches!(name, "pwsh" | "pwsh.exe" | "powershell" | "powershell.exe")
}

/// Default del shell por plataforma. Acepta override explícito del caller.
fn resolve_shell(requested: Option<&str>) -> String {
    if let Some(s) = requested {
        if !s.is_empty() {
            return s.to_string();
        }
    }
    if cfg!(windows) {
        // pwsh.exe (PowerShell 7+) si está en PATH; si no, powershell.exe.
        if which("pwsh.exe").is_some() {
            return "pwsh.exe".into();
        }
        "powershell.exe".into()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
    }
}

/// Mini-`which`: busca `name` en PATH y devuelve la primera coincidencia.
fn which(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Ruta al binario helper `quark-pty-host`. En desarrollo vive al lado del
/// exe principal (`src-tauri/target/.../`); en release también, porque
/// `tauri.conf.json` lo bundlea con `externalBin`.
fn helper_exe_path(app: &AppHandle) -> Option<PathBuf> {
    let exe_name = if cfg!(windows) {
        "quark-pty-host.exe"
    } else {
        "quark-pty-host"
    };
    // Misma carpeta que el exe actual: cubre dev y bundled.
    if let Ok(self_exe) = std::env::current_exe() {
        if let Some(parent) = self_exe.parent() {
            let candidate = parent.join(exe_name);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    // Fallback: resource_dir (algunos bundlers ubican sidecars ahí).
    if let Ok(resources) = app.path().resource_dir() {
        let candidate = resources.join(exe_name);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}
