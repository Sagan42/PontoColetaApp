export function formatDistance(distanceKm: number | null): string | null {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return null;

  if (distanceKm < 1) {
    const metres = Math.round(distanceKm * 1000);
    return `${metres} m`;
  }

  const rounded = distanceKm < 10 ? distanceKm.toFixed(1) : String(Math.round(distanceKm));
  return `${rounded.replace('.', ',')} km`;
}

export function formatMaterialList(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0] ?? '';

  const head = labels.slice(0, -1).join(', ');
  return `${head} e ${labels[labels.length - 1] ?? ''}`;
}

export function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return month && day ? `${day}/${month}` : isoDate;
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return year && month && day ? `${day}/${month}/${year}` : isoDate;
}

/**
 * Londrina está em UTC-3 o ano inteiro: o Brasil acabou com o horário de verão
 * em 2019. Um deslocamento fixo é, portanto, correto — e determinístico, sem
 * depender do `Intl` com fuso, cujo suporte varia entre builds do Hermes. Se o
 * horário de verão voltar, é aqui que se conserta.
 */
const LONDRINA_UTC_OFFSET_HOURS = -3;

/** `2026-10-19T15:30:00.000Z` → `19/10/2026 às 12:30`. */
export function formatDateTime(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return isoTimestamp;

  const local = new Date(parsed.getTime() + LONDRINA_UTC_OFFSET_HOURS * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, '0');

  const date = `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}`;
  return `${date} às ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}
