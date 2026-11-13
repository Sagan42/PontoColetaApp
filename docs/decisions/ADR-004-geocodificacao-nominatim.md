# ADR-004 — Nominatim (OpenStreetMap) como provedor de geocodificação

**Status:** substituído em produção · **Data:** 2026-08-22 ·
**Substituído em:** 2026-10-20 (ver [Atualização](#atualização--2026-10-20))

## Contexto

A busca por endereço e o cadastro de pontos precisam transformar um endereço
digitado em coordenadas. O backend é a fonte de verdade dessas coordenadas, ou
seja, a geocodificação acontece no servidor, nunca só no app.

O provedor não estava definido. Critérios: custo, simplicidade, cobertura de
endereços brasileiros, manutenção e limites gratuitos.

## Decisão

Usar **Nominatim**, a API de geocodificação do OpenStreetMap, atrás da porta
`GeocodingService` definida na camada Application.

Detalhes da implementação (`NominatimGeocodingService`):

- Busca restrita à área de atendimento por `viewbox` + `bounded=1` e
  `countrycodes=br`, de modo que uma rua homônima em outro estado nunca volta.
- `User-Agent` identificando o projeto e um contato, como a política de uso
  exige (configurável por variável de ambiente).
- Timeout explícito (4 s por padrão) e cache em memória por container (1 h),
  para usar a instância pública com parcimônia.
- Falhas viram `ExternalServiceError`, que a API traduz em 503 com mensagem
  para pessoa, sem vazar detalhes do provedor.

## Alternativas consideradas

- **Amazon Location Service**: fica dentro da AWS e tem SLA, mas cobra por
  requisição depois do free tier do primeiro ano e adiciona mais um recurso ao
  Terraform e mais uma permissão IAM. Guardado como a alternativa natural caso o
  volume cresça ou a política do Nominatim se torne um problema.
- **Google Geocoding API**: melhor cobertura de endereços brasileiros, porém
  exige conta de faturamento e chave — contrário ao objetivo de custo próximo de
  zero.
- **Base própria de CEPs**: manutenção contínua sem relação com o produto.

## Consequências

**Positivas**

- Zero custo, zero chave, zero conta adicional.
- A porta `GeocodingService` isola a escolha: trocar de provedor é escrever uma
  classe na camada de infraestrutura.
- Cache e restrição geográfica reduzem chamadas externas e resultados errados.

**Negativas**

- A instância pública do Nominatim pede uso moderado (na prática ~1 req/s) e não
  oferece SLA. Se o app crescer, é preciso migrar para Amazon Location Service ou
  hospedar um Nominatim.
- A cobertura de endereços brasileiros é boa, mas inferior à do Google; alguns
  endereços podem não ser encontrados e a pessoa verá "Não foi possível
  localizar esse endereço".
- O cache é por container Lambda, então o ganho depende de reuso de container.

## Atualização — 2026-10-20

**Produção passou a usar a Google Geocoding API.** A decisão acima não foi
revertida por preferência, e sim por uma falha que ela não previu.

A instância pública do Nominatim **recusa requisições vindas de IP de nuvem, e
recusa em silêncio**: responde `HTTP 200` com lista vazia, que é exatamente a
forma de "endereço não encontrado". Em produção isso derrubou o cadastro de
pontos sem acionar um único alarme, porque do ponto de vista do HTTP nada
falhou. O diagnóstico só fechou comparando produção e desenvolvimento: mesmo
código, mesma região, mesma configuração, e desenvolvimento funcionando — o que
isolou a causa no IP de saída do contêiner.

A alternativa "Google Geocoding API" acima foi descartada por exigir conta de
faturamento e chave. Esse custo continua existindo e foi aceito: o nível
gratuito mensal cobre com folga o volume do projeto, e a chave é restrita à
Geocoding API, fica apenas na Lambda e nunca no aplicativo.

O que mudou na implementação:

- `GEOCODING_PROVIDER` escolhe o adaptador e vale `google` por padrão. A
  variável `geocoding_api_key` é obrigatória nesse modo, validada no `plan` do
  Terraform para falhar antes do deploy, e não no primeiro cadastro.
- `GoogleGeocodingService` traduz o campo `status` com cuidado: só
  `ZERO_RESULTS` é ausência de endereço. `REQUEST_DENIED`, `OVER_QUERY_LIMIT` e
  companhia viram `ExternalServiceError`, que vira 503. **Recusa nunca se
  disfarça de endereço inexistente** — é a lição estrutural do incidente, e por
  isso o resultado de uma recusa também nunca entra no cache.
- `NominatimGeocodingService` continua implementado, testado e selecionável.
  Serve ao desenvolvimento local, onde o IP é residencial, e como saída caso a
  chave do Google precise ser rotacionada às pressas.

Detalhes do adaptador e da política de uso estão em
[architecture.md](../architecture.md#serviços-externos).
