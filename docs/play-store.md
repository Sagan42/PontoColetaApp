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
| Anúncios                    | —                                             | **não existem**; nenhum SDK de publicidade        |
| Denúncia de conteúdo        | tela de detalhes do ponto → "Denunciar"       | exigida pela política de conteúdo do utilizador   |
| Chave do Google Maps        | `app.config.js` → `android.config.googleMaps` | variável `GOOGLE_MAPS_ANDROID_API_KEY`            |
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
pela Play Store, com `autoIncrement: true` — o `versionCode` é controlado
remotamente pelo EAS (`cli.appVersionSource: "remote"`).

**Development build** (recomendada para o mapa):

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
| Política de privacidade | URL pública baseada em [`privacy.md`](privacy.md), em português do Brasil                       |

## Data Safety

Baseado no comportamento real do app:

| Pergunta                                | Resposta                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------ |
| Coleta dados pessoais?                  | Só **nome**, **opcional**, se a pessoa escrever um no feedback.          |
| Coleta conteúdo escrito pela pessoa?    | Sim: a mensagem do feedback e os dados de um ponto cadastrado.           |
| Coleta localização?                     | Não. As permissões de localização estão bloqueadas.                      |
| Coleta identificadores?                 | Não. Sem SDK de publicidade, sem `AD_ID` no manifesto.                   |
| Dados são compartilhados com terceiros? | Endereço digitado vai ao provedor de geocodificação, sem identificação.  |
| Dados trafegam criptografados?          | Sim, HTTPS.                                                              |
| É possível excluir dados?               | Não há conta a excluir. Remoção de um ponto ou de um feedback pelo contato do app.|

> Sem anúncios, a seção **Ads** do questionário é respondida com "o app não
> contém anúncios" e a permissão `com.google.android.gms.permission.AD_ID` não
> precisa ser declarada — é a declaração mais simples possível.

## Conteúdo gerado pelo utilizador

Os pontos de coleta são escritos por quem usa o app e publicados sem revisão
prévia, então a política de **Conteúdo Gerado pelo Utilizador** se aplica. O que
ela exige e onde está:

| Exigência | Onde |
| --- | --- |
| Denunciar conteúdo, dentro do app | Botão "Denunciar este ponto" na tela de detalhes |
| Agir sobre a denúncia | Aba **Denúncias** da área administrativa, com ação de ocultar |
| Bloquear utilizadores | **Não aplicável**: o app não tem conta, perfil nem interação 1:1 |

No questionário de classificação, isso muda a resposta de "capacidade de
denunciar utilizadores ou conteúdos gerados pelos utilizadores" para **Sim**.
Mudança de funcionalidade que afeta o questionário exige reenviá-lo.

## Antes do primeiro envio

- [ ] `eas init` e `projectId` preenchido
- [ ] Chave real do Google Maps
- [ ] `EXPO_PUBLIC_API_URL` apontando para o ambiente **prod**
- [ ] `EXPO_PUBLIC_COGNITO_CLIENT_ID` do ambiente prod
- [ ] Política de privacidade publicada em URL pública
- [ ] Capturas de tela e textos
- [ ] Data Safety preenchido
- [ ] Build AAB testada em dispositivo real
