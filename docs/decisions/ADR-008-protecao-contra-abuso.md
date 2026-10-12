# ADR-008 — Proteção contra abuso: limitar o teto antes de filtrar o tráfego

**Status:** aceito · **Data:** 2026-10-12

## Contexto

A API pública não exige conta, chave nem token. Qualquer pessoa com a URL pode
chamá-la à vontade, e todo custo cai na conta do projeto. O único controle era o
throttling do estágio, configurado em 50 rps em produção.

Cinquenta requisições por segundo sustentadas são **129.600.000 requisições por
mês** (50 × 2.592.000 segundos). Isso é duas a três ordens de grandeza acima do
uso plausível de um app de uma cidade, e no teto custaria algo em torno de
US$ 130 de API Gateway, US$ 240 de Lambda e — no pior caso de leitura — mais de
US$ 2.000 de DynamoDB por mês. Não havia `aws_budgets_budget`, nenhum
`aws_cloudwatch_metric_alarm` e nenhum teto de capacidade no DynamoDB.

O agravante é o padrão de leitura: `GET /v1/collection-points/nearby` faz no
mínimo nove `Query` no `GSI2-geo`, e como a precisão 4 do geohash coloca
praticamente toda Londrina em uma célula, uma dessas nove consultas lê a cidade
inteira. Com mil pontos cadastrados, uma única busca por proximidade consome
cerca de 116 unidades de leitura. É a rota mais barata de chamar e a mais cara de
servir.

## O que o HTTP API v2 não oferece

A escolha do HTTP API (v2) na [ADR-005](ADR-005-http-api-e-duas-lambdas.md) foi
por custo e pelo authorizer JWT nativo. O que ela não dá, e é exatamente o que
faltaria aqui:

| Recurso                        | HTTP API v2 | REST API v1 |
| ------------------------------ | ----------- | ----------- |
| AWS WAF                        | **não**     | sim         |
| API keys e usage plans         | **não**     | sim         |
| Cache de resposta              | **não**     | sim         |
| Throttling por estágio e rota  | sim         | sim         |
| Throttling por IP              | **não**     | **não**     |

Vale sublinhar a última linha: **nem o v1 nem o v2 fazem rate limit por IP.** O
throttling dos dois é global, por estágio ou por rota. Rate limit por IP, bot
control e geo-restrição ao Brasil só existem em um CloudFront na frente da API
(com WAF associado), ou voltando ao REST API — que custa cerca de três vezes
mais por milhão de requisições e exigiria um authorizer Lambda próprio.

## Decisão

**Limitar o teto e instrumentar o alerta. Não filtrar o tráfego ainda.**

1. **Throttle dimensionado pelo uso real**, não pelo confortável: 10 rps em prod
   (25.920.000 req/mês) e 5 rps em dev. As rotas de escrita
   (`POST /v1/collection-points` e `POST /v1/metrics/events`) ficam em 1 rps por
   `route_settings`, porque uma escrita custa mais a jusante que uma leitura.
2. **Teto de capacidade no DynamoDB** (`on_demand_throughput`), na tabela e em
   cada índice. Sem ele, on-demand escala sem limite, que é precisamente o que
   torna um laço de leitura caro.
3. **Teto de concorrência nas duas Lambdas**, nos dois ambientes.
4. **Orçamento mensal e três alarmes**, no módulo `cost-guardrails`, com limiares
   derivados dos tetos acima.

**CloudFront e WAF ficam de fora desta etapa.**

## Consequência explícita: indisponibilidade em vez de fatura

O throttle é global, não por IP. Uma pessoa mal-intencionada que sature os 10 rps
**derruba a API para todo mundo** — as requisições legítimas passam a receber
429. Essa é a troca, e ela é deliberada: para um produto gratuito, mantido por
uma pessoa, uma indisponibilidade temporária é recuperável e uma fatura de quatro
dígitos não é.

A mesma lógica vale por rota: sob um laço de busca por proximidade, o teto de
leitura do DynamoDB (500 unidades/s em prod, cerca de 4 buscas/s) corta antes do
throttle de 10 rps da API. As rotas baratas continuam servindo; a caríssima para
de responder. Nenhum dos dois limites protege a disponibilidade — eles protegem
só o custo.

## Alternativas consideradas

- **CloudFront + WAF na frente do HTTP API.** É a resposta certa para abuso real:
  rate limit por IP, regras gerenciadas de bot control, geo-restrição ao Brasil e
  cache de resposta nas rotas de leitura (que cortaria tanto custo quanto o
  throttle). Custa mais em complexidade — distribuição, certificado, invalidação,
  mais um lugar onde o roteamento pode quebrar — e nada no histórico do projeto
  indica abuso. Fica como **próximo passo caso o abuso se concretize**, e os
  alarmes desta etapa são exatamente o gatilho para saber disso.
- **Voltar ao REST API (v1)** pelo WAF nativo e pelas API keys. Triplica o custo
  por requisição em regime normal para resolver um problema hipotético, e API key
  em app distribuído publicamente não é segredo: ela vai no binário. A ADR-005
  **segue válida**.
- **Exigir conta para usar a API.** Resolveria a atribuição, mas o produto é
  deliberadamente anônimo — ver [privacy.md](../privacy.md). Trocar isso por
  proteção de custo seria pagar com o propósito do produto.
- **Captcha no cadastro.** Ajuda contra cadastro automatizado, não contra leitura
  em massa, que é o caminho caro. Vale discutir junto com o CloudFront.
- **Não fazer nada e observar.** Era o estado anterior, e o problema é que sem
  orçamento nem alarme a primeira notícia do abuso seria a fatura.

## Consequências

**Positivas**

- O pior caso mensal deixa de ser aberto e passa a ser estimável a partir dos
  tetos declarados, com a conta registrada em [terraform.md](../terraform.md).
- Quem precisar afrouxar um limite muda uma variável e vê o impacto na mesma
  tabela.
- Os alarmes transformam "descobrir pela fatura" em "receber um e-mail enquanto
  ainda é barato".
- Dev ganhou teto próprio, menor que o de prod: um laço acidental em
  desenvolvimento para no limite, não na fatura.

**Negativas**

- Abuso agora causa indisponibilidade, como descrito acima.
- As rotas de escrita em 1 rps global podem estrangular um pico legítimo de
  eventos de métrica (cada abertura do app gera um). Métrica é o que faz mais
  sentido descartar primeiro, e o backend já engole falha de métrica sem derrubar
  a operação medida — mas é um limite que merece acompanhamento.
- O teto de leitura do DynamoDB é apertado justamente porque a busca por
  proximidade lê demais. A correção de fundo é a precisão do geohash
  ([dynamodb.md](../dynamodb.md)), não o teto.
- Assinatura de e-mail no SNS exige confirmação manual: até alguém clicar no
  link, o alarme dispara e não avisa ninguém.
