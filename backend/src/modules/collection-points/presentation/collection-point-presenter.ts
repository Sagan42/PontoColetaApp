import type { CollectionPointResult } from '../application/dtos/collection-point-result.js';

export interface ApiCollectionPoint {
  id: string;
  name: string;
  address: { line: string; city: string; state: string; formatted: string };
  location: { latitude: number; longitude: number };
  materials: { label: string; slug: string }[];
  openingHours: string | null;
  notes: string | null;
  status: string;
  distanceKm: number | null;
  createdAt: string;
  updatedAt: string;
}

export function presentCollectionPoint(result: CollectionPointResult): ApiCollectionPoint {
  const { point } = result;

  return {
    id: point.id,
    name: point.name,
    address: point.address,
    location: { latitude: point.latitude, longitude: point.longitude },
    materials: point.materials,
    openingHours: point.openingHours,
    notes: point.notes,
    status: point.status,
    distanceKm: result.distanceKm,
    createdAt: point.createdAt,
    updatedAt: point.updatedAt,
  };
}
