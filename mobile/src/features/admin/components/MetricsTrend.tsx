import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, colors, radius, spacing } from '../../../design-system';
import { formatShortDate } from '../../../utils/format';

export interface MetricsTrendProps {
  title: string;
  series: { date: string; value: number }[];
}

const CHART_HEIGHT = 120;
const BAR_WIDTH = 14;

export function MetricsTrend({ title, series }: MetricsTrendProps) {
  const maximum = Math.max(1, ...series.map((point) => point.value));
  const total = series.reduce((sum, point) => sum + point.value, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color="textMuted">
          Máximo no período: {maximum}
        </Text>
      </View>

      {total === 0 ? (
        <Text variant="caption" color="textMuted">
          Nenhum registro no período.
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chart} accessibilityLabel={`${title}: gráfico por dia`}>
            {series.map((point) => (
              <View key={point.date} style={styles.column}>
                <View
                  accessible
                  accessibilityLabel={`${formatShortDate(point.date)}: ${point.value}`}
                  style={[
                    styles.bar,
                    {
                      height: Math.max(2, (point.value / maximum) * CHART_HEIGHT),
                      backgroundColor: point.value === 0 ? colors.border : colors.primary,
                    },
                  ]}
                />
                <Text variant="caption" color="textMuted" style={styles.label}>
                  {formatShortDate(point.date)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT + 24,
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  column: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: radius.sm,
  },
  label: {
    fontSize: 10,
  },
});
