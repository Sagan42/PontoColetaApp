import { z } from 'zod';

/**
 * Dias da semana na ordem em que aparecem no seletor. A ordem importa: é ela
 * que permite comprimir uma seleção contígua em "Seg a Sex".
 */
export const WEEKDAYS = [
  { key: 'seg', label: 'Seg' },
  { key: 'ter', label: 'Ter' },
  { key: 'qua', label: 'Qua' },
  { key: 'qui', label: 'Qui' },
  { key: 'sex', label: 'Sex' },
  { key: 'sab', label: 'Sáb' },
  { key: 'dom', label: 'Dom' },
] as const;

export type WeekdayKey = (typeof WEEKDAYS)[number]['key'];

const WEEKDAY_KEYS = WEEKDAYS.map((day) => day.key);

/** 24 horas, de 00:00 a 23:59. Nada de am/pm, nada de "8h". */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const collectionPointFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Informe um nome com pelo menos 3 caracteres.')
    .max(120, 'Nome deve ter no máximo 120 caracteres.'),
  street: z
    .string()
    .trim()
    .min(3, 'Informe a rua ou avenida.')
    .max(120, 'Rua deve ter no máximo 120 caracteres.'),
  number: z
    .string()
    .trim()
    .min(1, 'Informe o número.')
    .max(10, 'Número deve ter no máximo 10 dígitos.')
    .regex(/^\d+$/, 'O número aceita apenas dígitos.'),
  neighborhood: z
    .string()
    .trim()
    .min(2, 'Informe o bairro.')
    .max(80, 'Bairro deve ter no máximo 80 caracteres.'),
  materials: z
    .array(z.string().trim().min(2).max(40))
    .min(1, 'Selecione ou digite ao menos um material.')
    .max(10, 'Informe no máximo 10 materiais.'),
  weekdays: z.array(z.enum(WEEKDAY_KEYS as [WeekdayKey, ...WeekdayKey[]])),
  opensAt: z.string().trim(),
  closesAt: z.string().trim(),
  notes: z.string().trim().max(500, 'Observações devem ter no máximo 500 caracteres.'),
});

export type CollectionPointForm = z.infer<typeof collectionPointFormSchema>;

export type FormErrors = Partial<Record<keyof CollectionPointForm, string>>;

export const emptyCollectionPointForm: CollectionPointForm = {
  name: '',
  street: '',
  number: '',
  neighborhood: '',
  materials: [],
  weekdays: [],
  opensAt: '',
  closesAt: '',
  notes: '',
};

/**
 * O horário é opcional, mas é tudo ou nada: dias sem horário, ou horário sem
 * dias, produziriam um texto incompleto na ficha do ponto.
 */
function validateOpeningHours(form: CollectionPointForm): FormErrors {
  const temDias = form.weekdays.length > 0;
  const abre = form.opensAt.trim();
  const fecha = form.closesAt.trim();
  const temHora = abre.length > 0 || fecha.length > 0;

  if (!temDias && !temHora) return {};

  const errors: FormErrors = {};

  if (!temDias) errors.weekdays = 'Selecione os dias de funcionamento.';

  if (abre.length === 0) errors.opensAt = 'Informe o horário de abertura.';
  else if (!TIME_PATTERN.test(abre)) errors.opensAt = 'Use o formato 24h, como 08:00.';

  if (fecha.length === 0) errors.closesAt = 'Informe o horário de fechamento.';
  else if (!TIME_PATTERN.test(fecha)) errors.closesAt = 'Use o formato 24h, como 18:00.';

  if (!errors.opensAt && !errors.closesAt && abre >= fecha) {
    // Comparar "HH:MM" como texto funciona porque o formato é fixo e zero-padded.
    errors.closesAt = 'O fechamento deve ser depois da abertura.';
  }

  return errors;
}

export function validateCollectionPointForm(form: CollectionPointForm): FormErrors {
  const errors: FormErrors = {};
  const result = collectionPointFormSchema.safeParse(form);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof CollectionPointForm | undefined;
      if (field && !errors[field]) {
        errors[field] = issue.message;
      }
    }
  }

  return { ...errors, ...validateOpeningHours(form) };
}

/**
 * O backend recebe um endereço em texto. Montá-lo a partir de campos separados
 * dá um resultado mais uniforme — e mais fácil de geocodificar — do que pedir
 * a linha inteira à pessoa.
 */
export function composeAddress(form: CollectionPointForm): string {
  return `${form.street.trim()}, ${form.number.trim()} - ${form.neighborhood.trim()}`;
}

/** Comprime dias contíguos: [seg,ter,qua,qui,sex] vira "Seg a Sex". */
export function formatWeekdays(selected: readonly WeekdayKey[]): string {
  const indices = WEEKDAYS.map((day, index) => (selected.includes(day.key) ? index : -1)).filter(
    (index) => index >= 0,
  );
  if (indices.length === 0) return '';

  const blocos: string[] = [];
  let inicio = indices[0] as number;
  let anterior = inicio;

  for (const atual of indices.slice(1)) {
    if (atual === anterior + 1) {
      anterior = atual;
      continue;
    }
    blocos.push(rotuloDoBloco(inicio, anterior));
    inicio = atual;
    anterior = atual;
  }
  blocos.push(rotuloDoBloco(inicio, anterior));

  if (blocos.length === 1) return blocos[0] as string;
  return `${blocos.slice(0, -1).join(', ')} e ${blocos[blocos.length - 1]}`;
}

function rotuloDoBloco(inicio: number, fim: number): string {
  const primeiro = WEEKDAYS[inicio]?.label ?? '';
  const ultimo = WEEKDAYS[fim]?.label ?? '';

  if (inicio === fim) return primeiro;
  if (fim === inicio + 1) return `${primeiro} e ${ultimo}`;
  return `${primeiro} a ${ultimo}`;
}

/** `null` quando a pessoa não informou horário — o campo é opcional na API. */
export function composeOpeningHours(form: CollectionPointForm): string | null {
  if (form.weekdays.length === 0) return null;
  return `${formatWeekdays(form.weekdays)}, ${form.opensAt.trim()} às ${form.closesAt.trim()}`;
}

/** Mantém só dígitos. Usado no campo de número do endereço. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Máscara de hora: digita 0800, vira 08:00. Nunca passa de 5 caracteres. */
export function maskTime(value: string): string {
  const digits = onlyDigits(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
