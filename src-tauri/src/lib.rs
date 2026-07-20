// Capa de música cross-platform (escaneo + tags + portadas + gestión de
// archivos). La reproducción de música está adentro de music.rs pero detrás de
// cfg(not(android)): en Android se reproduce con HTMLAudioElement en el frontend.
mod music;

// Secretos (API keys, tokens OAuth): keyring del SO en desktop, JSON en el
// almacenamiento privado de la app en Android. Compila en todas las plataformas.
mod secrets;

// Módulos desktop-only:
//   - download: yt-dlp + ffmpeg (binarios externos, no aplican en sandbox Android).
#[cfg(not(target_os = "android"))]
mod download;
// Recorte de canciones del quark Música (trim con ffmpeg). Desktop-only:
// depende de ffmpeg/ffprobe externos, igual que las descargas. Ver `trim.rs`.
#[cfg(not(target_os = "android"))]
mod trim;
// Controles de media del SO (MPRIS) para el quark Música. La integración real
// es Linux-only; en Windows/macOS el módulo expone comandos no-op. Ver `mpris.rs`.
#[cfg(not(target_os = "android"))]
mod mpris;
// Backup manual a Drive: zip por streaming de una carpeta cualquiera + resumable
// upload. Desktop-only porque usa `zip` y `ureq`. Ver `backup.rs`.
#[cfg(not(target_os = "android"))]
mod backup;

// `Manager::manage` (registro del estado MPRIS en setup) — solo se usa en Linux.
#[cfg(target_os = "linux")]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_dialog::init())
    // Clipboard del SO: el frontend lo usa para leer imágenes pegadas cuando el
    // WebView no las expone (caso WebKitGTK en Linux).
    .plugin(tauri_plugin_clipboard_manager::init())
    // Deep link: en Android cierra el flujo OAuth (intent-filter en
    // AndroidManifest captura `com.googleusercontent.apps.<ID>:/oauth2redirect`).
    // En desktop también se usa para casos custom; el flujo de login desktop
    // sigue por tauri-plugin-oauth (loopback HTTP) — son complementarios.
    .plugin(tauri_plugin_deep_link::init());

  // Plugins desktop-only.
  // - autostart: no aplica en Android (no hay "abrir al iniciar" como en escritorio).
  // - oauth (loopback HTTP en localhost): patrón de escritorio; Android usa
  //   Custom Tabs + deep link, que es otro plugin distinto.
  #[cfg(not(target_os = "android"))]
  let builder = builder
    .plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      None::<Vec<&str>>,
    ))
    .plugin(tauri_plugin_oauth::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init());

  // Estado del thread de audio (rodio) del music quark — desktop-only.
  #[cfg(not(target_os = "android"))]
  let builder = builder.manage(music::AudioState::new());

  // Flag de cancelación del backup manual a Drive.
  #[cfg(not(target_os = "android"))]
  let builder = builder.manage(backup::BackupState::new());

  // Solo se puede llamar a `invoke_handler` una vez por builder, así que
  // armamos dos sets distintos por plataforma:
  //   - Android: solo las file ops del music quark (escaneo, tags, gestión).
  //     La reproducción la maneja el frontend con HTMLAudioElement.
  //   - Desktop: agrega los comandos de reproducción (rodio), descargas
  //     (yt-dlp + ffmpeg) y secretos (keyring).
  #[cfg(target_os = "android")]
  let builder = builder.invoke_handler(tauri::generate_handler![
    secrets::secret_set,
    secrets::secret_get,
    secrets::secret_delete,
    music::music_songs_dir,
    music::music_scan,
    music::music_delete_track,
    music::music_rename_track,
    music::music_get_cover,
    music::music_set_cover,
  ]);

  #[cfg(not(target_os = "android"))]
  let builder = builder.invoke_handler(tauri::generate_handler![
    secrets::secret_set,
    secrets::secret_get,
    secrets::secret_delete,
    music::music_songs_dir,
    music::music_scan,
    music::music_play,
    music::music_pause,
    music::music_resume,
    music::music_stop,
    music::music_seek,
    music::music_set_volume,
    music::music_delete_track,
    music::music_rename_track,
    music::music_get_cover,
    music::music_set_cover,
    mpris::mpris_set_metadata,
    mpris::mpris_set_playback,
    download::music_tools_status,
    download::music_tools_setup,
    download::music_tools_check_update,
    download::music_probe_url,
    download::music_download,
    trim::music_trim_probe,
    trim::music_trim_suggest_dest,
    trim::music_trim_export,
    backup::backup_estimate,
    backup::backup_run,
    backup::backup_cancel,
  ]);

  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Servicio MPRIS del quark Música (teclas multimedia + widget del SO).
      // Se arranca acá porque el handler necesita el AppHandle para emitir
      // eventos al frontend. Solo Linux por ahora.
      #[cfg(target_os = "linux")]
      app.manage(mpris::MprisState::spawn(app.handle().clone()));
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
