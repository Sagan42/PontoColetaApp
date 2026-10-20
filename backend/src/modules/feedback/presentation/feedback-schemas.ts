import { z } from 'zod';

/**
 * Primeira barreira: forma e tamanho, antes de qualquer lógica. `z.object`
 * descarta chaves desconhecidas, então nada que o cliente invente a mais chega
 * ao domínio ou ao banco.
 *
 * Os limites são repetidos na entidade de propósito: aqui eles recusam o
 * exagero cedo e barato; lá eles valem sobre o texto já saneado, que é o que
 * de fato será guardado.
 */
export const submitFeedbackSchema = z.object({
  name: z.string().trim().max(60).nullish(),
  message: z.string().trim().min(3).max(1000),
});

export type SubmitFeedbackBody = z.infer<typeof submitFeedbackSchema>;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export const listFeedbackQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: z.string().min(1).max(2000).optional(),
});
