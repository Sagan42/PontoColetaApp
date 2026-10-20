import { z } from 'zod';

/**
 * Os mesmos limites do backend. A cópia é intencional: o app erra rápido e sem
 * rede, e o servidor nunca confia no cliente — quem valida de verdade é ele.
 */
export const feedbackFormSchema = z.object({
  name: z.string().trim().max(60, 'Nome deve ter no máximo 60 caracteres.'),
  message: z
    .string()
    .trim()
    .min(3, 'Escreva uma mensagem com pelo menos 3 caracteres.')
    .max(1000, 'Mensagem deve ter no máximo 1000 caracteres.'),
});

export type FeedbackForm = z.infer<typeof feedbackFormSchema>;

export type FeedbackFormErrors = Partial<Record<keyof FeedbackForm, string>>;

export const emptyFeedbackForm: FeedbackForm = { name: '', message: '' };

export function validateFeedbackForm(form: FeedbackForm): FeedbackFormErrors {
  const result = feedbackFormSchema.safeParse(form);
  if (result.success) return {};

  const errors: FeedbackFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof FeedbackForm | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
