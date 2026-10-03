import { DomainError } from '../../../shared/domain/errors/index.js';

export class AddressNotFoundError extends DomainError {
  readonly code = 'ADDRESS_NOT_FOUND';

  constructor(message = 'Não foi possível localizar esse endereço.') {
    super(message);
  }
}
