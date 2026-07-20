//! Backup manual a Google Drive: comprime una carpeta cualquiera del disco y la
//! sube como un único zip.
//!
//! No confundir con el sync (`services/account/sync.ts`). El sync espeja, de
//! forma incremental y bidireccional, el árbol GESTIONADO de la app
//! (`settings.json` + `spaces/` + `packages/` + `quarky/`) contra la carpeta
//! "Quarks" del Drive. Esto es otra cosa: un volcado COMPLETO, manual y de una
//! sola dirección, de una carpeta arbitraria, a una carpeta aparte del Drive.
//! Pensado para migraciones o formateos, donde querés un solo archivo gordo.
//!
//! Por qué vive en Rust y no en el frontend:
//!   - **Memoria.** El zip se arma por streaming (`io::copy` archivo por
//!     archivo), así un backup de decenas de GB nunca toca el heap del WebView.
//!   - **Tamaño de subida.** El `upload()` del sync usa `uploadType=media` con
//!     el archivo entero en un `Uint8Array`; la Drive API solo banca eso para
//!     archivos chicos. Acá usamos **resumable upload** en chunks de 8 MiB, que
//!     es el camino soportado para archivos grandes.
//!
//! El reemplazo del backup anterior NO se hace acá: este módulo sube el zip
//! nuevo y devuelve su id. Recién cuando la subida terminó OK, el frontend
//! manda el viejo a la papelera (ver `services/account/backup.ts`). Así una
//! subida interrumpida nunca te deja sin el backup bueno.
//!
//! Desktop-only: depende de `ureq` y `zip`, que en el Cargo.toml viven en el
//! bloque `cfg(not(target_os = "android"))`.

use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

/// Tamaño de chunk de subida. La Drive API exige que los tramos intermedios de
/// un resumable upload sean múltiplo de 256 KiB; 8 MiB es un buen balance entre
/// cantidad de requests y memoria por chunk.
const CHUNK: usize = 8 * 1024 * 1024;

const UPLOAD_ENDPOINT: &str = "https://www.googleapis.com/upload/drive/v3/files";

/// Mensaje de error con el que se corta una operación cancelada. El frontend lo
/// compara para mostrarlo como aviso y no como error rojo.
pub const CANCELLED: &str = "Backup cancelado.";

/// Flag de cancelación compartido entre `backup_run` y `backup_cancel`.
/// Se resetea al arrancar cada backup.
#[derive(Default)]
pub struct BackupState {
    cancel: AtomicBool,
}

impl BackupState {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Peso de lo que se va a respaldar, para mostrarlo antes de arrancar (el zip
/// temporal necesita espacio libre en disco, así que conviene que el usuario lo
/// vea de antemano).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEstimate {
    files: u64,
    bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "phase")]
pub enum BackupProgress {
    Scanning,
    Zipping { done: u64, total: u64, file: String },
    Zipped { bytes: u64 },
    Uploading { sent: u64, total: u64 },
    Done { file_id: String },
}

// ── Comandos ─────────────────────────────────────────────────────────────────

/// Cuenta archivos y bytes de `source` sin comprimir nada.
#[tauri::command]
pub fn backup_estimate(source: String) -> Result<BackupEstimate, String> {
    let src = PathBuf::from(&source);
    if !src.is_dir() {
        return Err(format!("No existe la carpeta: {source}"));
    }
    scan(&src)
}

/// Marca la operación en curso para que corte en el próximo punto de chequeo
/// (entre archivos al comprimir, entre chunks al subir).
#[tauri::command]
pub fn backup_cancel(state: State<'_, BackupState>) {
    state.cancel.store(true, Ordering::Relaxed);
}

