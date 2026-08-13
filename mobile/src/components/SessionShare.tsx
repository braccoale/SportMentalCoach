import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Palette } from '../theme';

/**
 * Chi ha parlato, e quanto.
 *
 * Una barra sola, divisa in due. È il dato che si legge in un'occhiata e che
 * dice qualcosa di vero sulla seduta: una in cui il coach ha parlato per due
 * terzi del tempo è andata diversamente da una in cui l'atleta si è preso lo
 * spazio.
 *
 * Non è una pagella. È una misura che il coach fa su di sé, e per questo la
 * percentuale resta scritta accanto alla barra invece di essere lasciata al
 * colpo d'occhio — che su una proporzione inganna.
 */
export function SessionShare({
  athleteSharePercent,
  athleteTurns,
  coachTurns,
  athleteName,
}: {
  athleteSharePercent: number;
  athleteTurns: number;
  coachTurns: number;
  athleteName: string;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const athlete = Math.max(0, Math.min(100, Math.round(athleteSharePercent)));
  const coach = 100 - athlete;

  return (
    <View
      accessible
      accessibilityLabel={`${athleteName} ha parlato per il ${athlete} per cento del tempo, tu per il ${coach} per cento`}
    >
      <View style={styles.bar}>
        <View style={[styles.athlete, { flex: athlete || 1 }]} />
        <View style={[styles.coach, { flex: coach || 1 }]} />
      </View>

      <View style={styles.legend}>
        <View style={styles.item}>
          <View style={[styles.dot, { backgroundColor: theme.green }]} />
          <Text style={styles.text}>
            {athleteName} · {athlete}%
          </Text>
        </View>
        <View style={styles.item}>
          <View style={[styles.dot, { backgroundColor: theme.mid }]} />
          <Text style={styles.text}>Tu · {coach}%</Text>
        </View>
      </View>

      {/* Gli interventi accanto ai minuti: parlare a lungo poche volte e
          parlare spesso e poco sono due sedute diverse. */}
      <Text style={styles.turns}>
        {athleteTurns} interventi suoi · {coachTurns} tuoi
      </Text>
    </View>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      height: 12,
      borderRadius: 6,
      overflow: 'hidden',
      gap: 2,
    },
    athlete: { backgroundColor: theme.green },
    coach: { backgroundColor: theme.mid },
    legend: { flexDirection: 'row', gap: 18, marginTop: 10 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    text: { color: theme.hi, fontSize: 13 },
    turns: { color: theme.low, fontSize: 12, marginTop: 6 },
  });
