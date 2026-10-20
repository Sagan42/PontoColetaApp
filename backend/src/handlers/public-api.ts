import { registerCollectionPointRoutes } from '../modules/collection-points/presentation/collection-point-routes.js';
import { registerFeedbackRoutes } from '../modules/feedback/presentation/feedback-routes.js';
import { registerPublicMetricsRoutes } from '../modules/metrics/presentation/metrics-routes.js';
import { createContainer } from '../shared/infrastructure/container.js';
import { Router, createLambdaHandler, ok } from '../shared/presentation/http/index.js';

const container = createContainer();

const router = new Router();
router.get('/v1/health', () => ok({ status: 'ok' }));
registerCollectionPointRoutes(router, container.collectionPoints);
registerPublicMetricsRoutes(router, container.registerUsageMetric);
registerFeedbackRoutes(router, container.submitFeedback, container.logger);

export const handler = createLambdaHandler(router, container.logger);
