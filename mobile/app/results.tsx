import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BannerAdSlot } from '../src/components/ads/BannerAdSlot';
import { EmptyState, ErrorState, LoadingState, Screen, Text, spacing } from '../src/design-system';
import { CollectionPointCard } from '../src/features/collection-points/components/CollectionPointCard';
import { CollectionPointsMap } from '../src/features/collection-points/components/CollectionPointsMap';
import {
  ViewModeToggle,
  type ViewMode,
} from '../src/features/collection-points/components/ViewModeToggle';
import { useCollectionPointSearch, type SearchMode } from '../src/features/collection-points/hooks';
import { ApiError } from '../src/services/apiClient';

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; query?: string }>();
  const mode: SearchMode = params.mode === 'material' ? 'material' : 'address';
  const query = typeof params.query === 'string' ? params.query : '';

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const search = useCollectionPointSearch(mode, query);
  const points = search.data?.points ?? [];

  function openDetails(id: string) {
    router.push({ pathname: '/point/[id]', params: { id } });
  }

  return (
    <Screen footer={<BannerAdSlot testID="results-banner" />}>
      <View style={styles.header}>
        <Text variant="caption" color="textMuted">
          {mode === 'material' ? 'Material buscado' : 'Endereço buscado'}
        </Text>
        <Text variant="subtitle">{query}</Text>
        {search.data?.origin?.formattedAddress ? (
          <Text variant="caption" color="textSecondary">
            Perto de {search.data.origin.formattedAddress}
          </Text>
        ) : null}
      </View>

      <ViewModeToggle value={viewMode} onChange={setViewMode} />

      <View style={styles.body}>
        {search.isPending ? (
          <LoadingState label="Buscando pontos de coleta..." />
        ) : search.isError ? (
          <ErrorState
            title={errorTitle(search.error)}
            description={errorDescription(search.error)}
            onRetry={() => void search.refetch()}
          />
        ) : points.length === 0 ? (
          <EmptyState
            title="Nenhum ponto encontrado"
            description={
              mode === 'material'
                ? 'Ainda não há pontos cadastrados que aceitem esse material. Você pode cadastrar um.'
                : 'Não encontramos pontos próximos desse endereço. Você pode cadastrar um.'
            }
            actionLabel="Cadastrar novo ponto"
            onAction={() => router.push('/new-point')}
          />
        ) : viewMode === 'map' ? (
          <CollectionPointsMap
            points={points}
            origin={search.data?.origin ?? null}
            selectedId={selectedId}
            onSelect={(point) => setSelectedId(point.id)}
            onOpenDetails={(point) => openDetails(point.id)}
          />
        ) : (
          <FlatList
            data={points}
            keyExtractor={(point) => point.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <CollectionPointCard
                point={item}
                onPress={(point) => openDetails(point.id)}
                testID={`result-${item.id}`}
              />
            )}
            ListHeaderComponent={
              <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite">
                {points.length === 1 ? '1 ponto encontrado' : `${points.length} pontos encontrados`}
              </Text>
            }
          />
        )}
      </View>
    </Screen>
  );
}

function errorTitle(error: unknown): string {
  if (error instanceof ApiError && error.code === 'ADDRESS_NOT_FOUND') {
    return 'Endereço não encontrado';
  }
  return 'Algo deu errado';
}

function errorDescription(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'ADDRESS_NOT_FOUND') {
      return 'Não foi possível localizar esse endereço. Revise o que você digitou e tente novamente.';
    }
    return error.message;
  }
  return 'Não foi possível carregar os pontos. Tente novamente.';
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  body: {
    flex: 1,
    paddingTop: spacing.lg,
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
});
