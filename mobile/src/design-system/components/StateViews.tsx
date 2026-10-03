import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../tokens';
import { Button } from './Button';
import { Text } from './Text';

export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text variant="body" color="textSecondary" center>
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <View style={styles.badge}>
        <Text variant="title" color="primary">
          ⌕
        </Text>
      </View>
      <Text variant="subtitle" center>
        {title}
      </Text>
      {description ? (
        <Text variant="body" color="textSecondary" center>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = 'Algo deu errado',
  description = 'Não foi possível carregar os pontos. Tente novamente.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.container} accessibilityLiveRegion="assertive">
      <View style={[styles.badge, styles.badgeError]}>
        <Text variant="title" color="danger">
          !
        </Text>
      </View>
      <Text variant="subtitle" center>
        {title}
      </Text>
      <Text variant="body" color="textSecondary" center>
        {description}
      </Text>
      {onRetry ? <Button label="Tentar novamente" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeError: {
    backgroundColor: colors.dangerSoft,
  },
});
