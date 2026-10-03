import type { Router } from '../../../shared/presentation/http/index.js';
import {
  HttpAuthorizationError,
  accepted,
  ok,
  parseJsonBody,
} from '../../../shared/presentation/http/index.js';
import type { GetUsageMetrics } from '../application/use-cases/get-usage-metrics.js';
import type { RegisterUsageMetric } from '../application/use-cases/register-usage-metric.js';
import { parseUsageMetricType } from '../domain/usage-metric-type.js';
import { metricsQuerySchema, registerMetricSchema } from './metrics-schemas.js';

export function registerPublicMetricsRoutes(
  router: Router,
  registerUsageMetric: RegisterUsageMetric,
): void {
  router.post('/v1/metrics/events', async ({ request }) => {
    const body = registerMetricSchema.parse(parseJsonBody(request));
    await registerUsageMetric.execute({ type: parseUsageMetricType(body.type) });
    return accepted();
  });
}

export function registerAdminMetricsRoutes(router: Router, getUsageMetrics: GetUsageMetrics): void {
  router.get('/v1/admin/metrics', async ({ request }) => {
    assertAdmin(request.claims);

    const query = metricsQuerySchema.parse(request.query);
    const report = await getUsageMetrics.execute({
      from: query.from,
      to: query.to,
      lastDays: query.days,
    });

    return ok(report);
  });
}

function assertAdmin(claims: Readonly<Record<string, unknown>> | null): void {
  if (!claims) {
    throw new HttpAuthorizationError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  }
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new HttpAuthorizationError(403, 'FORBIDDEN', 'Acesso não autorizado.');
  }
}
