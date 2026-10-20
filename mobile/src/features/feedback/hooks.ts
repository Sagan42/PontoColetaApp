import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiEnvelope, apiRequest } from '../../services/apiClient';

/**
 * A resposta não devolve o texto enviado, só o comprovante. Validar o envelope
 * mantém o app honesto sobre o que recebeu, como nas outras rotas.
 */
const feedbackReceiptEnvelope = apiEnvelope(
  z.object({ id: z.string(), submittedAt: z.string() }),
);

export interface SubmitFeedbackPayload {
  /** Vazio vira `null`: o backend registra como anônimo. */
  name: string;
  message: string;
}

export const feedbackApi = {
  async submit(payload: SubmitFeedbackPayload) {
    const response = await apiRequest('/v1/feedback', {
      schema: feedbackReceiptEnvelope,
      method: 'POST',
      body: {
        name: payload.name.trim().length > 0 ? payload.name.trim() : null,
        message: payload.message.trim(),
      },
    });
    return response.data;
  },
};

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (payload: SubmitFeedbackPayload) => feedbackApi.submit(payload),
    retry: false,
  });
}

export const feedbackEntrySchema = z.object({
  id: z.string(),
  author: z.string(),
  message: z.string(),
  submittedAt: z.string(),
});

export type FeedbackEntry = z.infer<typeof feedbackEntrySchema>;

/**
 * Um cursor malformado lê como "não há mais páginas": parar de paginar é melhor
 * que descartar os feedbacks que vieram certos. Mesma escolha da listagem de
 * pontos.
 */
const feedbackListEnvelope = z.object({
  data: z.array(feedbackEntrySchema),
  meta: z.looseObject({ nextCursor: z.string().nullish().catch(null) }).optional(),
});

interface FeedbackPageResult {
  items: FeedbackEntry[];
  nextCursor: string | null;
}

/** Duplicado em vez de importado do módulo admin: é checagem de HTTP, não de sessão. */
function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/**
 * Leitura dos feedbacks, só com token de administrador. A rota é da Lambda
 * administrativa e exige JWT — sem token, nem sai do app.
 */
export function useAdminFeedback(token: string | null) {
  const query = useInfiniteQuery({
    // O token entra na chave para que uma sessão renovada refaça a busca em vez
    // de ficar no erro guardado para a sessão expirada.
    queryKey: ['admin', 'feedback', token],
    enabled: Boolean(token),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }): Promise<FeedbackPageResult> =>
      apiRequest('/v1/admin/feedback', {
        schema: feedbackListEnvelope,
        query: { cursor: pageParam ?? undefined },
        token: token ?? undefined,
        signal,
      }).then((response) => ({
        items: response.data,
        nextCursor: response.meta?.nextCursor ?? null,
      })),
    getNextPageParam: (lastPage: FeedbackPageResult) => lastPage.nextCursor,
    retry: false,
  });

  const isUnauthorized = isUnauthorizedError(query.error);
  const items: FeedbackEntry[] = query.data?.pages.flatMap((page) => page.items) ?? [];

  return { ...query, items, isUnauthorized, isError: query.isError && !isUnauthorized };
}
