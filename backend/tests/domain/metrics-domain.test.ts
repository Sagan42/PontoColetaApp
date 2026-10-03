import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/shared/domain/errors/index.js';
import {
  DailyUsageMetrics,
  MetricDay,
  MetricPeriod,
  UsageMetricType,
  parseUsageMetricType,
} from '../../src/modules/metrics/domain/index.js';

describe('MetricDay', () => {
  it('buckets an event by the local Brazilian day, not UTC', () => {
    expect(MetricDay.fromDate(new Date('2026-08-23T02:00:00.000Z')).value).toBe('2026-08-22');
    expect(MetricDay.fromDate(new Date('2026-08-23T04:00:00.000Z')).value).toBe('2026-08-23');
  });

  it('rejects malformed dates', () => {
    expect(() => MetricDay.parse('22/08/2026')).toThrow(ValidationError);
    expect(() => MetricDay.parse('2026-02-30')).toThrow(ValidationError);
  });

  it('shifts days across month boundaries', () => {
    expect(MetricDay.parse('2026-03-01').plusDays(-1).value).toBe('2026-02-28');
  });
});

describe('MetricPeriod', () => {
  it('builds a period ending today', () => {
    const period = MetricPeriod.lastDays(7, new Date('2026-08-22T12:00:00.000Z'));
    expect(period.from.value).toBe('2026-08-16');
    expect(period.to.value).toBe('2026-08-22');
    expect(period.days).toBe(7);
  });

  it('lists every day of the period', () => {
    const period = MetricPeriod.create(
      MetricDay.parse('2026-08-20'),
      MetricDay.parse('2026-08-22'),
    );
    expect(period.eachDay().map((day) => day.value)).toEqual([
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
    ]);
  });

  it('rejects an inverted period', () => {
    expect(() =>
      MetricPeriod.create(MetricDay.parse('2026-08-22'), MetricDay.parse('2026-08-20')),
    ).toThrow(ValidationError);
  });

  it('rejects a period longer than a year', () => {
    expect(() =>
      MetricPeriod.create(MetricDay.parse('2025-01-01'), MetricDay.parse('2026-08-22')),
    ).toThrow(ValidationError);
  });
});

describe('DailyUsageMetrics', () => {
  it('fills missing counters with zero', () => {
    const metrics = DailyUsageMetrics.restore(MetricDay.parse('2026-08-22'), { app_open: 5 });
    expect(metrics.counters.app_open).toBe(5);
    expect(metrics.counters.point_created).toBe(0);
  });

  it('sums both kinds of search', () => {
    const metrics = DailyUsageMetrics.restore(MetricDay.parse('2026-08-22'), {
      search_address: 3,
      search_material: 4,
    });
    expect(metrics.totalSearches).toBe(7);
  });
});

describe('parseUsageMetricType', () => {
  it('accepts known types', () => {
    expect(parseUsageMetricType('app_open')).toBe(UsageMetricType.AppOpen);
  });

  it('rejects unknown types', () => {
    expect(() => parseUsageMetricType('login')).toThrow(ValidationError);
  });
});
