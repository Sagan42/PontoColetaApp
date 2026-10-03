# Privacidade

Princípio: **coletar o mínimo possível.** O PontoColeta é um serviço público de
utilidade; ele não precisa saber quem você é para dizer onde descartar uma pilha.

## O que NÃO é coletado

```text
nome, e-mail ou telefone de quem usa o app
conta ou cadastro de usuário comum
localização GPS do dispositivo
identificador de dispositivo, publicitário ou de instalação
endereço IP associado a uma pessoa
histórico individual de buscas
qualquer dado que permita reconstruir o que uma pessoa específica fez
```

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
| **Nominatim (OpenStreetMap)** | o endereço digitado, sem identificação | busca por endereço e cadastro     |
| **Google Maps (Android)**  | o que qualquer app de mapa envia ao renderizar | ao abrir a aba mapa       |
| **Google AdMob**           | dados de exibição de anúncio           | apenas em builds com anúncios ligados |
| **Amazon Cognito**         | e-mail e senha do administrador        | apenas no login administrativo     |
| **AWS (API Gateway, Lambda, DynamoDB, CloudWatch)** | as requisições do app | sempre |

Cada serviço tem sua própria política de privacidade, e o app está sujeito a
elas nas partes que os utilizam.

## AdMob

- Desligado por padrão (`EXPO_PUBLIC_ADS_ENABLED=false`); em desenvolvimento usa
  unidades de teste do Google, que não geram impressão real.
- Quando ligado, exibe **um banner discreto** no rodapé de Home, resultados e
  detalhes. Não aparece na tela de cadastro, não cobre mapa nem lista, não
  interrompe leitura e não há anúncio intersticial ou premiado.
- O AdMob pode usar identificadores de publicidade do próprio dispositivo,
  conforme as configurações do Android e o consentimento da pessoa. Isso é do
  SDK do Google, não do PontoColeta: o app não coleta nem envia esse
  identificador por conta própria.
- Finalidade: cobrir custo básico de infraestrutura sem cobrar da população.

Se o app for publicado com anúncios ligados, a ficha da Play Store e a política
de privacidade precisam declarar o uso do AdMob.

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

Como não há dado pessoal de usuário comum, não existe conta a excluir nem
histórico a exportar.

Para pedir correção ou remoção de um **ponto de coleta** — por exemplo, se o
local fechou, os dados estão errados ou uma informação inadequada foi cadastrada
— o contato é o do responsável pelo aplicativo, publicado na ficha da Play Store.

## Política de privacidade da Play Store

A Google exige uma URL pública de política de privacidade. Ela ainda **não
existe** — depende do proprietário e de um domínio. O conteúdo deve declarar,
no mínimo:

1. quais dados o app coleta (contadores agregados; dados de pontos de coleta);
2. quais não coleta (nada que identifique pessoas; sem GPS);
3. a finalidade de cada coleta;
4. os serviços de terceiros (Nominatim, Google Maps, AdMob, AWS);
5. o uso do AdMob e do identificador de publicidade, quando ligado;
6. um contato para pedidos de correção ou remoção;
7. a data da última atualização.

Este documento serve de base direta para esse texto. Ver
[play-store.md](play-store.md) para o restante da ficha.
