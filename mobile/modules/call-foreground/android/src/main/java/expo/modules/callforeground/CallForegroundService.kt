package expo.modules.callforeground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Il servizio che tiene l'app "in uso" mentre la sessione continua.
 *
 * Non fa niente di suo: non tocca la fotocamera, non parla con LiveKit, non
 * conosce la chiamata. Esiste solo perche' Android conceda a questo processo
 * l'accesso a fotocamera e microfono anche quando l'utente e' altrove — che e'
 * l'unica cosa che separa il nostro comportamento da quello di Meet.
 *
 * La notifica non e' un dettaglio di stile: e' obbligatoria, ed e' anche la
 * cosa giusta. Se la telecamera continua a riprendere mentre il coach e' su
 * un'altra app, deve esserci qualcosa che glielo dice.
 */
class CallForegroundService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: DEFAULT_TITLE
    val body = intent?.getStringExtra(EXTRA_BODY) ?: DEFAULT_BODY

    ensureChannel()

    /*
     * Il tipo va ripetuto qui e non solo nel manifest: dal 14 e' il parametro
     * che Android controlla per decidere se concedere fotocamera e microfono,
     * e su un dispositivo piu' vecchio va invece omesso (zero), altrimenti la
     * chiamata fallisce.
     */
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    } else {
      0
    }

    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(title, body), type)

    /*
     * `START_NOT_STICKY`: se il sistema uccide il servizio, la chiamata e'
     * finita comunque. Farlo resuscitare da solo significherebbe una notifica
     * di sessione in corso senza nessuna sessione dietro.
     */
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun notification(title: String, body: String): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pending = launch?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setShowWhen(false)
      .setContentIntent(pending)
      .build()
  }

  /**
   * Il canale, in bassa importanza di proposito: deve stare nella tendina
   * senza suonare e senza comparire in testa allo schermo. Non e' un avviso,
   * e' uno stato.
   */
  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      CHANNEL_NAME,
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = CHANNEL_DESCRIPTION
      setShowBadge(false)
      enableVibration(false)
      setSound(null, null)
    }
    manager.createNotificationChannel(channel)
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"

    private const val NOTIFICATION_ID = 4711
    private const val CHANNEL_ID = "kaipai.call"
    private const val CHANNEL_NAME = "Sessione in corso"
    private const val CHANNEL_DESCRIPTION =
      "Mostra che una videochiamata KaiPai e' attiva, anche fuori dall'app."
    private const val DEFAULT_TITLE = "Sessione KaiPai in corso"
    private const val DEFAULT_BODY = "Tocca per tornare alla videochiamata."
  }
}
