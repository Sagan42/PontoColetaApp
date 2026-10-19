import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { BannerAdSlot } from '../src/components/ads/BannerAdSlot';
import {
  ActionTile,
  Button,
  ListGlyph,
  MapGlyph,
  Screen,
  SearchGlyph,
  Text,
  colors,
  radius,
  shadows,
  spacing,
} from '../src/design-system';

export default function HomeScreen() {
  const router = useRouter();

  /**
   * Ver tudo não exige filtro: a rota de listagem sem `material` devolve todos
   * os pontos publicados. `mode: 'all'` já existia no hook de busca e era
   * inalcançável pela interface até aqui.
   */
  function openAll(view: 'map' | 'list') {
    router.push({ pathname: '/results', params: { mode: 'all', view } });
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

      <View style={styles.tiles}>
        <ActionTile
          label="Ver mapa"
          description="Todos os pontos da cidade"
          icon={<MapGlyph />}
          onPress={() => openAll('map')}
          accessibilityHint="Abre o mapa com todos os pontos de coleta"
          testID="tile-map"
        />
        <ActionTile
          label="Listar pontos"
          description="Em ordem, do mais recente"
          icon={<ListGlyph />}
          onPress={() => openAll('list')}
          accessibilityHint="Abre a lista com todos os pontos de coleta"
          testID="tile-list"
        />
      </View>

      <Pressable
        onPress={() => router.push('/search')}
        accessibilityRole="button"
        accessibilityLabel="Buscar por endereço ou material"
        accessibilityHint="Abre a busca por endereço ou por material aceito"
        testID="button-open-search"
        style={({ pressed }) => [styles.searchBar, pressed ? styles.searchBarPressed : null]}
      >
        <View style={styles.searchIcon}>
          <SearchGlyph />
        </View>
        <View style={styles.searchLabels}>
          <Text variant="bodyStrong" color="textPrimary">
            Buscar por endereço ou material
          </Text>
          <Text variant="caption" color="textMuted">
            Filtre por perto de você ou pelo que precisa descartar
          </Text>
        </View>
      </Pressable>

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
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.sm,
  },
  logo: {
    width: 88,
    height: 88,
    marginBottom: spacing.sm,
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    ...shadows.card,
  },
  searchBarPressed: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  searchIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchLabels: {
    flex: 1,
    gap: 2,
  },
  footer: {
    gap: spacing.sm,
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  adminLink: {
    padding: spacing.sm,
  },
});