/// Comprime `source` y lo sube a `folder_id` como `file_name`. Devuelve el id
/// del archivo creado en Drive.
///
/// El error sale por `Result`; el progreso por `Channel`. Bloqueante: corre en
/// el pool de Tauri, igual que las descargas del quark de música.
#[tauri::command]
pub fn backup_run(
    app: AppHandle,
    state: State<'_, BackupState>,
    source: String,
    access_token: String,
    folder_id: String,
    file_name: String,
    on: Channel<BackupProgress>,
) -> Result<String, String> {
    state.cancel.store(false, Ordering::Relaxed);

    let src = PathBuf::from(&source);
    if !src.is_dir() {
        return Err(format!("No existe la carpeta: {source}"));
    }

    let _ = on.send(BackupProgress::Scanning);
    let est = scan(&src)?;
    if est.files == 0 {
        return Err(format!("La carpeta está vacía: {source}"));
    }

    // El zip temporal va bajo `<AppData>/tmp/`. A propósito NO en /tmp: en varias
    // distros es tmpfs (RAM), y un backup de varios GB la haría volar. La raíz de
    // AppData tampoco sincroniza salvo el allowlist (`settings.json` + `spaces/`
    // + `packages/` + `quarky/`), así que `tmp/` queda fuera del sync.
    let tmp_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("tmp");
    fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let tmp_zip = tmp_dir.join("backup.zip");

    // Closure para poder limpiar el zip temporal pase lo que pase (puede pesar GB).
    let result = (|| {
        let bytes = zip_dir(&src, &tmp_zip, est.files, &on, &state.cancel)?;
        let _ = on.send(BackupProgress::Zipped { bytes });
        upload_resumable(
            &tmp_zip,
            bytes,
            &access_token,
            &folder_id,
            &file_name,
            &on,
            &state.cancel,
        )
    })();
    let _ = fs::remove_file(&tmp_zip);

    let file_id = result?;
    let _ = on.send(BackupProgress::Done {
        file_id: file_id.clone(),
    });
    Ok(file_id)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Recorre `src` contando archivos regulares y su peso. Los directorios y los
/// symlinks no suman (no seguimos links: evita ciclos y duplicados).
fn scan(src: &Path) -> Result<BackupEstimate, String> {
    let mut files = 0u64;
    let mut bytes = 0u64;
    for entry in WalkDir::new(src).follow_links(false) {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().is_file() {
            files += 1;
            bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    Ok(BackupEstimate { files, bytes })
}

/// Comprime `src` (recursivo) en `dest` y devuelve el peso del zip resultante.
///
/// Las rutas dentro del zip son relativas a `src` y con separador POSIX, así al
/// descomprimir sale la misma estructura sin el prefijo absoluto de esta máquina
/// y se abre igual en Windows/macOS.
fn zip_dir(
    src: &Path,
    dest: &Path,
    total: u64,
    on: &Channel<BackupProgress>,
    cancel: &AtomicBool,
) -> Result<u64, String> {
    let file = File::create(dest).map_err(|e| format!("No pude crear el zip temporal: {e}"))?;
    let mut zip = ZipWriter::new(io::BufWriter::new(file));
    let mut done = 0u64;
    // Cota de eventos: con 100k archivos no queremos 100k mensajes por el IPC.
    let step = (total / 200).max(1);

    for entry in WalkDir::new(src).follow_links(false) {
        if cancel.load(Ordering::Relaxed) {
            return Err(CANCELLED.to_string());
        }
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let rel = path.strip_prefix(src).map_err(|e| e.to_string())?;
        if rel.as_os_str().is_empty() {
            continue; // la raíz misma
        }
        let name = rel.to_string_lossy().replace('\\', "/");

        if entry.file_type().is_dir() {
            zip.add_directory(name, SimpleFileOptions::default())
                .map_err(|e| e.to_string())?;
            continue;
        }
        // Solo archivos regulares: symlinks, sockets y FIFOs se saltean.
        if !entry.file_type().is_file() {
            continue;
        }

        let len = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let opts = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            // Arriba de 4 GiB hacen falta headers zip64.
            .large_file(len >= u32::MAX as u64);

        zip.start_file(name.clone(), opts)
            .map_err(|e| e.to_string())?;
        let mut f =
            File::open(path).map_err(|e| format!("No pude leer {}: {e}", path.display()))?;
        io::copy(&mut f, &mut zip).map_err(|e| format!("Falló al comprimir {}: {e}", path.display()))?;

        done += 1;
        if done % step == 0 || done == total {
            let _ = on.send(BackupProgress::Zipping { done, total, file: name });
        }
    }

    let mut out = zip.finish().map_err(|e| e.to_string())?;
    out.flush().map_err(|e| e.to_string())?;
    drop(out);
    fs::metadata(dest).map(|m| m.len()).map_err(|e| e.to_string())
}

/// Sube `zip_path` a Drive con **resumable upload**.
///
/// Dos pasos: se abre una sesión (POST con la metadata, que responde la URL de
/// sesión en el header `Location`) y después se mandan chunks con `Content-Range`.
/// Drive contesta `308 Resume Incomplete` mientras falten tramos y `200/201`
/// con el JSON del archivo en el último. `ureq` trata los no-2xx como `Err`, así
/// que el 308 se captura explícitamente.
fn upload_resumable(
    zip_path: &Path,
    total: u64,
    access_token: &str,
    folder_id: &str,
    file_name: &str,
    on: &Channel<BackupProgress>,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let metadata = serde_json::json!({ "name": file_name, "parents": [folder_id] });
    let init = ureq::post(&format!("{UPLOAD_ENDPOINT}?uploadType=resumable&fields=id,name"))
        .set("Authorization", &format!("Bearer {access_token}"))
        .set("Content-Type", "application/json; charset=UTF-8")
        .set("X-Upload-Content-Type", "application/zip")
        .set("X-Upload-Content-Length", &total.to_string())
        .send_string(&metadata.to_string())
        .map_err(|e| format!("No pude abrir la sesión de subida: {e}"))?;
    let session = init
        .header("Location")
        .ok_or("Drive no devolvió la URL de sesión (header Location).")?
        .to_string();

    let mut f = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; CHUNK];
    let mut sent = 0u64;

    let _ = on.send(BackupProgress::Uploading { sent: 0, total });
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(CANCELLED.to_string());
        }
        let n = read_chunk(&mut f, &mut buf)?;
        if n == 0 {
            break;
        }
        let end = sent + n as u64 - 1;
        let res = ureq::put(&session)
            .set("Content-Range", &format!("bytes {sent}-{end}/{total}"))
            .send_bytes(&buf[..n]);

        match res {
            // Último chunk: Drive devuelve el archivo creado.
            Ok(r) => {
                // `into_string` + `serde_json` en vez de `into_json()`: ese helper
                // vive detrás de la feature `json` de ureq, que no habilitamos.
                let body = r.into_string().map_err(|e| e.to_string())?;
                let v: serde_json::Value =
                    serde_json::from_str(&body).map_err(|e| e.to_string())?;
                let id = v
                    .get("id")
                    .and_then(|x| x.as_str())
                    .ok_or("Drive no devolvió el id del archivo subido.")?;
                let _ = on.send(BackupProgress::Uploading { sent: total, total });
                return Ok(id.to_string());
            }
            // Faltan tramos: seguimos.
            Err(ureq::Error::Status(308, _)) => {
                sent += n as u64;
                let _ = on.send(BackupProgress::Uploading { sent, total });
            }
            Err(e) => return Err(format!("Falló la subida a Drive: {e}")),
        }
    }

    Err("La subida terminó sin confirmación de Drive.".to_string())
}

/// Llena `buf` con lecturas sucesivas hasta completarlo o llegar al EOF.
/// `Read::read` puede devolver menos bytes de los pedidos y los chunks
/// intermedios de Drive tienen que ser múltiplo exacto de 256 KiB.
fn read_chunk(f: &mut File, buf: &mut [u8]) -> Result<usize, String> {
    let mut n = 0;
    while n < buf.len() {
        match f.read(&mut buf[n..]) {
            Ok(0) => break,
            Ok(k) => n += k,
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(n)
}
