// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // WebKitGTK (Linux): el renderer DMABUF acumula buffers GPU sin liberarlos
  // mientras hay compositing activo (animaciones del player, cursor de la
  // terminal, spinners), haciendo crecer el RSS sin techo hasta que el
  // WebProcess crashea por OOM. Desactivarlo corta la fuga manteniendo el
  // compositing acelerado. Debe setearse ANTES de que Tauri cree el webview.
  #[cfg(target_os = "linux")]
  if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
  }

  app_lib::run();
}
