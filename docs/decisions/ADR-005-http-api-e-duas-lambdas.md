# ADR-005 — API Gateway HTTP API e duas Lambdas

**Status:** aceito · **Data:** 2026-08-22

## Contexto

A API tem oito rotas, sete públicas e uma administrativa. Era preciso decidir
dois pontos: qual tipo de API Gateway usar e como distribuir as rotas entre
funções Lambda.

## Decisão

**API Gateway HTTP API (v2)**, com um estágio `$default` e `auto_deploy`.

**Duas Lambdas**, cada uma com um roteador interno:

| Função       | Rotas                        | Permissões DynamoDB                              |
| ------------ | ---------------------------- | ------------------------------------------------ |
| `public-api` | `/v1/*` exceto `/v1/admin/*` | GetItem, BatchGetItem, Query, PutItem, UpdateItem |
| `admin-api`  | `/v1/admin/*`                | Query, apenas na tabela                          |

O roteamento interno é feito por um `Router` de ~60 linhas, sem framework HTTP.

## Alternativas consideradas

- **REST API (v1)**: custa cerca de três vezes mais por milhão de requisições e
  exigiria um authorizer Lambda customizado para validar o token do Cognito.
  Só valeria por recursos que este produto não usa (WAF nativo, chaves de API,
  planos de uso).
- **Uma Lambda por rota**: IAM ainda mais granular, mas oito funções para
  gerenciar, oito log groups e oito cold starts distintos em um produto de
  tráfego baixo — onde container reutilizado é justamente o que segura a
  latência.
- **Uma Lambda única para tudo**: mais barato de manter, porém a função pública
  precisaria das permissões da administrativa, e uma falha na parte pública
  alcançaria os dados administrativos.
- **Express/Fastify dentro da Lambda**: peso de cold start e superfície para
  sete rotas sem middleware.

## Consequências

**Positivas**

- Authorizer JWT nativo, sem Lambda extra.
- Privilégio mínimo real: a função administrativa só sabe ler.
- Isolamento de falha entre público e administrativo.
- Bundles pequenos (~350 kB cada, AWS SDK externalizado).

**Negativas**

- O roteador é código nosso: precisa de teste (tem) e a ordem de registro
  importa (`/nearby` antes de `/{id}`), o que está documentado no próprio
  arquivo e coberto por teste.
- HTTP API não oferece validação de requisição no gateway; a validação é toda da
  aplicação (zod na camada de apresentação). Aceitável, e é onde as mensagens em
  português já são produzidas.
