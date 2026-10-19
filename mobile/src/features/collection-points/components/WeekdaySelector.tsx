import { Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH_TARGET, Text, colors, radius, spacing } from '../../../design-system';
import { WEEKDAYS, type WeekdayKey } from '../../../schemas/collectionPoint';

export interface WeekdaySelectorProps {
  value: readonly WeekdayKey[];
  onChange: (next: WeekdayKey[]) => void;
  error?: string | null;
}

/**
 * Os sete dias numa única linha, cada um com `flex: 1`.
 *
 * Preferido a uma lista com rolagem horizontal porque sete alvos de ~40dp
 * cabem na largura de qualquer telefone — e dia escondido atrás de rolagem é
 * dia que ninguém marca.
 */
export function WeekdaySelector({ value, onChange, error }: WeekdaySelectorProps) {
  function toggle(key: WeekdayKey) {
    const next = value.includes(key)
      ? value.filter((item) => item !== key)
      : WEEKDAYS.map((day) => day.key).filter((item) => item === key || value.includes(item));
    onChange(next);
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {WEEKDAYS.map((day) => {
          const selected = value.includes(day.key);

          return (
            <Pressable
              key={day.key}
              onPress={() => toggle(day.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={day.label}
              testID={`weekday-${day.key}`}
              style={({ pressed }) => [
                styles.day,
                selected ? styles.daySelected : null,
                pressed ? styles.dayPressed : null,
              ]}
            >
              <Text variant="caption" color={selected ? 'primaryDark' : 'textSecondary'}>
                {day.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  day: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  daySelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  dayPressed: {
    opacity: 0.7,
  },
});
