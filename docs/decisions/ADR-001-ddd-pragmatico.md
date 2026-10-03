# ADR-001 — DDD pragmático como arquitetura do software

**Status:** aceito · **Data:** 2026-08-22

## Contexto

O PontoColeta é um produto pequeno e de escopo fechado: encontrar e cadastrar
pontos de coleta em uma única cidade, mais uma tela administrativa de métricas.
Ao mesmo tempo, ele precisa ser mantido por muito tempo, com pouca gente, e
tende a acumular regras discretas mas reais (normalização de materiais, área de
atendimento, deduplicação, quem pode ver o quê).

Nenhuma arquitetura havia sido definida antes deste trabalho. As opções
consideradas iam de "handlers Lambda com acesso direto ao DynamoDB" até uma
arquitetura hexagonal completa com CQRS e eventos de domínio.

## Decisão

Adotar **DDD pragmático**: as quatro camadas conceituais (Domain, Application,
Infrastructure, Presentation), organizadas por módulo de negócio
(`collection-points`, `metrics`), sem cerimônia adicional.

Regras concretas que seguimos:

1. **Domain não conhece infraestrutura.** Nenhum arquivo em `domain/` importa
   AWS SDK, HTTP, Terraform, Expo ou zod de runtime. Isso é verificável lendo
   os imports.
2. **Entities e Value Objects só existem quando protegem uma invariante.**
   `Material` existe porque carrega a regra de normalização; `Coordinates`
   porque valida faixa e calcula distância; `OpeningHours` porque limita e
   normaliza um texto livre. Não existe `Name` nem `Id` como wrapper trivial.
3. **Um caso de uso por operação**, com dependências injetadas por construtor.
4. **Repositórios são expressos em access patterns**, não em tabelas.
5. **Handlers Lambda são finos**: traduzem requisição, chamam um caso de uso,
   apresentam o resultado.
6. **Sem eventos de domínio, sem CQRS, sem event sourcing, sem Unit of Work.**
   Nenhum deles resolve um problema que exista neste produto hoje.

## Alternativas consideradas

- **Handlers com acesso direto ao DynamoDB.** Mais rápido de escrever, e
  perfeitamente viável para 7 rotas. Rejeitado porque as regras (normalização,
  área de atendimento, deduplicação) ficariam espalhadas e sem teste possível
  sem AWS — exatamente o que mais custa caro em um projeto de vida longa.
- **Arquitetura hexagonal completa com CQRS.** Rejeitado por desproporção: o
  produto tem duas Lambdas e uma tabela.
- **Camadas por tipo técnico** (`controllers/`, `services/`, `models/`).
  Rejeitado porque espalha um mesmo assunto por várias pastas e não deixa claro
  o que é regra de negócio.

## Consequências

**Positivas**

- Domain e Application são testáveis sem AWS: 161 testes de backend rodam em
  ~1,3 s sem credencial alguma.
- Trocar o provedor de geocodificação, o mecanismo de autenticação ou a
  modelagem do DynamoDB não toca em regra de negócio.
- O código diz o que o produto faz: `SearchCollectionPointsByMaterial` é uma
  frase do domínio, não um detalhe técnico.

**Negativas**

- Há indireção que um projeto deste tamanho poderia evitar: um cadastro passa
  por rota → caso de uso → agregado → repositório.
- Um novo endpoint exige tocar em mais de um arquivo.
- A composição manual em `shared/infrastructure/container.ts` cresce
  linearmente com o número de casos de uso. Aceitável enquanto couber em uma
  tela; um contêiner de injeção seria a resposta se deixar de caber.
