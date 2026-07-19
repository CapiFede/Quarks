// Capa de música cross-platform (escaneo + tags + portadas + gestión de
// archivos). La reproducción de música está adentro de music.rs pero detrás de
// cfg(not(android)): en Android se reproduce con HTMLAudioElement en el frontend.
mod music;

// Secretos (API keys, tokens OAuth): keyring del SO en desktop, JSON en el
// almacenamiento privado de la app en Android. Compila en todas las plataformas.
mod secrets;

// Módulos desktop-only:
//   - download: yt-dlp + ffmpeg (binarios externos, no aplican en sandbox Android).
//   - console:  PTY real con portable-pty + helper elevado por UAC (Windows).
#[cfg(not(target_os = "android"))]
mod download;
// `pub` para que el binario `quark-pty-host` (mismo crate) pueda usar el
// módulo `protocol` y compartir el framing del named pipe con la app.
#[cfg(not(target_os = "android"))]
pub mod console;
// Tab System del quark Utils: corre scripts de shell (tweaks/instalación/backup)
// con salida en vivo. Desktop-only (usa `bash`/`pkexec`). Ver `system.rs`.
#[cfg(not(target_os = "android"))]
mod system;
// Editor de audio/video (recorte + reconcatenado con ffmpeg). Desktop-only:
// depende de ffmpeg/ffprobe externos, igual que las descargas de Música. Ver
// `editor.rs`.
#[cfg(not(target_os = "android"))]
mod editor;
// Controles de media del SO (MPRIS) para el quark Música. La integración real
// es Linux-only; en Windows/macOS el módulo expone comandos no-op. Ver `mpris.rs`.
#[cfg(not(target_os = "android"))]
mod mpris;

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

  // Estado del console quark — registry de sesiones PTY activas.
  #[cfg(not(target_os = "android"))]
  let builder = builder.manage(console::ConsoleState::new());

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
    download::music_probe_url,
    download::music_download,
    console::console_open,
    console::console_write,
    console::console_resize,
    console::console_close,
    console::console_default_shell,
    console::console_list_shells,
    system::system_run_script,
    editor::editor_list_songs,
    editor::editor_import,
    editor::editor_probe,
    editor::editor_suggest_song_dest,
    editor::editor_export,
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
