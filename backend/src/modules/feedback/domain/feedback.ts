import { ValidationError } from '../../../shared/domain/errors/index.js';

/** Autor exibido quando a pessoa escolhe não se identificar. */
export const ANONYMOUS_AUTHOR = 'Anônimo';

const MAX_AUTHOR_LENGTH = 60;
const MIN_MESSAGE_LENGTH = 3;
const MAX_MESSAGE_LENGTH = 1000;

/**
 * Quebra de linha de qualquer origem: CR, LF e os separadores Unicode de linha
 * e de parágrafo. Vertical tab e form feed ficam de fora porque ninguém os
 * digita — eles caem como controle, junto com os demais invisíveis.
 */
const ANY_LINE_BREAK = /[\r\n\p{Zl}\p{Zp}]/gu;

/**
 * Controles (`Cc`), formatadores (`Cf`) e surrogates órfãos (`Cs`).
 *
 * Isto não é defesa contra injeção: o DynamoDB recebe valores como dados, nunca
 * como expressão, então não existe "injeção de query" aqui. São três problemas
 * concretos:
 *
 * - `Cf` inclui os controles de direção de texto, e um override (U+202E) inverte
 *   a leitura de uma frase inteira para quem for ler o feedback depois;
 * - `Cf` também inclui as marcas de largura zero, que escondem conteúdo e
 *   inflam o tamanho sem aparecer;
 * - `Cs` com a flag `u` casa apenas surrogate sem par — texto UTF-16 malformado
 *   que o DynamoDB recusaria, virando um 500 em vez de um 400.
 *
 * Emoji continua passando: com a flag `u` o par de surrogates bem formado é um
 * code point só, fora de `Cs`.
 */
const INVISIBLE_CHARACTERS = /[\p{Cc}\p{Cf}\p{Cs}]/gu;

function stripInvisible(value: string, keepLineBreaks: boolean): string {
  return value.replace(INVISIBLE_CHARACTERS, (character) =>
    keepLineBreaks && character === '\n' ? character : '',
  );
}

function sanitizeSingleLine(value: string): string {
  const flattened = value.replace(ANY_LINE_BREAK, ' ').replace(/\t/g, ' ');
  return stripInvisible(flattened, false)
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Preserva parágrafos, porque é texto escrito por uma pessoa, mas limita o
 * estrago: espaços e tabulações colapsam, e mais de uma linha em branco seguida
 * vira uma só — senão uma mensagem de três palavras chega com mil quebras de
 * linha e ocupa o limite inteiro.
 */
function sanitizeMultiline(value: string): string {
  const normalized = value.replace(ANY_LINE_BREAK, '\n').replace(/\t/g, ' ');
  return stripInvisible(normalized, true)
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

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
