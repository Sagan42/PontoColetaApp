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

  /**
   * Buscar por um bairro cai no centro dele, e 5 km não alcançavam o outro lado
   * da cidade: quem procurava "Centro" via lista vazia tendo pontos a 7 km.
   * 15 km cobrem a área urbana inteira a partir de qualquer ponto dela.
   *
   * Alargar não custa leitura nenhuma, e isso foi medido: a cobertura de 5 km a
   * partir do centro já era o bloco de 3x3 partições de geohash 4 ao redor da
   * origem, exatamente as mesmas 9 que 15 km visita. Londrina ocupa 5 dessas
   * partições, não uma — o que não cresce aqui é o bloco, não o município. Em
   * 20 km o bloco salta para 25, e é nesse degrau que maxSearchRadiusKm segura.
   *
   * E o resultado continua ordenado por distância, com o mais perto em cima —
   * um ponto distante no fim da lista é informação, enquanto lista vazia não é.
   */
  defaultSearchRadiusKm: 15,
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
