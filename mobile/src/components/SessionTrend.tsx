import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme, type Palette } from '../theme';

/**
 * L'andamento della seduta, disegnato.
 *
 * È l'unica cosa in questa schermata che vale un grafico, perché è una
 * **forma**: si guarda, non si legge. Dice dove la conversazione si è aperta e
 * dove si è chiusa, e lo dice in un istante — che è tutto il tempo che si ha
 * scorrendo un telefono prima della sessione successiva.
 *
 * Niente assi, niente griglia, niente numeri sui punti: sono l'apparato di un
 * grafico da schermo grande, e qui ruberebbero spazio a ciò che conta. Il primo
 * e l'ultimo momento restano scritti sotto, perché una curva senza estremi non
 * dice fra cosa e cosa si è mossa.
 *
 * Il colore da solo non basta mai: sotto ogni curva restano le parole.
 */
export function SessionTrend({
  points,
}: {
  points: { value: number; label: string }[];
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Due punti sono il minimo per una direzione. Con uno solo non c'è andamento,
  // c'è un valore — e un valore si scrive, non si disegna.
  if (points.length < 2) return null;

  const width = 300;
  const height = 76;
  const padding = 8;

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Una seduta piatta è un'informazione, non un errore: senza questo, una
  // riga costante diventerebbe una divisione per zero.
  const span = max - min || 1;

  const coords = points.map((point, index) => {
    const x =
      padding + (index / (points.length - 1)) * (width - padding * 2);
    const y =
      height - padding - ((point.value - min) / span) * (height - padding * 2);
    return { x, y };
  });

  const line = coords
    .map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x} ${coord.y}`)
    .join(' ');

  const last = coords[coords.length - 1];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Andamento della seduta, da «${points[0].label}» a «${
        points[points.length - 1].label
      }»`}
    >
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path
          d={line}
          stroke={theme.green}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Dove si è arrivati: l'unico punto che merita di essere marcato. */}
        <Circle cx={last.x} cy={last.y} r={4.5} fill={theme.green} />
      </Svg>

      <View style={styles.labels}>
        <Text style={styles.label} numberOfLines={2}>
          {points[0].label}
        </Text>
        <Text style={[styles.label, styles.labelEnd]} numberOfLines={2}>
          {points[points.length - 1].label}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    labels: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
    label: { color: theme.low, fontSize: 11, lineHeight: 15, flex: 1 },
    labelEnd: { textAlign: 'right' },
  });
