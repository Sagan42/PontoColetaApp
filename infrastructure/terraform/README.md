# Infraestrutura — Terraform

Terraform é a única fonte de verdade da infraestrutura AWS do PontoColeta.

> **Nada aqui foi provisionado.** A configuração está escrita, formatada,
> inicializada e validada localmente. `terraform apply` depende de autorização
> explícita do proprietário.

A documentação completa — variáveis, outputs, state, backend remoto,
troubleshooting e drift — está em [`docs/terraform.md`](../../docs/terraform.md).
O fluxo do primeiro deploy está em
[`docs/deployment.md`](../../docs/deployment.md).

## Estrutura

```text
bootstrap/       bucket de state remoto (declarado, não aplicado)
environments/
  dev/           raiz do ambiente de desenvolvimento
  prod/          raiz do ambiente de produção
modules/
  stack/         compõe um ambiente inteiro
  dynamodb/      tabela + GSI1 (status) + GSI2 (geohash, esparso)
  lambda/        função + role + policy mínima + log group
  http-api/      API HTTP + estágio + rotas + authorizer JWT
  admin-auth/    Cognito user pool + app client
```

## Validação local (não toca na AWS)

```bash
terraform fmt -recursive -check

cd environments/dev
terraform init
terraform validate
```

`terraform init` baixa apenas os providers do registry; nenhuma credencial é
necessária ou solicitada.

## Antes de qualquer `plan` futuro

O Terraform não compila TypeScript. Construa o artefato das Lambdas primeiro:

```bash
npm --prefix ../../backend run build
```

## Proibido nesta etapa

```text
terraform apply
terraform destroy
terraform import
terraform state rm | mv | push
```
