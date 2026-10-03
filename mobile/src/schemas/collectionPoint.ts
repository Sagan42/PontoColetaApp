import { z } from 'zod';

export const collectionPointFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Informe um nome com pelo menos 3 caracteres.')
    .max(120, 'Nome deve ter no máximo 120 caracteres.'),
  address: z
    .string()
    .trim()
    .min(5, 'Informe o endereço completo.')
    .max(200, 'Endereço deve ter no máximo 200 caracteres.'),
  materials: z
    .array(z.string().trim().min(2).max(40))
    .min(1, 'Selecione ou digite ao menos um material.')
    .max(10, 'Informe no máximo 10 materiais.'),
  openingHours: z.string().trim().max(120, 'Horário deve ter no máximo 120 caracteres.'),
  notes: z.string().trim().max(500, 'Observações devem ter no máximo 500 caracteres.'),
});

export type CollectionPointForm = z.infer<typeof collectionPointFormSchema>;

export type FormErrors = Partial<Record<keyof CollectionPointForm, string>>;

export const emptyCollectionPointForm: CollectionPointForm = {
  name: '',
  address: '',
  materials: [],
  openingHours: '',
  notes: '',
};

export function validateCollectionPointForm(form: CollectionPointForm): FormErrors {
  const result = collectionPointFormSchema.safeParse(form);
  if (result.success) return {};

  const errors: FormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof CollectionPointForm | undefined;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }

  return errors;
}
