# PontoColeta

Aplicativo mobile para encontrar locais adequados ao descarte de materiais
especiais em **Londrina** e para cadastrar novos pontos de coleta. Simples, útil
e confiável.

Relacionado aos Objetivos de Desenvolvimento Sustentável **ODS 11** (Cidades e
Comunidades Sustentáveis) e **ODS 12** (Consumo e Produção Responsáveis).

> **Nenhum recurso AWS é provisionado automaticamente.**
> A infraestrutura está escrita, formatada, inicializada e validada localmente
> em Terraform, mas **não foi aplicada**. `terraform apply` só deve ser
> executado após revisão do plan e autorização explícita do proprietário.
> Ver [docs/deployment.md](docs/deployment.md).

## O que o app faz

**Para quem procura**

- Buscar por **endereço**: digite onde você está, sem precisar de GPS.
- Buscar por **material**, como "Pilhas", "Óleo de cozinha" ou "Lâmpadas". A
  busca entende acento, caixa e espaçamento.
- Ver os resultados em **lista** ou no **mapa**, alternando livremente.
- Abrir os **detalhes**: endereço, materiais aceitos, horário, observações e
  localização.

**Para quem contribui**

- **Cadastrar um ponto** sem criar conta. O backend confirma o endereço e é a
  fonte de verdade das coordenadas.

**Para quem mantém**

- Uma **área administrativa** com as métricas de uso: acessos, consultas,
  cadastros e sua evolução no tempo. Nada além disso.

## Stack

| Camada          | Tecnologia                                                     |
| --------------- | -------------------------------------------------------------- |
| Mobile          | React Native + Expo (SDK 57) + TypeScript estrito, Expo Router |
| Estado remoto   | TanStack Query                                                 |
| Mapa            | react-native-maps (Google Maps no Android)                     |
| Backend         | Node.js 22 + TypeScript, AWS Lambda (arm64)                    |
| API             | Amazon API Gateway HTTP API v2                                 |
| Persistência    | Amazon DynamoDB (tabela única)                                 |
| Autenticação    | Amazon Cognito (somente administrativo)                        |
| Geocodificação  | Nominatim / OpenStreetMap                                      |
| Observabilidade | Amazon CloudWatch Logs                                         |
| Infraestrutura  | Terraform (única fonte de verdade)                             |
| Build Lambda    | esbuild                                                        |
| Testes          | Vitest (backend), Jest + RNTL (mobile)                         |
| Anúncios        | Google AdMob (banner discreto, isolado em um componente)       |

## Arquitetura

```text
Pessoa
  |
  v
PontoColeta app (React Native + Expo)
  |  HTTPS
  v
Amazon API Gateway (HTTP API v2)
  |
  v
AWS Lambda (public-api, admin-api)
  |
  v
Application (casos de uso)
  |
  v
Domain / portas de repositório
  |
  v
Amazon DynamoDB
```

São duas funções Lambda. `public-api` e `admin-api` são os nomes dos handlers e
dos bundles; na AWS elas recebem o prefixo do projeto e do ambiente, como em
`pontocoleta-dev-public-api`.

O backend segue **DDD pragmático**: Domain, Application, Infrastructure e
Presentation, organizados por módulo de negócio. O domínio não conhece AWS,
HTTP, Terraform nem React Native.

Detalhes em [docs/architecture.md](docs/architecture.md) e
[docs/domain.md](docs/domain.md).

## Estrutura

```text
/
├── mobile/                   app Expo (telas, design system, features)
├── backend/                  Lambdas, domínio, casos de uso, repositórios
├── infrastructure/terraform/ toda a infraestrutura AWS (não aplicada)
├── docs/                     documentação e ADRs
├── README.md
└── package.json              scripts que orquestram os dois projetos
```

## Pré-requisitos

| Ferramenta           | Versão                             | Para quê                         |
| -------------------- | ---------------------------------- | -------------------------------- |
| Git                  | recente                            | clonar o repositório             |
| Node.js              | LTS >= 22                          | backend e mobile                 |
| npm                  | 10+                                | dependências                     |
| Terraform CLI        | >= 1.9 (1.10+ para o state remoto) | validar a infraestrutura         |
| AWS CLI v2           | 2.x                                | apenas na etapa futura de deploy |
| Android Studio + SDK | recente                            | emulador ou dispositivo          |
| JDK                  | 17                                 | build Android nativo             |
| EAS CLI              | recente                            | builds na nuvem                  |

Docker não é necessário. AWS SAM CLI não faz parte do projeto.

```bash
git --version && node --version && npm --version
terraform --version && aws --version && java --version && adb --version
```

O comando `aws sts get-caller-identity` não é pré-requisito desta fase. Ele
entra quando a conta AWS for conectada.

## Instalação

```bash
git clone <url-do-repositorio>
cd PontoColetaApp
npm run install:all
cp mobile/.env.example mobile/.env
```

## Backend

```bash
cd backend
npm run lint          # ESLint type-aware
npm run typecheck     # TypeScript estrito
npm test              # 161 testes, sem AWS
npm run build         # artefatos em dist/lambdas/
npm run verify        # tudo acima
```

## Mobile

```bash
cd mobile
npm start                 # Metro
npm run lint
npm run typecheck
npm test                  # 37 testes
npm run assets:generate   # regenera ícone, splash e logo
```

