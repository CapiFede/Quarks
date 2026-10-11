package com.quarks.app

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // wry lo llama antes de cargar la página, así los puentes ya existen al arrancar el JS.
  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(BackgroundBridge(this), "QuarksBackground")
    webView.addJavascriptInterface(MusicSessionBridge(this), "QuarksMedia")
    MusicSession.attach(webView)
  }

  override fun onDestroy() {
    // Sin activity no hay WebView: nada que mantener vivo ni a quién mandarle botones.
    BackgroundService.stopAll()
    MusicSession.release()
    super.onDestroy()
  }
}
