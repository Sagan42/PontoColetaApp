# Google Play Store

Estado: o projeto está **preparado** para build e publicação Android. Nenhuma
build foi gerada e nenhuma conta foi configurada — isso depende do proprietário.

## Já preparado

| Item                        | Onde                                          | Valor                                             |
| --------------------------- | --------------------------------------------- | ------------------------------------------------- |
| Application ID              | `app.json` → `android.package`                | `app.pontocoleta`                                 |
| Nome do app                 | `app.json` → `name`                           | PontoColeta                                       |
| Versão visível              | `app.json` → `version`                        | `1.0.0`                                           |
| `versionCode`               | `app.json` → `android.versionCode`            | `1` (auto-incrementado no perfil de produção)     |
| Ícone                       | `assets/icon.png`                             | 1024×1024, gerado por script                      |
| Ícone adaptativo            | `assets/adaptive-icon.png` + `backgroundColor`| foreground transparente na zona segura            |
| Splash                      | plugin `expo-splash-screen`                   | marca sobre `#F4F8F5`                             |
| Permissões                  | `app.json` → `android.permissions`            | `INTERNET`, `ACCESS_NETWORK_STATE`                |
| Permissões bloqueadas       | `android.blockedPermissions`                  | localização fina e grosseira                      |
| Perfis de build             | `eas.json`                                    | development, preview (APK), production (**AAB**)  |
| Configuração do AdMob       | `app.json` → `react-native-google-mobile-ads` | App ID **de teste** do Google                     |
| Chave do Google Maps        | `app.json` → `android.config.googleMaps`      | **placeholder**                                   |
| Base da política de privacidade | [`privacy.md`](privacy.md)                | conteúdo pronto para publicar                     |

### Assets da identidade

Ícone, ícone adaptativo, splash, logo e favicon são **gerados por código**
(`mobile/scripts/generate-assets.mjs`), a partir da mesma geometria e da mesma
paleta dos tokens do design system. A marca é um pino de mapa — "um lugar" — com
uma folha dentro — "para quê". Regenerar:

```bash
npm --prefix mobile run assets:generate
```

O SVG equivalente, fonte de verdade vetorial, está em `docs/brand/logo.svg`.

## Depende do proprietário

| Item                                   | Por quê                                            |
| -------------------------------------- | -------------------------------------------------- |
| Conta do Google Play Console (US$ 25)  | pagamento e identidade do titular                  |
| `extra.eas.projectId`                  | criado por `eas init` na conta Expo do proprietário |
| Chave do Google Maps para Android      | exige projeto no Google Cloud                      |
| App ID e unidade de banner reais do AdMob | exigem conta AdMob                              |
| Keystore de upload                     | gerado e guardado pelo EAS ou pelo proprietário     |
| URL pública da política de privacidade | exige domínio                                      |
| Textos, capturas de tela e feature graphic | conteúdo da ficha                              |
| Preenchimento do Data Safety           | declaração formal do titular                       |

## Fluxo de build

Pré-requisitos: `npm i -g eas-cli` e `eas login`.

```bash
cd mobile
eas init                    # cria o projectId na conta do proprietário
```

**Testar em dispositivo (APK):**

```bash
npm run build:android:preview
```

**Publicar (AAB):**

```bash
npm run build:android:production
```

O perfil `production` do `eas.json` gera **Android App Bundle**, formato exigido
pela Play Store, com `autoIncrement: "versionCode"` e `EXPO_PUBLIC_ADS_ENABLED=true`.

**Development build** (necessária para AdMob e recomendada para o mapa):

```bash
npx expo install expo-dev-client
eas build --profile development --platform android
```

### Build local (alternativa)

```bash
cd mobile
npx expo prebuild --platform android
cd android && ./gradlew bundleRelease
```

Exige JDK 17 e Android SDK. `android/` é gerado e está no `.gitignore` — a
configuração vive em `app.json`.

## Versionamento

- **`version`** (`1.0.0`) é o que a pessoa vê. Semver: correção → patch,
  funcionalidade → minor, mudança grande → major.
- **`versionCode`** é o inteiro que a Play Store usa para ordenar. Precisa
  aumentar a cada envio; o perfil de produção incrementa sozinho.
- Backend e app evoluem juntos pelo versionamento da API (`/v1`): mudanças
  compatíveis não exigem nova build; mudanças incompatíveis pedem `/v2`, porque
  versões antigas do app continuam instaladas.

## Atualizações

1. Ajuste `version` se a mudança for perceptível.
2. `npm --prefix mobile run typecheck && npm --prefix mobile test`.
3. `npm run build:android:production`.
4. Envie ao Play Console (`eas submit --platform android` ou upload manual).
5. Publique primeiro em teste interno; depois promova para produção.

O `eas.json` já traz `submit.production.android` com `track: internal` e
`releaseStatus: draft` — nada é publicado sem uma ação explícita.

## Ficha da Play Store

| Campo                | Sugestão                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Nome                 | PontoColeta                                                                                       |
| Descrição curta      | Encontre onde descartar pilhas, óleo, eletrônicos e mais em Londrina.                              |
| Descrição completa   | Explique as duas buscas (endereço e material), o mapa, a lista e a possibilidade de contribuir sem cadastro. Mencione as ODS 11 e 12. |
| Categoria            | Estilo de vida ou Ferramentas                                                                      |
| Classificação        | Livre                                                                                              |
| Capturas de tela     | Home, resultados em lista, resultados no mapa, detalhes, cadastro                                   |
| Política de privacidade | URL pública baseada em [`privacy.md`](privacy.md)                                              |

## Data Safety

Baseado no comportamento real do app:

| Pergunta                                | Resposta                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------ |
| Coleta dados pessoais?                  | Não pelo app. Ver a ressalva do AdMob abaixo.                            |
| Coleta localização?                     | Não. As permissões de localização estão bloqueadas.                      |
| Coleta identificadores?                 | Não pelo app. Com anúncios ligados, o SDK do AdMob pode usar o ID de publicidade. |
| Dados são compartilhados com terceiros? | Endereço digitado vai ao provedor de geocodificação, sem identificação.  |
| Dados trafegam criptografados?          | Sim, HTTPS.                                                              |
| É possível excluir dados?               | Não há conta a excluir. Correção/remoção de um ponto pelo contato do app.|

> Se publicar com AdMob **ligado**, o Data Safety precisa declarar o uso do
> identificador de publicidade para anúncios. Publicar com anúncios desligados
> mantém a declaração mais simples.

## Antes do primeiro envio

- [ ] `eas init` e `projectId` preenchido
- [ ] Chave real do Google Maps
- [ ] App ID e unidade de banner reais do AdMob (ou anúncios desligados)
- [ ] `EXPO_PUBLIC_API_URL` apontando para o ambiente **prod**
- [ ] `EXPO_PUBLIC_COGNITO_CLIENT_ID` do ambiente prod
- [ ] Política de privacidade publicada em URL pública
- [ ] Capturas de tela e textos
- [ ] Data Safety preenchido
- [ ] Build AAB testada em dispositivo real
