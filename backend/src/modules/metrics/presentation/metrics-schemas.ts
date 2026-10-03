import { z } from 'zod';
import { CLIENT_REPORTABLE_METRIC_TYPES } from '../domain/usage-metric-type.js';

const reportableTypes = CLIENT_REPORTABLE_METRIC_TYPES.map((type) => type);

export const registerMetricSchema = z.object({
  type: z.enum(reportableTypes as [string, ...string[]]),
});

export const metricsQuerySchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.')
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.')
      .optional(),
    days: z.coerce.number().int().min(1).max(366).optional(),
  })
  .refine((query) => (query.from === undefined) === (query.to === undefined), {
    message: 'Informe from e to juntos, ou apenas days.',
    path: ['from'],
  });
