import type { Logger } from '../../../shared/application/ports/index.js';
import type { Router } from '../../../shared/presentation/http/index.js';
import { assertAdmin, created, ok, parseJsonBody } from '../../../shared/presentation/http/index.js';
import type { ListFeedback } from '../application/use-cases/list-feedback.js';
import type { SubmitFeedback } from '../application/use-cases/submit-feedback.js';
import { listFeedbackQuerySchema, submitFeedbackSchema } from './feedback-schemas.js';

export function registerFeedbackRoutes(
  router: Router,
  submitFeedback: SubmitFeedback,
  logger: Logger,
): void {
  router.post('/v1/feedback', async ({ request }) => {
    const body = submitFeedbackSchema.parse(parseJsonBody(request));

    const result = await submitFeedback.execute({
      author: body.name ?? null,
      message: body.message,
    });

    // Nunca o conteúdo: log é lido por mais gente e guardado por mais tempo que
    // o item da tabela. O suficiente para saber que chegou feedback sem abrir o
    // banco — não existe rota de leitura.
    logger.info('feedback.received', {
      feedbackId: result.id,
      messageLength: body.message.length,
      named: (body.name ?? '').trim().length > 0,
    });

    // A resposta não devolve o texto recebido. Eco de entrada é como conteúdo
    // hostil costuma achar um alvo; e o app já sabe o que escreveu.
    return created({ id: result.id, submittedAt: result.submittedAt });
  });
}

/**
 * Leitura só aqui, e com a mesma proteção das outras rotas administrativas: o
 * authorizer JWT do API Gateway na frente, `assertAdmin` dentro. Está na Lambda
 * administrativa, que nem sabe responder na rota pública.
 */
export function registerAdminFeedbackRoutes(router: Router, listFeedback: ListFeedback): void {
  router.get('/v1/admin/feedback', async ({ request }) => {
    assertAdmin(request.claims);

    const query = listFeedbackQuerySchema.parse(request.query);
    const page = await listFeedback.execute({ limit: query.limit, cursor: query.cursor });

    return ok(page.items, { nextCursor: page.nextCursor });
  });
}
