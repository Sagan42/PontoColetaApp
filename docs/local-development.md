# Desenvolvimento local

Nada aqui exige conta AWS. Backend, domínio, testes e validação do Terraform
rodam offline.

## Pré-requisitos

| Ferramenta            | Versão            | Necessário para                       |
| --------------------- | ----------------- | ------------------------------------- |
| Git                   | qualquer recente  | clonar o repositório                  |
| Node.js               | LTS ≥ 22          | backend e mobile                      |
| npm                   | 10+               | dependências                          |
| Terraform CLI         | ≥ 1.9 (1.10+ para lock nativo) | validar a infraestrutura |
| AWS CLI v2            | 2.x               | apenas na etapa futura de deploy      |
| Android Studio + SDK  | recente           | emulador ou dispositivo Android       |
| JDK                   | 17                | build Android nativo                  |
| EAS CLI               | recente           | apenas para builds na nuvem           |

Docker **não** é necessário. AWS SAM CLI **não** faz parte deste projeto.

Conferir:

```bash
git --version
node --version
npm --version
terraform --version
aws --version
java --version
adb --version
```

`aws sts get-caller-identity` **não** é pré-requisito desta fase. Ele só entra
quando o proprietário decidir conectar a conta AWS — ver
[deployment.md](deployment.md).

## Clonar e instalar

```bash
git clone <url-do-repositorio>
cd PontoColetaApp
npm run install:all
```

Isso instala `backend/` e `mobile/` separadamente — não há workspace único, para
manter o resolver do Metro simples.

Se o npm bloquear scripts de instalação, aprove os necessários:

```bash
npm --prefix backend install-scripts approve esbuild
```

## Variáveis de ambiente

**Mobile** — copie e ajuste:

```bash
cp mobile/.env.example mobile/.env
```

| Variável                          | Uso                                                            |
| --------------------------------- | -------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`             | `http://10.0.2.2:3000` para o emulador Android falar com o host |
| `EXPO_PUBLIC_COGNITO_REGION`      | região do user pool (etapa futura)                             |
| `EXPO_PUBLIC_COGNITO_CLIENT_ID`   | output `admin_client_id` (etapa futura)                        |
| `EXPO_PUBLIC_ADS_ENABLED`         | mantenha `false` em desenvolvimento                            |
| `EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID`| unidade de **teste** do Google                                 |

Tudo que começa com `EXPO_PUBLIC_` é embutido no bundle e, portanto, público.
Segredo nenhum entra aí.

**Backend** — as variáveis são injetadas pelo Terraform em produção
(`TABLE_NAME`, `LOG_LEVEL`, `GEOCODING_*`). Localmente elas só são necessárias
se você executar um handler de verdade, o que não é preciso para os testes.

## Backend

```bash
cd backend

npm run lint         # ESLint com regras type-aware
npm run typecheck    # TypeScript estrito
npm test             # 161 testes, sem AWS
npm run build        # artefatos das Lambdas em dist/lambdas/
npm run verify       # os quatro acima, em sequência
```

Os testes cobrem domínio, casos de uso, mapeamento DynamoDB, geocodificação
(fetch mockado), roteador, tradução de erros e as rotas ponta a ponta contra
adaptadores em memória. Nenhum deles precisa de credencial, LocalStack ou
DynamoDB Local — ver [testing.md](testing.md).

## Mobile

```bash
cd mobile

npm start            # Metro; a ver Expo Go vs development build abaixo
npm run lint
npm run typecheck
npm test             # 37 testes de componentes e formulários
npm run assets:generate   # regenera ícone, splash e logo a partir da geometria
```

### Expo Go ou development build?

| Recurso                  | Expo Go | Development build |
| ------------------------ | ------- | ----------------- |
| Home, busca, lista, detalhes, cadastro | sim | sim |
| Mapa (`react-native-maps`) | depende da versão do Expo Go | sim |
| AdMob                    | **não** | sim               |

O app foi escrito para degradar com elegância: `BannerAdSlot` não renderiza nada
quando o módulo nativo não existe, e o mapa tem um error boundary que orienta a
usar a lista. Ou seja, o app **inicia e funciona no Expo Go** mesmo sem esses
módulos.

Para o app completo:

```bash
npx expo install expo-dev-client
npx eas build --profile development --platform android
```

### Emulador Android

`EXPO_PUBLIC_API_URL=http://10.0.2.2:3000` — `10.0.2.2` é como o emulador enxerga
o `localhost` da máquina. Em dispositivo físico, use o IP da máquina na rede
local.

O mapa precisa de uma chave do Google Maps para Android
(`android.config.googleMaps.apiKey` em `app.json`, hoje um placeholder) e de uma
imagem de emulador **com Google Play Services**.

## Terraform local

```bash
cd infrastructure/terraform
terraform fmt -recursive -check

cd environments/dev
terraform init        # só baixa providers do registry
terraform validate
```

`terraform init` e `terraform validate` funcionam **sem credencial AWS** — a
configuração evita de propósito data sources que exijam a conta.

`terraform plan` está pendente para a etapa de conexão com a AWS. `apply` e
`destroy` não devem ser executados.

## Verificação completa

Da raiz:

```bash
npm run verify
```

Roda lint, typecheck, testes dos dois projetos e o build do backend.
