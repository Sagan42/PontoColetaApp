import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { BannerAdSlot } from '../../src/components/ads/BannerAdSlot';
import {
  Button,
  Card,
  Chip,
  ErrorState,
  LoadingState,
  Screen,
  Text,
  spacing,
} from '../../src/design-system';
import { useCollectionPoint } from '../../src/features/collection-points/hooks';
import { ApiError } from '../../src/services/apiClient';
import { reportMetric } from '../../src/services/metrics';
import { formatDistance } from '../../src/utils/format';

export default function CollectionPointDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const query = useCollectionPoint(id);
  const point = query.data;

  useEffect(() => {
    if (point) reportMetric('point_viewed');
  }, [point]);

  if (query.isPending) {
    return (
      <Screen>
        <LoadingState label="Carregando ponto de coleta..." />
      </Screen>
    );
  }

  if (query.isError || !point) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;

    return (
      <Screen>
        <ErrorState
          title={notFound ? 'Ponto não encontrado' : 'Algo deu errado'}
          description={
            notFound
              ? 'Esse ponto de coleta não está mais disponível.'
              : 'Não foi possível carregar o ponto. Tente novamente.'
          }
          onRetry={notFound ? undefined : () => void query.refetch()}
        />
      </Screen>
    );
  }

  const distance = formatDistance(point.distanceKm);

  return (
    <Screen scrollable footer={<BannerAdSlot testID="details-banner" />}>
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {point.name}
        </Text>
        {distance ? (
          <Text variant="caption" color="primaryDark">
            A {distance} do endereço buscado
          </Text>
        ) : null}
      </View>

      <Card>
        <Text variant="bodyStrong">Endereço</Text>
        <Text variant="body" color="textSecondary">
          {point.address.formatted}
        </Text>
      </Card>

      <Card>
        <Text variant="bodyStrong">Materiais aceitos</Text>
        <View style={styles.materials}>
          {point.materials.map((material) => (
            <Chip key={material.slug} label={material.label} />
          ))}
        </View>
      </Card>

      <Card>
        <Text variant="bodyStrong">Horário de funcionamento</Text>
        <Text variant="body" color="textSecondary">
          {point.openingHours ?? 'Horário não informado'}
        </Text>
      </Card>

      <Card>
        <Text variant="bodyStrong">Observações</Text>
        <Text variant="body" color="textSecondary">
          {point.notes ?? 'Sem observações adicionais'}
        </Text>
      </Card>

      <Card>
        <Text variant="bodyStrong">Localização</Text>
        <Text variant="body" color="textSecondary">
          {point.location.latitude.toFixed(5)}, {point.location.longitude.toFixed(5)}
        </Text>
        <Button
          label="Abrir no aplicativo de mapas"
          variant="secondary"
          onPress={() => {
            const { latitude, longitude } = point.location;
            void Linking.openURL(
              `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(point.name)})`,
            );
          }}
          accessibilityHint="Abre a localização no aplicativo de mapas do aparelho"
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  materials: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
