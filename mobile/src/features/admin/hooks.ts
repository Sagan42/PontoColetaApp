import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiEnvelope, apiRequest } from '../../services/apiClient';

export const usageCountersSchema = z.object({
  app_open: z.number(),
  search_address: z.number(),
  search_material: z.number(),
  point_created: z.number(),
  point_viewed: z.number(),
});

export const usageMetricsReportSchema = z.object({
  period: z.object({ from: z.string(), to: z.string(), days: z.number() }),
  totals: usageCountersSchema.extend({ searches: z.number() }),
  daily: z.array(z.object({ date: z.string(), counters: usageCountersSchema })),
});

const usageMetricsEnvelope = apiEnvelope(usageMetricsReportSchema);

export type UsageCounters = z.infer<typeof usageCountersSchema>;
export type UsageMetricsReport = z.infer<typeof usageMetricsReportSchema>;

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
      apiRequest('/v1/admin/metrics', {
        schema: usageMetricsEnvelope,
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
