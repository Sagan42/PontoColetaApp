# Terraform

O Terraform é a **única fonte de verdade** da infraestrutura AWS do PontoColeta.
Nenhum recurso deve ser criado ou alterado pelo Console ou pela AWS CLI.

> **Estado atual: nada foi provisionado.** A infraestrutura está escrita,
> formatada, inicializada e validada localmente. `terraform plan` está pendente
> por ausência deliberada de credenciais, e `terraform apply` não deve ser
> executado sem autorização explícita do proprietário.

## Diretórios

```text
infrastructure/terraform/
├── bootstrap/            bucket de state remoto (DECLARADO, NÃO APLICADO)
├── environments/
│   ├── dev/              raiz do ambiente de desenvolvimento
│   └── prod/             raiz do ambiente de produção
└── modules/
    ├── stack/            compõe o ambiente inteiro
    ├── dynamodb/         tabela + GSI1 (status) + GSI2 (geohash, esparso)
    ├── lambda/           função + role + policy mínima + log group
    ├── http-api/         API HTTP + estágio + rotas + integrações + authorizer
    ├── admin-auth/       Cognito user pool + app client
    └── cost-guardrails/  orçamento, tópico SNS e alarmes de abuso
```

Cada ambiente é uma raiz independente, com state próprio
([ADR-007](decisions/ADR-007-terraform-state-e-ambientes.md)). O módulo `stack`
garante que dev e prod tenham a mesma forma.

## Provider

```hcl
terraform { required_version = ">= 1.9.0" }

aws     ~> 6.0    # recursos da AWS
archive ~> 2.7    # empacota o artefato das Lambdas em zip
```

Credenciais **nunca** aparecem em código. O provider as resolve do ambiente ou
de um profile da AWS CLI escolhido por quem opera:

```bash
AWS_PROFILE=pontocoleta-dev terraform plan
```

Não há `data "aws_caller_identity"` nem `data "aws_region"` na configuração:
`terraform validate` funciona sem qualquer contato com a conta AWS. Isso é
intencional e deve ser preservado.

## Módulos

Módulos existem onde há reuso ou agrupamento lógico real. `lambda` é usado duas
vezes; os demais agrupam recursos que só fazem sentido juntos. Não há um módulo
por recurso.

### `dynamodb`

Tabela única, `PAY_PER_REQUEST`, dois GSIs. Ver [dynamodb.md](dynamodb.md).

Não há bloco `server_side_encryption`. A ausência **não** significa tabela sem
criptografia: o DynamoDB cifra tudo em repouso sempre, e omitir o bloco é o
mesmo que `enabled = false` — ambos usam a chave gerenciada pela AWS, sem custo.
`enabled = true` trocaria para uma chave do KMS (`aws/dynamodb`), que é cobrada.
O bloco existia com `enabled = false` e lia como se a criptografia estivesse
desligada; foi removido porque dizia o contrário do que fazia.

> O AWS provider 6.61 marca `hash_key`/`range_key` como deprecados em favor de
> um bloco `key_schema`, mas esse bloco ainda só existe dentro de
> `global_secondary_index`. Enquanto o provider não expuser o substituto no
> nível da tabela, `terraform validate` emite quatro avisos de depreciação. São
> avisos, não erros, e estão documentados no próprio módulo.

### `lambda`

Empacota `backend/dist/lambdas/<nome>/` com `archive_file` e usa
`output_base64sha256` como `source_code_hash`, então o Terraform detecta um novo
artefato automaticamente. Cria a role com política mínima: escrever no próprio
log group e exatamente as ações de DynamoDB declaradas pelo chamador.

### `http-api`

API HTTP v2, estágio `$default` com `auto_deploy`, access logs em JSON com os
mesmos nomes de campo que as Lambdas usam, throttling explícito, integrações
`AWS_PROXY` e authorizer JWT para as rotas administrativas.

### `admin-auth`

User pool sem cadastro público, política de senha forte, MFA configurável, app
client público sem segredo. **O usuário administrador não é criado aqui** —
senha não pertence ao state.

