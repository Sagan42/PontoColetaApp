import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { BannerAdSlot } from '../src/components/ads/BannerAdSlot';
import { Button, Screen, Text, TextField, colors, spacing } from '../src/design-system';

export default function HomeScreen() {
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
    <Screen scrollable footer={<BannerAdSlot testID="home-banner" />}>
      <View style={styles.header}>
        <Image
          source={require('../assets/logo-mark.png')}
          style={styles.logo}
          accessibilityIgnoresInvertColors
          accessible
          accessibilityLabel="Logotipo do PontoColeta"
        />
        <Text variant="display" center accessibilityRole="header">
          PontoColeta
        </Text>
        <Text variant="subtitle" color="primaryDark" center>
          Londrina
        </Text>
        <Text variant="body" color="textSecondary" center>
          Encontre onde descartar corretamente ou cadastre um novo ponto de coleta.
        </Text>
      </View>

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

      <View style={styles.footer}>
        <Button
          label="Cadastrar novo ponto"
          variant="ghost"
          onPress={() => router.push('/new-point')}
          testID="button-new-point"
          accessibilityHint="Abre o formulário para cadastrar um ponto de coleta"
        />
        <Pressable
          onPress={() => router.push('/admin')}
          accessibilityRole="link"
          accessibilityLabel="Área administrativa"
          style={styles.adminLink}
        >
          <Text variant="caption" color="textMuted">
            Área administrativa
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.huge,
    paddingBottom: spacing.lg,
  },
  logo: {
    width: 88,
    height: 88,
    marginBottom: spacing.sm,
  },
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
  footer: {
    gap: spacing.sm,
    alignItems: 'center',
    paddingTop: spacing.lg,
  },
  adminLink: {
    padding: spacing.sm,
  },
});
