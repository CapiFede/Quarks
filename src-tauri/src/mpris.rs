//! Integración con los controles de media del SO para el quark Música.
//!
//! Hoy **solo Linux**, vía MPRIS (`org.mpris.MediaPlayer2`) con `souvlaki` sobre
//! D-Bus (backend zbus, Rust puro). Esto hace que:
//!   - las teclas multimedia del teclado/auriculares (Play/Pause, Siguiente,
//!     Anterior, Stop) controlen la reproducción, y
//!   - el widget del reproductor del SO (GNOME/KDE, lockscreen) muestre qué
//!     suena y permita controlarlo.
//!
//! Arquitectura (espeja el thread de audio de `music.rs`): `souvlaki` mantiene
//! un servicio D-Bus vivo en su propio thread. Como el control de reproducción
//! es del frontend (el `MusicStore` es la fuente de verdad), MPRIS se usa solo
//! como mando a distancia + display:
//!   - OS → app: el handler de `souvlaki` emite el evento Tauri `mpris:event`,
//!     que el store escucha para llamar a `togglePlay`/`next`/`prev`/etc.
//!   - app → OS: el store invoca `mpris_set_metadata` / `mpris_set_playback`
//!     para reflejar el track y el estado de reproducción en el widget.
//!
//! En Windows/macOS los comandos son no-ops (ver el módulo `stub` al final): la
//! integración se portará a esas plataformas más adelante (souvlaki ya las
//! cubre, solo falta cablearlas).

#[cfg(target_os = "linux")]
mod imp {
    use std::sync::mpsc::{self, Receiver, Sender};
    use std::sync::Mutex;
    use std::thread;
    use std::time::Duration;

    use serde::Serialize;
    use souvlaki::{
        MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition,
        PlatformConfig,
    };
    use tauri::{AppHandle, Emitter, State};

    /// Estado del player que el frontend empuja al widget del SO.
    enum PlaybackKind {
        Playing,
        Paused,
        Stopped,
    }

    /// Comandos que el thread de MPRIS aplica sobre los `MediaControls` (que son
    /// `!Sync` y viven en su propio thread, igual que el `OutputStream` de rodio).
    enum MprisCmd {
        Metadata {
            title: Option<String>,
            artist: Option<String>,
            album: Option<String>,
            duration_sec: Option<f64>,
        },
        Playback {
            kind: PlaybackKind,
            position_sec: f64,
        },
    }

    /// Evento del SO hacia el frontend (`mpris:event`). `position_sec` solo viene
    /// para la acción `seek` (la barra del widget).
    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct MprisEvent {
        action: &'static str,
        position_sec: Option<f64>,
    }

    /// Estado gestionado por Tauri: solo el extremo emisor del canal hacia el
    /// thread de MPRIS. Si el servicio no se pudo abrir (sin D-Bus), el thread
    /// descarta los comandos y quedan como no-op.
    pub struct MprisState {
        tx: Mutex<Sender<MprisCmd>>,
    }

    impl MprisState {
        /// Arranca el thread de MPRIS. Necesita el `AppHandle` para emitir los
        /// eventos del SO al frontend, por eso se crea en `setup()`.
        pub fn spawn(app: AppHandle) -> Self {
            let (tx, rx) = mpsc::channel::<MprisCmd>();
            thread::spawn(move || mpris_thread(app, rx));
            MprisState { tx: Mutex::new(tx) }
        }

        fn send(&self, cmd: MprisCmd) -> Result<(), String> {
            let guard = self.tx.lock().map_err(|e| e.to_string())?;
            guard.send(cmd).map_err(|e| e.to_string())
        }
    }

    /// Traduce un evento de `souvlaki` a la acción que entiende el store. Devuelve
    /// `None` para los que no manejamos (volumen, raise, quit, open uri…).
    fn map_event(event: &MediaControlEvent) -> Option<MprisEvent> {
        let (action, position_sec) = match event {
            MediaControlEvent::Play => ("play", None),
            MediaControlEvent::Pause => ("pause", None),
            MediaControlEvent::Toggle => ("toggle", None),
            MediaControlEvent::Next => ("next", None),
            MediaControlEvent::Previous => ("prev", None),
            MediaControlEvent::Stop => ("stop", None),
            MediaControlEvent::SetPosition(MediaPosition(d)) => ("seek", Some(d.as_secs_f64())),
            _ => return None,
        };
        Some(MprisEvent {
            action,
            position_sec,
        })
    }

