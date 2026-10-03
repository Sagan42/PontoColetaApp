import { Coordinates } from './value-objects/coordinates.js';

export const SERVICE_AREA = {
  cityId: 'LONDRINA',
  cityName: 'Londrina',
  state: 'PR',
  country: 'Brasil',
  centre: Coordinates.create(-23.3103, -51.1628),
  bounds: {
    minLatitude: -23.62,
    maxLatitude: -23.05,
    minLongitude: -51.42,
    maxLongitude: -50.85,
  },
  maxSearchRadiusKm: 20,
  defaultSearchRadiusKm: 5,
} as const;

export function isWithinServiceArea(coordinates: Coordinates): boolean {
  const { bounds } = SERVICE_AREA;
  return (
    coordinates.latitude >= bounds.minLatitude &&
    coordinates.latitude <= bounds.maxLatitude &&
    coordinates.longitude >= bounds.minLongitude &&
    coordinates.longitude <= bounds.maxLongitude
  );
}
