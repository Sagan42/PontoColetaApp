# Arquitetura

Este documento descreve a arquitetura **implementada**, não uma intenção.

## Visão geral

```mermaid
flowchart TD
    U([Pessoa em Londrina])
    A["PontoColeta app<br/>React Native + Expo"]
    G["Amazon API Gateway<br/>HTTP API v2"]
    C["Amazon Cognito<br/>User Pool"]
    LP["Lambda public-api"]
    LA["Lambda admin-api"]
    APP["Application<br/>casos de uso"]
    DOM["Domain<br/>regras e invariantes"]
    REPO["Portas de repositório"]
    DB[("Amazon DynamoDB<br/>tabela única")]
    GEO["Nominatim<br/>geocodificação"]
    CW["Amazon CloudWatch Logs"]

    U --> A
    A -->|"HTTPS"| G
    A -.->|"login administrativo"| C
    G -->|"rotas públicas"| LP
    G -->|"rotas /v1/admin/* + JWT"| LA
    C -.->|"valida token"| G
    LP --> APP
    LA --> APP
    APP --> DOM
    APP --> REPO
    REPO --> DB
    APP -->|"porta GeocodingService"| GEO
    LP -.-> CW
    LA -.-> CW
    G -.-> CW
```

Nada no app fala diretamente com o DynamoDB. A única porta de entrada dos dados
é o API Gateway.

## Camadas

O backend segue DDD pragmático ([ADR-001](decisions/ADR-001-ddd-pragmatico.md)),
organizado por módulo de negócio antes de por tipo técnico.

```mermaid
flowchart LR
    P["Presentation<br/>handlers, rotas, schemas HTTP"]
    AP["Application<br/>casos de uso, portas"]
    D["Domain<br/>entidades, VOs, invariantes"]
    I["Infrastructure<br/>DynamoDB, Nominatim, logs"]

    P --> AP
    AP --> D
    I --> AP
    I --> D
```

A seta de `Infrastructure` aponta **para dentro**: a infraestrutura implementa
interfaces declaradas no domínio e na aplicação. O domínio não importa AWS SDK,
HTTP, Terraform, Expo nem React Native.

| Camada             | Responsabilidade                                          | Exemplos                                                                 |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Domain**         | Conceitos e regras que existiriam sem computador           | `CollectionPoint`, `Material`, `Coordinates`, `SERVICE_AREA`, Haversine   |
| **Application**    | Orquestração de um caso de uso, dependendo só de abstrações| `CreateCollectionPoint`, `SearchCollectionPointsByLocation`, `HideCollectionPoint` |
| **Infrastructure** | Implementações concretas                                   | `DynamoCollectionPointRepository`, `NominatimGeocodingService`, logger    |
| **Presentation**   | Contrato HTTP, validação estrutural, códigos de status     | `collection-point-routes.ts`, `error-mapper.ts`, `Router`                 |

## Módulos

```text
backend/src/
├── modules/
│   ├── collection-points/    domain · application · infrastructure · presentation
│   ├── metrics/              domain · application · infrastructure · presentation
│   └── feedback/             domain · application · infrastructure · presentation
├── shared/
│   ├── domain/               erros, geohash, Haversine, normalização de texto
│   ├── application/          portas Clock, IdGenerator, Logger
│   ├── infrastructure/       config, cliente DynamoDB, logger, composition root
│   └── presentation/         router, respostas, mapeamento de erros, adapter Lambda
└── handlers/                 public-api.ts, admin-api.ts
```

### Como os módulos se falam

`collection-points` precisa contar cadastros e buscas, mas não conhece o módulo
de métricas. Ele declara a porta `UsageMetricRecorder`; o adaptador
`UsageMetricRecorderAdapter` liga essa porta ao caso de uso
`RegisterUsageMetric`; a ligação acontece no composition root. Registrar métrica
nunca derruba a operação medida: falha é logada em `warn` e engolida.

## Lambdas

Duas funções ([ADR-005](decisions/ADR-005-http-api-e-duas-lambdas.md)):

| Função       | Memória | Timeout | Permissões DynamoDB                              |
| ------------ | ------- | ------- | ------------------------------------------------ |
| `public-api` | 512 MB  | 15 s    | GetItem, BatchGetItem, Query, PutItem, UpdateItem |
| `admin-api`  | 256 MB  | 10 s    | Query, GetItem, TransactWriteItems               |

Ambas em `arm64` (Graviton, ~20% mais barato) e runtime `nodejs22.x`. O
container é construído uma vez por container (fora do handler), então clientes
HTTP e DynamoDB são reaproveitados entre invocações.

A `admin-api` lê métricas (`Query`) e modera pontos: `GetItem` para carregar o
ponto e `TransactWriteItems` para reescrevê-lo com seus itens de material. Sem
`PutItem` e sem `DeleteItem` — a API administrativa nunca cria nem destrói
ponto, só muda o estado de um que já existe.

## Ciclo de vida do ponto de coleta

```mermaid
stateDiagram-v2
    [*] --> PUBLISHED: POST /v1/collection-points
    PUBLISHED --> HIDDEN: POST /v1/admin/…/hide
    HIDDEN --> PUBLISHED: POST /v1/admin/…/publish
```

Um ponto nasce publicado — o cadastro é aberto e não há fila de aprovação. A
moderação é **reativa**: tirar do ar o que estiver errado ou abusivo.

`HIDDEN` é a razão de existir do `GSI2` esparso. Os atributos `GSI2PK`/`GSI2SK`
só são gravados para ponto publicado, então a busca por proximidade não precisa
filtrar status — o índice simplesmente não contém o que está oculto. O ponto
permanece no `GSI1-status`, que é como um administrador consegue listar os
ocultos.

