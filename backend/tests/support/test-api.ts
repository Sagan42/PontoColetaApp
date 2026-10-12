import { CreateCollectionPoint } from '../../src/modules/collection-points/application/use-cases/create-collection-point.js';
import { GetCollectionPoint } from '../../src/modules/collection-points/application/use-cases/get-collection-point.js';
import { HideCollectionPoint } from '../../src/modules/collection-points/application/use-cases/hide-collection-point.js';
import { ListCollectionPoints } from '../../src/modules/collection-points/application/use-cases/list-collection-points.js';
import { PublishCollectionPoint } from '../../src/modules/collection-points/application/use-cases/publish-collection-point.js';
import { SearchCollectionPointsByLocation } from '../../src/modules/collection-points/application/use-cases/search-collection-points-by-location.js';
import { SearchCollectionPointsByMaterial } from '../../src/modules/collection-points/application/use-cases/search-collection-points-by-material.js';
import { registerAdminCollectionPointRoutes } from '../../src/modules/collection-points/presentation/admin-collection-point-routes.js';
import { registerCollectionPointRoutes } from '../../src/modules/collection-points/presentation/collection-point-routes.js';
import { GetUsageMetrics } from '../../src/modules/metrics/application/use-cases/get-usage-metrics.js';
import { RegisterUsageMetric } from '../../src/modules/metrics/application/use-cases/register-usage-metric.js';
import {
  registerAdminMetricsRoutes,
  registerPublicMetricsRoutes,
} from '../../src/modules/metrics/presentation/metrics-routes.js';
import type { HttpRequest, HttpResponse } from '../../src/shared/presentation/http/index.js';
import { Router, ok, toHttpResponse } from '../../src/shared/presentation/http/index.js';
import {
  FakeGeocodingService,
  FixedClock,
  InMemoryCollectionPointRepository,
  InMemoryMetricsRepository,
  RecordingMetricRecorder,
  SequentialIdGenerator,
  createRecordingLogger,
  type RecordedLog,
} from './fakes.js';

export interface TestRequestOptions {
  query?: Record<string, string>;
  body?: unknown;
  claims?: Record<string, unknown> | null;
}

export interface TestApi {
  request(method: string, path: string, options?: TestRequestOptions): Promise<TestResponse>;
  repository: InMemoryCollectionPointRepository;
  metricsRepository: InMemoryMetricsRepository;
  geocoding: FakeGeocodingService;
  recorder: RecordingMetricRecorder;
  logs: RecordedLog[];
}

export interface TestResponse {
  statusCode: number;
  body: { data?: unknown; meta?: Record<string, unknown>; error?: { code: string } };
}

export function buildTestApi(now = new Date('2026-08-22T12:00:00.000Z')): TestApi {
  const repository = new InMemoryCollectionPointRepository();
  const metricsRepository = new InMemoryMetricsRepository();
  const geocoding = new FakeGeocodingService();
  const recorder = new RecordingMetricRecorder();
  const clock = new FixedClock(now);
  const { logger: silentLogger, infos } = createRecordingLogger();

  const router = new Router();
  router.get('/v1/health', () => ok({ status: 'ok' }));

  registerCollectionPointRoutes(router, {
    createCollectionPoint: new CreateCollectionPoint(
      repository,
      geocoding,
      new SequentialIdGenerator(),
      clock,
      recorder,
      silentLogger,
    ),
    getCollectionPoint: new GetCollectionPoint(repository),
    listCollectionPoints: new ListCollectionPoints(repository),
    searchByMaterial: new SearchCollectionPointsByMaterial(repository, recorder, silentLogger),
    searchByLocation: new SearchCollectionPointsByLocation(
      repository,
      geocoding,
      recorder,
      silentLogger,
    ),
  });

  registerAdminCollectionPointRoutes(
    router,
    {
      hideCollectionPoint: new HideCollectionPoint(repository, clock),
      publishCollectionPoint: new PublishCollectionPoint(repository, clock),
    },
    silentLogger,
  );

  registerPublicMetricsRoutes(router, new RegisterUsageMetric(metricsRepository, clock));
  registerAdminMetricsRoutes(router, new GetUsageMetrics(metricsRepository, clock));

  return {
    repository,
    metricsRepository,
    geocoding,
    recorder,
    logs: infos,
    async request(method, path, options = {}) {
      const request: HttpRequest = {
        method: method.toUpperCase() as HttpRequest['method'],
        path,
        query: options.query ?? {},
        headers: {},
        rawBody: options.body === undefined ? null : JSON.stringify(options.body),
        requestId: 'test-request',
        correlationId: 'test-correlation',
        claims: options.claims ?? null,
      };

      let response: HttpResponse;
      try {
        response = await router.handle(request);
      } catch (error) {
        response = toHttpResponse(error, request, silentLogger);
      }

      return {
        statusCode: response.statusCode,
        body: JSON.parse(response.body) as TestResponse['body'],
      };
    },
  };
}
