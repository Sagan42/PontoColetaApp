import type { Router } from '../../../shared/presentation/http/index.js';
import { accepted, created, ok, parseJsonBody } from '../../../shared/presentation/http/index.js';
import type { CreateCollectionPoint } from '../application/use-cases/create-collection-point.js';
import type { GetCollectionPoint } from '../application/use-cases/get-collection-point.js';
import type { ListCollectionPoints } from '../application/use-cases/list-collection-points.js';
import type { ReportCollectionPoint } from '../application/use-cases/report-collection-point.js';
import type { SearchCollectionPointsByLocation } from '../application/use-cases/search-collection-points-by-location.js';
import type { SearchCollectionPointsByMaterial } from '../application/use-cases/search-collection-points-by-material.js';
import { SUGGESTED_MATERIALS } from '../domain/value-objects/material.js';
import { presentCollectionPoint } from './collection-point-presenter.js';
import {
  createCollectionPointSchema,
  listQuerySchema,
  nearbyQuerySchema,
  reportCollectionPointSchema,
} from './collection-point-schemas.js';

export interface CollectionPointUseCases {
  readonly createCollectionPoint: CreateCollectionPoint;
  readonly getCollectionPoint: GetCollectionPoint;
  readonly listCollectionPoints: ListCollectionPoints;
  readonly searchByMaterial: SearchCollectionPointsByMaterial;
  readonly searchByLocation: SearchCollectionPointsByLocation;
  readonly reportCollectionPoint: ReportCollectionPoint;
}

export function registerCollectionPointRoutes(
  router: Router,
  useCases: CollectionPointUseCases,
): void {
  router.get('/v1/materials', () => ok(SUGGESTED_MATERIALS.map((label) => ({ label }))));

  router.get('/v1/collection-points/nearby', async ({ request }) => {
    const query = nearbyQuerySchema.parse(request.query);

    const result = await useCases.searchByLocation.execute({
      address: query.address,
      latitude: query.lat,
      longitude: query.lng,
      radiusKm: query.radiusKm,
      limit: query.limit,
    });

    return ok(result.items.map(presentCollectionPoint), {
      origin: result.origin,
      radiusKm: result.radiusKm,
      count: result.items.length,
    });
  });

  router.get('/v1/collection-points/{id}', async ({ params }) => {
    const point = await useCases.getCollectionPoint.execute(params.id ?? '');
    return ok(presentCollectionPoint({ point, distanceKm: null }));
  });

  router.get('/v1/collection-points', async ({ request }) => {
    const query = listQuerySchema.parse(request.query);

    if (query.material !== undefined) {
      const result = await useCases.searchByMaterial.execute({
        material: query.material,
        limit: query.limit,
        cursor: query.cursor,
      });

      return ok(result.items.map(presentCollectionPoint), {
        material: result.material,
        nextCursor: result.nextCursor,
        count: result.items.length,
      });
    }

    const result = await useCases.listCollectionPoints.execute({
      limit: query.limit,
      cursor: query.cursor,
    });

    return ok(result.items.map(presentCollectionPoint), {
      nextCursor: result.nextCursor,
      count: result.items.length,
    });
  });

  router.post('/v1/collection-points', async ({ request }) => {
    const body = createCollectionPointSchema.parse(parseJsonBody(request));

    const point = await useCases.createCollectionPoint.execute({
      name: body.name,
      address: body.address,
      materials: body.materials,
      openingHours: body.openingHours,
      notes: body.notes,
      latitude: body.latitude,
      longitude: body.longitude,
    });

    return created(
      presentCollectionPoint({ point, distanceKm: null }),
      `/v1/collection-points/${point.id}`,
    );
  });

  /**
   * Denunciar é público e anônimo de propósito: a política de conteúdo gerado
   * pelo utilizador exige que exista no app, e exigir cadastro para denunciar
   * seria o mesmo que não ter.
   *
   * Responde 202: foi recebido e uma pessoa vai olhar. Nada é devolvido — não
   * há recurso que quem denuncia possa consultar depois.
   */
  router.post('/v1/collection-points/{id}/reports', async ({ request, params }) => {
    const body = reportCollectionPointSchema.parse(parseJsonBody(request));

    await useCases.reportCollectionPoint.execute({
      pointId: params.id ?? '',
      reason: body.reason,
      details: body.details,
    });

    return accepted();
  });
}
