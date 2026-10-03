import { ValidationError } from '../../../../shared/domain/errors/index.js';
import { collapseWhitespace } from '../../../../shared/domain/text/index.js';
import { SERVICE_AREA } from '../service-area.js';

const MIN_LINE_LENGTH = 5;
const MAX_LINE_LENGTH = 200;

export class Address {
  private constructor(
    readonly line: string,
    readonly city: string,
    readonly state: string,
  ) {
    Object.freeze(this);
  }

  static create(rawLine: string, city?: string, state?: string): Address {
    const line = collapseWhitespace(rawLine);

    if (line.length < MIN_LINE_LENGTH) {
      throw new ValidationError('Informe um endereço com pelo menos 5 caracteres.', 'address');
    }
    if (line.length > MAX_LINE_LENGTH) {
      throw new ValidationError(
        `Endereço deve ter no máximo ${MAX_LINE_LENGTH} caracteres.`,
        'address',
      );
    }

    return new Address(
      line,
      collapseWhitespace(city ?? SERVICE_AREA.cityName) || SERVICE_AREA.cityName,
      collapseWhitespace(state ?? SERVICE_AREA.state) || SERVICE_AREA.state,
    );
  }

  get formatted(): string {
    const suffix = `${this.city}, ${this.state}`;
    return this.line.toLowerCase().includes(this.city.toLowerCase())
      ? this.line
      : `${this.line}, ${suffix}`;
  }

  equals(other: Address): boolean {
    return this.formatted === other.formatted;
  }
}
