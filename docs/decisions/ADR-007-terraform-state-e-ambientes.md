# ADR-007 — Estratégia de state e isolamento de ambientes no Terraform

**Status:** aceito · **Data:** 2026-08-22

## Contexto

O Terraform é a única fonte de verdade da infraestrutura. Precisamos de `dev` e
`prod` isolados, e de uma estratégia de state que funcione hoje — sem conta AWS
conectada — e depois, com o deploy real.

## Decisão

**Isolamento por diretório raiz, com um módulo de composição.**

```text
environments/dev  ─┐
                   ├─> modules/stack ─> dynamodb, lambda ×2, http-api, admin-auth
environments/prod ─┘
```

Cada ambiente tem state próprio, providers próprios e nomes próprios
(`pontocoleta-dev-*`, `pontocoleta-prod-*`). `modules/stack` garante que os dois
tenham a mesma forma; as diferenças são explícitas e limitadas a durabilidade e
segurança (backups contínuos, deletion protection, retenção de log, MFA e
limites de concorrência em produção).

**State:** local por enquanto, remoto depois.

- Nenhum bloco `backend` está ativo, então `terraform init` funciona sem AWS.
- `environments/*/backend.tf.example` traz o bloco S3 pronto para ser renomeado.
- `infrastructure/terraform/bootstrap/` declara o bucket de state (versionado,
  criptografado, sem acesso público, `prevent_destroy`), **sem ter sido
  aplicado**.
- Usamos `use_lockfile = true` (lock nativo no S3, Terraform 1.10+) em vez de
  uma tabela DynamoDB de lock.

## Alternativas consideradas

- **Terraform workspaces**: um único diretório com `terraform.workspace`.
  Rejeitado porque prod e dev passam a compartilhar backend e configuração, e o
  risco de aplicar no ambiente errado por esquecer um `workspace select` é real.
- **Tabela DynamoDB para lock**: desnecessária desde que o S3 backend ganhou
  lock nativo; seria mais um recurso para criar e pagar.
- **State local permanente**: inviável para produção — perder o arquivo é perder
  o mapeamento da infraestrutura, e não há colaboração possível.
- **Módulo por recurso**: rejeitado; módulos existem aqui só onde há reuso real
  (`lambda`, usado duas vezes) ou agrupamento lógico coeso.

## Consequências

**Positivas**

- `terraform init` e `terraform validate` rodam localmente sem credencial, o que
  torna a infraestrutura verificável desde já.
- Aplicar em dev não pode afetar prod: são states diferentes.
- Migrar para o backend remoto é renomear um arquivo e rodar
  `terraform init -migrate-state`.

**Negativas**

- Duplicação pequena entre `environments/dev` e `environments/prod`
  (providers, variables, outputs). É o preço do isolamento.
- Enquanto o state for local, ele não é compartilhado nem versionado — aceitável
  apenas porque nada foi provisionado ainda.
