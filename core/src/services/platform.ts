/**
 * Detección de plataforma a nivel UI. Se evalúa una sola vez al cargar el módulo
 * porque la ventana de WebView no migra entre dispositivos en vivo.
 *
 * Por qué userAgent y no `@tauri-apps/plugin-os`: el plugin es async y queremos
 * usar este flag en `render()` de muchos componentes sin esperar nada. El UA del
 * WebView en Tauri Android contiene "Android" — suficiente y estable.
 */

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

export const isAndroid = /Android/i.test(ua);
export const isDesktop = !isAndroid;
/**
 * Linux de escritorio (WebKitGTK): su UA contiene "Linux" pero no "Android".
 * Lo usa el quark Música para activar la integración MPRIS (teclas multimedia +
 * widget del reproductor del SO), que hoy es Linux-only.
 */
export const isLinux = isDesktop && /Linux/i.test(ua);
