import { StyleSheet, View } from 'react-native';
import { colors } from '../tokens';

/**
 * Glifos desenhados com Views, sem biblioteca de ícones.
 *
 * O projeto já desenha o gráfico de métricas assim. Manter a mesma abordagem
 * evita uma dependência nova — e um pacote de ícones inteiro para dois
 * símbolos seria peso de bundle sem retorno.
 *
 * São decorativos: quem anuncia o significado é o rótulo do componente que os
 * contém, então ficam escondidos do leitor de tela.
 */

export function MapGlyph() {
  return (
    <View style={styles.glyph} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.pinHead} />
      <View style={styles.pinTail} />
    </View>
  );
}

export function ListGlyph() {
  return (
    <View style={styles.glyph} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.row}>
          <View style={styles.bullet} />
          <View style={[styles.line, row === 2 ? styles.lineShort : null]} />
        </View>
      ))}
    </View>
  );
}

/**
 * Folha: um quadrado com dois cantos opostos arredondados e girado 45°. Os
 * dois cantos que sobram viram as pontas.
 */
export function LeafGlyph({ tone = 'primary' }: { tone?: 'primary' | 'inverse' }) {
  return (
    <View style={styles.glyph} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View
        style={[styles.leaf, tone === 'inverse' ? styles.leafInverse : null]}
      />
    </View>
  );
}

export function SearchGlyph() {
  return (
    <View style={styles.glyph} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.lens} />
      <View style={styles.handle} />
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinHead: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2.5,
    borderColor: colors.primary,
  },
  pinTail: {
    width: 7,
    height: 7,
    marginTop: -4,
    backgroundColor: colors.primary,
    transform: [{ rotate: '45deg' }],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginVertical: 2,
  },
  bullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  line: {
    width: 15,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.primary,
    opacity: 0.55,
  },
  lineShort: {
    width: 9,
  },
  leaf: {
    width: 15,
    height: 15,
    backgroundColor: colors.primary,
    borderTopLeftRadius: 15,
    borderBottomRightRadius: 15,
    transform: [{ rotate: '-45deg' }],
  },
  leafInverse: {
    backgroundColor: colors.textInverse,
  },
  lens: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: colors.primary,
  },
  handle: {
    width: 2.5,
    height: 7,
    borderRadius: 2,
    backgroundColor: colors.primary,
    transform: [{ rotate: '-45deg' }],
    marginTop: -2,
    marginLeft: 9,
  },
});
