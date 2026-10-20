import { CreateCollectionPoint } from '../../modules/collection-points/application/use-cases/create-collection-point.js';
import { GetCollectionPoint } from '../../modules/collection-points/application/use-cases/get-collection-point.js';
import { HideCollectionPoint } from '../../modules/collection-points/application/use-cases/hide-collection-point.js';
import { ListCollectionPointReports } from '../../modules/collection-points/application/use-cases/list-collection-point-reports.js';
import { ListCollectionPoints } from '../../modules/collection-points/application/use-cases/list-collection-points.js';
import { PublishCollectionPoint } from '../../modules/collection-points/application/use-cases/publish-collection-point.js';
import { ReportCollectionPoint } from '../../modules/collection-points/application/use-cases/report-collection-point.js';
import { SearchCollectionPointsByLocation } from '../../modules/collection-points/application/use-cases/search-collection-points-by-location.js';
import { SearchCollectionPointsByMaterial } from '../../modules/collection-points/application/use-cases/search-collection-points-by-material.js';
import { DynamoCollectionPointReportRepository } from '../../modules/collection-points/infrastructure/dynamodb/dynamo-collection-point-report-repository.js';
import { DynamoCollectionPointRepository } from '../../modules/collection-points/infrastructure/dynamodb/dynamo-collection-point-repository.js';
import { NominatimGeocodingService } from '../../modules/collection-points/infrastructure/geocoding/nominatim-geocoding-service.js';
import { UsageMetricRecorderAdapter } from '../../modules/collection-points/infrastructure/metrics/usage-metric-recorder-adapter.js';
import type { AdminCollectionPointUseCases } from '../../modules/collection-points/presentation/admin-collection-point-routes.js';
import type { CollectionPointUseCases } from '../../modules/collection-points/presentation/collection-point-routes.js';
import { ListFeedback } from '../../modules/feedback/application/use-cases/list-feedback.js';
import { SubmitFeedback } from '../../modules/feedback/application/use-cases/submit-feedback.js';
import { DynamoFeedbackRepository } from '../../modules/feedback/infrastructure/dynamodb/dynamo-feedback-repository.js';
import { GetUsageMetrics } from '../../modules/metrics/application/use-cases/get-usage-metrics.js';
import { RegisterUsageMetric } from '../../modules/metrics/application/use-cases/register-usage-metric.js';
import { DynamoMetricsRepository } from '../../modules/metrics/infrastructure/dynamodb/dynamo-metrics-repository.js';
import { systemClock, uuidGenerator, type Logger } from '../application/ports/index.js';
import { loadEnvironment, type Environment } from './config/environment.js';
import { getDocumentClient } from './dynamodb/index.js';
import { StructuredLogger } from './logging/index.js';

export interface Container {
  readonly environment: Environment;
  readonly logger: Logger;
  readonly collectionPoints: CollectionPointUseCases;
  readonly adminCollectionPoints: AdminCollectionPointUseCases;
  readonly registerUsageMetric: RegisterUsageMetric;
  readonly getUsageMetrics: GetUsageMetrics;
  readonly submitFeedback: SubmitFeedback;
  readonly listFeedback: ListFeedback;
}

export function createContainer(environment: Environment = loadEnvironment()): Container {
  const logger = new StructuredLogger(environment.LOG_LEVEL, {
    environment: environment.ENVIRONMENT,
  });

  const documentClient = getDocumentClient(environment.AWS_REGION);
  const collectionPointRepository = new DynamoCollectionPointRepository(
    documentClient,
    environment.TABLE_NAME,
    logger,
  );
  const metricsRepository = new DynamoMetricsRepository(documentClient, environment.TABLE_NAME);
  const feedbackRepository = new DynamoFeedbackRepository(documentClient, environment.TABLE_NAME);
  const reportRepository = new DynamoCollectionPointReportRepository(
    documentClient,
    environment.TABLE_NAME,
  );

  const registerUsageMetric = new RegisterUsageMetric(metricsRepository, systemClock);
  const metricRecorder = new UsageMetricRecorderAdapter(registerUsageMetric);

  const geocoding = new NominatimGeocodingService(
    {
      baseUrl: environment.GEOCODING_BASE_URL,
      userAgent: environment.GEOCODING_USER_AGENT,
      timeoutMs: environment.GEOCODING_TIMEOUT_MS,
    },
    logger,
  );

  return {
    environment,
    logger,
    collectionPoints: {
      createCollectionPoint: new CreateCollectionPoint(
        collectionPointRepository,
        geocoding,
        uuidGenerator,
        systemClock,
        metricRecorder,
        logger,
      ),
      getCollectionPoint: new GetCollectionPoint(collectionPointRepository),
      listCollectionPoints: new ListCollectionPoints(collectionPointRepository),
      searchByMaterial: new SearchCollectionPointsByMaterial(
        collectionPointRepository,
        metricRecorder,
        logger,
      ),
      searchByLocation: new SearchCollectionPointsByLocation(
        collectionPointRepository,
        geocoding,
        metricRecorder,
        logger,
      ),
      reportCollectionPoint: new ReportCollectionPoint(
        collectionPointRepository,
        reportRepository,
        uuidGenerator,
        systemClock,
      ),
    },
    adminCollectionPoints: {
      hideCollectionPoint: new HideCollectionPoint(collectionPointRepository, systemClock),
      publishCollectionPoint: new PublishCollectionPoint(collectionPointRepository, systemClock),
      listReports: new ListCollectionPointReports(reportRepository, systemClock),
    },
    registerUsageMetric,
    getUsageMetrics: new GetUsageMetrics(metricsRepository, systemClock),
    submitFeedback: new SubmitFeedback(feedbackRepository, uuidGenerator, systemClock),
    listFeedback: new ListFeedback(feedbackRepository, systemClock),
  };
}
