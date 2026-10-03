import { Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH_TARGET, Text, colors, radius, spacing } from '../../../design-system';

export type ViewMode = 'list' | 'map';

export interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: 'list', label: 'Lista' },
  { mode: 'map', label: 'Mapa' },
];

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {OPTIONS.map((option) => {
        const selected = option.mode === value;

        return (
          <Pressable
            key={option.mode}
            onPress={() => onChange(option.mode)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`Ver resultados em ${option.label.toLowerCase()}`}
            testID={`view-mode-${option.mode}`}
            style={[styles.option, selected ? styles.optionSelected : null]}
          >
            <Text variant="bodyStrong" color={selected ? 'primaryDark' : 'textSecondary'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  option: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET - 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
});
