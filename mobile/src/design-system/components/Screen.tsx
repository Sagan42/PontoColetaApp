import { useEffect, useState } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../tokens';

/** Altura do botão flutuante mais folga, reservada no fim de cada tela. */
export const FAB_CLEARANCE = 80;

export interface ScreenProps {
  children: React.ReactNode;
  scrollable?: boolean;
  testID?: string;
}

/**
 * Altura do teclado em dp, zero quando ele está fechado.
 *
 * Por que não `KeyboardAvoidingView`: ele decide o quanto subir a partir de
 * `endCoordinates.screenY`, e com edge-to-edge — obrigatório no Android a
 * partir do SDK 54 — a janela não é mais redimensionada. O `screenY` passa a
 * apontar para o fim da tela, a conta dá zero e o componente fica inerte. Era
 * exatamente isso que deixava o teclado cobrindo o campo em foco.
 *
 * O `height` do mesmo evento continua correto nas duas plataformas. No Android
 * ele já vem descontando a barra de navegação (`imeInsets - barInsets`), que o
 * `paddingBottom` da tela reserva de todo jeito; no iOS ele inclui a área do
 * indicador, então ali o desconto é feito aqui.
 */
function useKeyboardHeight(bottomInset: number): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        const reported = event.endCoordinates?.height ?? 0;
        const usable = Platform.OS === 'ios' ? reported - bottomInset : reported;
        setHeight(Math.max(usable, 0));
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setHeight(0),
    );

    return () => {
      show.remove();
      hide.remove();
    };
  }, [bottomInset]);

  return height;
}

export function Screen({ children, scrollable = false, testID }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight(insets.bottom);

  const body = scrollable ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.content}>{children}</View>
  );

  /**
   * O espaço do teclado sai da altura da tela, não de uma translação. Encurtar
   * a ScrollView faz o Android rolar sozinho até o campo em foco
   * (`ScrollView.onSizeChanged`), que é o comportamento pedido: o conteúdo
   * acompanha o teclado em vez de ficar embaixo dele.
   */
  return (
    <View
      style={[styles.container, { paddingBottom: insets.bottom + keyboardHeight }]}
      testID={testID}
    >
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    // Espaço reservado para o botão flutuante de feedback, que paira sobre
    // qualquer tela: sem isto ele cobriria o fim do conteúdo.
    paddingBottom: FAB_CLEARANCE,
    gap: spacing.lg,
  },
});