O app **roda no Expo Go**: o slot de anúncio não renderiza nada sem o módulo
nativo e o mapa tem fallback para a lista. Para o app completo, com AdMob e mapa
garantido, use uma development build, conforme
[docs/local-development.md](docs/local-development.md).

## Testes, lint e typecheck

Da raiz, para os dois projetos de uma vez:

```bash
npm test
npm run lint
npm run typecheck
npm run verify        # lint + typecheck + testes + build do backend
```

| Suíte   | Testes |
| ------- | ------ |
| Backend | 161    |
| Mobile  | 37     |

Nenhum teste precisa de conta AWS, LocalStack ou DynamoDB Local.
Ver [docs/testing.md](docs/testing.md).

## Terraform

```bash
cd infrastructure/terraform
terraform fmt -recursive -check

cd environments/dev
terraform init         # baixa providers; não usa credenciais
terraform validate
```

O comando `terraform plan` está **pendente** para a etapa de conexão com a AWS.
`terraform apply` e `terraform destroy` **não devem ser executados** agora.

Ver [docs/terraform.md](docs/terraform.md).

## Build e deploy

O deploy não faz parte desta etapa. Quando for autorizado, a ordem é:

1. Configurar a autenticação AWS.
2. Validar a identidade com `aws sts get-caller-identity`.
3. Construir o backend com `npm --prefix backend run verify`.
4. Rodar `terraform init`, `fmt -check` e `validate`.
5. Gerar o plan com `terraform plan -out=tfplan`.
6. Revisar o plan.
7. Aplicar com `terraform apply tfplan`, após autorização explícita.

O passo a passo completo está em [docs/deployment.md](docs/deployment.md), e o
build Android em [docs/play-store.md](docs/play-store.md).

## Segurança e privacidade

- HTTPS em todo o tráfego; o app **nunca** fala com o DynamoDB diretamente.
- Validação no backend, que é a fonte de verdade. O frontend não é camada de
  segurança.
- IAM com privilégio mínimo; a função administrativa só sabe ler.
- Segredos fora do Git; configuração por ambiente; `dev` e `prod` isolados.
- Área administrativa protegida por autenticação real, não por rota escondida.
- Limite de payload (16 KB), throttling na API, erros sem stack trace.
- **Usuário comum não tem conta e não é identificado.** GPS não é solicitado nem
  usado; as permissões de localização estão bloqueadas.
- Métricas são apenas contadores agregados por dia. Nenhum evento individual é
  armazenado.

Ver [docs/privacy.md](docs/privacy.md).

## Documentação

| Documento                                                 | Conteúdo                                               |
| --------------------------------------------------------- | ------------------------------------------------------ |
| [architecture.md](docs/architecture.md)                   | camadas, módulos, fluxos, diagramas                    |
| [domain.md](docs/domain.md)                               | linguagem ubíqua, agregados, invariantes, casos de uso |
| [api.md](docs/api.md) e [openapi.yaml](docs/openapi.yaml) | endpoints, contratos, erros                            |
| [dynamodb.md](docs/dynamodb.md)                           | modelagem, índices, access patterns, geohash           |
| [local-development.md](docs/local-development.md)         | como rodar tudo sem AWS                                |
| [deployment.md](docs/deployment.md)                       | processo futuro de deploy                              |
| [terraform.md](docs/terraform.md)                         | módulos, variáveis, state, drift                       |
| [testing.md](docs/testing.md)                             | estratégia, dublês, limitações                         |
| [observability.md](docs/observability.md)                 | logs estruturados, diagnóstico                         |
| [metrics.md](docs/metrics.md)                             | eventos, agregação, interpretação                      |
| [privacy.md](docs/privacy.md)                             | o que é e o que não é coletado                         |
| [play-store.md](docs/play-store.md)                       | Android, AAB, EAS, ficha da loja                       |
| [decisions/](docs/decisions/)                             | ADRs                                                   |

### Decisões arquiteturais

| ADR                                                                      | Assunto                                  |
| ------------------------------------------------------------------------ | ---------------------------------------- |
| [ADR-001](docs/decisions/ADR-001-ddd-pragmatico.md)                      | DDD pragmático                           |
| [ADR-002](docs/decisions/ADR-002-dynamodb-single-table-e-proximidade.md) | Single-table, itens auxiliares e geohash |
| [ADR-003](docs/decisions/ADR-003-autenticacao-administrativa-cognito.md) | Cognito para o acesso administrativo     |
| [ADR-004](docs/decisions/ADR-004-geocodificacao-nominatim.md)            | Nominatim como geocodificador            |
| [ADR-005](docs/decisions/ADR-005-http-api-e-duas-lambdas.md)             | HTTP API e duas Lambdas                  |
| [ADR-006](docs/decisions/ADR-006-esbuild-para-empacotar-lambdas.md)      | esbuild para empacotar                   |
| [ADR-007](docs/decisions/ADR-007-terraform-state-e-ambientes.md)         | State do Terraform e ambientes           |

## Fora do escopo

Login de usuário comum, perfil, rede social, chat, comentários, avaliações,
favoritos, gamificação, pagamentos, notificações push, recomendação por IA,
dashboard corporativo, CMS, gestão avançada de pontos e GPS obrigatório.

A pergunta que orienta qualquer adição:

> Isso ajuda uma pessoa em Londrina a encontrar ou cadastrar facilmente um local
> adequado para descarte?

## Licença

MIT.
