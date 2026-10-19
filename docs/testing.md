# Testes

Princípio: **teste útil, não cobertura artificial.** Cada teste descreve um
comportamento que alguém depende — nenhum existe só para tocar uma linha.

Nenhum teste precisa de conta AWS, LocalStack ou DynamoDB Local.

## Situação atual

| Suíte    | Framework                            | Arquivos | Testes  | Tempo   |
| -------- | ------------------------------------ | -------- | ------- | ------- |
| Backend  | Vitest                               | 14       | **232** | ~1,5 s  |
| Mobile   | Jest (`jest-expo`) + RNTL 14         | 9        | **77**  | ~5 s    |

```bash
npm test                 # ambos
npm run test:backend
npm run test:mobile
npm --prefix backend run test:coverage
```

## Integração contínua

`npm run verify` (lint + typecheck + testes + build do backend) é o portão, e
`.github/workflows/verify.yml` é o que o obriga em **todo push e todo pull
request**. Antes disso, nada impedia um commit quebrado de entrar.

| Job                       | O que roda                                                                 | Credencial |
| ------------------------- | -------------------------------------------------------------------------- | ---------- |
| `lint · typecheck · test · build` | `npm run install:all` e `npm run verify`                            | nenhuma    |
| `terraform fmt · validate`        | `fmt -recursive -check`; `init -backend=false` + `validate` em dev e prod | nenhuma    |

Decisões do workflow que valem conhecer:

- **Node vem do `.nvmrc`** (`node-version-file`), então CI e máquina local não
  podem divergir de versão.
- **Cache de npm apontando para os dois lock files.** Não existe
  `package-lock.json` na raiz: os projetos instalam separados, então a chave do
  cache precisa vir de `backend/` e de `mobile/`.
- **Os dois jobs são independentes** e rodam em paralelo: um erro de formatação
  de Terraform não esconde uma falha de teste, nem o contrário.
