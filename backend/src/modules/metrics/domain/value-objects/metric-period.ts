import { ValidationError } from '../../../../shared/domain/errors/index.js';
import { MetricDay } from './metric-day.js';

const MAX_DAYS = 366;

export class MetricPeriod {
  private constructor(
    readonly from: MetricDay,
    readonly to: MetricDay,
  ) {
    Object.freeze(this);
  }

  static create(from: MetricDay, to: MetricDay): MetricPeriod {
    if (from.isAfter(to)) {
      throw new ValidationError('A data inicial deve ser anterior à data final.', 'from');
    }
    if (countDays(from, to) > MAX_DAYS) {
      throw new ValidationError(`O período deve ter no máximo ${MAX_DAYS} dias.`, 'to');
    }
    return new MetricPeriod(from, to);
  }

  static lastDays(days: number, reference: Date): MetricPeriod {
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      throw new ValidationError(`Informe um período entre 1 e ${MAX_DAYS} dias.`, 'days');
    }
    const to = MetricDay.fromDate(reference);
    return new MetricPeriod(to.plusDays(-(days - 1)), to);
  }

  get days(): number {
    return countDays(this.from, this.to);
  }

  eachDay(): MetricDay[] {
    const days: MetricDay[] = [];
    for (let offset = 0; offset < this.days; offset += 1) {
      days.push(this.from.plusDays(offset));
    }
    return days;
  }
}

function countDays(from: MetricDay, to: MetricDay): number {
  const fromTime = Date.parse(`${from.value}T00:00:00Z`);
  const toTime = Date.parse(`${to.value}T00:00:00Z`);
  return Math.round((toTime - fromTime) / 86_400_000) + 1;
}
