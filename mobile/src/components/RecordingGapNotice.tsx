import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchAiNotes, fetchRecordingStatus } from '../lib/api';
import { useTheme, type Palette } from '../theme';

/**
 * «La tua voce non viene registrata», detto mentre si può ancora rimediare.
 *
 * Nella seduta 181 la registrazione del coach si è fermata al minuto sette e
 * non è più ripartita. Nessuno se n'è accorto: né in chiamata, dove bastava
 * spegnere e riaccendere il microfono, né dopo, finché il riepilogo non ha
 * detto che l'atleta aveva parlato per l'83% del tempo. Il sistema lo sapeva
 * dal minuto sette e non lo diceva a nessuno.
 *
 * Compare solo quando c'è qualcosa da fare e sparisce da solo quando l'audio
 * riparte. Sta in alto, sotto il consenso, e non copre i comandi: un avviso
 * che si mette davanti alla chiamata è un avviso che viene chiuso senza
 * leggerlo.
 *
 * La soglia e la frase le decide il server (`live-coverage.ts`): sono le
 * stesse per il telefono e per il browser.
 */
export function RecordingGapNotice({ bookingId }: { bookingId: number }) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const look = async () => {
      try {
        const notes = await fetchAiNotes(bookingId);
        if (cancelled || !notes.session) {
          if (!cancelled) setMessage('');
          return;
        }
        const status = await fetchRecordingStatus(notes.session.id);
        if (cancelled) return;
        setMessage(status.recording.liveGapMessage ?? '');
      } catch {
        /*
         * Un errore di rete non diventa un avviso.
         *
         * Dire «la tua voce non viene registrata» perché una richiesta non è
         * arrivata sarebbe un allarme falso nel mezzo di una seduta — e un
         * allarme falso insegna a ignorare quelli veri.
         */
      }
    };

    void look();
    // Trenta secondi: la soglia dell'avviso è novanta, quindi si viene a
    // saperlo entro pochi secondi da quando conta.
    const timer = setInterval(() => void look(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [bookingId]);

  if (!message) return null;

  return (
    <View style={styles.strip} accessibilityLiveRegion="polite">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    strip: {
      backgroundColor: 'rgba(224,139,42,0.92)',
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginTop: 8,
      // Su Android un elemento sopra la chiamata senza questi viene disegnato
      // e resta inerte.
      elevation: 8,
      zIndex: 8,
    },
    // Il testo su fondo arancione resta scuro: è la combinazione che tiene il
    // contrasto in entrambi i temi.
    text: { color: '#1a1206', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  });
