import type {
  Clock,
  IdGenerator,
  LogContext,
  Logger,
} from '../../src/shared/application/ports/index.js';
import type { CollectionPoint } from '../../src/modules/collection-points/domain/collection-point.js';
import type { CollectionPointStatus } from '../../src/modules/collection-points/domain/collection-point-status.js';
import type {
  CollectionPointRepository,
  NearbyQuery,
  Page,
  PageRequest,
} from '../../src/modules/collection-points/domain/repositories/collection-point-repository.js';
import type {
  GeocodingResult,
  GeocodingService,
} from '../../src/modules/collection-points/application/ports/geocoding-service.js';
import type { UsageMetricRecorder } from '../../src/modules/collection-points/application/ports/usage-metric-recorder.js';
import type { CollectionPointReport } from '../../src/modules/collection-points/domain/collection-point-report.js';
import type {
  CollectionPointReportRepository,
  ReportPage,
  ReportPageRequest,
} from '../../src/modules/collection-points/domain/repositories/collection-point-report-repository.js';
import type { Feedback } from '../../src/modules/feedback/domain/feedback.js';
import type {
  FeedbackPage,
  FeedbackPageRequest,
  FeedbackRepository,
} from '../../src/modules/feedback/domain/repositories/feedback-repository.js';
import { Coordinates } from '../../src/modules/collection-points/domain/value-objects/coordinates.js';
import {
  DailyUsageMetrics,
  type MetricDay,
  type MetricPeriod,
  type MetricsRepository,
  type UsageCounters,
  type UsageMetricType,
} from '../../src/modules/metrics/domain/index.js';

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  advanceDays(days: number): void {
    this.current = new Date(this.current.getTime() + days * 86_400_000);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  constructor(private readonly prefix = 'point') {}

  generate(): string {
    this.counter += 1;
    return `${this.prefix}-${this.counter}`;
  }
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

export interface RecordedLog {
  readonly message: string;
  readonly context: LogContext | undefined;
}

export interface RecordingLogger {
  readonly logger: Logger;
  readonly debugs: RecordedLog[];
  readonly infos: RecordedLog[];
  readonly warnings: RecordedLog[];
  readonly errors: RecordedLog[];
}

export function createRecordingLogger(): RecordingLogger {
  const debugs: RecordedLog[] = [];
  const infos: RecordedLog[] = [];
  const warnings: RecordedLog[] = [];
  const errors: RecordedLog[] = [];

  const logger: Logger = {
    debug: (message, context) => {
      debugs.push({ message, context });
    },
    info: (message, context) => {
      infos.push({ message, context });
    },
    warn: (message, context) => {
      warnings.push({ message, context });
    },
    error: (message, context) => {
      errors.push({ message, context });
    },
    child: () => logger,
  };

  return { logger, debugs, infos, warnings, errors };
}

export class InMemoryCollectionPointRepository implements CollectionPointRepository {
  readonly points = new Map<string, CollectionPoint>();

  save(point: CollectionPoint): Promise<void> {
    this.points.set(point.id, point);
    return Promise.resolve();
  }

  readonly updated: string[] = [];

  update(point: CollectionPoint): Promise<void> {
    this.updated.push(point.id);
    this.points.set(point.id, point);
    return Promise.resolve();
  }

  findById(id: string): Promise<CollectionPoint | null> {
    return Promise.resolve(this.points.get(id) ?? null);
  }

  listPublished(request: PageRequest): Promise<Page<CollectionPoint>> {
    return this.findByStatus('PUBLISHED', request);
  }

  findByStatus(
    status: CollectionPointStatus,
    request: PageRequest,
  ): Promise<Page<CollectionPoint>> {
    const items = [...this.points.values()]
      .filter((point) => point.status === status)
      .slice(0, request.limit);
    return Promise.resolve({ items, nextCursor: null });
  }

  findByMaterialSlug(materialSlug: string, request: PageRequest): Promise<Page<CollectionPoint>> {
    const items = [...this.points.values()]
      .filter(
        (point) =>
          point.isPubliclyVisible &&
          point.materials.some((material) => material.slug === materialSlug),
      )
      .slice(0, request.limit);
    return Promise.resolve({ items, nextCursor: null });
  }

  findNearby(query: NearbyQuery): Promise<CollectionPoint[]> {
    const items = [...this.points.values()]
      .filter((point) => point.isPubliclyVisible)
      .map((point) => ({ point, distanceKm: point.distanceKmTo(query.centre) }))
      .filter((entry) => entry.distanceKm <= query.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, query.limit)
      .map((entry) => entry.point);
    return Promise.resolve(items);
  }
}

export class FakeGeocodingService implements GeocodingService {
  readonly queries: string[] = [];
  private results: GeocodingResult[] = [
    {
      formattedAddress: 'Avenida Higienópolis, Londrina, PR, Brasil',
      coordinates: Coordinates.create(-23.3103, -51.1628),
      confidence: 0.8,
    },
  ];

  search(address: string): Promise<GeocodingResult[]> {
    this.queries.push(address);
    return Promise.resolve(this.results);
  }

  respondWith(results: GeocodingResult[]): void {
    this.results = results;
  }
}

export class RecordingMetricRecorder implements UsageMetricRecorder {
  readonly recorded: UsageMetricType[] = [];

  record(type: UsageMetricType): Promise<void> {
    this.recorded.push(type);
    return Promise.resolve();
  }
}

export class InMemoryMetricsRepository implements MetricsRepository {
  readonly counters = new Map<string, Partial<UsageCounters>>();

  increment(day: MetricDay, type: UsageMetricType, amount: number): Promise<void> {
    const current = this.counters.get(day.value) ?? {};
    current[type] = (current[type] ?? 0) + amount;
    this.counters.set(day.value, current);
    return Promise.resolve();
  }

  findByPeriod(period: MetricPeriod): Promise<DailyUsageMetrics[]> {
    const days = period.eachDay();
    const metrics = days
      .filter((day) => this.counters.has(day.value))
      .map((day) => DailyUsageMetrics.restore(day, this.counters.get(day.value) ?? {}));
    return Promise.resolve(metrics);
  }
}

export class InMemoryCollectionPointReportRepository
  implements CollectionPointReportRepository
{
  readonly saved: CollectionPointReport[] = [];

  save(report: CollectionPointReport): Promise<void> {
    this.saved.push(report);
    return Promise.resolve();
  }

  /** Mais recente primeiro, com o índice do próximo item como cursor. */
  findRecent(request: ReportPageRequest): Promise<ReportPage> {
    const newestFirst = [...this.saved].sort(
      (left, right) => right.reportedAt.getTime() - left.reportedAt.getTime(),
    );

    const offset = Number(request.cursor ?? '0');
    const items = newestFirst.slice(offset, offset + request.limit);
    const next = offset + items.length;

    return Promise.resolve({
      items,
      nextCursor: next < newestFirst.length ? String(next) : null,
    });
  }
}

export class InMemoryFeedbackRepository implements FeedbackRepository {
  readonly saved: Feedback[] = [];

  save(feedback: Feedback): Promise<void> {
    this.saved.push(feedback);
    return Promise.resolve();
  }

  /** Mais recente primeiro, com o índice do próximo item como cursor. */
  findRecent(request: FeedbackPageRequest): Promise<FeedbackPage> {
    const newestFirst = [...this.saved].sort(
      (left, right) => right.submittedAt.getTime() - left.submittedAt.getTime(),
    );

    const offset = Number(request.cursor ?? '0');
    const items = newestFirst.slice(offset, offset + request.limit);
    const next = offset + items.length;

    return Promise.resolve({
      items,
      nextCursor: next < newestFirst.length ? String(next) : null,
    });
  }
}
