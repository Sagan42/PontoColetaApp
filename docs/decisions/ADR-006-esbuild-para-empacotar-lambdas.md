# ADR-006 — esbuild para empacotar as Lambdas

**Status:** aceito · **Data:** 2026-08-22

## Contexto

Terraform não compila TypeScript. Era preciso um passo de build que produzisse
um artefato por função, pequeno e reprodutível, que o Terraform pudesse
empacotar e cujo hash mudasse quando o código mudasse.

Ferramentas SAM/CDK/Serverless Framework estão fora do escopo por decisão do
projeto.

## Decisão

Usar **esbuild**, chamado por `backend/scripts/build.mjs`:

- um diretório por função em `dist/lambdas/<nome>/index.mjs`;
- formato ESM, target `node22`, `minify`, sem sourcemap em produção;
- `@aws-sdk/*` marcado como **external**, porque o runtime `nodejs22.x` já traz
  o AWS SDK v3;
- o Terraform usa `data "archive_file"` sobre esse diretório e
  `source_code_hash = output_base64sha256`, de modo que um novo artefato é
  detectado automaticamente no `plan`.

## Alternativas consideradas

- **`tsc` puro + `node_modules` no zip**: artefato dezenas de vezes maior, cold
  start pior e nenhum tree-shaking.
- **Webpack/Rollup**: configuração maior para o mesmo resultado.
- **`aws_lambda_function` com `s3_bucket`**: exigiria bucket de artefatos e um
  passo de upload — recurso e complexidade a mais para pacotes de ~350 kB, que
  cabem folgadamente no limite de upload direto (50 MB).
- **SAM / CDK / Serverless Framework**: fora do escopo; duplicariam a
  representação da infraestrutura que o Terraform já é dono.

## Consequências

**Positivas**

- Build de ~1 s, artefatos de ~350 kB.
- Terraform detecta mudança de código sem versionamento manual.
- Nenhuma ferramenta de infraestrutura concorrente com o Terraform.

**Negativas**

- Marcar `@aws-sdk/*` como externo amarra o projeto à versão do SDK que a AWS
  embarca no runtime. É a prática recomendada pela AWS, mas exige atenção quando
  o runtime for atualizado.
- `npm run build` precisa rodar antes de `terraform plan`; se o diretório não
  existir, o `archive_file` falha no plan. Está documentado no fluxo de deploy.
