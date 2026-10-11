package com.quarks.app

import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.lang.ref.WeakReference

/**
 * Botones de media (auriculares, Bluetooth) para el quark Música.
 *
 * Android le manda las teclas de media a la MediaSession de la app que sonó
 * último. La música suena en un `<audio>` del WebView, que no publica ninguna,
 * así que sin esto los botones de los auriculares no hacen nada. Esta sesión
 * refleja el estado del reproductor (lo empuja el JS, `mediaSession.ts`) y le
 * reenvía cada botón al JS como `window.quarksMediaKey(acción)`.
 *
 * Play/pausa simple y doble toque → siguiente los resuelve el callback por
 * defecto de MediaSession. La sesión sigue viva en pausa, para que el mismo
 * botón reanude; se libera cuando el reproductor para del todo. Solo main thread.
 */
object MusicSession {
  private const val ACTIONS = PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or
    PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_SKIP_TO_NEXT or
    PlaybackState.ACTION_SKIP_TO_PREVIOUS or PlaybackState.ACTION_STOP

  private var session: MediaSession? = null
  private var webView: WeakReference<WebView>? = null

  fun attach(view: WebView) {
    webView = WeakReference(view)
  }

  /** `state`: "playing" | "paused" | "stopped" (el `PlaybackStatus` del JS). */
  fun update(context: Context, state: String, title: String) {
    if (state != "playing" && state != "paused") {
      release()
      return
    }
    val s = session ?: MediaSession(context, "quarks-music").also {
      it.setCallback(callback)
      session = it
    }
    val playing = state == "playing"
    s.setPlaybackState(
      PlaybackState.Builder()
        .setActions(ACTIONS)
        .setState(
          if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
          PlaybackState.PLAYBACK_POSITION_UNKNOWN,
          if (playing) 1f else 0f,
        )
        .build()
    )
    // El título también le llega a quien lo pida por Bluetooth (auto, reloj).
    s.setMetadata(MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title).build())
    s.isActive = true
  }

  fun release() {
    session?.release()
    session = null
  }

  private val callback = object : MediaSession.Callback() {
    override fun onPlay() = send("play")
    override fun onPause() = send("pause")
    override fun onSkipToNext() = send("next")
    override fun onSkipToPrevious() = send("prev")
    override fun onStop() = send("stop")
  }

  private fun send(action: String) {
    webView?.get()?.evaluateJavascript("window.quarksMediaKey?.(\"$action\")", null)
  }
}

/** Puente JS → [MusicSession]. MainActivity lo expone como `window.QuarksMedia`. */
class MusicSessionBridge(context: Context) {
  private val app = context.applicationContext
  private val main = Handler(Looper.getMainLooper())

  // Los métodos de un JavascriptInterface corren en un thread propio del WebView.
  @JavascriptInterface
  fun update(state: String, title: String) {
    main.post { MusicSession.update(app, state, title) }
  }
}
