import { registerAdminMetricsRoutes } from '../modules/metrics/presentation/metrics-routes.js';
import { createContainer } from '../shared/infrastructure/container.js';
import { Router, createLambdaHandler } from '../shared/presentation/http/index.js';

const container = createContainer();

const router = new Router();
registerAdminMetricsRoutes(router, container.getUsageMetrics);

export const handler = createLambdaHandler(router, container.logger);
