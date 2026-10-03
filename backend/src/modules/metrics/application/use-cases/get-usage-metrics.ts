import type { Clock } from '../../../../shared/application/ports/index.js';
import {
  DailyUsageMetrics,
  MetricDay,
  MetricPeriod,
  emptyCounters,
  type MetricsRepository,
  type UsageCounters,
  type DailyUsageMetricsSnapshot,
} from '../../domain/index.js';

export interface GetUsageMetricsInput {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly lastDays?: number | undefined;
}

export interface UsageMetricsReport {
  readonly period: { from: string; to: string; days: number };
  readonly totals: UsageCounters & { searches: number };
  readonly daily: DailyUsageMetricsSnapshot[];
}

const DEFAULT_LAST_DAYS = 30;

export class GetUsageMetrics {
  constructor(
    private readonly repository: MetricsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: GetUsageMetricsInput): Promise<UsageMetricsReport> {
    const period = this.resolvePeriod(input);
    const stored = await this.repository.findByPeriod(period);
    const byDay = new Map(stored.map((metrics) => [metrics.day.value, metrics]));

    const daily = period
      .eachDay()
      .map((day) => (byDay.get(day.value) ?? DailyUsageMetrics.empty(day)).toSnapshot());

    const totals = daily.reduce<UsageCounters>((accumulator, day) => {
      for (const [type, count] of Object.entries(day.counters)) {
        accumulator[type as keyof UsageCounters] += count;
      }
      return accumulator;
    }, emptyCounters());

    return {
      period: { from: period.from.value, to: period.to.value, days: period.days },
      totals: { ...totals, searches: totals.search_address + totals.search_material },
      daily,
    };
  }

  private resolvePeriod(input: GetUsageMetricsInput): MetricPeriod {
    if (input.from !== undefined && input.to !== undefined) {
      return MetricPeriod.create(MetricDay.parse(input.from), MetricDay.parse(input.to));
    }
    return MetricPeriod.lastDays(input.lastDays ?? DEFAULT_LAST_DAYS, this.clock.now());
  }
}
