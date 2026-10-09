import type { BlogArticle } from '../index';

/**
 * Bozza per l'indicizzazione, da far validare a Francesco Borrelli prima di
 * togliere `reviewed: false`.
 *
 * ATTENZIONE: descrive solo il **processo** che il prodotto fa davvero
 * (candidatura, profilo completo, revisione del team, pubblicazione,
 * conferma di ogni seduta da parte del coach). I **criteri** con cui il team
 * decide (titoli, certificazioni, esperienza, colloquio) non sono scritti da
 * nessuna parte nel codice e qui non si inventano: vanno aggiunti da chi li
 * applica, in una sezione «Cosa guardiamo» che oggi manca di proposito.
 */
export const SELEZIONE_COACH: BlogArticle = {
  slug: 'come-selezioniamo-i-coach-kaipai',
  title: 'Come selezioniamo i coach di KaiPai',
  seoTitle: 'Come selezioniamo i coach di KaiPai',
  description:
    'Come si entra nell’elenco dei coach di KaiPai: candidatura, profilo, revisione del team prima della pubblicazione e cosa succede dopo l’approvazione.',
  publishedAt: '2026-10-09',
  author: {
    name: 'Francesco Borrelli',
    role: 'Fondatore di KaiPai · Mental coach sportivo',
    href: '/chi-siamo',
  },
  image: {
    src: '/blog/ansia-da-prestazione.webp',
    alt: 'Un atleta seduto da solo nello spogliatoio, prima della gara',
    og: '/og/blog-ansia-da-prestazione.jpg',
  },
  related: { href: '/diventa-coach', label: 'Diventa coach' },
  tags: ['Coach', 'Qualità', 'Come funziona KaiPai'],
  reviewed: false,
  blocks: [
    {
      type: 'p',
      text: 'Non esiste un albo dei mental coach: chiunque può usare il titolo. Per questo, sull’elenco di KaiPai nessun profilo compare in automatico. Ecco il percorso che ogni coach fa prima di essere visibile agli atleti e cosa succede dopo.',
    },
    { type: 'h2', id: 'candidatura', text: '1. La candidatura' },
    {
      type: 'p',
      text: 'Il coach crea il suo account e completa il profilo: una presentazione, gli sport che segue, le specialità, almeno un servizio con la sua durata e la disponibilità settimanale. Un profilo incompleto non può essere inviato.',
    },
    { type: 'h2', id: 'revisione', text: '2. La revisione del team' },
    {
      type: 'p',
      text: 'Il profilo non viene pubblicato finché il team KaiPai non lo ha controllato. Il team può approvarlo o rifiutarlo; solo dopo l’approvazione il coach compare nell’[elenco dei coach](/coaches) e può ricevere richieste.',
    },
    { type: 'h2', id: 'dopo', text: '3. Dopo l’approvazione' },
    {
      type: 'list',
      items: [
        'Nessuna seduta è confermata senza il coach: l’atleta chiede un orario libero e il coach accetta o rifiuta.',
        'Le sedute si svolgono dentro KaiPai, in videochiamata.',
        'Gli Appunti AI funzionano solo con il consenso dell’atleta e, per un minorenne, con l’autorizzazione del genitore: il riepilogo lo rivede e lo approva il coach prima che l’atleta lo veda.',
        'Dopo una seduta svolta l’atleta può lasciare una recensione.',
      ],
    },
    { type: 'h2', id: 'academy', text: 'La formazione continua: l’Academy' },
    {
      type: 'p',
      text: 'La [KaiPai Academy](/academy) accompagna la formazione dei coach. La selezione non finisce con l’approvazione del profilo: il lavoro di un coach si vede nelle sedute e nei riscontri degli atleti.',
    },
    {
      type: 'callout',
      title: 'I limiti che valgono per tutti',
      text: 'Tutti i coach di KaiPai fanno mental coaching, non terapia: se emerge un bisogno clinico, lo dicono chiaramente e indirizzano verso un professionista sanitario. Nessun coach può garantire un risultato.',
    },
    { type: 'h2', id: 'scegliere', text: 'La scelta resta tua' },
    {
      type: 'p',
      text: 'La revisione toglie una parte del rischio, ma non sostituisce la tua valutazione. Per sapere cosa chiedere e come capire se un coach fa per te, leggi la guida su [come scegliere un mental coach sportivo](/blog/come-scegliere-un-mental-coach-sportivo). E se vuoi provare, [la sessione conoscitiva è gratuita](/atleti).',
    },
  ],
  faq: [
    {
      q: 'Chiunque può diventare coach su KaiPai?',
      a: 'No: ogni profilo viene controllato dal team prima della pubblicazione e può essere rifiutato. Solo i profili approvati compaiono nell’elenco.',
    },
    {
      q: 'Cosa succede dopo l’approvazione?',
      a: 'Il coach diventa visibile agli atleti e può ricevere richieste di sedute, che accetta o rifiuta una per una.',
    },
    {
      q: 'Posso lasciare una recensione?',
      a: 'Sì: dopo una seduta svolta l’atleta può lasciare una recensione sul coach.',
    },
  ],
};