- **Nenhum passo recebe credencial AWS**, e nenhum roda `plan`, `apply` ou
  `destroy`. O Terraform para em `fmt` e `validate` — ver
  [terraform.md](terraform.md#no-ci).

O que o CI **não** cobre, e continua manual: `terraform plan`, qualquer deploy,
e o build do app móvel pelo EAS.

## Escolha de frameworks

- **Backend: Vitest.** Executa TypeScript ESM sem passo de transpilação
  configurado à mão, tem API compatível com Jest e sobe em menos de dois
  segundos.
- **Mobile: `jest-expo` + `@testing-library/react-native`.** É o preset que a
  Expo mantém alinhado com cada SDK; sair dele significaria manter transform,
  mocks de módulos nativos e resolver por conta própria.

## Backend

### Domínio (`tests/domain/`)

Sem mocks — são funções e objetos puros.

- **`geo.test.ts`** — geohash validado contra o valor de referência da
  especificação (`u4pruydqqvj`); cobertura de células verificada amostrando
  pontos sobre a circunferência do raio de busca; Haversine conferido contra a
  distância real Londrina–Maringá e testado quanto a simetria.
- **`value-objects.test.ts`** — normalização de materiais (acento, caixa,
  espaço, pontuação), formatação de endereço sem duplicar cidade, limites de
  horário e observações, arredondamento de coordenadas, área de atendimento.
- **`collection-point.test.ts`** — invariantes do agregado: publicação
  imediata, deduplicação de materiais em grafias diferentes, limites de nome e
  quantidade, idempotência de `hide()`, round-trip pelo snapshot.
- **`metrics-domain.test.ts`** — bucket diário no fuso de Londrina (02:00 UTC
  ainda é o dia anterior), períodos, série de dias, contadores.

### Aplicação (`tests/application/`)

Casos de uso reais contra dublês em `tests/support/fakes.ts`.

- **`create-collection-point.test.ts`** — o endereço enviado ao geocodificador
  inclui a cidade; coordenadas do app são aceitas quando concordam e descartadas
  quando não; ponto fora de Londrina é recusado; duplicata vira conflito;
  métrica é registrada; **falha de métrica não derruba o cadastro**.
- **`search-collection-points.test.ts`** — ponto oculto responde como
  inexistente; busca por material normaliza o texto; busca por localização
  ordena por distância, aceita coordenadas sem geocodificar e limita o raio.
- **`usage-metrics.test.ts`** — incremento por tipo e por dia; relatório com
  série contínua; período padrão de 30 dias.

Dublês usados: `InMemoryCollectionPointRepository` (replica a semântica do
repositório real), `FakeGeocodingService`, `InMemoryMetricsRepository`,
`FixedClock`, `SequentialIdGenerator`, `RecordingMetricRecorder`, `silentLogger`.

### Infraestrutura (`tests/infrastructure/`)

- **`collection-point-item.test.ts`** — chaves primárias e de índice, geohash de
  precisão 9 cujo prefixo é a partição geográfica, **índice esparso** (ponto
  oculto perde `GSI2PK`), round-trip domínio ↔ item, item corrompido falha alto
  em vez de devolver dado errado, itens auxiliares de material.
- **`dynamo-collection-point-repository.test.ts`** — um cliente dublê captura os
  comandos enviados. Verifica que o ponto e seus materiais vão em uma única
  transação, que a listagem usa o índice de status em ordem decrescente, que a
  busca por material faz `Query` + `BatchGetItem` (e **não** faz `BatchGetItem`
  quando não há resultado), que a proximidade consulta o índice geográfico
  célula a célula e filtra por distância real, e que **nenhum caminho usa
  `Scan`**.
- **`metrics-and-pagination.test.ts`** — cursor opaco (round-trip e rejeição de
  cursor adulterado), meses de um período, `ADD` atômico, um `Query` por mês.
- **`nominatim-geocoding-service.test.ts`** — `fetch` mockado: a URL restringe a
  busca à área de atendimento, o `User-Agent` exigido pela política é enviado,
  resultados inválidos são descartados, o cache evita a segunda chamada, e
  falhas viram `ExternalServiceError` sem vazar detalhes.

### Apresentação (`tests/presentation/`)

- **`http.test.ts`** — roteador (parâmetros, precedência de segmento literal,
  405 × 404, decodificação), tradução de cada erro de domínio no status certo,
  **nenhum vazamento de dado interno em erro 500**, limite de payload, adapter do
  API Gateway (headers, claims, corpo base64, correlation id).
- **`api.test.ts`** — a API inteira ponta a ponta com adaptadores em memória:
  rotas reais, casos de uso reais, domínio real. Cobre cadastro, 409 de
  duplicata, busca por material normalizada, busca por endereço com distância,
  404 de endereço inexistente, detalhes, lista vazia, métricas públicas
  (incluindo a recusa de um tipo que só o backend pode contar) e a área
  administrativa (401 sem token, 403 sem `sub`, 200 com token).

## Mobile

- **`format.test.ts`** — distância em metros/quilômetros com vírgula decimal,
  lista de materiais com "e", datas em ordem brasileira.
- **`collectionPointForm.test.ts`** — validação do formulário: campos
  obrigatórios, limites, espaços em volta, uma mensagem por campo; horário
  tudo-ou-nada em 24h; composição do endereço e do horário enviados à API;
  máscara de hora e filtro de dígitos.
- **`HomeScreen.test.tsx`** — a Home apresenta produto e cidade; os dois
  quadrados abrem **todos** os pontos em mapa e em lista (`mode=all`); o botão
  retangular leva à busca; cadastro e área administrativa seguem acessíveis.
- **`SearchScreen.test.tsx`** — **as duas** formas de busca; cada uma navega com
  os parâmetros certos; busca vazia não navega e explica o porquê.
- **`ResultsScreen.test.tsx`** — os quatro estados (carregando, sucesso, vazio,
  erro); lista com nome, endereço, materiais e distância; alternância
  lista ↔ mapa sobre o mesmo conjunto; abertura dos detalhes; mensagem
  específica para endereço não localizado; 4xx não é repetido automaticamente e
  a pessoa pode tentar de novo.
- **`NewPointScreen.test.tsx`** — submit bloqueado com formulário inválido; erro
  do campo some ao corrigir; número do endereço recusa o que não é dígito;
  seleção de material sugerido; envio com o payload correto, incluindo endereço
  e horário compostos; dias marcados sem horário não enviam; confirmação de
  sucesso e navegação para o ponto criado; **três toques seguidos enviam uma
  única vez**; mensagem de duplicata.

### Mocks do mobile (`jest.setup.js`)

Apenas módulos nativos sem sentido em Node: `react-native-maps` vira uma `View`.
`expo-router` é mockado por teste, porque cada tela precisa de parâmetros
diferentes.

`__tests__/support/render.tsx` monta os mesmos providers do app
(`QueryClientProvider`, `SafeAreaProvider`) com retry desligado.

> **RNTL 14 é assíncrona.** `render()` e `fireEvent.*` devolvem promessas e
> precisam de `await`. Esquecer o `await` produz falhas confusas de "elemento não
> encontrado". Além disso, `screen` (o singleton global) não funciona neste
> ambiente: use as queries do objeto devolvido pelo `render`.

## O que não é testado, e por quê

| Área                              | Motivo                                                                    |
| --------------------------------- | ------------------------------------------------------------------------- |
| DynamoDB de verdade               | exigiria conta AWS ou LocalStack; o dublê verifica os comandos enviados    |
| API Gateway / Cognito de verdade  | configuração de infraestrutura, verificada por `terraform validate`        |
| Renderização real do mapa         | depende de módulo nativo e do Google Play Services; há fallback testável   |
| Comportamento do teclado          | depende do IME real; `Screen` usa os eventos nativos de teclado            |
| Tela administrativa (componentes) | login e gráfico dependem de Cognito real; a lógica de métricas é testada no backend |

Essas lacunas são reais e conscientes. A primeira que valeria fechar, quando
houver ambiente, é um teste de fumaça contra a API implantada em `dev`.
