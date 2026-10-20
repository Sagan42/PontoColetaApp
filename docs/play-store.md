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
| Política de privacidade     | [`privacy.md`](privacy.md) no GitHub Pages    | **publicada** em `sagan42.github.io/PontoColetaApp/privacy` |

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
| Nome                 | `PontoColeta - Londrina` (22 de 30)                                                                |
| Descrição curta      | Encontre onde descartar pilhas, óleo, eletrônicos e mais em Londrina. (69 de 80)                    |
| Descrição completa   | Texto final em [Textos da ficha](#textos-da-ficha), abaixo                                          |
| Categoria            | **Mapas e navegação**. A função principal é achar um lugar perto de um endereço, com mapa e distância. "Ferramentas" é utilitário de aparelho; "Viagens e local" é a alternativa se a leitura for de diretório local. Dá para mudar depois, sem nova revisão. |
| Classificação        | Livre                                                                                              |
| Ícone 512×512        | `docs/brand/play-icon.png`. **Não use `mobile/assets/icon.png`**: tem 1024×1024, porque é o que o Expo pede, e o console recusa fora de 512×512 |
| Recurso gráfico 1024×500 | `docs/brand/play-feature-graphic.png`                                                           |
| Capturas de tela     | 2 a 8, 16:9 ou 9:16, lado entre 320 e 3840 px. Sugestão: Home, resultados no mapa, resultados em lista, detalhes, cadastro. **Quatro ou mais com 1080 px de lado qualificam para promoção** |
| Política de privacidade | `https://sagan42.github.io/PontoColetaApp/privacy` — servida de [`privacy.md`](privacy.md)        |

## Textos da ficha

Prontos para colar no console. Sem travessão, por escolha de estilo do
proprietário. Os materiais citados são exatamente os dez de
`SUGGESTED_MATERIALS`, para a ficha não prometer o que o app não lista.

**Nome do app** (30): `PontoColeta - Londrina`

**Descrição curta** (80): `Encontre onde descartar pilhas, óleo, eletrônicos e mais em Londrina.`

**Descrição completa** (4000):

```text
PontoColeta mostra onde descartar corretamente, em Londrina, o que não pode ir
no lixo comum.

Pilhas, baterias, óleo de cozinha usado, eletrônicos, lâmpadas, medicamentos,
vidro, papel, plástico e metal têm lugar certo para serem entregues. O app
reúne esses pontos de coleta em um mapa e em uma lista, com endereço, horário
e o que cada lugar aceita.

Veja tudo de uma vez

Ao abrir o app, você pode ver todos os pontos da cidade no mapa ou em lista,
sem precisar digitar nada antes.

Duas formas de buscar

Por endereço: digite a rua onde você está ou para onde vai e veja os pontos
mais próximos, já ordenados por distância.

Por material: digite o que você precisa descartar e veja quais lugares aceitam.

O que você encontra em cada ponto

Nome do lugar, endereço completo, distância, materiais aceitos, horário de
funcionamento e observações úteis, como a entrada ficar pela lateral do
prédio. Um toque abre a localização no aplicativo de mapas do seu aparelho.

Sem cadastro e sem login

Não existe conta para criar. Buscar, consultar e contribuir funcionam sem
informar nome, e-mail ou telefone.

O app não pede sua localização

As permissões de GPS ficam bloqueadas no aplicativo. Buscar pelo endereço
digitado é o caminho principal, e não uma alternativa: você decide de onde
quer procurar.

Feito por quem usa

Conhece um ponto de coleta que não está aqui? Cadastre você mesmo, sem conta.
Informe o nome do lugar, a rua, o número, o bairro e o que ele aceita. O app
confirma o endereço automaticamente e o ponto passa a aparecer nas buscas.

Encontrou informação errada, um local que fechou ou conteúdo impróprio?
Denuncie na própria tela do ponto. A denúncia é anônima e chega direto a quem
mantém o app.

Quer sugerir uma melhoria? O botão de feedback fica sempre à mão, no canto da
tela. Dar seu nome é opcional.

Sem anúncios

O PontoColeta não exibe anúncios de nenhum tipo e não tem compras dentro do
app.

Área de atendimento

Por enquanto, apenas Londrina, no Paraná. Pontos fora do município não são
aceitos no cadastro.

Privacidade

O app coleta o mínimo possível: contadores de uso por dia, que não identificam
ninguém, e aquilo que você escolhe escrever ao cadastrar um ponto, enviar um
feedback ou fazer uma denúncia. Seus dados não são compartilhados com
terceiros.

Política de privacidade: https://sagan42.github.io/PontoColetaApp/privacy

Dúvidas, correções ou pedidos de remoção: tasemcorp@gmail.com
```

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

## A política de privacidade publicada

A política está no ar em `https://sagan42.github.io/PontoColetaApp/privacy`,
servida pelo GitHub Pages a partir de [`privacy.md`](privacy.md) deste mesmo
repositório — o arquivo **é** a política, não um rascunho dela.

Duas consequências de servir um arquivo do repositório:

- **Editar `privacy.md` publica imediatamente.** Não há revisão entre o commit
  e o texto que a Google lê. Trate esse arquivo como se fosse a página que é.
- **Nada de nota interna lá dentro.** Instrução para o desenvolvedor, "isto
  ainda não existe", pendência — tudo isso vive aqui, neste arquivo. A política
  fala com quem usa o app.

O texto deve declarar, no mínimo:

1. quais dados o app coleta (contadores agregados; dados de pontos de coleta;
   feedback com nome opcional; denúncias);
2. quais não coleta (nada que identifique quem busca; sem GPS; sem identificador
   de publicidade);
3. a finalidade de cada coleta;
4. os serviços de terceiros (Nominatim, Google Maps, AWS);
5. um **endereço de e-mail** para pedidos de correção ou remoção;
6. a data da última atualização.

> **O contato precisa ser um e-mail escrito na página**, não "o contato da ficha
> da Play Store". O revisor abre a URL **antes** de o app existir na loja: uma
> remissão à ficha é um beco sem saída nesse momento.

### Em que idioma publicar

Em **português do Brasil**, o mesmo idioma do app e da ficha.

O que a Google exige da política é que ela esteja em uma URL pública e ativa,
que não seja editável pelo público, que se refira especificamente a este app e
que descreva o tratamento dos dados. Não há exigência de idioma — a
documentação da Play cita inglês em outro contexto (credenciais de login para a
revisão do app), não para a política.

O argumento mais forte não é da Google e sim da LGPD: a informação precisa ser
clara e acessível ao titular. O público do PontoColeta é de Londrina e a
interface só existe em pt-BR; uma política em inglês cumpriria a letra e
falharia no propósito.

Se um dia a ficha ganhar outros idiomas ou países de distribuição, a política
acompanha, com uma versão por idioma.

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
- [x] Política de privacidade publicada em URL pública
- [x] E-mail de contato dentro da política (`tasemcorp@gmail.com`)
- [ ] Capturas de tela e textos
- [ ] Data Safety preenchido
- [ ] Build AAB testada em dispositivo real
