import { Component, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Region } from 'react-native-maps';
import { Card, EmptyState, Text, colors, radius, spacing } from '../../../design-system';
import { config } from '../../../services/config';
import { formatDistance } from '../../../utils/format';
import type { CollectionPoint, SearchOrigin } from '../api';

export interface CollectionPointsMapProps {
  points: CollectionPoint[];
  origin: SearchOrigin | null;
  selectedId: string | null;
  onSelect: (point: CollectionPoint) => void;
  onOpenDetails: (point: CollectionPoint) => void;
}

type MapsModule = typeof import('react-native-maps');

function loadMapsModule(): MapsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-maps') as MapsModule;
  } catch {
    return null;
  }
}

export function CollectionPointsMap(props: CollectionPointsMapProps) {
  // Builds without the native module exist (Expo Go, for one). A static import
  // would blow up while the module loads, long before any boundary could help,
  // taking the whole results screen with it.
  const maps = loadMapsModule();
  if (!maps) return <MapUnavailable />;

  return (
    <MapFallbackBoundary>
      <MapCanvas maps={maps} {...props} />
    </MapFallbackBoundary>
  );
}

function MapCanvas({
  maps,
  points,
  origin,
  selectedId,
  onSelect,
  onOpenDetails,
}: CollectionPointsMapProps & { maps: MapsModule }) {
  const { default: MapView, Marker, PROVIDER_GOOGLE } = maps;
  const selected = points.find((point) => point.id === selectedId) ?? null;

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={buildRegion(points, origin)}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        accessibilityLabel={`Mapa com ${points.length} ponto(s) de coleta`}
      >
        {points.map((point) => (
          <Marker
            key={point.id}
            coordinate={point.location}
            title={point.name}
            description={point.address.formatted}
            pinColor={point.id === selectedId ? colors.primaryDark : colors.primary}
            onPress={() => onSelect(point)}
          />
        ))}
      </MapView>

      {selected ? (
        <View style={styles.summary}>
          <Card
            onPress={() => onOpenDetails(selected)}
            accessibilityLabel={`${selected.name}. ${selected.address.formatted}.`}
            accessibilityHint="Abre os detalhes do ponto de coleta"
          >
            <Text variant="subtitle">{selected.name}</Text>
            <Text variant="caption" color="textSecondary">
              {selected.address.formatted}
            </Text>
            <Text variant="caption" color="primaryDark">
              {formatDistance(selected.distanceKm) ?? 'Toque para ver os detalhes'}
            </Text>
          </Card>
        </View>
      ) : null}
    </View>
  );
}

function MapUnavailable() {
  return (
    <EmptyState
      title="Mapa indisponível"
      description="Não foi possível carregar o mapa neste dispositivo. Use a visualização em lista."
    />
  );
}

function buildRegion(points: CollectionPoint[], origin: SearchOrigin | null): Region {
  const coordinates = points.map((point) => point.location);
  if (origin) coordinates.push({ latitude: origin.latitude, longitude: origin.longitude });

  if (coordinates.length === 0) {
    return {
      latitude: config.cityCentre.latitude,
      longitude: config.cityCentre.longitude,
      latitudeDelta: 0.12,
      longitudeDelta: 0.12,
    };
  }

  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);

  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.6, 0.02),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.6, 0.02),
  };
}

class MapFallbackBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) {
      return <MapUnavailable />;
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  summary: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
  },
});
