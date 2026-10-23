//! Secretos (API keys, tokens OAuth).
//!
//! Desktop usa el almacén nativo del SO vía la crate `keyring` (Credential
//! Manager en Windows, Secret Service en Linux); los secretos no tocan disco en
//! claro. Android no tiene esa crate ni un keyring equivalente accesible, así
//! que se guardan en un JSON dentro del almacenamiento privado de la app
//! (sandbox del SO: sólo legible por Quarks). Ambos backends exponen los mismos
//! comandos Tauri (`secret_set` / `secret_get` / `secret_delete`).

// ── Desktop: keyring del SO ─────────────────────────────────────────────────

#[cfg(not(target_os = "android"))]
use keyring::{Entry, Error as KeyringError};

/// Nombre de servicio bajo el que se agrupan todos los secretos de Quarks.
#[cfg(not(target_os = "android"))]
const SERVICE: &str = "Quarks";

#[cfg(not(target_os = "android"))]
fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

/// Guarda (o reemplaza) el secreto identificado por `key`.
#[cfg(not(target_os = "android"))]
#[tauri::command(async)]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

/// Devuelve el secreto o `None` si no existe.
#[cfg(not(target_os = "android"))]
#[tauri::command(async)]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Borra el secreto. No falla si no existía.
#[cfg(not(target_os = "android"))]
#[tauri::command(async)]
pub fn secret_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ── Android: JSON en el almacenamiento privado de la app ────────────────────

#[cfg(target_os = "android")]
use std::collections::HashMap;
#[cfg(target_os = "android")]
use std::path::PathBuf;
#[cfg(target_os = "android")]
use tauri::{AppHandle, Manager};

/// `secrets.json` en el almacenamiento privado de la app (sólo legible por
/// Quarks bajo el sandbox de Android).
#[cfg(target_os = "android")]
fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("secrets.json"))
}

#[cfg(target_os = "android")]
fn load(app: &AppHandle) -> Result<HashMap<String, String>, String> {
    match std::fs::read_to_string(store_path(app)?) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(HashMap::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(target_os = "android")]
fn store(app: &AppHandle, map: &HashMap<String, String>) -> Result<(), String> {
    let json = serde_json::to_string(map).map_err(|e| e.to_string())?;
    std::fs::write(store_path(app)?, json).map_err(|e| e.to_string())
}

/// Guarda (o reemplaza) el secreto identificado por `key`.
#[cfg(target_os = "android")]
#[tauri::command(async)]
pub fn secret_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let mut map = load(&app)?;
    map.insert(key, value);
    store(&app, &map)
}

/// Devuelve el secreto o `None` si no existe.
#[cfg(target_os = "android")]
#[tauri::command(async)]
pub fn secret_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    Ok(load(&app)?.get(&key).cloned())
}

/// Borra el secreto. No falla si no existía.
#[cfg(target_os = "android")]
#[tauri::command(async)]
pub fn secret_delete(app: AppHandle, key: String) -> Result<(), String> {
    let mut map = load(&app)?;
    map.remove(&key);
    store(&app, &map)
}
