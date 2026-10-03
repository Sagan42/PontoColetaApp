import { Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH_TARGET, colors, radius, spacing } from '../tokens';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}

export function Chip({ label, selected = false, onPress, testID }: ChipProps) {
  const content = (
    <Text variant="caption" color={selected ? 'primaryDark' : 'textSecondary'}>
      {selected ? `✓ ${label}` : label}
    </Text>
  );

  if (!onPress) {
    return (
      <View style={[styles.chip, selected ? styles.selected : null]} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        styles.tappable,
        selected ? styles.selected : null,
        pressed ? styles.pressed : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  tappable: {
    minHeight: MIN_TOUCH_TARGET - 8,
    justifyContent: 'center',
  },
  selected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
