import { USAGE_METRIC_TYPES, type UsageMetricType } from './usage-metric-type.js';
import type { MetricDay } from './value-objects/metric-day.js';

export type UsageCounters = Record<UsageMetricType, number>;

export interface DailyUsageMetricsSnapshot {
  readonly date: string;
  readonly counters: UsageCounters;
}

export class DailyUsageMetrics {
  private constructor(
    readonly day: MetricDay,
    readonly counters: UsageCounters,
  ) {
    Object.freeze(this);
  }

  static empty(day: MetricDay): DailyUsageMetrics {
    return new DailyUsageMetrics(day, emptyCounters());
  }

  static restore(day: MetricDay, counters: Partial<UsageCounters>): DailyUsageMetrics {
    const complete = emptyCounters();
    for (const type of USAGE_METRIC_TYPES) {
      complete[type] = counters[type] ?? 0;
    }
    return new DailyUsageMetrics(day, complete);
  }

  get totalSearches(): number {
    return this.counters.search_address + this.counters.search_material;
  }

  toSnapshot(): DailyUsageMetricsSnapshot {
    return { date: this.day.value, counters: { ...this.counters } };
  }
}

export function emptyCounters(): UsageCounters {
  return USAGE_METRIC_TYPES.reduce((counters, type) => {
    counters[type] = 0;
    return counters;
  }, {} as UsageCounters);
}
