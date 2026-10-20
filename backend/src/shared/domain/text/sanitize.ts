/**
 * Saneamento de texto livre escrito por quem usa o app.
 *
 * Mora no compartilhado de propósito: é código de segurança, e segurança
 * duplicada é segurança que conserta pela metade. Quem escreve texto livre —
 * feedback, denúncia — passa por aqui.
 */

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
 *   a leitura de uma frase inteira para quem for ler depois;
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

/** Uma linha só: toda quebra vira espaço e os espaços colapsam. */
export function sanitizeSingleLine(value: string): string {
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
export function sanitizeMultiline(value: string): string {
  const normalized = value.replace(ANY_LINE_BREAK, '\n').replace(/\t/g, ' ');
  return stripInvisible(normalized, true)
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}
