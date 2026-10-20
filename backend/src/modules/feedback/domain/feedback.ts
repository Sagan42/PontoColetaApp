import { ValidationError } from '../../../shared/domain/errors/index.js';
import { sanitizeMultiline, sanitizeSingleLine } from '../../../shared/domain/text/index.js';

/** Autor exibido quando a pessoa escolhe não se identificar. */
export const ANONYMOUS_AUTHOR = 'Anônimo';

const MAX_AUTHOR_LENGTH = 60;
const MIN_MESSAGE_LENGTH = 3;
const MAX_MESSAGE_LENGTH = 1000;

export interface CreateFeedbackInput {
  readonly id: string;
  readonly author?: string | null | undefined;
  readonly message: string;
  readonly submittedAt: Date;
}

export interface FeedbackSnapshot {
  readonly id: string;
  readonly author: string;
  readonly message: string;
  readonly submittedAt: string;
}

/**
 * Feedback de quem usa o app. Escrito por qualquer pessoa, lido só pela área
 * administrativa — não existe rota pública de leitura.
 */
export class Feedback {
  private constructor(
    readonly id: string,
    readonly author: string,
    readonly message: string,
    readonly submittedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(input: CreateFeedbackInput): Feedback {
    // A validação roda sobre o texto já saneado, não sobre o que chegou: o que
    // vale é o tamanho do que será guardado.
    const author = sanitizeSingleLine(input.author ?? '');
    if (author.length > MAX_AUTHOR_LENGTH) {
      throw new ValidationError(`Nome deve ter no máximo ${MAX_AUTHOR_LENGTH} caracteres.`, 'name');
    }

    const message = sanitizeMultiline(input.message);
    if (message.length < MIN_MESSAGE_LENGTH) {
      throw new ValidationError(
        `Escreva uma mensagem com pelo menos ${MIN_MESSAGE_LENGTH} caracteres.`,
        'message',
      );
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new ValidationError(
        `Mensagem deve ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.`,
        'message',
      );
    }

    return new Feedback(
      input.id,
      author.length > 0 ? author : ANONYMOUS_AUTHOR,
      message,
      input.submittedAt,
    );
  }

  /**
   * Reconstrói o que já está gravado, sem revalidar: o texto foi saneado na
   * entrada, e recusar agora um item antigo só esconderia feedback de quem
   * precisa lê-lo.
   */
  static restore(snapshot: FeedbackSnapshot): Feedback {
    return new Feedback(
      snapshot.id,
      snapshot.author,
      snapshot.message,
      new Date(snapshot.submittedAt),
    );
  }

  toSnapshot(): FeedbackSnapshot {
    return {
      id: this.id,
      author: this.author,
      message: this.message,
      submittedAt: this.submittedAt.toISOString(),
    };
  }
}
