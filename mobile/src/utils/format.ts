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
