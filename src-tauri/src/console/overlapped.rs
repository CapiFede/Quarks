//! Wrappers de `ReadFile`/`WriteFile` con **OVERLAPPED I/O** para los named
//! pipes del console quark.
//!
//! Sin esto, ambos extremos hacen `ReadFile`/`WriteFile` sync concurrentes
//! sobre el mismo HANDLE. El kernel de Windows serializa esas operaciones a
//! nivel `FILE_OBJECT`: la `WriteFile` espera a que la `ReadFile` previa
//! termine, pero la `ReadFile` está esperando bytes que justamente vendrían
//! del `WriteFile` → deadlock. `FILE_FLAG_OVERLAPPED` desactiva la
//! serialización: las operaciones se pueden encolar en paralelo y completan
//! independientemente.
//!
//! Mantenemos semántica sync para el caller: cada llamada inicia la operación
//! con un evento manual-reset, espera con `WaitForSingleObject` y devuelve el
//! resultado con `GetOverlappedResult`. No es la forma más eficiente (un
//! evento por I/O), pero el ancho de banda de una terminal lo absorbe sin
//! drama.

#![cfg(target_os = "windows")]

use std::io::{Read, Write};

use windows::Win32::Foundation::{CloseHandle, GetLastError, HANDLE, WAIT_OBJECT_0};
use windows::Win32::Storage::FileSystem::{ReadFile, WriteFile};
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject, INFINITE};
use windows::Win32::System::IO::{GetOverlappedResult, OVERLAPPED};

// Códigos Win32 que no están exportados como constantes tipadas en este perfil
// de la `windows` crate; las dejamos como literales con su significado.
const ERROR_IO_PENDING: u32 = 997;
const ERROR_BROKEN_PIPE: u32 = 109;

/// Reader sync sobre un HANDLE de pipe abierto con `FILE_FLAG_OVERLAPPED`.
///
/// Como `HANDLE` es `*mut c_void` (!Send), guardamos el puntero como `isize`
/// y reconstruimos el HANDLE en cada llamada. Es lo que el `windows` crate
/// hace internamente para exponer APIs Send-friendly.
pub struct OverlappedReader {
    raw: isize,
}

impl OverlappedReader {
    pub fn new(handle: HANDLE) -> Self {
        Self {
            raw: handle.0 as isize,
        }
    }
}

unsafe impl Send for OverlappedReader {}

impl Read for OverlappedReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let handle = HANDLE(self.raw as *mut std::ffi::c_void);
        overlapped_io(handle, |h, ov, bytes| unsafe {
            ReadFile(h, Some(buf), Some(bytes), Some(ov))
        })
    }
}

/// Writer sync sobre un HANDLE de pipe overlapped. Cada `write` escribe el
/// slice ENTERO (loop si WriteFile devuelve menos bytes).
pub struct OverlappedWriter {
    raw: isize,
}

impl OverlappedWriter {
    pub fn new(handle: HANDLE) -> Self {
        Self {
            raw: handle.0 as isize,
        }
    }
}

unsafe impl Send for OverlappedWriter {}

impl Write for OverlappedWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let handle = HANDLE(self.raw as *mut std::ffi::c_void);
        overlapped_io(handle, |h, ov, bytes| unsafe {
            WriteFile(h, Some(buf), Some(bytes), Some(ov))
        })
    }
    fn flush(&mut self) -> std::io::Result<()> {
        // Los pipes Win32 no tienen flush por API: los bytes ya están en el
        // buffer del kernel cuando WriteFile retorna. No-op consciente.
        Ok(())
    }
}

/// Núcleo común: arma un OVERLAPPED con evento manual-reset, dispara `op`,
/// espera completion y devuelve los bytes transferidos.
///
/// - Si la operación completa sync (ReadFile/WriteFile devuelve Ok), usa los
///   bytes que reportó el out-param.
/// - Si devuelve Err con `ERROR_IO_PENDING`, esperamos al evento y leemos
///   el resultado con `GetOverlappedResult`.
/// - `ERROR_BROKEN_PIPE` → `Ok(0)` (EOF), tanto en path sync como async.
/// - Cualquier otro error se propaga como `io::Error`.
fn overlapped_io<F>(handle: HANDLE, op: F) -> std::io::Result<usize>
where
    F: FnOnce(HANDLE, *mut OVERLAPPED, *mut u32) -> windows::core::Result<()>,
{
    let event = unsafe { CreateEventW(None, true, false, None) }
        .map_err(|e| std::io::Error::other(format!("CreateEventW: {e}")))?;
    if event.is_invalid() {
        return Err(std::io::Error::other("CreateEventW devolvió INVALID_HANDLE"));
    }
    let mut overlapped: OVERLAPPED = unsafe { std::mem::zeroed() };
    overlapped.hEvent = event;
    let mut bytes = 0u32;

    let initial = op(handle, &mut overlapped as *mut _, &mut bytes as *mut _);

    let result = match initial {
        Ok(()) => {
            // Completó sync. `bytes` está poblado.
            Ok(bytes as usize)
        }
        Err(_) => {
            let err = unsafe { GetLastError().0 };
            if err == ERROR_BROKEN_PIPE {
                Ok(0)
            } else if err != ERROR_IO_PENDING {
                Err(std::io::Error::from_raw_os_error(err as i32))
            } else {
                // Pending: bloquear hasta el evento. WaitForSingleObject sobre
                // un evento manual-reset es señalado por la I/O completion.
                let wait = unsafe { WaitForSingleObject(event, INFINITE) };
                if wait != WAIT_OBJECT_0 {
                    Err(std::io::Error::other(format!(
                        "WaitForSingleObject pipe I/O: {wait:?}"
                    )))
                } else {
                    let mut done = 0u32;
                    let g = unsafe {
                        GetOverlappedResult(handle, &overlapped, &mut done, false)
                    };
                    match g {
                        Ok(()) => Ok(done as usize),
                        Err(_) => {
                            let err = unsafe { GetLastError().0 };
                            if err == ERROR_BROKEN_PIPE {
                                Ok(0)
                            } else {
                                Err(std::io::Error::from_raw_os_error(err as i32))
                            }
                        }
                    }
                }
            }
        }
    };

    unsafe {
        let _ = CloseHandle(event);
    }
    result
}