### `cost-guardrails`

Orçamento mensal da AWS, um tópico SNS e três alarmes do CloudWatch. Os limiares
não são números soltos: cada um deriva do teto que o ambiente declara. Ver
[ADR-008](decisions/ADR-008-protecao-contra-abuso.md) e
[observability.md](observability.md#alarmes).

## Dimensionamento dos tetos

A API pública não exige conta nem chave: qualquer pessoa com a URL pode chamá-la,
e todo custo cai na conta do projeto. Os tetos abaixo existem para que o pior
caso seja estimável.

**A conta é sempre a mesma:** requisições por segundo × **2.592.000** segundos no
mês (30 dias).

| Teto                  | req/mês      | API Gateway¹ | Lambda²    |
| --------------------- | ------------ | ------------ | ---------- |
| 50 rps (antes, prod)  | 129.600.000  | ~US$ 130     | ~US$ 240   |
| **10 rps (prod)**     | 25.920.000   | ~US$ 26      | ~US$ 48    |
| **5 rps (dev)**       | 12.960.000   | ~US$ 13      | ~US$ 24    |
| 1 rps (escritas)      | 2.592.000    | ~US$ 3       | ~US$ 5     |

¹ US$ 1,00 por milhão de requisições. ² 512 MB, 200 ms médios.

Para comparar: um app de uma cidade com alguns milhares de usuários ativos fica
na casa de **100.000 requisições por mês**, ou 0,04 rps em média. O teto de
10 rps é cerca de 250 vezes isso — generoso, mas não catastrófico.

### Por que o DynamoDB tem teto próprio

`GET /v1/collection-points/nearby` faz **no mínimo nove `Query`** no `GSI2-geo`,
e a precisão 4 do geohash coloca quase toda Londrina em uma célula. Com mil
pontos cadastrados, uma dessas nove consultas lê ~928 KB e custa ~116 unidades de
leitura; a busca inteira custa praticamente isso.

| Teto de leitura | Custo máximo/mês | Buscas `nearby`/s que permite |
| --------------- | ---------------- | ----------------------------- |
| sem teto        | ilimitado        | ilimitado                     |
| 2.000 RCU/s     | ~US$ 648         | ~17                           |
| **500 (prod)**  | ~US$ 162         | ~4                            |
| **100 (dev)**   | ~US$ 32          | ~1                            |

Consequência deliberada: **sob um laço de busca por proximidade o teto do
DynamoDB corta antes do throttle de 10 rps da API.** As rotas baratas seguem
servindo; a caríssima para de responder. A correção de fundo é a precisão do
geohash, não o teto — ver [dynamodb.md](dynamodb.md).

Escritas: um cadastro é uma transação de três itens (~6 WCU) e um evento de
métrica é 1 WCU. Com as rotas de escrita em 1 rps, o teto de 20 WCU/s tem 3× de
folga e **o limite da API é o que vincula**, não o do DynamoDB.

### O throttle é global, não por IP

Isto é o ponto mais importante desta seção. O throttling do API Gateway — tanto
no v1 quanto no v2 — é **por estágio e por rota, nunca por endereço de origem**.
Quem saturar os 10 rps derruba a API **para todos**: as requisições legítimas
passam a receber 429.

Ou seja, estes tetos trocam **fatura por indisponibilidade**. É uma troca
escolhida, não um efeito colateral: para um produto gratuito mantido por uma
pessoa, uma indisponibilidade temporária é recuperável e uma fatura de quatro
dígitos não é. Rate limit por IP exigiria CloudFront na frente, registrado como
próximo passo na [ADR-008](decisions/ADR-008-protecao-contra-abuso.md).

## Variables

| Variável (stack)                    | Padrão   | Para que serve                                    |
| ----------------------------------- | -------- | ------------------------------------------------- |
| `environment`                       | —        | `dev` ou `prod`; entra no nome de todo recurso     |
| `aws_region`                        | —        | região do ambiente                                 |
| `project_name`                      | `pontocoleta` | prefixo dos nomes                             |
| `log_level`                         | `info`   | nível mínimo dos logs das Lambdas                  |
| `log_retention_days`                | `14`     | retenção dos log groups                            |
| `geocoding_base_url`                | Nominatim| endpoint do provedor de geocodificação             |
| `geocoding_user_agent`              | —        | identificação exigida pela política do provedor    |
| `geocoding_timeout_ms`              | `4000`   | timeout da geocodificação                          |
| `public_lambda_memory_size`         | `512`    | memória da função pública                          |
| `public_lambda_timeout_seconds`     | `8`      | deve ser maior que o timeout da geocodificação     |
| `public_lambda_reserved_concurrency`| `-1`     | teto de concorrência (proteção de custo)           |
| `admin_lambda_memory_size`          | `256`    | memória da função administrativa                   |
| `admin_lambda_timeout_seconds`      | `10`     | timeout da função administrativa                   |
| `admin_lambda_reserved_concurrency` | `-1`     | teto de concorrência                               |
| `api_throttling_rate_limit`         | `20`     | req/s em regime permanente                         |
| `table_max_read_request_units`      | `500`    | teto de leitura do DynamoDB (tabela e índices)      |
| `table_max_write_request_units`     | `20`     | teto de escrita do DynamoDB                        |
| `monthly_budget_usd`                | `20`     | orçamento mensal que dispara notificação           |
| `cost_alert_email`                  | —        | destino das notificações; **sem padrão**            |
| `api_throttling_burst_limit`        | `40`     | pico acima do regime                               |
| `point_in_time_recovery_enabled`    | `false`  | backups contínuos do DynamoDB                      |
| `deletion_protection_enabled`       | `false`  | impede destruir a tabela                           |
| `admin_mfa_configuration`           | `OPTIONAL` | política de MFA do pool                          |
| `cors_allow_origins`                | `[]`     | CORS desligado; abrir origem só para ferramenta local |
| `tags`                              | `{}`     | tags extras                                        |

Diferenças efetivas entre ambientes:

| Ajuste                | dev        | prod       |
| --------------------- | ---------- | ---------- |
| `log_level`           | `debug`    | `info`     |
| `log_retention_days`  | 7          | 30         |
| PITR                  | desligado  | **ligado** |
| Deletion protection   | desligada  | **ligada** |
| MFA administrativo    | `OPTIONAL` | **`ON`**   |
| Throttling            | 5 / 10     | 10 / 30    |
| Throttling de escrita | 1 / 5      | 1 / 5      |
| Teto DynamoDB (R/W)   | 100 / 10   | 500 / 20   |
| Concorrência reservada| 5 / 1      | 20 / 2     |
| Orçamento mensal      | US$ 5      | US$ 25     |

## Outputs

| Output               | Para que serve                                              |
| -------------------- | ----------------------------------------------------------- |
| `api_endpoint`       | valor de `EXPO_PUBLIC_API_URL` no app                        |
| `table_name`         | nome da tabela do ambiente                                   |
| `admin_user_pool_id` | onde criar a conta administrativa                            |
| `admin_client_id`    | valor de `EXPO_PUBLIC_COGNITO_CLIENT_ID` no app              |
| `log_groups`         | log groups a inspecionar em um diagnóstico                   |
| `cost_guardrails`    | orçamento, tópico de alerta e limiar de cada alarme          |

`modules/stack` também expõe `lambda_package_sizes_bytes`, útil para perceber
crescimento indevido do bundle.

## State

Hoje: **local**, porque não há conta conectada e nada foi aplicado.

Depois: **S3**, com lock nativo do próprio bucket (`use_lockfile = true`,
Terraform ≥ 1.10) — não é preciso tabela DynamoDB de lock.

Nunca versionar: `.terraform/`, `*.tfstate`, `*.tfstate.*`, `*.tfvars`,
`crash.log`. O `.gitignore` da raiz já cobre. `*.tfvars.example` e
`.terraform.lock.hcl` **devem** ser versionados.

### Migrar para o backend remoto (etapa futura)

1. Aplicar `infrastructure/terraform/bootstrap/` (cria o bucket versionado,
   criptografado, sem acesso público, com `prevent_destroy`).
2. Renomear `environments/<env>/backend.tf.example` para `backend.tf` e
   substituir `<account-id>` no nome do bucket.
3. `terraform init -migrate-state`.
4. Conferir que o state subiu e remover o `terraform.tfstate` local.

Isolamento: uma key por ambiente (`dev/terraform.tfstate`,
`prod/terraform.tfstate`) no mesmo bucket. Proteção: versionamento do bucket
(recuperação de state corrompido), criptografia em repouso, bloqueio total de
acesso público e `prevent_destroy` no recurso.

## Comandos

### Hoje (sem conta AWS)

```bash
cd infrastructure/terraform
terraform fmt -recursive -check          # formatação

cd environments/dev
terraform init                            # baixa providers, sem credenciais
terraform validate                        # valida a configuração
```

O mesmo vale para `environments/prod` e `bootstrap/`.

### No CI

`.github/workflows/verify.yml` roda exatamente os dois comandos acima, em
`push` e em pull request, num job separado do job de Node:

```yaml
terraform fmt -recursive -check          # em infrastructure/terraform
terraform init -backend=false            # em environments/{dev,prod}
terraform validate
```

`-backend=false` instala providers e módulos sem ler o backend, então o job
**não precisa de credencial AWS** — o que só funciona porque a configuração não
tem `data "aws_caller_identity"` nem `data "aws_region"`. Preservar isso é o que
mantém a infraestrutura verificável no CI.

O workflow **não** executa `plan`, `apply` nem `destroy`, e não tem nenhum passo
de credencial. O primeiro `apply` continua sendo manual e autorizado pelo
proprietário.

### Futuro (após conectar a conta)

```bash
# 1. construir o artefato das Lambdas — o Terraform não compila TypeScript
npm --prefix backend run build

# 2. conferir a identidade AWS antes de qualquer coisa
aws sts get-caller-identity --profile <profile>

# 3. planejar
cd infrastructure/terraform/environments/dev
terraform plan -out=tfplan

# 4. revisar o plan e só então aplicar
terraform apply tfplan
```

> **`terraform apply` não deve ser executado nesta etapa.** O primeiro deploy
> depende de revisão do plan e autorização explícita do proprietário.

## Troubleshooting

| Sintoma                                                          | Causa provável                                   | O que fazer                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `archive_file`: `source_dir` não existe                          | backend não foi construído                       | `npm --prefix backend run build`                               |
| `NoCredentialProviders` / `ExpiredToken` no `plan`               | sem credenciais ou sessão vencida                | configurar profile/SSO **quando o proprietário autorizar**     |
| Avisos `range_key is deprecated`                                 | provider 6.61 sem substituto no nível da tabela  | ignorar; documentado no módulo `dynamodb`                       |
| `Error acquiring the state lock`                                 | outra execução em andamento ou lock órfão        | aguardar; em último caso `terraform force-unlock <id>`         |
| Lambda não atualiza após mudar o código                          | artefato não reconstruído antes do `plan`        | rodar o build e planejar de novo                               |
| `terraform plan` mostra mudança em recurso que ninguém tocou     | drift (alteração manual no Console)              | ver abaixo                                                     |

## Drift

Drift é qualquer diferença entre o que o Terraform declara e o que existe na
AWS — normalmente causada por alteração manual no Console.

Detectar:

```bash
terraform plan -detailed-exitcode
# 0 = sem mudanças · 1 = erro · 2 = há diferenças
```

Corrigir: preferir **ajustar o código** e reaplicar, de modo que o Terraform
volte a ser a verdade. `terraform import` só faz sentido para trazer um recurso
pré-existente para o state, e não deve ser usado nesta etapa.

A melhor prevenção é não alterar nada pelo Console: quem precisa de uma mudança,
muda o `.tf`.
