import { registerAdminCollectionPointRoutes } from '../modules/collection-points/presentation/admin-collection-point-routes.js';
import { registerAdminMetricsRoutes } from '../modules/metrics/presentation/metrics-routes.js';
import { createContainer } from '../shared/infrastructure/container.js';
import { Router, createLambdaHandler } from '../shared/presentation/http/index.js';

const container = createContainer();

const router = new Router();
registerAdminMetricsRoutes(router, container.getUsageMetrics);
registerAdminCollectionPointRoutes(router, container.adminCollectionPoints, container.logger);

export const handler = createLambdaHandler(router, container.logger);
