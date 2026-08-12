import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useTheme, type Palette } from '../theme';

/**
 * Quale versione stai guardando, e da dove arriva.
 *
 * Il numero di versione da solo non basta: durante una fase di collaudo resta
 * `0.2.0` sia nella build sia in ogni aggiornamento pubblicato sopra, quindi
 * non distingue il caso che conta — «sto vedendo il lavoro nuovo o no?».
 *
 * È esattamente l'informazione che è mancata per un'intera mattinata: gli
 * aggiornamenti venivano pubblicati, l'app continuava a eseguire il bundle
 * incorporato, e nulla lo diceva. `isEmbeddedLaunch` lo dice in due parole.
 *
 * Sta in fondo e in piccolo: serve a chi collauda, non deve competere con
 * niente. Quando il prodotto sarà stabile può restare — è la stessa riga che
 * si chiede a un utente quando segnala un problema.
 */
export function BuildStamp() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const version = Constants.expoConfig?.version ?? '—';
  // In sviluppo il codice arriva da Metro: non e' ne' la build ne' un
  // aggiornamento pubblicato, e chiamarlo 'agg.' sarebbe fuorviante proprio
  // per chi sta collaudando.
  const origin = __DEV__
    ? 'sviluppo'
    : Updates.isEmbeddedLaunch
    ? 'build'
    : Updates.createdAt
      ? `agg. ${new Intl.DateTimeFormat('it-IT', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Rome',
        }).format(Updates.createdAt)}`
      : 'agg.';

  return (
    <Text style={styles.stamp} selectable>
      {`v${version} · ${origin}`}
      {/* L'avvio d'emergenza vuol dire che un aggiornamento ha fallito e si è
          tornati indietro: senza dirlo, sembra soltanto che le modifiche non
          siano arrivate. */}
      {Updates.isEmergencyLaunch ? ' · ripristino' : ''}
    </Text>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    stamp: {
      color: theme.low,
      fontSize: 11,
      textAlign: 'center',
      paddingTop: 14,
    },
  });
