package expo.modules.callforeground

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Il ponte fra la chiamata e il servizio.
 *
 * Due funzioni e nessuno stato: chi decide quando una sessione comincia e
 * quando finisce e' `CallScreen`, non questo modulo. Tenere qui una nozione di
 * "chiamata in corso" significherebbe avere due verita' sullo stesso fatto, e
 * quella nativa sarebbe invisibile da JavaScript.
 */
class CallForegroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallForeground")

    AsyncFunction("start") { title: String, body: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(context, CallForegroundService::class.java).apply {
        putExtra(CallForegroundService.EXTRA_TITLE, title)
        putExtra(CallForegroundService.EXTRA_BODY, body)
      }
      /*
       * `startForegroundService` e non `startService`: dal 26 e' l'unica forma
       * ammessa, e obbliga il servizio a chiamare `startForeground` entro
       * cinque secondi — cosa che fa nel suo `onStartCommand`.
       *
       * Va invocata mentre l'app e' ancora in primo piano. Farlo al momento in
       * cui l'app passa in secondo piano e' esattamente cio' che Android
       * vieta: percio' il servizio parte all'ingresso nella stanza, non
       * quando si esce dall'app.
       */
      ContextCompat.startForegroundService(context, intent)
    }

    AsyncFunction("stop") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      context.stopService(Intent(context, CallForegroundService::class.java))
    }
  }
}
