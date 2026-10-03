# Observabilidade

Ferramenta única: **Amazon CloudWatch Logs**. Nada além disso é provisionado —
métricas de negócio ficam no DynamoDB ([metrics.md](metrics.md)), e observabilidade
paga (X-Ray, dashboards, alarmes elaborados) não se justifica no volume atual.

## Log estruturado

Uma linha JSON por evento, com envelope fixo
(`shared/infrastructure/logging/structured-logger.ts`):

```json
{
  "level": "info",
  "message": "request.completed",
  "timestamp": "2026-08-22T12:00:00.000Z",
  "environment": "prod",
  "requestId": "8f1c0f6e-…",
  "correlationId": "app-m0x1-9fkq2b",
  "operation": "GET /v1/collection-points/nearby",
  "status": 200,
  "durationMs": 143
}
```

| Campo           | Quando aparece                                   |
| --------------- | ------------------------------------------------ |
| `level`         | sempre                                           |
| `message`       | sempre — nome do evento, não frase livre          |
| `timestamp`     | sempre                                           |
| `environment`   | sempre                                           |
| `requestId`     | toda requisição HTTP                             |
| `correlationId` | toda requisição; vem do app quando ele o envia   |
| `operation`     | requisições e operações de dependência            |
| `status`        | respostas HTTP                                   |
| `durationMs`    | requisições e chamadas externas                  |
| `errorType`     | falhas                                           |

`LOG_LEVEL` é `debug` em dev e `info` em prod.

### Correlation ID

O app gera um `x-correlation-id` por requisição; o adapter o adota (ou usa o
`requestId` do API Gateway como alternativa) e o injeta no logger filho. Uma ação
relatada por alguém pode assim ser seguida do app até o log da Lambda.

### O que nunca é registrado

```text
senhas · tokens · segredos · credenciais
dados que identifiquem quem consulta, busca ou cadastra
corpo de requisição
```

`console.log` direto é **proibido por lint** (`no-console: error`); a única
exceção configurada é o próprio logger.

## Eventos emitidos

| Evento                          | Nível | Significado                                        |
| ------------------------------- | ----- | -------------------------------------------------- |
| `request.completed`             | info  | uma invocação terminou (sempre emitido)             |
| `request.rejected`              | warn  | erro de domínio → 4xx                               |
| `request.unauthorized`          | warn  | 401/403 na área administrativa                      |
| `request.failed`                | error | erro inesperado → 500, com tipo, mensagem e stack   |
| `geocoding.request.completed`   | debug | geocodificação bem-sucedida, com duração             |
| `geocoding.request.failed`      | warn  | rede/timeout ao geocodificar                        |
| `geocoding.request.rejected`    | warn  | provedor respondeu com erro                         |
| `geocoding.miss.using_client_coordinates` | warn | endereço não encontrado; usadas as do app |
| `metrics.record.failed`         | warn  | contador falhou — a operação seguiu normalmente     |

Stack traces vão para o log; a resposta HTTP nunca os contém.

## Log groups

| Grupo                                       | Conteúdo                       | Retenção dev/prod |
| ------------------------------------------- | ------------------------------ | ----------------- |
| `/aws/lambda/pontocoleta-<env>-public-api`  | logs da API pública            | 7 / 30 dias       |
| `/aws/lambda/pontocoleta-<env>-admin-api`   | logs da API administrativa     | 7 / 30 dias       |
| `/aws/apigateway/pontocoleta-<env>`         | uma linha por requisição HTTP  | 7 / 30 dias       |

Os access logs do API Gateway usam os **mesmos nomes de campo** das Lambdas
(`requestId`, `status`, `durationMs`), então uma consulta funciona nos dois.

Retenção é o custo recorrente principal da observabilidade aqui; por isso é
explícita e curta.

## Diagnóstico

Roteiro para "alguém relatou que a busca falhou":

1. Se houver `requestId` (a resposta de erro sempre traz um), procure por ele.
2. Sem `requestId`, filtre por `operation` e janela de tempo.
3. `request.failed` traz `errorType` e stack.
4. `geocoding.*` diz se o problema veio do provedor externo.
5. Se o log não mostrar nada, o erro pode ter sido antes da Lambda — verifique o
   access log do API Gateway (throttling aparece como 429).

### Comandos (etapa futura — não executados agora)

```bash
# funções e tabelas do ambiente
aws lambda list-functions --profile <profile>
aws dynamodb list-tables --profile <profile>

# acompanhar em tempo real
aws logs tail /aws/lambda/pontocoleta-dev-public-api --follow --profile <profile>

# erros da última hora
aws logs filter-log-events \
  --log-group-name /aws/lambda/pontocoleta-dev-public-api \
  --filter-pattern '{ $.level = "error" }' \
  --start-time $(($(date +%s) - 3600))000 \
  --profile <profile>

# seguir uma requisição específica
aws logs filter-log-events \
  --log-group-name /aws/lambda/pontocoleta-dev-public-api \
  --filter-pattern '{ $.requestId = "8f1c0f6e-…" }' \
  --profile <profile>
```

### Logs Insights

```sql
-- requisições mais lentas
fields @timestamp, operation, status, durationMs
| filter ispresent(durationMs)
| sort durationMs desc
| limit 20

-- erros por tipo
fields errorType
| filter level = "error"
| stats count() by errorType

-- saúde da geocodificação
fields @timestamp, message, durationMs
| filter message like /geocoding/
| stats count() by message
```

## O que ainda não existe

Alarmes do CloudWatch (taxa de 5xx, throttling do DynamoDB, erros de Lambda) não
foram declarados. Fazem sentido depois do primeiro deploy, quando houver linha de
base — criar alarme sem tráfego real só produz ruído. É a primeira adição
recomendada em observabilidade.
