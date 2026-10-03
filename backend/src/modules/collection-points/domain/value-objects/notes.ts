import { ValidationError } from '../../../../shared/domain/errors/index.js';
import { collapseWhitespace } from '../../../../shared/domain/text/index.js';

const MAX_LENGTH = 500;

export class Notes {
  private constructor(readonly value: string | null) {
    Object.freeze(this);
  }

  static readonly empty = new Notes(null);

  static create(rawValue: string | null | undefined): Notes {
    if (rawValue === null || rawValue === undefined) {
      return Notes.empty;
    }

    const value = collapseWhitespace(rawValue);
    if (value.length === 0) {
      return Notes.empty;
    }
    if (value.length > MAX_LENGTH) {
      throw new ValidationError(
        `Observações devem ter no máximo ${MAX_LENGTH} caracteres.`,
        'notes',
      );
    }

    return new Notes(value);
  }

  get isPresent(): boolean {
    return this.value !== null;
  }
}
