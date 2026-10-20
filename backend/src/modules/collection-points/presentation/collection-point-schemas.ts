import { z } from 'zod';
import { REPORT_REASONS } from '../domain/collection-point-report.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const limitSchema = z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT);

export const listQuerySchema = z.object({
  material: z.string().trim().min(1).max(40).optional(),
  limit: limitSchema,
  cursor: z.string().min(1).max(2000).optional(),
});

export const nearbyQuerySchema = z
  .object({
    address: z.string().trim().min(3).max(200).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(50).optional(),
    limit: limitSchema,
  })
  .refine(
    (query) => query.address !== undefined || (query.lat !== undefined && query.lng !== undefined),
    { message: 'Informe address ou lat e lng.', path: ['address'] },
  );

export const createCollectionPointSchema = z.object({
  name: z.string().trim().min(3).max(120),
  address: z.string().trim().min(5).max(200),
  materials: z.array(z.string().trim().min(2).max(40)).min(1).max(10),
  openingHours: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(500).nullish(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export type CreateCollectionPointBody = z.infer<typeof createCollectionPointSchema>;

export const reportCollectionPointSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500).nullish(),
});

const REPORTS_DEFAULT_LIMIT = 20;
const REPORTS_MAX_LIMIT = 50;

export const listReportsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(REPORTS_MAX_LIMIT)
    .default(REPORTS_DEFAULT_LIMIT),
  cursor: z.string().min(1).max(2000).optional(),
});
