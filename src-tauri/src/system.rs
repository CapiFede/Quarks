//! Backend del tab **System** del quark Utils (desktop-only, Linux-first).
//!
//! Expone un único comando, `system_run_script`, que corre un script de shell
//! y streamea su salida al frontend por eventos Tauri por ejecución:
//!
//!   - `system:output:<id>` → `{ line: string }` por cada línea de stdout/stderr.
//!   - `system:exit:<id>`    → `{ code: i32 }` cuando el proceso termina.
//!
//! El script se escribe a un archivo temporal y se corre con `bash`. Si
//! `privileged` es true, se corre con `pkexec bash <tmp>`: polkit muestra UN
//! solo diálogo gráfico de autenticación que cubre todo el script — el UX
//! correcto para los tweaks de sistema de un tab "un botón = una acción".
//! `pkexec` es Linux-only; en otra plataforma el spawn falla con error claro,
//! lo cual es aceptable porque este tab apunta a CachyOS (ver CLAUDE.md).
//!
//! A diferencia del quark-console (PTY interactivo), acá NO hay input del
//! usuario: es fire-and-forget con log en vivo. Por eso line-based en vez de
//! bytes crudos — la salida va a un panel de texto, no a un emulador de terminal.

use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunArgs {
    /// Id único de ejecución. Namespacea el archivo temporal y los eventos.
    pub id: String,
    /// Cuerpo del script (bash). Se escribe tal cual a un `.sh` temporal.
    pub script: String,
    /// Si true, se corre vía `pkexec` (auth gráfica de polkit).
    #[serde(default)]
    pub privileged: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OutputEvent {
    line: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExitEvent {
    code: i32,
}

/// Async para que Tauri lo despache a un worker thread: el body es sync
/// (spawn + `wait()` bloqueante), pero si corriera en el main thread la UI se
/// congelaría mientras el script corre. Mismo patrón que `console_open`.
#[tauri::command]
pub async fn system_run_script(app: AppHandle, args: RunArgs) -> Result<(), String> {
    // Script → archivo temporal. El id namespacea el nombre para no pisar
    // ejecuciones concurrentes de distintos tweaks.
    let path = std::env::temp_dir().join(format!("quark-sys-{}.sh", sanitize(&args.id)));
    std::fs::write(&path, args.script.as_bytes())
        .map_err(|e| format!("no pude escribir el script temporal: {e}"))?;

    let script_path = path.to_string_lossy().into_owned();
    let (program, cmd_args): (&str, Vec<String>) = if args.privileged {
        ("pkexec", vec!["bash".into(), script_path])
    } else {
        ("bash", vec![script_path])
    };

    let mut child = Command::new(program)
        .args(&cmd_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let _ = std::fs::remove_file(&path);
            format!("no pude lanzar `{program}`: {e}")
        })?;

    // Un hilo por stream: stdout y stderr se emiten al MISMO canal de output
    // (el panel del frontend no los distingue; el orden relativo entre ambos no
    // está garantizado, pero cada línea llega íntegra).
    let h_out = child.stdout.take().map(|out| {
        let app = app.clone();
        let id = args.id.clone();
        thread::spawn(move || stream_lines(out, &app, &id))
    });
    let h_err = child.stderr.take().map(|err| {
        let app = app.clone();
        let id = args.id.clone();
        thread::spawn(move || stream_lines(err, &app, &id))
    });

    let code = child.wait().map(|s| s.code().unwrap_or(-1)).unwrap_or(-1);
    if let Some(h) = h_out {
        let _ = h.join();
    }
    if let Some(h) = h_err {
        let _ = h.join();
    }
    let _ = std::fs::remove_file(&path);

    let _ = app.emit(&format!("system:exit:{}", args.id), ExitEvent { code });
    Ok(())
}

/// Lee `reader` línea por línea y emite cada una por `system:output:<id>`.
/// Termina al cerrarse el stream (EOF) o ante un error de IO.
fn stream_lines<R: Read>(reader: R, app: &AppHandle, id: &str) {
    let buf = BufReader::new(reader);
    let channel = format!("system:output:{id}");
    for line in buf.lines() {
        match line {
            Ok(line) => {
                let _ = app.emit(&channel, OutputEvent { line });
            }
            Err(_) => break,
        }
    }
}

/// Deja solo caracteres seguros para un nombre de archivo. El id viene del
/// frontend (controlado), pero igual lo saneamos para no construir rutas raras.
fn sanitize(id: &str) -> String {
    id.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect()
}
