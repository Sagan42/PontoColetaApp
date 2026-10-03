# Métricas de uso

As métricas existem para responder quatro perguntas, e só isso:

1. Quantas vezes o aplicativo foi acessado?
2. Quantas consultas foram feitas?
3. Quantos pontos foram cadastrados?
4. Como esses números evoluíram?

Não é uma plataforma de analytics. Ninguém é identificado —
ver [privacy.md](privacy.md).

## Eventos

| Tipo              | Significado                       | Quem conta         |
| ----------------- | --------------------------------- | ------------------ |
| `app_open`        | app foi aberto                    | app                |
| `point_viewed`    | detalhes de um ponto foram abertos| app                |
| `search_address`  | busca por endereço bem-sucedida   | **backend**        |
| `search_material` | busca por material bem-sucedida   | **backend**        |
| `point_created`   | ponto cadastrado                  | **backend**        |

A divisão é deliberada: o que o backend consegue observar por si, ele conta
sozinho. `POST /v1/metrics/events` aceita **apenas** `app_open` e
`point_viewed`; tentar enviar `point_created` recebe 400. Assim os números que
mais importam não podem ser inflados por um cliente.

## Agregação

Nenhum evento individual é armazenado. Cada evento incrementa um contador do dia
com `ADD` (atômico entre invocações concorrentes):

```text
PK = METRICS#2026-08          (mês)
SK = DATE#2026-08-22          (dia)

app_open: 137 · search_address: 61 · search_material: 43
point_created: 2 · point_viewed: 88
```

Não armazenar eventos é ao mesmo tempo a opção mais barata (uma escrita de
poucos bytes, sem crescimento indefinido) e a mais protetiva: não existe registro
individual a ser correlacionado depois.

### Dia = dia em Londrina

O bucket usa UTC−3, não UTC. O Brasil não tem horário de verão desde 2019, então
o deslocamento fixo é exato e evita embarcar um banco de fusos na Lambda. Um
acesso às 23h de 22/08 conta no dia 22, como qualquer pessoa esperaria.

## Consulta

```http
GET /v1/admin/metrics?days=30
authorization: Bearer <IdToken>
```

Ou período explícito: `?from=2026-08-01&to=2026-08-22` (máximo 366 dias).

A resposta traz:

- `period` — o intervalo efetivamente considerado;
- `totals` — soma de cada contador, mais `searches` (endereço + material);
- `daily` — **série contínua**: dias sem atividade vêm com zeros, para o gráfico
  não sugerir continuidade onde houve silêncio.

Internamente é um `Query` por mês do período — no máximo 13 para um ano.

## Painel administrativo

`mobile/app/admin/index.tsx`, após login ([ADR-003](decisions/ADR-003-autenticacao-administrativa-cognito.md)):

- seletor de período: 7, 30 ou 90 dias;
- três totais em destaque: **Acessos**, **Consultas**, **Pontos cadastrados**;
- três gráficos de barras diários, para a evolução;
- detalhamento: consultas por endereço, por material, e detalhes abertos.

O gráfico é desenhado com views comuns — no volume deste produto, uma biblioteca
de charts seria peso sem retorno. Cada barra tem rótulo de acessibilidade com o
valor exato, então o gráfico não é a única forma de ler o dado.

## Como interpretar

| Leitura                                     | Sugere                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| Acessos altos, consultas baixas             | a Home não está deixando claro como buscar                    |
| Consultas altas, detalhes abertos baixos    | os resultados não parecem úteis ou relevantes                 |
| Buscas por material ≫ por endereço          | as pessoas partem do "o que descartar", não do "onde estou"   |
| Cadastros próximos de zero                  | o caminho de contribuição está escondido ou é penoso demais   |
| Queda geral súbita                          | investigue disponibilidade antes de interpretar comportamento |

Cuidados honestos:

- Não existe distinção entre pessoas: 100 acessos podem ser 100 pessoas ou uma
  pessoa abrindo 100 vezes. Isso é consequência direta de não identificar
  ninguém, e é uma troca aceita.
- Consultas sem resultado contam como consulta — o número mede demanda, não
  sucesso.
- `app_open` conta montagens do app; retomadas do segundo plano podem não gerar
  novo evento, dependendo de como o sistema preserva o processo.

## Custo

Cinco contadores por dia significam um item por dia e algumas centenas de bytes
por mês. Consultar 90 dias lê três itens. É irrelevante na fatura, e essa foi
uma das razões da escolha.
