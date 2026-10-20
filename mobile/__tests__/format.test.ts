import {
  formatDate,
  formatDateTime,
  formatDistance,
  formatMaterialList,
  formatShortDate,
} from '../src/utils/format';

describe('formatDistance', () => {
  it('uses metres below one kilometre', () => {
    expect(formatDistance(0.35)).toBe('350 m');
    expect(formatDistance(0)).toBe('0 m');
  });

  it('uses one decimal, with a comma, up to ten kilometres', () => {
    expect(formatDistance(1.24)).toBe('1,2 km');
    expect(formatDistance(9.98)).toBe('10,0 km');
  });

  it('rounds to whole kilometres above ten', () => {
    expect(formatDistance(12.4)).toBe('12 km');
  });

  it('returns null when there is no distance to show', () => {
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(Number.NaN)).toBeNull();
  });
});

describe('formatMaterialList', () => {
  it('joins with commas and a final "e"', () => {
    expect(formatMaterialList(['Pilhas', 'Baterias', 'Lâmpadas'])).toBe(
      'Pilhas, Baterias e Lâmpadas',
    );
  });

  it('handles one and zero items', () => {
    expect(formatMaterialList(['Pilhas'])).toBe('Pilhas');
    expect(formatMaterialList([])).toBe('');
  });
});

describe('date formatting', () => {
  it('formats a full date in the Brazilian order', () => {
    expect(formatDate('2026-08-22')).toBe('22/08/2026');
  });

  it('formats a short date for the chart axis', () => {
    expect(formatShortDate('2026-08-22')).toBe('22/08');
  });
});

describe('formatDateTime', () => {
  it('shows date and hour in Londrina time', () => {
    expect(formatDateTime('2026-10-19T15:30:00.000Z')).toBe('19/10/2026 às 12:30');
  });

  it('crosses the day backwards when UTC is already past midnight', () => {
    expect(formatDateTime('2026-10-19T01:15:00.000Z')).toBe('18/10/2026 às 22:15');
  });

  it('gives back what it cannot parse', () => {
    expect(formatDateTime('nao-e-data')).toBe('nao-e-data');
  });
});
