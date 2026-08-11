import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  fetchAiNotes,
  respondToAiNotesConsent,
  startAiNotes,
  type AiNotesSession,
} from '../lib/api';
import { useTheme, type Palette } from '../theme';

/**
 * Il consenso alla registrazione, dentro la chiamata.
 *
 * Finora l'app non aveva niente di tutto questo, e la conseguenza non era
 * cosmetica: una seduta fatta dal telefono non poteva essere registrata,
 * quindi niente trascrizione e niente riepilogo. L'app tagliava fuori il pezzo
 * di prodotto che dà valore alle sedute.
 *
 * La registrazione non parte finché **entrambi** non hanno detto sì, e il
 * rifiuto è sempre a un tocco di distanza. Non è una formalità da sbrigare: è
 * il momento in cui una persona decide se la propria voce viene conservata, e
 * va trattato con lo spazio che merita — nessun sì implicito, nessun pulsante
 * più facile dell'altro.
 */
export function AiNotesConsentPanel({
  bookingId,
  canActivate,
}: {
  bookingId: number;
  /** Solo il coach apre una sessione di appunti: all'atleta non si mostra. */
  canActivate: boolean;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [session, setSession] = useState<AiNotesSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchAiNotes(bookingId);
      setSession(data.session);
    } catch {
      // Silenzio di proposito: un errore di rete qui non deve coprire la
      // chiamata, che è la cosa per cui si è aperta l'app.
    } finally {
      setLoaded(true);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
    /*
     * Ricontrolla ogni cinque secondi.
     *
     * Il consenso dell'altra persona arriva dal suo dispositivo: senza una
     * ricontrollata periodica, chi ha già detto sì resterebbe a guardare «in
     * attesa» anche dopo che l'altro ha risposto, e penserebbe che qualcosa
     * si è rotto.
     */
    const timer = setInterval(() => void load(), 5_000);
    return () => clearInterval(timer);
  }, [load]);

  async function decide(decision: 'accepted' | 'rejected') {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const data = await respondToAiNotesConsent(session.id, decision);
      setSession(data.session);
    } catch {
      setError('Non sono riuscito a registrare la tua scelta.');
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const data = await startAiNotes(bookingId);
      setSession(data.session);
    } catch {
      setError('Non sono riuscito ad attivare gli appunti.');
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  // Nessuna sessione: solo il coach può aprirla, e finché non lo fa l'atleta
  // non deve vedere un pulsante che non gli appartiene.
  if (!session) {
    if (!canActivate) return null;
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Appunti AI</Text>
        <Text style={styles.body}>
          Se attivi gli appunti, la seduta viene registrata e trasformata in un
          riepilogo. Serve il consenso di entrambi.
        </Text>
        <Row>
          <Action label="Attiva" primary onPress={activate} busy={busy} />
        </Row>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  const mine = session.consents.find((consent) => consent.isCurrentUser);
  const others = session.consents.filter((consent) => !consent.isCurrentUser);
  const someoneRefused = session.consents.some(
    (consent) => consent.status === 'rejected' || consent.status === 'revoked'
  );

  if (someoneRefused) {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Registrazione non attiva</Text>
        <Text style={styles.body}>
          La seduta non viene registrata. La chiamata prosegue normalmente.
        </Text>
      </View>
    );
  }

  // Deciso, e in attesa dell'altro: si dice chi manca, non «attendere».
  if (mine?.status === 'accepted') {
    const waiting = others.some((consent) => consent.status !== 'accepted');
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>
          {waiting ? 'In attesa dell’altro consenso' : 'Registrazione attiva'}
        </Text>
        <Text style={styles.body}>
          {waiting
            ? 'Hai acconsentito. La registrazione parte quando anche l’altra persona accetta.'
            : 'La seduta viene registrata. Puoi revocare il consenso quando vuoi.'}
        </Text>
        {!waiting && (
          <Row>
            <Action
              label="Revoca"
              onPress={() => decide('rejected')}
              busy={busy}
            />
          </Row>
        )}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Registrare questa seduta?</Text>
      <Text style={styles.body}>
        L’audio viene registrato e trasformato in un riepilogo per il coach.
        Puoi rifiutare: la chiamata prosegue lo stesso.
      </Text>
      <Row>
        {/* Rifiuta per primo e con lo stesso peso visivo: la scelta più facile
            non deve essere quella che ci conviene. */}
        <Action label="Rifiuta" onPress={() => decide('rejected')} busy={busy} />
        <Action
          label="Acconsento"
          primary
          onPress={() => decide('accepted')}
          busy={busy}
        />
      </Row>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <View style={styles.row}>{children}</View>;
}

function Action({
  label,
  onPress,
  primary,
  busy,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  busy?: boolean;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.action,
        primary && styles.actionPrimary,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? '#fff' : theme.hi} />
      ) : (
        <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    panel: {
      backgroundColor: theme.ink2,
      borderColor: theme.line,
      borderWidth: 1,
      borderRadius: 18,
      padding: 16,
      margin: 12,
      gap: 8,
    },
    title: { color: theme.hi, fontSize: 16, fontWeight: '700' },
    body: { color: theme.mid, fontSize: 13, lineHeight: 19 },
    row: { flexDirection: 'row', gap: 8, marginTop: 6 },
    action: {
      flex: 1,
      backgroundColor: theme.surface,
      borderRadius: 999,
      paddingVertical: 12,
      alignItems: 'center',
    },
    actionPrimary: { backgroundColor: theme.red },
    actionText: { color: theme.hi, fontSize: 14, fontWeight: '600' },
    actionTextPrimary: { color: '#fff' },
    pressed: { opacity: 0.85 },
    error: { color: theme.red2, fontSize: 12 },
  });
