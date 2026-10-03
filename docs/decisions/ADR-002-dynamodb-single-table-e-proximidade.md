# ADR-002 — Single-table design, itens auxiliares por material e geohash

**Status:** aceito · **Data:** 2026-08-22

## Contexto

O planejamento inicial previa:

```text
PK = CITY#LONDRINA
SK = POINT#<id>
```

Isso resolve "obter ponto por ID" e "listar pontos de Londrina", mas não
responde sozinho aos outros access patterns exigidos pelo produto: buscar por
material, buscar por proximidade, buscar por status e consultar métricas por
período. Fazer isso com `Scan` + filtro é proibido pelo escopo e caro.

## Decisão

Manter uma única tabela e a partição `CITY#LONDRINA` para os pontos, e
acrescentar:

1. **Itens auxiliares por material.** Além do item do ponto, gravamos um item
   por material aceito, com
   `SK = MATERIAL#<slug>#POINT#<id>`. A busca por material vira um `Query` com
   `begins_with` na tabela principal, seguido de um `BatchGetItem`.
   Escolhido em vez de um GSI porque não replica o item inteiro e porque a
   escrita é rara (um cadastro) enquanto a leitura é o caminho quente.
2. **GSI1 — status.** `GSI1PK = STATUS#<status>`,
   `GSI1SK = <createdAt>#<id>`. Atende "buscar por status" e também "listar
   pontos publicados", já ordenado do mais recente para o mais antigo.
3. **GSI2 — geohash, esparso.** `GSI2PK = GEO#<geohash-4>`,
   `GSI2SK = POINT#<id>`, gravado **apenas** para pontos publicados. A busca por
   proximidade consulta as células que cobrem o círculo de busca e depois filtra
   e ordena por distância de Haversine em memória.
4. **Métricas particionadas por mês.** `PK = METRICS#<AAAA-MM>`,
   `SK = DATE#<AAAA-MM-DD>`, com contadores incrementados por `ADD`.

Precisão 4 de geohash foi escolhida porque uma célula tem cerca de 39 km × 20 km
— o município inteiro cabe com folga, então qualquer busca dentro da área de
atendimento resolve com no máximo nove `Query` (centro + vizinhos).

## Alternativas consideradas

- **GSI por material** (`GSI_PK = MATERIAL#<slug>`): impossível com um item
  único por ponto, porque um ponto aceita vários materiais e um item só tem um
  valor por atributo de chave. Exigiria os mesmos itens auxiliares, só que
  replicados também no índice.
- **Projeção completa no item auxiliar** (nome, endereço, materiais): evitaria o
  `BatchGetItem`, ao custo de manter cópias sincronizadas. Rejeitado: leitura
  extra de um `BatchGetItem` é barata; divergência de dados não é.
- **Geohash precisão 5 ou 6**: células menores exigiriam dezenas de `Query` para
  raios de escala urbana.
- **Filtro por `Scan`**: proibido pelo escopo e caro conforme a base cresce.
- **Uma partição única para métricas** (`METRICS#DAILY`): concentraria todas as
  escritas do produto em uma partição. O particionamento mensal espalha as
  escritas e ainda responde qualquer período com poucos `Query`.

## Consequências

**Positivas**

- Nenhum caminho de leitura usa `Scan`; há teste que verifica isso.
- O índice geográfico é esparso: ponto oculto simplesmente não tem `GSI2PK`, e
  some das buscas por proximidade sem custo de filtro.
- Custo previsível e sob demanda (`PAY_PER_REQUEST`).

**Negativas**

- Cadastrar um ponto grava N+1 itens em uma transação (limite prático de 10
  materiais por ponto, imposto no domínio).
- Não existe endpoint de edição de ponto. Se um dia existir, ele precisará
  apagar os itens auxiliares dos materiais removidos — hoje isso não é possível
  porque nada altera a lista de materiais depois do cadastro.
- Proximidade acima de ~20 km sai da área de atendimento e não é suportada; o
  raio é limitado no domínio.
