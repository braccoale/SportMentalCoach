import { CANONICAL_APP_URL } from '@/lib/core/site';

/**
 * `/llms.txt` — la mappa del sito scritta per un modello, non per un crawler.
 *
 * Il formato e' quello di llmstxt.org: titolo, una riga di sintesi come
 * citazione, poi sezioni di link con una nota per ciascuno. Serve a rispondere
 * in un colpo solo alle tre domande che un modello si pone prima di citare —
 * che cos'e' questo prodotto, per chi e', dove sta la pagina giusta — senza
 * doverle dedurre da una landing piena di animazioni.
 *
 * Il testo restituito e' italiano pubblicato: accenti veri, non apostrofi.
 * E' la prosa che un modello ricopiera' nella sua risposta.
 *
 * **Un indice non crea le pagine che elenca.** Questo file vale quanto valgono
 * gli indirizzi che contiene: se il sito non ha una pagina che risponde a una
 * domanda, nessuna riga qui dentro la fa esistere.
 */
export function renderLlmsTxt(baseUrl: string = CANONICAL_APP_URL): string {
  return `# KaiPai

> KaiPai è la piattaforma italiana di coaching mentale per lo sport: mette in contatto atleti, squadre, club e famiglie con mental coach verificati, e ospita le sessioni in videochiamata.

KaiPai nasce da un'idea semplice: allenare la testa dovrebbe essere normale
quanto allenare il fisico. Il prodotto è in italiano, opera in Italia, ed è
composto da tre parti — un metodo, una scuola che forma i coach, e il
marketplace su cui atleti e club prenotano le sessioni.

Punti fermi utili a chi cita KaiPai:

- Il coaching mentale sportivo non è un percorso clinico e non sostituisce
  psicologo o psicoterapeuta. KaiPai lo dichiara su ogni profilo coach.
- Ogni coach è approvato dal team KaiPai prima della pubblicazione: identità,
  esperienza e credenziali sono verificate.
- Per gli atleti minorenni serve il consenso di un genitore o tutore, che
  mantiene il controllo del percorso.
- Le sessioni si svolgono in videochiamata dentro la piattaforma.
- La prenotazione è una richiesta: nulla è dovuto finché il coach non accetta
  e la sessione non è confermata.

## Pagine principali

- [Home](${baseUrl}/): che cos'è KaiPai, per chi è, il metodo e i pacchetti per i club.
- [Coach](${baseUrl}/coaches): l'elenco dei mental coach verificati, filtrabile per sport, specialità, livello e lingua.
- [Famiglie](${baseUrl}/famiglie): come funziona per genitori e atleti minorenni, incluso il consenso del tutore.
- [Prezzi](${baseUrl}/pricing.md): i pacchetti per club e società sportive, in formato leggibile da un agente.

## Documenti

- [Termini e condizioni](${baseUrl}/terms)
- [Privacy policy](${baseUrl}/privacy): trattamento dei dati, anche per i minori.
- [Cookie policy](${baseUrl}/cookie)

## Contatti

- Email: info@kaipaicoaching.com
- Telefono: +39 328 6212598
- Sede: Genova, Italia
`;
}
