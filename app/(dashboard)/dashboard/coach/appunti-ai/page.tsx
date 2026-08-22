import Link from 'next/link';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import {
  AI_LITERACY_KEY,
  getLatestAcceptance,
} from '@/lib/core/legal/acceptance';
import { formatDate } from '@/lib/core/format';
import { AiLiteracyAcknowledgement } from './acknowledgement';
import { acknowledgeAiLiteracy } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Che cos'è il Session Compass, per chi lo usa su persone vere.
 *
 * **Perché esiste questa pagina.** L'art. 4 dell'AI Act chiede a fornitori e
 * deployer di garantire un livello adeguato di alfabetizzazione a chi opera i
 * sistemi per loro conto. Non è un obbligo che si chiude scrivendo codice: si
 * chiude facendo leggere qualcosa a delle persone.
 *
 * Ma la ragione vera viene prima della norma. Un coach legge un testo su una
 * persona che ha in cura, scritto da una macchina, e decide che cosa
 * condividerle. Se non sa dove quella macchina sbaglia, non può fare quel
 * lavoro — e il riepilogo smette di essere uno strumento e diventa un'autorità.
 */
export default async function AiLiteracyPage() {
  const user = await requireRole('coach');
  const read = await getLatestAcceptance(user.id, AI_LITERACY_KEY);

  return (
    <section className="mx-auto w-full max-w-3xl p-6 lg:py-8">
      <Link
        href="/dashboard/coach"
        className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-950"
      >
        <ArrowLeft className="h-4 w-4" />
        Torna alla dashboard
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-gray-950">
        Come funziona il riepilogo automatico
      </h1>
      <p className="mt-2 text-gray-600">
        Cinque minuti di lettura. Riguarda uno strumento che scrive di persone
        che hai in cura.
      </p>

      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-gray-800">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            Che cosa fa, in ordine
          </h2>
          <p className="mt-2">
            Con il consenso di tutti i presenti, la seduta viene registrata su
            tracce separate — una per voce. L’audio va a un servizio di
            trascrizione, che restituisce il testo di chi ha detto cosa e
            quando. L’audio viene poi cancellato: serviva solo a ottenere il
            testo.
          </p>
          <p className="mt-2">
            Un modello linguistico legge <strong>solo quel testo</strong> e ne
            ricava una bozza: sintesi, temi, indicatori, momenti chiave,
            impegni. Ogni affermazione porta con sé la frase da cui nasce. La
            bozza arriva a te, e resta invisibile all’atleta finché non
            l’approvi.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            Dove sbaglia, e come accorgersene
          </h2>
          <p className="mt-2">
            Sono i tre errori che vedrai davvero, non un elenco di cautele
            generiche:
          </p>
          <ul className="mt-3 space-y-3">
            <li>
              <strong>Prende sul serio una frase detta di sfuggita.</strong> Un
              «tanto non cambia niente» buttato lì mentre si parla d’altro può
              diventare un tema della seduta. Il modello non sente il tono con
              cui è stato detto: legge parole.
            </li>
            <li>
              <strong>Non coglie l’ironia e le mezze frasi.</strong> Una battuta
              autoironica su una sconfitta può arrivarti come sconforto.
            </li>
            <li>
              <strong>Riempie i vuoti.</strong> Dove la trascrizione è incerta —
              audio coperto, due voci sovrapposte — il testo prodotto resta
              scorrevole e sicuro di sé. La scorrevolezza non è affidabilità.
            </li>
          </ul>
          <p className="mt-3">
            Per questo <strong>ogni indicatore cita la frase</strong> da cui
            deriva. Se qualcosa ti sorprende, la prima mossa è leggere la
            citazione: quasi sempre lì si vede subito se il modello ha capito o
            no.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            Che cosa il sistema non fa
          </h2>
          <p className="mt-2">
            Non riconosce emozioni dalla voce, dal volto o da altri dati
            biometrici: gli indicatori nascono <em>dalle parole dette</em>. Non
            produce diagnosi e non usa termini clinici. Non decide niente al
            posto tuo: non archivia, non segnala, non classifica un atleta per
            l’accesso a un servizio.
          </p>
          <p className="mt-2">
            Se la registrazione ha perso un pezzo — un microfono spento, una
            traccia caduta — il riepilogo te lo dice. Un riepilogo costruito su
            metà seduta va letto per quello che è.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            La tua parte
          </h2>
          <p className="mt-2">
            L’approvazione non è un passaggio burocratico: è il punto in cui una
            persona si assume la responsabilità di quel testo.{' '}
            <strong>
              Quello che approvi diventa quello che l’atleta legge di sé.
            </strong>
          </p>
          <p className="mt-2">
            Puoi correggere, togliere, o non condividere affatto. Esistono due
            piani: le note condivise, che l’atleta vede, e le tue note private.
            Nel dubbio su una frase, toglila: un riepilogo più corto non ha mai
            fatto danni.
          </p>
        </div>
      </div>

      <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-5">
        {read ? (
          <p className="flex items-center gap-2 text-sm font-medium text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Hai preso visione di questa nota il {formatDate(read.acceptedAt)}.
          </p>
        ) : (
          <AiLiteracyAcknowledgement action={acknowledgeAiLiteracy} />
        )}
      </div>
    </section>
  );
}