A transição é um caso de uso de aplicação (`HideCollectionPoint`,
`PublishCollectionPoint`) sobre os métodos de domínio `hide()`/`publish()`, que
são idempotentes. A persistência usa `update` no repositório, e não `save`:
`save` grava a claim de unicidade sob `attribute_not_exists` e entraria em
conflito consigo mesma num ponto que já existe. `update` reescreve o item
inteiro, então os atributos do índice esparso desaparecem e reaparecem sem
precisar de `REMOVE`.

Não há tela para isso: por enquanto a moderação é feita por chamada HTTP
autenticada.

## Mobile

```text
mobile/
├── app/                      rotas (Expo Router)
│   ├── _layout.tsx           providers + navegação
│   ├── index.tsx             Home (ver mapa, listar pontos, atalhos)
│   ├── search.tsx            busca por endereço ou material
│   ├── results.tsx           resultados (lista ↔ mapa)
│   ├── point/[id].tsx        detalhes
│   ├── new-point.tsx         cadastro
│   ├── feedback.tsx          feedback (nome opcional + mensagem)
│   ├── report/[id].tsx       denúncia de um ponto de coleta
│   └── admin/index.tsx       login + métricas + feedbacks + denúncias
└── src/
    ├── design-system/        tokens + componentes
    ├── features/             collection-points, feedback, admin
    ├── services/             apiClient, config, metrics
    ├── schemas/              validação de formulário (zod)
    └── utils/                formatação pt-BR
```

Separação de estado:

- **Estado de servidor** — TanStack Query. Cache, `loading`/`error`/`empty`,
  retry e invalidação após cadastro. Nunca copiado para `useState`.
- **Estado de UI** — `useState` local (texto digitado, aba lista/mapa, seleção
  no mapa).

Não há store global: nenhuma tela precisa de estado compartilhado que já não
esteja no cache de queries ou na URL.

## Fluxo de uma busca por endereço

```mermaid
sequenceDiagram
    participant P as Pessoa
    participant A as App
    participant G as API Gateway
    participant L as Lambda public-api
    participant N as Nominatim
    participant D as DynamoDB

    P->>A: digita "Rua Pará, 500"
    A->>G: GET /v1/collection-points/nearby?address=...
    G->>L: evento (payload v2)
    L->>N: geocodifica (viewbox de Londrina)
    N-->>L: coordenadas
    L->>D: Query GSI2-geo nas células que cobrem o raio
    D-->>L: candidatos
    L->>L: filtra e ordena por Haversine
    L->>D: UpdateItem ADD search_address
    L-->>G: 200 { data, meta.origin }
    G-->>A: JSON
    A-->>P: lista e mapa com distâncias
```

## Serviços externos

| Serviço                     | Uso                          | Onde fica isolado                        |
| --------------------------- | ---------------------------- | ---------------------------------------- |
| Nominatim (OpenStreetMap)   | endereço → coordenadas       | `NominatimGeocodingService` (porta)      |
| Google Maps (Android)       | renderização do mapa         | `CollectionPointsMap`                    |
| Amazon Cognito              | login administrativo         | `features/admin/auth.ts`                 |

Cada um está atrás de um único arquivo. Trocar qualquer um deles é uma mudança
local.

### Política de uso do Nominatim

A instância pública aceita **no máximo 1 requisição por segundo** e bloqueia por
IP quem passa disso. `NominatimGeocodingService` aplica quatro camadas, nesta
ordem:

1. **Cache em memória** — 1 hora, até 200 endereços, por container Lambda. Um
   endereço repetido não gasta requisição nem slot do limitador.
2. **Limitador de 1 req/s** — as chamadas são serializadas numa fila dentro do
   container, espaçadas em 1 segundo. Duas buscas simultâneas pelo mesmo
   endereço são unificadas: a segunda encontra o cache que a primeira acabou de
   preencher.
3. **Uma retentativa** — só para erro de rede e status 5xx, com recuo de 250 ms.
   4xx não é repetido: é o provedor dizendo que a requisição está errada, e
   insistir só queima o orçamento de taxa.
4. **Teto pelo timeout** — `GEOCODING_TIMEOUT_MS` (4 s em produção) é o orçamento
   da operação inteira, incluindo a espera na fila. Se a vez da chamada só
   chegaria depois do prazo, ela falha na hora em vez de enfileirar. Na prática
   cabem ~4 geocodificações distintas por container dentro de um orçamento de
   4 s; o excedente recebe o mesmo erro de provedor indisponível.

**O limitador é por container, não global.** Com
`public_lambda_reserved_concurrency = 20`, 20 containers quentes podem somar até
20 req/s no provedor. O que protege de verdade contra o bloqueio é o cache mais a
concorrência reservada; o limitador elimina a rajada de um container só. Um
limitador global exigiria estado compartilhado (token bucket no DynamoDB) ou uma
fila de concorrência 1 — vale quando a busca por endereço tiver volume real.

## Infraestrutura

Toda a infraestrutura é declarada em Terraform e **nada foi provisionado**. Ver
[terraform.md](terraform.md) e [deployment.md](deployment.md).

```text
modules/stack
├── modules/dynamodb      tabela + GSI1 (status) + GSI2 (geohash, esparso)
├── modules/lambda   ×2   função + role + policy mínima + log group
├── modules/http-api      API + estágio + rotas + integrações + authorizer JWT
└── modules/admin-auth    user pool + app client
```
