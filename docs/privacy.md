# Privacidade

Última atualização: 19 de outubro de 2026.

Princípio: **coletar o mínimo possível.** O PontoColeta é um serviço público de
utilidade; ele não precisa saber quem você é para dizer onde descartar uma pilha.

O app **não exibe anúncios** e não embarca nenhum SDK de publicidade.

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
2. quais não coleta (nada que identifique pessoas; sem GPS; sem identificador
   de publicidade);
3. a finalidade de cada coleta;
4. os serviços de terceiros (Nominatim, Google Maps, AWS);
5. um contato para pedidos de correção ou remoção;
6. a data da última atualização.

### Em que idioma publicar

Em **português do Brasil**, o mesmo idioma do app e da ficha da Play Store.

O que a Google exige da política é que ela esteja em uma URL pública e ativa,
que não seja editável pelo público, que se refira especificamente a este app e
que descreva o tratamento dos dados. Não há exigência de idioma — a
documentação da Play cita inglês em outro contexto (credenciais de login para a
revisão do app), não para a política.

O argumento mais forte não é da Google e sim da LGPD: a informação precisa ser
clara e acessível ao titular. O público do PontoColeta é de Londrina e a
interface só existe em pt-BR; uma política em inglês cumpriria a letra e
falharia no propósito.

Se um dia a ficha ganhar outros idiomas ou outros países de distribuição, a
política acompanha, com uma versão por idioma.

Este documento serve de base direta para esse texto. Ver
[play-store.md](play-store.md) para o restante da ficha.
