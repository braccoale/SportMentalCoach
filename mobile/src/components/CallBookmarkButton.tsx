import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { addSessionBookmark, fetchAiNotes } from '../lib/api';
import { Icon } from './Icon';
import { useTheme, type Palette } from '../theme';

/**
 * Segna questo momento, durante la chiamata.
 *
 * È la funzione più nativamente mobile di tutto il prodotto e viveva solo sul
 * web: un tocco, nessun testo da scrivere — un coach che scrive smette di
 * guardare l'atleta — e il minuto lo calcola il server dall'inizio della
 * seduta, così il client non può spostarlo.
 *
 * Compare per **tutta** la sessione, non solo mentre una traccia sta
 * registrando: è la stessa regola del web, e il motivo è che l'istante si
 * ricava dall'inizio della seduta. Vale anche se una traccia è caduta — ed è
 * proprio quando cade che serve annotare dove tornare a guardare.
 *
 * Il riscontro è immediato e muto: il pulsante si accende un istante e torna
 * com'era. Se il coach deve leggere una conferma, l'attenzione è già andata
 * via dall'atleta — e per la stessa ragione un errore di rete qui non apre
 * nulla: il segnalibro è un di più, la chiamata no.
 */
export function CallBookmarkButton({
  bookingId,
  viewerIsCoach,
  bottom,
}: {
  bookingId: number;
  /** Il segnalibro è un appunto di lavoro del coach: l'atleta non ce l'ha. */
  viewerIsCoach: boolean;
  /** Sopra la fila dei comandi, non sopra il volto di chi si ha davanti. */
  bottom: number;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [marked, setMarked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!viewerIsCoach) return;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    const look = async () => {
      try {
        const data = await fetchAiNotes(bookingId);
        if (cancelled || !data.session) return;
        setSessionId(data.session.id);
        /*
         * Trovata una volta, si smette di cercare.
         *
         * La sessione di appunti nasce una sola volta e il suo identificativo
         * non cambia: continuare a chiedere sarebbe traffico su una rete che
         * durante una videochiamata serve ad altro.
         */
        if (poll) clearInterval(poll);
      } catch {
        // Silenzio di proposito: la chiamata è la cosa che conta.
      }
    };

    void look();
    poll = setInterval(() => void look(), 10_000);
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [bookingId, viewerIsCoach]);

  if (!viewerIsCoach || sessionId === null) return null;

  return (
    <Pressable
      onPress={() => {
        setMarked(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setMarked(false), 1800);
        void addSessionBookmark(sessionId).catch(() => undefined);
      }}
      accessibilityRole="button"
      accessibilityLabel="Segna questo momento"
      hitSlop={8}
      style={({ pressed }) => [
        styles.pill,
        { bottom },
        marked && styles.pillOn,
        pressed && styles.pressed,
      ]}
    >
      <Icon name="bookmark" size={18} color={marked ? '#0b0b0e' : '#fff'} />
      <Text style={[styles.text, marked && styles.textOn]}>
        {marked ? 'Segnato' : 'Segna'}
      </Text>
    </Pressable>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    /*
     * A destra e sopra i comandi, non al centro: al centro coprirebbe il volto
     * dell'atleta, che è ciò che si guarda per tutta la seduta.
     *
     * `elevation` e `zIndex` non sono cosmesi: su Android un elemento in
     * posizione assoluta senza di essi viene disegnato e non riceve il tocco.
     */
    pill: {
      position: 'absolute',
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.55)',
      elevation: 10,
      zIndex: 10,
    },
    pillOn: { backgroundColor: theme.green },
    text: { color: '#fff', fontSize: 14, fontWeight: '700' },
    textOn: { color: '#0b0b0e' },
    pressed: { opacity: 0.85 },
  });
