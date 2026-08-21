import type { IconType } from 'react-icons';
import {
  FaBasketball,
  FaBroomBall,
  FaDumbbell,
  FaFlagCheckered,
  FaFootball,
  FaFutbol,
  FaGolfBallTee,
  FaHandFist,
  FaMedal,
  FaPersonBiking,
  FaPersonRunning,
  FaPersonSkiing,
  FaPersonSwimming,
  FaVolleyball,
} from 'react-icons/fa6';
import { IoTennisball } from 'react-icons/io5';

/**
 * L'icona di uno sport.
 *
 * **Perché una libreria e non un disegno nostro.** Il primo tentativo usava
 * lucide, che non ha un pallone da calcio: il ripiego era `Goal`, un bersaglio
 * con la freccia, che si legge «obiettivo» e non «calcio». Il secondo le
 * disegnava a mano, e a sedici pixel un pentagono con cinque cuciture non è un
 * pallone, è un ingorgo. Uno sport si riconosce dal suo oggetto, e disegnare
 * bene quindici oggetti è un mestiere: qui si prendono già fatti.
 *
 * Font Awesome 6 (free) copre quattordici sport su quindici con una famiglia
 * sola, quindi coerente. Il tennis viene da Ionicons perché in FA6 free una
 * racchetta non c'è, e una racchetta da ping pong al posto del tennis sarebbe
 * di nuovo un ripiego che sembra vicino.
 *
 * **Perché non una colonna sulla tabella `sports`:** un'icona è presentazione,
 * e quella tabella tiene la tassonomia — chiave, etichetta, ordine — letta
 * anche da chi non disegna niente. E da una stringa arbitraria non si risale a
 * un componente senza importare l'intera libreria: servirebbe comunque
 * l'elenco chiuso qui sotto, e la colonna ne sarebbe una copia libera di
 * divergere. Diventerà giusta quando un amministratore potrà aggiungere sport
 * dall'interfaccia: allora serve `icon_key`, scelta da un elenco.
 */
const ICON_BY_SPORT: Record<string, IconType> = {
  football: FaFutbol,
  basketball: FaBasketball,
  volleyball: FaVolleyball,
  tennis: IoTennisball,
  swimming: FaPersonSwimming,
  athletics: FaPersonRunning,
  cycling: FaPersonBiking,
  martial_arts: FaHandFist,
  golf: FaGolfBallTee,
  skiing: FaPersonSkiing,
  rugby: FaFootball,
  /** La bandiera a scacchi: l'auto in FA6 free non c'è, il traguardo sì. */
  motorsport: FaFlagCheckered,
  /** La scopa, che è l'attrezzo con cui il curling si riconosce. */
  curling: FaBroomBall,
  crossfit: FaDumbbell,
  other: FaMedal,
};

/** Uno sport che non conosciamo prende la medaglia e non rompe niente. */
export function sportIcon(sportKey: string | null): IconType {
  if (!sportKey) return FaMedal;
  return ICON_BY_SPORT[sportKey] ?? FaMedal;
}

export function SportIcon({
  sportKey,
  className,
}: {
  sportKey: string | null;
  className?: string;
}) {
  const Icon = sportIcon(sportKey);
  return <Icon className={className} aria-hidden="true" />;
}
