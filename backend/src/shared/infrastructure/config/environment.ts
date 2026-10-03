import { z } from 'zod';

const environmentSchema = z.object({
  ENVIRONMENT: z.enum(['dev', 'prod']).default('dev'),
  AWS_REGION: z.string().min(1).default('us-east-1'),
  TABLE_NAME: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  GEOCODING_PROVIDER: z.enum(['nominatim']).default('nominatim'),
  GEOCODING_BASE_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
  GEOCODING_USER_AGENT: z.string().min(1).default('PontoColeta/1.0 (contato@pontocoleta.app)'),
  GEOCODING_TIMEOUT_MS: z.coerce.number().int().min(500).max(10_000).default(4000),
});

export type Environment = z.infer<typeof environmentSchema>;

let cached: Environment | null = null;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  if (cached) return cached;

  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${missing}`);
  }

  cached = result.data;
  return cached;
}

export function resetEnvironmentCache(): void {
  cached = null;
}
