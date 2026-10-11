package com.quarks.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Mantiene viva la app mientras corre una tarea larga, también con la pantalla
 * apagada: la música y el sync con Google Drive.
 *
 * Las dos corren en JS dentro del WebView. Con la pantalla apagada, Android
 * duerme la CPU y le corta la red a las apps en background: la playlist se
 * corta al terminar el track en curso (mientras suena, el audio mantiene la CPU
 * despierta; entre track y track, no) y una bajada larga del sync muere a mitad.
 *
 * Es lo que hace cualquier reproductor o cliente de sync: un foreground service
 * (el proceso no se degrada a background y conserva la red, también en Doze) +
 * un wakelock parcial (la CPU sigue despierta). El servicio vive mientras haya
 * al menos una tarea activa y declara el tipo de cada una.
 *
 * Lo maneja el JS (`core/src/services/background.ts`) vía [BackgroundBridge].
 * Todo el estado se toca solo desde el main thread.
 */
class BackgroundService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  /** Ya llamó a `startForeground`: recién ahí se lo puede parar sin crash. */
  private var foreground = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "quarks:background").apply {
      setReferenceCounted(false)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Obligatorio después de startForegroundService, aunque ya no queden tareas.
    if (!foreground && !update()) {
      shutdown()
      return START_NOT_STICKY
    }
    // Se pararon todas mientras arrancaba (ver `settle`).
    if (tasks.isEmpty()) shutdown()
    return START_NOT_STICKY
  }

  /** El usuario cerró la app desde recientes: sin WebView no queda nada corriendo. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    tasks.clear()
    shutdown()
  }

  /** Android 15+: el tipo dataSync tiene un tope de horas por día; al llegar, hay que irse ya. */
  override fun onTimeout(startId: Int, fgsType: Int) {
    tasks.clear()
    shutdown()
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    wakeLock?.let { if (it.isHeld) it.release() }
    super.onDestroy()
  }

  private fun shutdown() {
    if (instance === this) instance = null
    stopSelf()
  }

  /**
   * Pasa a foreground, o actualiza tipos y notificación si ya lo estaba, y
   * renueva el tope del wakelock.
   */
  private fun update(): Boolean {
    wakeLock?.acquire(WAKE_LOCK_MAX_MS)
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIF_ID, notification(), foregroundTypes())
      } else {
        startForeground(NOTIF_ID, notification())
      }
      foreground = true
      true
    } catch (e: Exception) {
      // Android 12+ no deja pasar a foreground desde background.
      Log.w(TAG, "startForeground falló", e)
      false
    }
  }

  private fun foregroundTypes(): Int {
    val types = tasks.keys.fold(0) { acc, task -> acc or (TYPES[task] ?: 0) }
    // Sin tareas (se pararon mientras arrancaba) cualquier tipo declarado sirve:
    // el servicio se va enseguida.
    return if (types != 0) types else ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
  }

  private fun notification(): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "En segundo plano", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val icon = if ("music" in tasks) android.R.drawable.ic_media_play else android.R.drawable.stat_notify_sync
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(icon)
      .setContentTitle(tasks.values.joinToString(" · ").ifEmpty { "Quarks" })
      .setContentText("Quarks")
      .setContentIntent(open)
      .setOngoing(true)
      .setSilent(true)
      .build()
  }

  companion object {
    private const val TAG = "QuarksBackground"
    private const val CHANNEL_ID = "background"
    private const val NOTIF_ID = 1
    /**
     * Tope del wakelock: si el JS nunca avisa que terminó (el WebView murió), que
     * no drene la batería para siempre. Se renueva en cada cambio de tarea.
     */
    private const val WAKE_LOCK_MAX_MS = 3 * 60 * 60 * 1000L
    /** Tareas que conoce el JS y el tipo de foreground service de cada una. */
    private val TYPES = mapOf(
      "music" to ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
      "sync" to ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
    )

    // Solo main thread. Tarea activa → texto para la notificación.
    private val tasks = LinkedHashMap<String, String>()
    private var instance: BackgroundService? = null

    fun start(context: Context, task: String, text: String) {
      if (task !in TYPES) return
      tasks[task] = text
      val svc = instance
      if (svc != null) {
        // Si todavía está arrancando, `onStartCommand` toma el estado nuevo.
        if (svc.foreground) svc.update()
        return
      }
      try {
        ContextCompat.startForegroundService(context, Intent(context, BackgroundService::class.java))
      } catch (e: Exception) {
        Log.w(TAG, "no se pudo arrancar el servicio", e)
      }
    }

    fun stop(task: String) {
      if (tasks.remove(task) != null) settle()
    }

    fun stopAll() {
      tasks.clear()
      settle()
    }

    private fun settle() {
      val svc = instance ?: return
      // Pararlo antes de `startForeground` crashea la app; si todavía está
      // arrancando, `onStartCommand` ve que no quedan tareas y se va solo.
      if (!svc.foreground) return
      if (tasks.isEmpty()) svc.shutdown() else svc.update()
    }
  }
}

/** Puente JS → [BackgroundService]. MainActivity lo expone como `window.QuarksBackground`. */
class BackgroundBridge(context: Context) {
  private val app = context.applicationContext
  private val main = Handler(Looper.getMainLooper())

  // Los métodos de un JavascriptInterface corren en un thread propio del WebView.
  @JavascriptInterface
  fun start(task: String, text: String) {
    main.post { BackgroundService.start(app, task, text) }
  }

  @JavascriptInterface
  fun stop(task: String) {
    main.post { BackgroundService.stop(task) }
  }

  @JavascriptInterface
  fun stopAll() {
    main.post { BackgroundService.stopAll() }
  }
}
