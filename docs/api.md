# API

REST versionada em `/v1`. A especificação formal é
[`openapi.yaml`](openapi.yaml) e reflete a implementação em `backend/src`.

Base URL: o output `api_endpoint` do Terraform do ambiente. Nenhum ambiente foi
provisionado ainda.

## Convenções

**Sucesso** — sempre um envelope:

```json
{ "data": ..., "meta": { ... } }
```

`meta` aparece quando há informação sobre a consulta em si (contagem, cursor,
origem geográfica da busca).

**Erro** — sempre a mesma forma:

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": ... },
  "requestId": "..."
}
```

`message` é escrita em português e pode ser mostrada diretamente à pessoa.
`requestId` é o mesmo identificador que aparece no CloudWatch, o que permite
investigar um problema relatado por alguém.

Stack traces nunca são expostos.

## Endpoints

| Método | Caminho                        | Autenticação | Descrição                                      |
| ------ | ------------------------------ | ------------ | ---------------------------------------------- |
| GET    | `/v1/health`                   | pública      | disponibilidade                                |
| GET    | `/v1/materials`                | pública      | materiais sugeridos pela interface             |
| GET    | `/v1/collection-points`        | pública      | lista publicados; `?material=` filtra          |
| GET    | `/v1/collection-points/nearby` | pública      | busca por endereço ou coordenada               |
| GET    | `/v1/collection-points/{id}`   | pública      | detalhes                                       |
| POST   | `/v1/collection-points`        | pública      | cadastro                                       |
| POST   | `/v1/metrics/events`           | pública      | registra `app_open` ou `point_viewed`          |
| GET    | `/v1/admin/metrics`            | **JWT**      | métricas agregadas                             |
| POST   | `/v1/admin/collection-points/{id}/hide`    | **JWT** | tira o ponto do ar                     |
| POST   | `/v1/admin/collection-points/{id}/publish` | **JWT** | devolve o ponto ao ar                  |

## Códigos de status

| Código | Quando                                                                 |
| ------ | ---------------------------------------------------------------------- |
| 200    | consulta bem-sucedida (lista vazia também é 200)                        |
| 201    | ponto cadastrado; header `location` aponta para o recurso               |
| 202    | evento de métrica contabilizado                                         |
| 400    | corpo/query inválidos, invariante de domínio violada, payload > 16 KB   |
| 401    | rota administrativa sem token válido                                    |
| 403    | token válido mas sem identidade utilizável                              |
| 404    | ponto inexistente **ou oculto**, endereço não geocodificável, rota inexistente |
| 405    | caminho existe, método não                                              |
| 409    | ponto duplicado (mesmo nome a menos de 150 m)                           |
| 500    | erro inesperado; detalhes só no CloudWatch                              |
| 503    | provedor de geocodificação indisponível                                 |

## Exemplos

### Buscar por material

```http
GET /v1/collection-points?material=%C3%93leo%20de%20cozinha
```

```json
{
  "data": [
    {
      "id": "0f2c…",
      "name": "Mercado Central",
      "address": {
        "line": "Rua Pará, 500",
        "city": "Londrina",
        "state": "PR",
        "formatted": "Rua Pará, 500, Londrina, PR"
      },
      "location": { "latitude": -23.3103, "longitude": -51.1628 },
      "materials": [{ "label": "Óleo de cozinha", "slug": "oleo-de-cozinha" }],
      "openingHours": "Seg a Sáb, 8h às 20h",
      "notes": null,
      "status": "PUBLISHED",
      "distanceKm": null,
      "createdAt": "2026-08-22T12:00:00.000Z",
      "updatedAt": "2026-08-22T12:00:00.000Z"
    }
  ],
  "meta": {
    "material": { "query": "Óleo de cozinha", "slug": "oleo-de-cozinha" },
    "nextCursor": null,
    "count": 1
  }
}
```

O texto é normalizado antes da consulta: `ÓLEO DE COZINHA`, `oleo de cozinha` e
`Óleo de Cozinha` produzem o mesmo resultado.

### Buscar por endereço

```http
GET /v1/collection-points/nearby?address=Rua%20Par%C3%A1,%20500&radiusKm=3
```

```json
{
  "data": [{ "id": "0f2c…", "name": "Ecoponto Centro", "distanceKm": 0.42 }],
  "meta": {
    "origin": {
      "latitude": -23.3103,
      "longitude": -51.1628,
      "formattedAddress": "Rua Pará, Centro, Londrina, PR, Brasil"
    },
    "radiusKm": 3,
    "count": 1
  }
}
```

Alternativa sem geocodificação:
`GET /v1/collection-points/nearby?lat=-23.3103&lng=-51.1628`.

### Cadastrar um ponto

```http
POST /v1/collection-points
content-type: application/json

