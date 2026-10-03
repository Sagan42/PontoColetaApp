import { ValidationError } from '../../../../shared/domain/errors/index.js';

const BRAZIL_UTC_OFFSET_MINUTES = -180;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class MetricDay {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  static fromDate(date: Date): MetricDay {
    const shifted = new Date(date.getTime() + BRAZIL_UTC_OFFSET_MINUTES * 60_000);
    return new MetricDay(shifted.toISOString().slice(0, 10));
  }

  static parse(value: string): MetricDay {
    if (!DAY_PATTERN.test(value)) {
      throw new ValidationError('Data deve estar no formato AAAA-MM-DD.', 'date');
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new ValidationError('Data inválida.', 'date');
    }
    return new MetricDay(value);
  }

  plusDays(days: number): MetricDay {
    const base = new Date(`${this.value}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + days);
    return new MetricDay(base.toISOString().slice(0, 10));
  }

  isAfter(other: MetricDay): boolean {
    return this.value > other.value;
  }

  equals(other: MetricDay): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
