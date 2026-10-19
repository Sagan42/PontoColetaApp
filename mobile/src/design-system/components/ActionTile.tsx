import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, shadows, spacing } from '../tokens';
import { Text } from './Text';

export interface ActionTileProps {
  label: string;
  description?: string;
  /** Glifo desenhado pelo chamador; recebe o espaço quadrado do topo. */
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * Ação principal em formato de quadrado, para quando duas opções têm o mesmo
 * peso e disputam a mesma decisão. Vive numa linha com `flex: 1` em cada, e o
 * `aspectRatio` mantém os dois quadrados iguais em qualquer largura de tela.
 */
export function ActionTile({
  label,
  description,
  icon,
  onPress,
  accessibilityHint,
  testID,
}: ActionTileProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => [styles.tile, pressed ? styles.pressed : null]}
    >
      <View style={styles.iconSlot}>{icon}</View>

      <View style={styles.labels}>
        <Text variant="bodyStrong" color="textPrimary">
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    justifyContent: 'space-between',
    ...shadows.card,
  },
  pressed: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  iconSlot: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labels: {
    gap: 2,
  },
});
