# ADR-004 — Nominatim (OpenStreetMap) como provedor de geocodificação

**Status:** aceito · **Data:** 2026-08-22

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
