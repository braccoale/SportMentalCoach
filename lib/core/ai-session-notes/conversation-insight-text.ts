import type { ConversationInsight, ConversationRole } from './conversation-map';

/**
 * Cosa vuol dire quel numero.
 *
 * È la differenza fra un cruscotto e uno strumento. «16s vs 7s» lascia al
 * coach il lavoro di capire se sia un bene o un male; «parli più a lungo
 * dell'atleta» glielo dice.
 *
 * Ogni frase è una lettura di un fatto contato, mai una stima: descrive il
 * rapporto fra due numeri che abbiamo misurato, non uno stato che abbiamo
 * indovinato.
 */

export type InsightTone = 'buono' | 'neutro' | 'attenzione';

export type InsightStat = {
  key: 'domande' | 'durata' | 'apertura';
  value: string;
  label: string;
  /** La lettura del numero: cosa significa per chi conduce la sessione. */
  meaning: string;
  tone: InsightTone;
};

/**
 * Una domanda ogni due interventi è il segno di una conduzione che fa
 * emergere; sotto un terzo il coach sta prevalentemente spiegando.
 */
const QUESTION_RATIO_GOOD = 0.5;
const QUESTION_RATIO_LOW = 0.3;

/** Oltre questo rapporto fra le durate medie, uno dei due sta conducendo. */
const TURN_LENGTH_DOMINANCE = 1.5;

export function describeConversationInsight(
  insight: ConversationInsight,
  /*
   * Le voci non registrate.
   *
   * Un confronto ha bisogno di due termini. Con il microfono dell'atleta mai
   * arrivato, «2s vs 0s → turni di durata simile» non e' un'imprecisione: e'
   * una lettura sicura di se' costruita su un dato che non esiste, e il coach
   * la legge come un fatto sulla propria seduta. Le statistiche che
   * dipendono da una voce mancante non si attenuano: si tolgono.
   */
  rolesWithoutRecording: readonly ConversationRole[] = []
): InsightStat[] {
  const stats: InsightStat[] = [];
  const mancante = (role: ConversationRole) =>
    rolesWithoutRecording.includes(role);

  if (insight.coachTurns > 0 && !mancante('coach')) {
    const ratio = insight.coachQuestionTurns / insight.coachTurns;
    stats.push({
      key: 'domande',
      value: `${insight.coachQuestionTurns}/${insight.coachTurns}`,
      label: 'Tuoi interventi con una domanda',
      meaning:
        ratio >= QUESTION_RATIO_GOOD
          ? 'Hai chiesto più di quanto hai spiegato.'
          : ratio >= QUESTION_RATIO_LOW
            ? 'Una domanda ogni tre interventi circa.'
            : 'Hai spiegato più di quanto hai chiesto.',
      tone:
        ratio >= QUESTION_RATIO_GOOD
          ? 'buono'
          : ratio >= QUESTION_RATIO_LOW
            ? 'neutro'
            : 'attenzione',
    });
  }

  if (
    (insight.coachAverageTurnSec > 0 || insight.athleteAverageTurnSec > 0) &&
    rolesWithoutRecording.length === 0
  ) {
    const coach = insight.coachAverageTurnSec;
    const athlete = insight.athleteAverageTurnSec;
    const coachLeads = athlete > 0 && coach >= athlete * TURN_LENGTH_DOMINANCE;
    const athleteLeads = coach > 0 && athlete >= coach * TURN_LENGTH_DOMINANCE;
    stats.push({
      key: 'durata',
      value: `${coach}s vs ${athlete}s`,
      label: 'Durata media dei turni',
      meaning: coachLeads
        ? 'Parli più a lungo dell’atleta.'
        : athleteLeads
          ? 'L’atleta parla più a lungo di te.'
          : 'Turni di durata simile.',
      tone: coachLeads ? 'attenzione' : athleteLeads ? 'buono' : 'neutro',
    });
  }

  if (insight.athleteOpenedUp !== null && !mancante('athlete')) {
    stats.push({
      key: 'apertura',
      value: insight.athleteOpenedUp ? 'Sì' : 'No',
      label: 'L’atleta si è aperto',
      meaning: insight.athleteOpenedUp
        ? `Le sue risposte sono passate da ${insight.athleteFirstHalfSec}s a ${insight.athleteSecondHalfSec}s.`
        : `È rimasto sulle risposte brevi (${insight.athleteSecondHalfSec}s a turno).`,
      tone: insight.athleteOpenedUp ? 'buono' : 'attenzione',
    });
  }

  return stats;
}
