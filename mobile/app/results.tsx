import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  EmptyState,
  ErrorState,
  FAB_CLEARANCE,
  LoadingState,
  Screen,
  Text,
  spacing,
} from '../src/design-system';
import { CollectionPointCard } from '../src/features/collection-points/components/CollectionPointCard';
import { CollectionPointsMap } from '../src/features/collection-points/components/CollectionPointsMap';
import {
  ViewModeToggle,
  type ViewMode,
} from '../src/features/collection-points/components/ViewModeToggle';
import { useCollectionPointSearch, type SearchMode } from '../src/features/collection-points/hooks';
import { ApiError } from '../src/services/apiClient';

/** `all` lista tudo que está publicado; os outros dois filtram. */
function parseMode(value: unknown): SearchMode {
  if (value === 'material') return 'material';
  if (value === 'all') return 'all';
  return 'address';
}

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; query?: string; view?: string }>();
  const mode = parseMode(params.mode);
  const query = typeof params.query === 'string' ? params.query : '';

  // A home abre direto no mapa ou na lista; a busca filtrada continua na lista.
  const [viewMode, setViewMode] = useState<ViewMode>(params.view === 'map' ? 'map' : 'list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const search = useCollectionPointSearch(mode, query);
  const points = search.data?.points ?? [];

  function openDetails(id: string) {
    router.push({ pathname: '/point/[id]', params: { id } });
  }

  // The map shows whatever the list has loaded; only scrolling the list asks
  // for more. onEndReached also fires on short lists, hence the guard.
  function loadMore() {
    if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="caption" color="textMuted">
          {headerLabel(mode)}
        </Text>
        <Text variant="subtitle">{mode === 'all' ? 'Londrina' : query}</Text>
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
            description={emptyDescription(mode)}
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
            testID="results-list"
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
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={search.isFetchingNextPage ? <LoadingState /> : null}
          />
        )}
      </View>
    </Screen>
  );
}

function headerLabel(mode: SearchMode): string {
  if (mode === 'material') return 'Material buscado';
  if (mode === 'all') return 'Todos os pontos de coleta';
  return 'Endereço buscado';
}

function emptyDescription(mode: SearchMode): string {
  if (mode === 'material') {
    return 'Ainda não há pontos cadastrados que aceitem esse material. Você pode cadastrar um.';
  }
  if (mode === 'all') {
    return 'Ainda não há pontos de coleta cadastrados. Seja a primeira pessoa a cadastrar um.';
  }
  return 'Não encontramos pontos próximos desse endereço. Você pode cadastrar um.';
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
    paddingBottom: FAB_CLEARANCE,
  },
});
