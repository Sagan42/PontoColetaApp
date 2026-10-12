import { useQuery } from '@tanstack/react-query';
import { ApiError, apiRequest, type ApiEnvelope } from '../../services/apiClient';

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

export function isUnauthorizedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}

export function useUsageMetrics(token: string | null, days: MetricPeriodDays) {
  const query = useQuery({
    // The token is part of the key so a renewed session refetches instead of
    // staying on the failure cached for the expired one.
    queryKey: ['admin', 'metrics', days, token],
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

  // An expired session is not a loading failure: it is reported on its own so the
  // screen can renew the session instead of showing the generic error state.
  const isUnauthorized = isUnauthorizedError(query.error);

  return { ...query, isUnauthorized, isError: query.isError && !isUnauthorized };
}