    fn mpris_thread(app: AppHandle, rx: Receiver<MprisCmd>) {
        let config = PlatformConfig {
            // Bus name final: `org.mpris.MediaPlayer2.quarks`.
            dbus_name: "quarks",
            display_name: "Quarks",
            // Solo Windows usa hwnd.
            hwnd: None,
        };
        let mut controls = match MediaControls::new(config) {
            Ok(c) => c,
            // Sin D-Bus (entorno raro / headless): el thread termina y los
            // comandos pasan a fallar; el frontend se los come en silencio.
            Err(_) => return,
        };

        // El handler corre en el thread interno de souvlaki; reenvía al frontend.
        let app_for_handler = app.clone();
        if controls
            .attach(move |event: MediaControlEvent| {
                if let Some(ev) = map_event(&event) {
                    let _ = app_for_handler.emit("mpris:event", ev);
                }
            })
            .is_err()
        {
            return;
        }

        // Mantenemos `controls` vivo (sostiene el servicio D-Bus) y aplicamos las
        // actualizaciones de metadata/estado que llegan del store.
        while let Ok(cmd) = rx.recv() {
            match cmd {
                MprisCmd::Metadata {
                    title,
                    artist,
                    album,
                    duration_sec,
                } => {
                    let _ = controls.set_metadata(MediaMetadata {
                        title: title.as_deref(),
                        artist: artist.as_deref(),
                        album: album.as_deref(),
                        cover_url: None,
                        duration: duration_sec.map(Duration::from_secs_f64),
                    });
                }
                MprisCmd::Playback { kind, position_sec } => {
                    let progress =
                        Some(MediaPosition(Duration::from_secs_f64(position_sec.max(0.0))));
                    let playback = match kind {
                        PlaybackKind::Playing => MediaPlayback::Playing { progress },
                        PlaybackKind::Paused => MediaPlayback::Paused { progress },
                        PlaybackKind::Stopped => MediaPlayback::Stopped,
                    };
                    let _ = controls.set_playback(playback);
                }
            }
        }
    }

    /// Refleja el track actual en el widget del SO.
    #[tauri::command]
    pub fn mpris_set_metadata(
        state: State<MprisState>,
        title: Option<String>,
        artist: Option<String>,
        album: Option<String>,
        duration_sec: Option<f64>,
    ) -> Result<(), String> {
        state.send(MprisCmd::Metadata {
            title,
            artist,
            album,
            duration_sec,
        })
    }

    /// Refleja el estado de reproducción (+ posición) en el widget del SO.
    /// `status`: `"playing" | "paused" | "stopped"`.
    #[tauri::command]
    pub fn mpris_set_playback(
        state: State<MprisState>,
        status: String,
        position_sec: f64,
    ) -> Result<(), String> {
        let kind = match status.as_str() {
            "playing" => PlaybackKind::Playing,
            "paused" => PlaybackKind::Paused,
            _ => PlaybackKind::Stopped,
        };
        state.send(MprisCmd::Playback { kind, position_sec })
    }
}

#[cfg(target_os = "linux")]
pub use imp::*;

// ── Stubs no-Linux (Windows/macOS): mismos comandos, sin efecto ────────────────
// Permiten listar los comandos en el `invoke_handler` desktop sin ramas extra.
#[cfg(not(target_os = "linux"))]
mod stub {
    #[tauri::command]
    pub fn mpris_set_metadata(
        _title: Option<String>,
        _artist: Option<String>,
        _album: Option<String>,
        _duration_sec: Option<f64>,
    ) -> Result<(), String> {
        Ok(())
    }

    #[tauri::command]
    pub fn mpris_set_playback(_status: String, _position_sec: f64) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(not(target_os = "linux"))]
pub use stub::*;
