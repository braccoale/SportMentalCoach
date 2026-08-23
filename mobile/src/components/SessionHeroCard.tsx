import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { UpcomingSession } from '../lib/api';
import { dayTitle, timeLabel } from '../lib/day-grouping';
import { Icon } from './Icon';
import { useTheme, type Palette } from '../theme';

/**
 * L'appuntamento in arrivo, in grande.
 *
 * La foto non è decorazione: una scheda con un volto si riconosce in un colpo
 * d'occhio, una con un'iniziale va letta. E la data in grande si legge da
 * lontano, che è come si guarda un telefono appoggiato sul tavolo.
 *
 * L'azione principale — entrare — è verde e piena; tutto il resto è secondario
 * e sta sotto, più piccolo. Prima erano tutte allo stesso peso, e una schermata
 * dove tutto pesa uguale non ha una risposta alla domanda «e adesso?».
 */
export function SessionHeroCard({
  session,
  now,
  wide,
  onOpenCall,
  onMenu,
  onDecide,
  onPrepare,
  deciding,
}: {
  session: UpcomingSession;
  now: number;
  /** Nel carosello la scheda ha una larghezza fissa; da sola occupa tutto. */
  wide?: number;
  onOpenCall: () => void;
  onMenu: () => void;
  onDecide: (accept: boolean) => void;
  /**
   * Apre «Da portare in questa seduta».
   *
   * Assente per l'atleta: quei punti nascono dai riepiloghi, che sono
   * materiale del coach.
   */
  onPrepare?: () => void;
  deciding: boolean;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  /*
   * Il ruolo lo dice la sessione, non la schermata.
   *
   * Prima arrivava da `sessions[0]`: durante una ricarica
   * l'elenco resta un istante vuoto, il ruolo diventava «non coach», e una
   * richiesta da accettare si trasformava per un momento in «in attesa che il
   * coach accetti» — cioè i due pulsanti sparivano sotto le dita di chi
   * stava per premerli.
   */
  const isCoach = session.viewerIsCoach;

  const when = session.scheduledFor ? new Date(session.scheduledFor) : null;
  const day = when
    ? new Intl.DateTimeFormat('it-IT', {
        day: 'numeric',
        timeZone: 'Europe/Rome',
      }).format(when)
    : '—';
  const month = when
    ? new Intl.DateTimeFormat('it-IT', {
        month: 'short',
        timeZone: 'Europe/Rome',
      })
        .format(when)
        .toUpperCase()
        .replace('.', '')
    : '';
  const weekday = when
    ? new Intl.DateTimeFormat('it-IT', {
        weekday: 'long',
        timeZone: 'Europe/Rome',
      })
        .format(when)
        .toUpperCase()
    : '';

  const waiting = session.status === 'requested';
  const canJoin = session.canJoinNow !== false && !waiting;
  /*
   * Prepararsi si fa **prima**, e prima che la stanza apra.
   *
   * Sul web quel pulsante compare solo dentro la finestra in cui si puo'
   * entrare in call; qui no. Il momento in cui questa scheda viene guardata
   * davvero e' il quarto d'ora precedente, quando la stanza e' ancora chiusa
   * e c'e' ancora tempo per leggere. Dopo la seduta invece non serve piu':
   * quello che resta si legge nel riepilogo.
   */
  const ended = !canJoin && Boolean(when && when.getTime() <= now);
  const canPrepare = isCoach && !waiting && !ended;

  return (
    <View style={[styles.card, wide ? { width: wide } : null]}>
      <View style={styles.top}>
        {/* Il volto a sinistra, la data a destra: si guarda chi, poi quando. */}
        {session.otherAvatarUrl ? (
          <Image source={{ uri: session.otherAvatarUrl }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Text style={styles.photoInitial}>
              {session.otherName.trim().slice(0, 1).toUpperCase() || '·'}
            </Text>
          </View>
        )}

        <View style={styles.headline}>
          <View style={styles.badgeRow}>
            <View style={styles.onlineBadge}>
              <Icon name="videocam" size={13} color={theme.green} />
              <Text style={styles.onlineText}>SESSIONE ONLINE</Text>
            </View>
            <Pressable
              onPress={onMenu}
              accessibilityRole="button"
              accessibilityLabel={`Azioni per la sessione con ${session.otherName}`}
              hitSlop={12}
              style={styles.menu}
            >
              <Icon name="more" size={18} color={theme.mid} />
            </Pressable>
          </View>

          <View style={styles.dateRow}>
            <Text style={styles.day}>{day}</Text>
            <View>
              <Text style={styles.month}>{month}</Text>
              <Text style={styles.weekday}>{weekday}</Text>
            </View>
          </View>
          <Text style={styles.time}>{timeLabel(session.scheduledFor)}</Text>
          <Text style={styles.who}>{session.otherName}</Text>
        </View>
      </View>

      {waiting && isCoach ? (
        <View style={styles.decide}>
          <Pressable
            onPress={() => onDecide(false)}
            disabled={deciding}
            accessibilityRole="button"
            accessibilityLabel="Rifiuta la richiesta"
            style={({ pressed }) => [styles.decline, pressed && styles.pressed]}
          >
            <Text style={styles.declineText}>Rifiuta</Text>
          </Pressable>
          <Pressable
            onPress={() => onDecide(true)}
            disabled={deciding}
            accessibilityRole="button"
            accessibilityLabel="Accetta la richiesta"
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>Accetta</Text>
          </Pressable>
        </View>
      ) : waiting ? (
        <Text style={styles.note}>In attesa che il coach accetti</Text>
      ) : (
        <>
          {canJoin ? (
            <Pressable
              onPress={onOpenCall}
              accessibilityRole="button"
              accessibilityLabel={`Apri la videochiamata con ${session.otherName}`}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Icon name="videocam" size={18} color="#fff" />
              <Text style={styles.primaryText}>Apri videochiamata</Text>
            </Pressable>
          ) : (
            <Text style={styles.note}>
              {when && when.getTime() > now
                ? 'La stanza apre pochi minuti prima'
                : 'Sessione terminata'}
            </Text>
          )}

          {onPrepare && canPrepare ? (
            <Pressable
              onPress={onPrepare}
              accessibilityRole="button"
              accessibilityLabel={`Preparati alla sessione con ${session.otherName}`}
              accessibilityHint="Mostra cosa riprendere dalle sedute precedenti"
              style={({ pressed }) => [styles.prepare, pressed && styles.pressed]}
            >
              <Icon name="bulb" size={18} color={theme.hi} />
              <Text style={styles.prepareText}>Preparati per la call</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.ink2,
      borderRadius: 22,
      borderColor: theme.line,
      borderWidth: 1,
      padding: 14,
      gap: 12,
    },
    top: { flexDirection: 'row', gap: 14 },
    photo: { width: 96, height: 128, borderRadius: 16, backgroundColor: theme.surface },
    photoEmpty: { alignItems: 'center', justifyContent: 'center' },
    photoInitial: { color: theme.mid, fontSize: 34, fontWeight: '700' },
    headline: { flex: 1, gap: 2 },
    badgeRow: { flexDirection: 'row', alignItems: 'center' },
    onlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
    onlineText: {
      color: theme.green,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    menu: { padding: 2 },
    dateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
    day: { color: theme.hi, fontSize: 40, fontWeight: '800', lineHeight: 44 },
    month: { color: theme.mid, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
    weekday: { color: theme.low, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    time: { color: theme.hi, fontSize: 20, fontWeight: '700' },
    who: { color: theme.mid, fontSize: 14, marginTop: 2 },
    primary: {
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      minHeight: 48,
      borderRadius: 999,
      backgroundColor: theme.green,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    /*
     * Di contorno, mai piena: nella scheda il peso forte resta uno solo,
     * entrare. Stessa altezza del primario perche' due pulsanti impilati di
     * altezza diversa si leggono come due cose scollegate.
     */
    prepare: {
      flexDirection: 'row',
      gap: 8,
      minHeight: 48,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    prepareText: { color: theme.hi, fontSize: 15, fontWeight: '600' },
    decide: { flexDirection: 'row', gap: 8 },
    decline: {
      flex: 1,
      minHeight: 48,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    declineText: { color: theme.mid, fontSize: 15, fontWeight: '600' },
    note: { color: theme.mid, fontSize: 13, fontStyle: 'italic', paddingVertical: 6 },
    pressed: { opacity: 0.85 },
  });
