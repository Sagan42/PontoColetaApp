import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Screen, Text, TextField, colors, spacing } from '../src/design-system';

/**
 * Busca filtrada, que era a tela inicial até a home passar a oferecer "ver
 * tudo". Quem chega aqui já decidiu que quer filtrar, então a tela não repete
 * logotipo nem apresentação do app.
 */
export default function SearchScreen() {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [material, setMaterial] = useState('');
  const [error, setError] = useState<string | null>(null);

  function searchByAddress() {
    const query = address.trim();
    if (query.length < 3) {
      setError('Digite um endereço para buscar.');
      return;
    }
    setError(null);
    router.push({ pathname: '/results', params: { mode: 'address', query } });
  }

  function searchByMaterial() {
    const query = material.trim();
    if (query.length < 2) {
      setError('Digite um material para buscar.');
      return;
    }
    setError(null);
    router.push({ pathname: '/results', params: { mode: 'material', query } });
  }

  return (
    <Screen scrollable>
      <Text variant="body" color="textSecondary">
        Busque pelos pontos próximos de um endereço ou pelos que aceitam um material.
      </Text>

      <View style={styles.search}>
        <TextField
          label="Digite seu endereço"
          placeholder="Ex.: Rua Pará, 500"
          value={address}
          onChangeText={setAddress}
          autoCapitalize="words"
          returnKeyType="search"
          onSubmitEditing={searchByAddress}
          testID="input-address"
        />
        <Button
          label="Buscar por endereço"
          onPress={searchByAddress}
          testID="button-search-address"
          accessibilityHint="Mostra os pontos de coleta próximos do endereço informado"
        />

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text variant="bodyStrong" color="textMuted">
            ou
          </Text>
          <View style={styles.line} />
        </View>

        <TextField
          label="Digite o material para descarte"
          placeholder="Ex.: Pilhas, Óleo de cozinha"
          value={material}
          onChangeText={setMaterial}
          autoCapitalize="sentences"
          returnKeyType="search"
          onSubmitEditing={searchByMaterial}
          testID="input-material"
        />
        <Button
          label="Buscar por material"
          onPress={searchByMaterial}
          variant="secondary"
          testID="button-search-material"
          accessibilityHint="Mostra os pontos que aceitam o material informado"
        />

        {error ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    gap: spacing.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
});
