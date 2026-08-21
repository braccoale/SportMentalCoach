import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Palette } from '../theme';

/**
 * Le stime della seduta, su scala 1–5.
 *
 * Non una griglia di riquadri: una riga per stima, nome a sinistra e cinque
 * tacche a destra. Su un telefono sei valori disposti a griglia diventano
 * decorazione — si guardano e non si leggono — mentre incolonnati si
 * confrontano fra loro in un'occhiata.
 *
 * Il numero resta scritto accanto alle tacche: su una scala corta il colpo
 * d'occhio sbaglia, e queste sono stime che vanno lette per quello che sono.
 *
 * Quando la stima è incerta lo dice a parole. Il colore da solo non basta —
 * e una stima incerta presentata come certa è peggio che non averla.
 */
const LABELS: Record<string, string> = {
  energy: 'Energia',
  motivation: 'Motivazione',
  concentration: 'Concentrazione',
  emotional_management: 'Gestione emotiva',
  confidence: 'Fiducia',
  pre_competition_anxiety: 'Ansia pre-gara',
};

const STEPS = [1, 2, 3, 4, 5];

export function SessionMetrics({
  metrics,
}: {
  metrics: { key: string; value: number; confidence: string }[];
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.list}>
      {metrics.map((metric) => {
        const value = Math.max(1, Math.min(5, Math.round(metric.value)));
        const uncertain = metric.confidence === 'low';
        return (
          <View
            key={metric.key}
            style={styles.row}
            accessible
            accessibilityLabel={`${LABELS[metric.key] ?? metric.key}: ${value} su 5${
              uncertain ? ', stima incerta' : ''
            }`}
          >
            <View style={styles.head}>
              <Text style={styles.name}>{LABELS[metric.key] ?? metric.key}</Text>
              {uncertain && <Text style={styles.uncertain}>stima incerta</Text>}
            </View>
            <View style={styles.scale}>
              {STEPS.map((step) => (
                <View
                  key={step}
                  style={[
                    styles.step,
                    step <= value && (uncertain ? styles.stepFaint : styles.stepOn),
                  ]}
                />
              ))}
              <Text style={styles.value}>{value}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    list: { gap: 12, marginTop: 4 },
    row: { gap: 6 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { color: theme.hi, fontSize: 14 },
    uncertain: { color: theme.low, fontSize: 11, fontStyle: 'italic' },
    scale: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    step: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.surface,
    },
    stepOn: { backgroundColor: theme.green },
    // Incerta: la stessa forma, meno voce.
    stepFaint: { backgroundColor: `${theme.green}66` },
    value: { color: theme.mid, fontSize: 12, width: 14, textAlign: 'right' },
  });
