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
| `geocoding.request.retrying`    | warn  | 5xx ou erro de rede; uma retentativa a caminho       |
| `geocoding.rate_limit.exhausted`| warn  | a vez da chamada cairia depois do timeout            |
| `geocoding.request.failed`      | warn  | rede/timeout ao geocodificar                        |
| `geocoding.request.rejected`    | warn  | provedor respondeu com erro                         |
| `geocoding.miss.using_client_coordinates` | warn | endereço não encontrado; usadas as do app |
| `metrics.record.failed`         | warn  | contador falhou — a operação seguiu normalmente     |

Stack traces vão para o log; a resposta HTTP nunca os contém.

### Campos da geocodificação

`geocoding.request.completed`, `.failed`, `.rejected` e `.rate_limit.exhausted`
trazem três campos em **toda** chamada, que contam a história da política de uso
descrita em [architecture.md](architecture.md#política-de-uso-do-nominatim):

| Campo      | Significado                                                        |
| ---------- | ------------------------------------------------------------------ |
| `cacheHit` | `true` quando o endereço veio do cache de 1 hora, sem tocar no provedor |
| `waitedMs` | quanto a chamada ficou retida pelo limitador de 1 req/s             |
| `retried`  | `true` quando a resposta exigiu uma segunda tentativa               |

Com `LOG_LEVEL = info` em produção, o `completed` (debug) não aparece: o caminho
feliz é silencioso de propósito. O que sobe para `warn` é o que merece atenção —
retentativa, estouro do limitador e falha. Para medir cache e espera num
diagnóstico, suba o nível para `debug` temporariamente.

Dois sinais e o que significam:

- `geocoding.request.retrying` frequente → o provedor está instável. A pessoa
  não vê erro, mas a latência da busca por endereço dobra.
- `geocoding.rate_limit.exhausted` → mais buscas por endereços distintos do que
  1 req/s por container comporta. Indica que o cache não está ajudando (consultas
  muito dispersas) ou que o volume cresceu. É o gatilho para considerar um
  limitador global.

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

-- pressão sobre a política de uso do provedor
fields @timestamp, message, waitedMs, retried, cacheHit
| filter message like /geocoding/
| stats count() by message, retried
```

## Alarmes

Declarados em `modules/cost-guardrails`. Todos têm um propósito só: avisar que um
dos tetos de custo está sendo alcançado, enquanto ainda é barato. Ver
[ADR-008](decisions/ADR-008-protecao-contra-abuso.md).

| Alarme                          | Métrica                               | Limiar                                      |
| ------------------------------- | ------------------------------------- | ------------------------------------------- |
| `<env>-api-request-flood`       | `AWS/ApiGateway` `Count` (Sum)         | metade do teto de rps, por 5 min            |
| `<env>-public-lambda-concurrency` | `AWS/Lambda` `ConcurrentExecutions` (Max) | 80% da concorrência reservada          |
| `<env>-table-read-capacity`     | `AWS/DynamoDB` `ConsumedReadCapacityUnits` (Sum) | metade do teto de leitura, por 5 min |

Nenhum limiar é um número solto: cada um deriva do teto que o ambiente declara,
então afrouxar um limite move o alarme junto. Em prod isso dá 1.500 requisições
por 5 minutos, 16 execuções concorrentes e 75.000 unidades de leitura por
5 minutos.

Decisões por trás deles:

- **Janela de 5 minutos.** Curta o bastante para pegar abuso sustentado
  enquanto é barato, longa o bastante para que uma rajada isolada não avise
  ninguém.
- **Metade do teto, não o teto.** No teto já houve 429 para gente legítima. A
  metade é o ponto em que ainda há o que fazer, e segue duas ordens de grandeza
  acima do uso plausível.
- **`treat_missing_data = "notBreaching"`.** Sem tráfego não é problema. Um
  alarme que grita com API parada é um alarme que ninguém lê.
- **`ok_actions` só no alarme de requisições**, para fechar o ciclo do evento que
  mais importa: saber que a enxurrada passou.

Destino: um tópico SNS por ambiente, com assinatura de e-mail. **A assinatura
nasce pendente** — a AWS manda um link de confirmação, e até alguém clicar o
alarme dispara sem avisar ninguém. É o primeiro passo após o primeiro apply.

## Orçamento

`aws_budgets_budget` mensal em USD por ambiente (US$ 25 em prod, US$ 5 em dev),
notificando em 50%, 80% e 100% do gasto **real** e em 100% do **previsto**. O
previsto é o que chega cedo o bastante para agir.

O orçamento fala direto com o e-mail, não pelo tópico SNS: um destino SNS exigiria
uma política no tópico autorizando `budgets.amazonaws.com` a publicar, mais peças
móveis para o mesmo e-mail.

Orçamento e alarme respondem perguntas diferentes: o alarme diz **agora** que o
tráfego está anormal; o orçamento diz que o **mês** está caro, inclusive por
motivos que nenhum alarme cobre.

## O que ainda não existe

Alarmes de saúde — taxa de 5xx, throttling do DynamoDB, erros e duração das
Lambdas — ainda não foram declarados. Os desta etapa são de **custo**, não de
saúde: eles avisam que alguém está abusando, não que o produto está quebrado.
Alarme de saúde precisa de linha de base para não ser ruído, e linha de base
exige tráfego real; é a primeira adição recomendada depois do primeiro deploy.

Também não há painel. As consultas do Logs Insights acima cobrem o diagnóstico
pontual; painel só se paga quando alguém olha todo dia.
