import { useQuery } from '@tanstack/react-query';
import { apiRequest, type ApiEnvelope } from '../../services/apiClient';

export interface UsageCounters {
  app_open: number;
  search_address: number;
  search_material: number;
  point_created: number;
  point_viewed: number;
}

export interface UsageMetricsReport {
  period: { from: string; to: string; days: number };
  totals: UsageCounters & { searches: number };
  daily: { date: string; counters: UsageCounters }[];
}

export const METRIC_PERIODS = [7, 30, 90] as const;
export type MetricPeriodDays = (typeof METRIC_PERIODS)[number];

export function useUsageMetrics(token: string | null, days: MetricPeriodDays) {
  return useQuery({
    queryKey: ['admin', 'metrics', days],
    enabled: Boolean(token),
    queryFn: ({ signal }) =>
      apiRequest<ApiEnvelope<UsageMetricsReport>>('/v1/admin/metrics', {
        query: { days },
        token: token ?? undefined,
        signal,
      }).then((response) => response.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
