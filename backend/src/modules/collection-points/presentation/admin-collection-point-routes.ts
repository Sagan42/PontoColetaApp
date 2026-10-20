import type { Logger } from '../../../shared/application/ports/index.js';
import type { Router } from '../../../shared/presentation/http/index.js';
import { assertAdmin, ok } from '../../../shared/presentation/http/index.js';
import type { HideCollectionPoint } from '../application/use-cases/hide-collection-point.js';
import type { ListCollectionPointReports } from '../application/use-cases/list-collection-point-reports.js';
import type { PublishCollectionPoint } from '../application/use-cases/publish-collection-point.js';
import { presentCollectionPoint } from './collection-point-presenter.js';
import { listReportsQuerySchema } from './collection-point-schemas.js';

export interface AdminCollectionPointUseCases {
  readonly hideCollectionPoint: HideCollectionPoint;
  readonly publishCollectionPoint: PublishCollectionPoint;
  readonly listReports: ListCollectionPointReports;
}

export function registerAdminCollectionPointRoutes(
  router: Router,
  useCases: AdminCollectionPointUseCases,
  logger: Logger,
): void {
  router.post('/v1/admin/collection-points/{id}/hide', async ({ request, params }) => {
    const admin = assertAdmin(request.claims);
    const id = params.id ?? '';

    const point = await useCases.hideCollectionPoint.execute(id);

    // Taking a point off the air is a moderation decision: who did it belongs
    // in the log, since the point itself only records that it is hidden.
    logger.info('collection_point.hidden', {
      operation: 'HideCollectionPoint',
      pointId: id,
      actor: admin,
    });

    return ok(presentCollectionPoint({ point, distanceKm: null }));
  });

  router.post('/v1/admin/collection-points/{id}/publish', async ({ request, params }) => {
    const admin = assertAdmin(request.claims);
    const id = params.id ?? '';

    const point = await useCases.publishCollectionPoint.execute(id);

    logger.info('collection_point.published', {
      operation: 'PublishCollectionPoint',
      pointId: id,
      actor: admin,
    });

    return ok(presentCollectionPoint({ point, distanceKm: null }));
  });

  router.get('/v1/admin/reports', async ({ request }) => {
    assertAdmin(request.claims);

    const query = listReportsQuerySchema.parse(request.query);
    const page = await useCases.listReports.execute({ limit: query.limit, cursor: query.cursor });

    return ok(page.items, { nextCursor: page.nextCursor });
  });
}
