import { ValidationError } from '../../../../shared/domain/errors/index.js';
import { collapseWhitespace } from '../../../../shared/domain/text/index.js';

const MAX_LENGTH = 120;

export class OpeningHours {
  private constructor(readonly value: string | null) {
    Object.freeze(this);
  }

  static readonly notInformed = new OpeningHours(null);

  static create(rawValue: string | null | undefined): OpeningHours {
    if (rawValue === null || rawValue === undefined) {
      return OpeningHours.notInformed;
    }

    const value = collapseWhitespace(rawValue);
    if (value.length === 0) {
      return OpeningHours.notInformed;
    }
    if (value.length > MAX_LENGTH) {
      throw new ValidationError(
        `Horário deve ter no máximo ${MAX_LENGTH} caracteres.`,
        'openingHours',
      );
    }

    return new OpeningHours(value);
  }

  get isInformed(): boolean {
    return this.value !== null;
  }
}
