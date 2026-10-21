# Privacidade

Última atualização: 20 de outubro de 2026.

Princípio: **coletar o mínimo possível.** O PontoColeta é um serviço público de
utilidade; ele não precisa saber quem você é para dizer onde descartar uma pilha.

O app **não exibe anúncios** e não embarca nenhum SDK de publicidade.

## O que NÃO é coletado

```text
e-mail ou telefone de quem usa o app
nome, exceto se a pessoa escolher escrever um no feedback
conta ou cadastro de usuário comum
localização GPS do dispositivo
identificador de dispositivo, publicitário ou de instalação
endereço IP associado a uma pessoa
histórico individual de buscas
qualquer dado que permita reconstruir o que uma pessoa específica fez
```

O identificador de publicidade do Android (`AD_ID`) não é lido, não é enviado e
a permissão correspondente não é declarada no manifesto.

Não existe login para usuário comum. Consultar, buscar, ver detalhes e cadastrar
são todos anônimos.

## O que é coletado

### 1. Dados dos pontos de coleta (públicos por natureza)

Nome do lugar, endereço, materiais aceitos, horário, observações e coordenadas.
São informações sobre **estabelecimentos e locais públicos**, não sobre pessoas.

Finalidade: permitir que qualquer pessoa encontre onde descartar corretamente.

O campo "Observações" é livre. A orientação na interface pede detalhes do local
("Entrada pela lateral do prédio"); dados pessoais não devem ser escritos ali, e
um ponto cadastrado com informação inadequada pode ser ocultado (`HIDDEN`).

### 2. Contadores agregados de uso

Cinco contadores por dia: acessos, buscas por endereço, buscas por material,
cadastros e detalhes abertos.

Nenhum evento individual é armazenado — só o número do dia é incrementado. Não há
identificador, sessão, dispositivo ou IP associado. Um contador em `137` não
guarda nada sobre as 137 ocorrências.

Finalidade: entender se o app está sendo útil e como evolui.

### 3. Endereço digitado (transitório)

Quando alguém busca por endereço, o texto vai ao provedor de geocodificação para
virar coordenadas.

- Não é gravado em banco.
- Não é registrado em log.
- Fica em cache **em memória** do container Lambda por até 1 hora, sem qualquer
  vínculo com quem digitou, apenas para não repetir chamadas ao provedor.

### 4. Feedback (só se a pessoa escrever um)

A tela de feedback tem dois campos: **nome, opcional**, e **mensagem**. Guardamos
o que foi escrito mais a data e a hora do envio, geradas pelo servidor.

- Em branco, o nome é gravado como `Anônimo`. Não há pergunta implícita: não
  pedimos e-mail, telefone nem forma de contato.
- Nada mais acompanha o registro — sem IP, sem identificador de dispositivo,
  sem vínculo com as buscas feitas antes ou depois.
- O conteúdo nunca vai para log, e a rota de envio não devolve o texto na
  resposta.
- Ler o que foi escrito exige **login administrativo**: a rota de leitura fica
  na API administrativa, protegida por token do Cognito, como as métricas e a
  moderação. Não existe rota pública que devolva feedback.

Finalidade: corrigir e melhorar o app a partir de quem o usa.

Quem escrever o próprio nome está, por definição, fornecendo um dado pessoal
voluntariamente. Para apagar um feedback enviado, use o contato da ficha da Play
Store.

### 5. Denúncia de um ponto (só se alguém denunciar)

Quem vir algo errado em um ponto de coleta pode denunciá-lo pelo app. Guardamos
o motivo escolhido, os detalhes opcionais, o ponto denunciado e a data e a hora.

- **Nada sobre quem denunciou é guardado** — sem nome, sem contato, sem IP, sem
  identificador. Denúncia que identifica quem denunciou é denúncia que ninguém
  faz.
- Não é preciso cadastro nem login para denunciar.
- A leitura é só da área administrativa, protegida por login.

Finalidade: tirar do ar informação errada ou conteúdo impróprio, que é o que a
política de conteúdo gerado pelo utilizador exige de quem publica o que outras
pessoas escrevem.

## Localização

**GPS nunca é obrigatório e o app não o solicita.** As permissões de localização
estão explicitamente bloqueadas em `app.json`:

```json
"blockedPermissions": [
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION"
]
```

Buscar por endereço digitado é um caminho de primeira classe, não um plano B.

## Serviços externos

| Serviço                    | O que recebe                          | Quando                             |
| -------------------------- | ------------------------------------- | ---------------------------------- |
| **Google (geocodificação)** | o endereço digitado, sem identificação | busca por endereço e cadastro     |
| **Google Maps (Android)**  | o que qualquer app de mapa envia ao renderizar | ao abrir a aba mapa       |
| **Amazon Cognito**         | e-mail e senha do administrador        | apenas no login administrativo     |
| **AWS (API Gateway, Lambda, DynamoDB, CloudWatch)** | as requisições do app | sempre |

Cada serviço tem sua própria política de privacidade, e o app está sujeito a
elas nas partes que os utilizam.

## Anúncios

Não há anúncios. O app não exibe banner, intersticial, vídeo nem conteúdo
patrocinado, e nenhum SDK de publicidade é embarcado — portanto não há
identificador de publicidade, perfil de interesse, rastreamento entre apps nem
compartilhamento de dados com rede de anúncios.

O custo de infraestrutura é mantido baixo por outros meios: serverless com teto
de concorrência, limites de taxa na API e alarmes de orçamento. Ver
[ADR-008](decisions/ADR-008-protecao-contra-abuso.md).

## Segurança dos dados

- Todo tráfego por HTTPS.
- Nenhum acesso direto do app ao DynamoDB — só pela API.
- IAM com privilégio mínimo: a função administrativa só sabe ler.
- Criptografia em repouso no DynamoDB.
- Segredos fora do Git; configuração por ambiente.
- Logs nunca contêm senha, token ou dado pessoal.
- Payload limitado a 16 KB e throttling na API.
- A área administrativa é protegida por autenticação real, não por rota
  desconhecida.

## Direitos e contato

Não existe conta a excluir nem histórico a exportar: não há cadastro de usuário.
O único dado pessoal possível é um nome escrito voluntariamente no feedback.

Para pedir correção ou remoção de um **ponto de coleta** — por exemplo, se o
local fechou, os dados estão errados ou uma informação inadequada foi cadastrada
—, a remoção de um **feedback** já enviado, ou qualquer outro pedido sobre seus
dados, escreva para:

**tasemcorp@gmail.com**

Respondemos pelo mesmo endereço. Não é preciso se identificar além do necessário
para localizar o que deve ser corrigido ou removido.

Pontos de coleta com informação errada ou conteúdo impróprio também podem ser
**denunciados dentro do app**, na tela de detalhes do ponto — é o caminho mais
rápido, e não exige escrever para ninguém.
