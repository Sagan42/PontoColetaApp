import { StyleSheet, View } from 'react-native';
import { Card, Chip, Text, spacing } from '../../../design-system';
import { formatDistance, formatMaterialList } from '../../../utils/format';
import type { CollectionPoint } from '../api';

export interface CollectionPointCardProps {
  point: CollectionPoint;
  onPress: (point: CollectionPoint) => void;
  testID?: string;
}

export function CollectionPointCard({ point, onPress, testID }: CollectionPointCardProps) {
  const distance = formatDistance(point.distanceKm);
  const materials = point.materials.map((material) => material.label);

  return (
    <Card
      onPress={() => onPress(point)}
      testID={testID}
      accessibilityLabel={`${point.name}. ${point.address.formatted}. Aceita ${formatMaterialList(
        materials,
      )}.${distance ? ` A ${distance} de distância.` : ''}`}
      accessibilityHint="Abre os detalhes do ponto de coleta"
    >
      <View style={styles.header}>
        <Text variant="subtitle" style={styles.name}>
          {point.name}
        </Text>
        {distance ? (
          <Text variant="caption" color="primaryDark">
            {distance}
          </Text>
        ) : null}
      </View>

      <Text variant="body" color="textSecondary">
        {point.address.formatted}
      </Text>

      <View style={styles.materials}>
        {materials.slice(0, 4).map((label) => (
          <Chip key={label} label={label} />
        ))}
        {materials.length > 4 ? <Chip label={`+${materials.length - 4}`} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    flexShrink: 1,
  },
  materials: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