{
  "name": "Ecoponto Centro",
  "address": "Rua Pará, 500",
  "materials": ["Pilhas", "Baterias"],
  "openingHours": "Seg a Sex, 8h às 18h",
  "notes": "Entrada pela lateral"
}
```

`201` com o ponto criado e `location: /v1/collection-points/<id>`.

O backend geocodifica o endereço e é a fonte de verdade das coordenadas. Se o
app enviar `latitude`/`longitude`, elas só são usadas quando estão a menos de
1 km do endereço geocodificado.

### Métricas administrativas

```http
GET /v1/admin/metrics?days=30
authorization: Bearer <IdToken do Cognito>
```

```json
{
  "data": {
    "period": { "from": "2026-07-24", "to": "2026-08-22", "days": 30 },
    "totals": {
      "app_open": 1240,
      "search_address": 610,
      "search_material": 430,
      "point_created": 27,
      "point_viewed": 880,
      "searches": 1040
    },
    "daily": [{ "date": "2026-07-24", "counters": { "app_open": 31, "…": 0 } }]
  }
}
```

A série `daily` é contínua: dias sem atividade vêm com zeros, para o gráfico não
mentir sobre a evolução.

### Ciclo de vida do ponto (moderação)

Como tirar do ar um ponto errado ou abusivo sem editar a tabela à mão.

```http
POST /v1/admin/collection-points/0f2c…/hide
authorization: Bearer <IdToken do Cognito>
```

```json
{
  "data": {
    "id": "0f2c…",
    "name": "Ecoponto Centro",
    "status": "HIDDEN",
    "updatedAt": "2026-10-12T09:30:00.000Z"
  }
}
```

`/publish` tem a mesma forma e devolve `status: "PUBLISHED"`.

Comportamento:

- A resposta é o ponto atualizado, no mesmo formato das rotas públicas.
- **Idempotente.** Ocultar um ponto já oculto responde 200 sem mudar nada, e
  `updatedAt` fica como estava — repetir a chamada não falsifica o histórico.
- **404** para id inexistente. Diferente das rotas públicas, um ponto **oculto
  não** dá 404 aqui: é justamente ele que `/publish` precisa alcançar.
- Oculto sai na hora de `GET /v1/collection-points`, da busca por material, da
  busca por proximidade e de `GET /v1/collection-points/{id}` (que passa a
  responder 404). O ponto continua na tabela e no `GSI1-status`.
- Quem executou a ação vai para o log como `collection_point.hidden` /
  `collection_point.published`, com `pointId` e `actor` (o `sub` do token). O
  ponto em si só registra que está oculto, não por quem.

Ocultar **não** libera o nome: a claim de unicidade continua valendo, então
recadastrar o mesmo lugar ainda responde 409. Ver
[dynamodb.md](dynamodb.md#3-item-de-unicidade).

## Validação

A camada de apresentação valida **estrutura** (zod): tipos, tamanhos, formatos,
enums, presença. O domínio valida **regra**: normalização, área de atendimento,
duplicidade, limites de negócio.

O app repete essas validações apenas para dar retorno rápido. O frontend não é
camada de segurança — ver [privacy.md](privacy.md) e a seção de segurança do
[README](../README.md).

Limites impostos pelo backend:

| Limite                      | Valor                    |
| --------------------------- | ------------------------ |
| Corpo da requisição         | 16 KB                    |
| Nome                        | 3–120 caracteres         |
| Endereço                    | 5–200 caracteres         |
| Materiais                   | 1–10, 2–40 caracteres    |
| Horário                     | 120 caracteres           |
| Observações                 | 500 caracteres           |
| `limit`                     | 1–100 (padrão 50)        |
| `radiusKm`                  | até 20 km efetivos       |
| Período de métricas         | até 366 dias             |
| Throttling (dev / prod)     | 10 / 50 req/s            |

## Autenticação

Apenas `/v1/admin/*`. `Authorization: Bearer <IdToken>` emitido pelo Cognito;
validado pelo authorizer JWT do API Gateway e reconferido na Lambda. Detalhes em
[ADR-003](decisions/ADR-003-autenticacao-administrativa-cognito.md).
