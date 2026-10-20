import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LeafGlyph,
  MIN_TOUCH_TARGET,
  Text,
  colors,
  radius,
  shadows,
  spacing,
} from '../../../design-system';

/**
 * Botão flutuante, preso ao canto inferior direito de qualquer tela.
 *
 * Mora no layout raiz, acima do navegador, e não dentro do `Screen`: assim ele
 * não se redesenha a cada navegação, e o `Screen` — que é design system — não
 * precisa conhecer rotas.
 */
export function FeedbackFab() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Na própria tela de feedback o botão não teria para onde levar.
  if (pathname === '/feedback') return null;

  return (
    <View
      style={[styles.anchor, { paddingBottom: insets.bottom + spacing.lg }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => router.push('/feedback')}
        accessibilityRole="button"
        accessibilityLabel="Deixe seu feedback"
        accessibilityHint="Abre a tela para enviar um comentário sobre o app"
        testID="button-feedback"
        style={({ pressed }) => [styles.fab, pressed ? styles.pressed : null]}
      >
        <LeafGlyph tone="inverse" />
        <Text variant="button" color="textInverse">
          Deixe seu feedback
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingRight: spacing.xl,
    alignItems: 'flex-end',
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    ...shadows.raised,
  },
  pressed: {
    backgroundColor: colors.primaryPressed,
  },
});
