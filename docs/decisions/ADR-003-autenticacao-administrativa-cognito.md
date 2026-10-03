# ADR-003 — Amazon Cognito para o único acesso administrativo

**Status:** aceito · **Data:** 2026-08-22

## Contexto

Usuários comuns não têm conta: consultar, buscar, ver detalhes e cadastrar são
fluxos públicos. Só a área de métricas precisa de autenticação, e existe **um**
acesso administrativo, destinado aos responsáveis pelo projeto.

O mecanismo não estava definido e o repositório não tinha decisão anterior.

## Decisão

Usar **Amazon Cognito User Pool** com um app client público, e proteger as rotas
`/v1/admin/*` com o **authorizer JWT nativo do API Gateway HTTP API**.

- O app faz `InitiateAuth` (`USER_PASSWORD_AUTH`) direto no endpoint HTTPS do
  Cognito, sem SDK, e recebe um `IdToken`.
- O token vai no header `Authorization: Bearer <token>`.
- O API Gateway valida assinatura, emissor, audiência e validade **antes** de
  invocar a Lambda.
- A Lambda administrativa revalida a presença do claim `sub` — defesa em
  profundidade caso uma rota seja publicada sem authorizer por engano.
- O usuário administrador **não** é criado pelo Terraform: senha não pertence
  ao state. É um `aws cognito-idp admin-create-user` único, documentado em
  `docs/deployment.md`.
- O pool tem `allow_admin_create_user_only = true`: não existe cadastro público.
- Em produção, `mfa_configuration = "ON"`.

## Alternativas consideradas

- **Escrever autenticação própria** (hash de senha, emissão de JWT): descartado
  explicitamente pelo escopo, e seria a parte mais arriscada do projeto.
- **Chave estática/API key no app**: um APK é público; a chave vazaria no
  primeiro `unzip`.
- **Lambda authorizer customizado**: uma Lambda a mais para fazer o que o
  authorizer nativo já faz de graça.
- **Auth0 / Firebase Auth**: gerenciados e bons, mas adicionam um fornecedor
  fora da AWS para atender um único usuário.

## Consequências

**Positivas**

- Nenhuma linha de código de senha no projeto.
- Requisição não autenticada é rejeitada no API Gateway, sem custo de Lambda.
- Grátis nesta escala (um usuário, muito abaixo do free tier).
- Suporta MFA sem trabalho adicional.

**Negativas**

- `USER_PASSWORD_AUTH` envia a senha ao Cognito (sobre TLS) em vez de usar SRP.
  Aceito: evita uma dependência criptográfica no app, e o escopo é um usuário.
- Desafios do Cognito (troca de senha obrigatória, MFA) não são tratados dentro
  do app: a tela orienta a concluir a etapa no console. Tratar todos os desafios
  seria construir um fluxo de autenticação completo para um usuário.
- A sessão vive apenas em memória: fechar o app exige novo login. Guardar token
  em disco exigiria armazenamento seguro para benefício pequeno.
