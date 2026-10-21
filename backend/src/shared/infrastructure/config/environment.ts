import { z } from 'zod';

const environmentSchema = z
  .object({
    ENVIRONMENT: z.enum(['dev', 'prod']).default('dev'),
    AWS_REGION: z.string().min(1).default('sa-east-1'),
    TABLE_NAME: z.string().min(1),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    GEOCODING_PROVIDER: z.enum(['nominatim', 'google']).default('nominatim'),
    GEOCODING_BASE_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
    GEOCODING_USER_AGENT: z.string().min(1).default('PontoColeta/1.0 (contato@pontocoleta.app)'),
    GEOCODING_TIMEOUT_MS: z.coerce.number().int().min(500).max(10_000).default(4000),
    GEOCODING_API_KEY: z.string().optional(),
  })
  // Chave de geocodificação só faz sentido com o provedor do Google, e sem ela
  // ele não sai do lugar. Falhar aqui, na partida da Lambda, é melhor que
  // descobrir no primeiro cadastro de ponto.
  .refine(
    (env) => env.GEOCODING_PROVIDER !== 'google' || (env.GEOCODING_API_KEY ?? '').length > 0,
    { message: 'GEOCODING_API_KEY é obrigatória quando GEOCODING_PROVIDER é google.', path: ['GEOCODING_API_KEY'] },
  );

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
