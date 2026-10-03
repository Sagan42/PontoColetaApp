import { beforeEach, describe, expect, it } from 'vitest';
import { GetUsageMetrics } from '../../src/modules/metrics/application/use-cases/get-usage-metrics.js';
import { RegisterUsageMetric } from '../../src/modules/metrics/application/use-cases/register-usage-metric.js';
import { UsageMetricType } from '../../src/modules/metrics/domain/index.js';
import { FixedClock, InMemoryMetricsRepository } from '../support/fakes.js';

describe('RegisterUsageMetric', () => {
  let repository: InMemoryMetricsRepository;
  let clock: FixedClock;
  let useCase: RegisterUsageMetric;

  beforeEach(() => {
    repository = new InMemoryMetricsRepository();
    clock = new FixedClock(new Date('2026-08-22T12:00:00.000Z'));
    useCase = new RegisterUsageMetric(repository, clock);
  });

  it('increments the counter of the current day', async () => {
    await useCase.execute({ type: UsageMetricType.AppOpen });
    await useCase.execute({ type: UsageMetricType.AppOpen });

    expect(repository.counters.get('2026-08-22')?.app_open).toBe(2);
  });

  it('keeps counters of different types apart', async () => {
    await useCase.execute({ type: UsageMetricType.AppOpen });
    await useCase.execute({ type: UsageMetricType.PointViewed });

    expect(repository.counters.get('2026-08-22')).toEqual({ app_open: 1, point_viewed: 1 });
  });

  it('uses the event date when provided', async () => {
    await useCase.execute({
      type: UsageMetricType.SearchByAddress,
      occurredAt: new Date('2026-08-20T15:00:00.000Z'),
    });

    expect(repository.counters.get('2026-08-20')?.search_address).toBe(1);
  });
});

describe('GetUsageMetrics', () => {
  let repository: InMemoryMetricsRepository;
  let clock: FixedClock;
  let useCase: GetUsageMetrics;

  beforeEach(async () => {
    repository = new InMemoryMetricsRepository();
    clock = new FixedClock(new Date('2026-08-22T12:00:00.000Z'));
    useCase = new GetUsageMetrics(repository, clock);

    const register = new RegisterUsageMetric(repository, clock);
    await register.execute({
      type: UsageMetricType.AppOpen,
      occurredAt: new Date('2026-08-21T12:00:00.000Z'),
    });
    await register.execute({ type: UsageMetricType.AppOpen });
    await register.execute({ type: UsageMetricType.SearchByAddress });
    await register.execute({ type: UsageMetricType.SearchByMaterial });
    await register.execute({ type: UsageMetricType.PointCreated });
  });

  it('totals every counter of the period', async () => {
    const report = await useCase.execute({ lastDays: 7 });

    expect(report.totals.app_open).toBe(2);
    expect(report.totals.searches).toBe(2);
    expect(report.totals.point_created).toBe(1);
  });

  it('returns a continuous series, including days without activity', async () => {
    const report = await useCase.execute({ lastDays: 3 });

    expect(report.period).toEqual({ from: '2026-08-20', to: '2026-08-22', days: 3 });
    expect(report.daily.map((day) => day.date)).toEqual(['2026-08-20', '2026-08-21', '2026-08-22']);
    expect(report.daily[0]?.counters.app_open).toBe(0);
    expect(report.daily[2]?.counters.app_open).toBe(1);
  });

  it('accepts an explicit period', async () => {
    const report = await useCase.execute({ from: '2026-08-21', to: '2026-08-21' });

    expect(report.period.days).toBe(1);
    expect(report.totals.app_open).toBe(1);
  });

  it('defaults to the last 30 days', async () => {
    const report = await useCase.execute({});
    expect(report.period).toEqual({ from: '2026-07-24', to: '2026-08-22', days: 30 });
  });
});
