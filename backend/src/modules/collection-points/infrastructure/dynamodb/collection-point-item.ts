import { z } from 'zod';
import { encodeGeohash } from '../../../../shared/domain/geo/index.js';
import { slugify } from '../../../../shared/domain/text/index.js';
import { CollectionPoint } from '../../domain/collection-point.js';
import {
  CollectionPointStatus,
  isPubliclyVisible,
  type CollectionPointStatus as Status,
} from '../../domain/collection-point-status.js';
import { SERVICE_AREA } from '../../domain/service-area.js';

export const GEOHASH_PARTITION_PRECISION = 4;

export const GEOHASH_STORED_PRECISION = 9;

/**
 * Cell behind the uniqueness item: about 153 m x 140 m at this latitude, so it
 * matches the radius the duplicate pre-check uses.
 */
export const GEOHASH_UNIQUENESS_PRECISION = 7;

export const ITEM_TYPE = {
  CollectionPoint: 'CollectionPoint',
  CollectionPointMaterial: 'CollectionPointMaterial',
  CollectionPointUniqueness: 'CollectionPointUniqueness',
} as const;

export const keys = {
  cityPartition: (): string => `CITY#${SERVICE_AREA.cityId}`,
  pointSortKey: (id: string): string => `POINT#${id}`,
  materialLinkSortKey: (materialSlug: string, id: string): string =>
    `MATERIAL#${materialSlug}#POINT#${id}`,
  materialLinkPrefix: (materialSlug: string): string => `MATERIAL#${materialSlug}#POINT#`,
  statusPartition: (status: Status): string => `STATUS#${status}`,
  statusSortKey: (createdAt: string, id: string): string => `${createdAt}#${id}`,
  geoPartition: (geohashPrefix: string): string => `GEO#${geohashPrefix}`,
  uniquenessSortKey: (nameSlug: string, geohashCell: string): string =>
    `UNIQUE#POINT#${nameSlug}#${geohashCell}`,
} as const;

const materialSchema = z.object({ label: z.string(), slug: z.string() });

export const collectionPointItemSchema = z.object({
  PK: z.string(),
  SK: z.string(),
  entityType: z.literal(ITEM_TYPE.CollectionPoint),
  id: z.string(),
  name: z.string(),
  addressLine: z.string(),
  addressCity: z.string(),
  addressState: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  geohash: z.string(),
  materials: z.array(materialSchema).min(1),
  openingHours: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum([CollectionPointStatus.Published, CollectionPointStatus.Hidden]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CollectionPointItem = z.infer<typeof collectionPointItemSchema> & {
  GSI1PK: string;
  GSI1SK: string;
  GSI2PK?: string;
  GSI2SK?: string;
};

export function toItem(point: CollectionPoint): CollectionPointItem {
  const snapshot = point.toSnapshot();
  const geohash = encodeGeohash(snapshot.latitude, snapshot.longitude, GEOHASH_STORED_PRECISION);

  const item: CollectionPointItem = {
    PK: keys.cityPartition(),
    SK: keys.pointSortKey(snapshot.id),
    entityType: ITEM_TYPE.CollectionPoint,
    id: snapshot.id,
    name: snapshot.name,
    addressLine: snapshot.address.line,
    addressCity: snapshot.address.city,
    addressState: snapshot.address.state,
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    geohash,
    materials: snapshot.materials,
    openingHours: snapshot.openingHours,
    notes: snapshot.notes,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    GSI1PK: keys.statusPartition(snapshot.status),
    GSI1SK: keys.statusSortKey(snapshot.createdAt, snapshot.id),
  };

  if (isPubliclyVisible(snapshot.status)) {
    item.GSI2PK = keys.geoPartition(geohash.slice(0, GEOHASH_PARTITION_PRECISION));
    item.GSI2SK = keys.pointSortKey(snapshot.id);
  }

  return item;
}

export function toDomain(raw: unknown): CollectionPoint {
  const item = collectionPointItemSchema.parse(raw);

  return CollectionPoint.restore({
    id: item.id,
    name: item.name,
    address: {
      line: item.addressLine,
      city: item.addressCity,
      state: item.addressState,
      formatted: item.addressLine,
    },
    latitude: item.latitude,
    longitude: item.longitude,
    materials: item.materials,
    openingHours: item.openingHours,
    notes: item.notes,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
}

export interface MaterialLinkItem {
  PK: string;
  SK: string;
  entityType: typeof ITEM_TYPE.CollectionPointMaterial;
  pointId: string;
  materialSlug: string;
  createdAt: string;
}

export function toMaterialLinkItems(point: CollectionPoint): MaterialLinkItem[] {
  const snapshot = point.toSnapshot();

  return snapshot.materials.map((material) => ({
    PK: keys.cityPartition(),
    SK: keys.materialLinkSortKey(material.slug, snapshot.id),
    entityType: ITEM_TYPE.CollectionPointMaterial,
    pointId: snapshot.id,
    materialSlug: material.slug,
    createdAt: snapshot.createdAt,
  }));
}

export function pointIdFromMaterialLink(sortKey: string): string {
  const marker = '#POINT#';
  const index = sortKey.indexOf(marker);
  return index === -1 ? '' : sortKey.slice(index + marker.length);
}

export interface UniquenessItem {
  PK: string;
  SK: string;
  entityType: typeof ITEM_TYPE.CollectionPointUniqueness;
  pointId: string;
  nameSlug: string;
  geohashCell: string;
  createdAt: string;
}

/**
 * Claim on "this name, at this place". Written in the same transaction as the
 * point under attribute_not_exists, so of two concurrent registrations of the
 * same place only the first can commit.
 */
export function toUniquenessItem(point: CollectionPoint): UniquenessItem {
  const snapshot = point.toSnapshot();
  const nameSlug = slugify(snapshot.name);
  const geohashCell = encodeGeohash(
    snapshot.latitude,
    snapshot.longitude,
    GEOHASH_UNIQUENESS_PRECISION,
  );

  return {
    PK: keys.cityPartition(),
    SK: keys.uniquenessSortKey(nameSlug, geohashCell),
    entityType: ITEM_TYPE.CollectionPointUniqueness,
    pointId: snapshot.id,
    nameSlug,
    geohashCell,
    createdAt: snapshot.createdAt,
  };
}
