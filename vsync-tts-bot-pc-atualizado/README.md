# Bot TTS para VSync

Bot que lê mensagens comuns dos canais de texto e fala em uma call do VSync. Ele tenta entrar na call de quem enviou a mensagem; se essa pessoa não estiver em voz, tenta usar a primeira call ocupada do servidor. Se não houver ninguém em voz, não existe uma call para a qual falar e a mensagem é ignorada.

## O que inclui

- Vozes neurais em português brasileiro, Mita, Nobara, Goldship, Brainrot, Toph Beifong, Yumeko, Saga de Gêmeos, Hatsune Miku, Kobayashi, Bolsonaro, Sukuna, Corazon, Narrador Tengen de JJK, Kaiser, Rick, Morty, Peridot, Mu de Áries, Gojo, Naoya, Luffy e Garnet via provedores Fish Audio/Edge; a voz feminina brasileira antiga (`brasileira`) e Lhays usam o proxy comunitário TikTok TTS (sem cookie de login).
- Modo `!voz aleatoria` para alternar vozes.
- Leitura automática do chat, por padrão em todos os canais que o bot consegue ver.
- Entrada automática em call ocupada e suporte a WebRTC/ICE do VSync.
- `!tts on`, `!tts off`, `!tts entrar`, `!tts sair`, `!tts ajuda`.
- Configuração de ativação, voz padrão, whitelist e blacklist salva por servidor em `data/config.json`; cada usuário também pode salvar sua própria voz por servidor.
- Whitelist por cargo: quando há cargos permitidos configurados, só os membros com pelo menos um deles são falados.
- Blacklist por cargo: membros com um cargo bloqueado nunca são falados; a blacklist tem prioridade sobre a whitelist.
- Ignora mensagens de bots, comandos do próprio bot e mensagens vazias; remove URLs de mensagens antes de gerar a fala, sem pronunciar os links. Se uma mensagem tiver apenas um link, ela não será falada. Limita o texto falado para evitar mensagens enormes. O áudio da fala é mantido apenas em memória e não é gravado como arquivo MP3/WAV.

A voz feminina brasileira antiga foi restaurada; preferências antigas para uma voz removida são transferidas para `brasileira`.

## Requisitos

- Node.js 20 ou mais novo.
- Python 3.10 ou mais novo.
- FFmpeg instalado e disponível no PATH.
- Conexão à internet para Edge TTS, proxy comunitário TikTok TTS (somente vozes TikTok) e gateway/voz do VSync. Se o Edge TTS falhar, o bot tenta usar uma voz instalada no Windows (fallback local).

## Instalação no Windows

1. Crie um bot em Configurações do VSync → Desenvolvedores e copie o token. Nunca o compartilhe.
2. Convide o bot para o servidor com as permissões `VIEW_CHANNEL`, `SEND_MESSAGES` e `CONNECT`. Dê acesso de leitura aos canais de texto que ele deve ler.
3. Instale Node.js, Python e FFmpeg. Durante a instalação do Python, marque a opção para adicionar Python ao PATH.
4. Copie `.env.example` para `.env` e cole o token em `VSYNC_BOT_TOKEN`.
5. Abra o terminal nesta pasta e execute:

   ```powershell
   npm install
   python -m pip install -r requirements.txt
   npm start
   ```

   Ou execute `start.bat`: ele verifica se o SDK do Fish Audio está instalado e tenta instalar as dependências Python que estiverem faltando. Se isso falhar, rode `python -m pip install -r requirements.txt` nesta pasta.

6. Entre em um canal de voz com pelo menos uma pessoa e envie uma mensagem em um canal de texto que o bot consegue ver. Ele deve pedir para entrar na call e falar a mensagem.

## Comandos no chat

O bot aceita comandos com prefixo `!` e também ` / ` digitado no chat: por exemplo, `!tts status` e `/tts status`. `!voz` e `/voz` também funcionam. **Observação:** o gateway VSync utilizado neste projeto entrega mensagens de chat, não interações nativas com autocomplete; por isso o prefixo `/tts` aqui é processado como texto de mensagem. Comandos de barra nativos dependem de a própria API da VSync oferecer suporte a interações.

Digite `!tts` ou `/tts` para ver a ajuda diretamente no chat.

### Comandos para todos

| Comando | O que faz |
|---|---|
| `!tts on` | Liga a leitura automática |
| `!tts off` | Desliga a leitura automática |
| `!tts entrar` | Pede para o bot entrar na call ocupada |
| `!tts sair` | Faz o bot sair da call |
| `!tts vozes` | Mostra as vozes disponíveis |
| `!tts voz nobara` | Escolhe Nobara para suas mensagens |
| `!tts voz goldship` | Escolhe Goldship (Fish Audio) para suas mensagens |
| `!tts voz brainrot` | Escolhe Steal a Brainrot para suas mensagens |
| `!tts voz toph` | Escolhe Toph Beifong para suas mensagens |
| `!tts voz yumeko` | Escolhe Yumeko para suas mensagens |
| `!tts voz saga` | Escolhe Saga de Gêmeos para suas mensagens |
| `!tts voz miku` | Escolhe Hatsune Miku para suas mensagens |
| `!tts voz kobayashi` | Escolhe Kobayashi para suas mensagens |
| `!tts voz bolsonaro` | Escolhe Bolsonaro para suas mensagens |
| `!tts voz sukuna` | Escolhe Sukuna para suas mensagens |
| `!tts voz corazon` | Escolhe Corazon para suas mensagens |
| `!tts voz tengen` | Escolhe Narrador Tengen de JJK para suas mensagens |
| `!tts voz kaiser` | Escolhe Kaiser (Fish Audio) para suas mensagens |
| `!tts voz brasileira` | Restaura a voz feminina brasileira (TikTok) |
| `!tts voz rick` | Escolhe Rick (Fish Audio) para suas mensagens |
| `!tts voz morty` | Escolhe Morty (Fish Audio) para suas mensagens |
| `!tts voz gojo` | Escolhe Satoru Gojo (Fish Audio) para suas mensagens |
| `!tts voz naoya` | Escolhe Naoya Zenin (Fish Audio) para suas mensagens |
| `!tts voz luffy` | Escolhe Monkey D. Luffy (Fish Audio) para suas mensagens |
| `!tts voz garnet` | Escolhe Garnet (Fish Audio) para suas mensagens |
| `!tts voz aleatoria` | Alterna suas vozes aleatoriamente |
| `!tts voz padrao` | Remove sua preferência e volta à voz padrão do servidor |
| `!tts cargos` | Mostra quem pode/não pode ser lido e os comandos de cargos |

### Comandos extras (dono/admin onde indicado)

| Comando | O que faz |
|---|---|
| `!tts status` / `/tts status` | Mostra leitura, voz padrão, sessão de voz, fila e restrição de canal |
| `!tts ping` / `/tts ping` | Verifica se o bot está respondendo e conectado ao gateway |
| `!tts canal #canal` | Restringe leitura automática a um canal de texto |
| `!tts canal ver` | Mostra o canal de leitura configurado |
| `!tts canal todos` | Permite leitura em todos os canais |
| `!tts canal reset` | Volta a respeitar `TTS_TEXT_CHANNEL_ID` do `.env` |
| `!tts voz-servidor NOME` | Define a voz padrão do servidor; preferências pessoais continuam valendo |
| `!tts voz-atual` | Mostra sua voz atual |
| `!tts velocidade 1.25` | Ajusta a velocidade por servidor (1.00–1.50) |
| `!tts limite 280` | Ajusta o máximo de caracteres por mensagem (80–600) |
| `!tts fila` | Mostra quantas mensagens aguardam |
| `!tts fila limite 20` | Ajusta o limite da fila (3–80) |
| `!tts limparfila` | Limpa mensagens aguardando; não interrompe a fala atual |
| `!tts config` | Mostra as configurações atuais do servidor |
| `!tts teste [texto]` | Envia uma fala de teste para a fila |

Os mesmos comandos de `!tts` podem ser digitados como `/tts ...`. Alterações em configurações do servidor, como canal, velocidade, limite, fila e voz padrão, exigem dono/admin.

### Cargos (somente dono/admin do servidor)

Mencione o cargo no comando para não precisar copiar o ID:

| Comando | O que faz |
|---|---|
| `!tts permitir @Cargo` | Permite que esse cargo seja lido |
| `!tts tirar @Cargo` | Remove o cargo da lista de permitidos |
| `!tts bloquear @Cargo` | Impede que membros com esse cargo sejam lidos |
| `!tts desbloquear @Cargo` | Remove o cargo da lista de bloqueados |
| `!tts limpar permitidos` | Limpa todos os cargos permitidos |
| `!tts limpar bloqueados` | Limpa todos os cargos bloqueados |

**Como as listas funcionam:** se a lista de permitidos estiver vazia, qualquer pessoa pode ser lida, exceto quem tiver um cargo bloqueado. Quando a lista de permitidos tem cargos, só pessoas com pelo menos um desses cargos são lidas. Bloqueios sempre têm prioridade. Cada servidor tem suas próprias listas. Membros comuns podem consultar `!tts cargos`, mas as alterações só são aceitas do dono/admin.

Os comandos antigos também continuam funcionando (`!voz lista`, `!voz NOME`, `!tts whitelist add ID_CARGO`, `!tts blacklist add ID_CARGO` e seus comandos `remove`/`clear`).

Vozes femininas: `francisca`, `brenda`, `elza`, `giovanna`, `leticia`, `manuela`, `thalita`, `mita`, `nobara`, `goldship`, `toph`, `yumeko`, `miku`, `kobayashi`, `tengen`, `lhays`. A voz `brasileira` é a voz feminina brasileira antiga (TikTok); `laizza` continua como alias de `nobara`.

Vozes masculinas: `antonio`, `donato`, `fabio`, `humberto`, `julio`, `nicolau`, `thiago`, `brainrot`, `saga`, `bolsonaro`, `sukuna`, `corazon`, `kaiser`, `rick`, `morty`, `mu`, `gojo`, `naoya`, `luffy`.

## Configurar vozes Fish Audio

1. Entre em `https://fish.audio/app/api-keys` e crie uma chave de API na sua própria conta.
2. Abra o arquivo `.env` do bot e acrescente `FISH_API_KEY=SUA_CHAVE_AQUI` (substitua pelo valor real, sem aspas).
3. Salve e reinicie o bot. Nunca mande essa chave em chat nem para outra pessoa.
4. No chat, use `!tts voz NOME` para selecionar qualquer voz Fish Audio. Exemplos: `mita`, `nobara`, `goldship`, `brainrot`, `toph`, `yumeko`, `saga`, `miku`, `kobayashi`, `bolsonaro`, `sukuna`, `corazon`, `tengen`, `kaiser`, `brasileira`, `rick`, `morty`, `peridot`, `mu`, `gojo` ou `naoya`.

A chave não vem incluída no ZIP. A Fish Audio pode aplicar limites de uso/custos conforme a conta; confira o painel antes de usar bastante. Se o terminal mostrar `[TTS] Fish Audio indisponível`, confira a mensagem do erro. Se aparecer `[TTS] Fallback ativo`, significa que a voz Fish não foi gerada e o Windows falou no lugar.

## Configuração opcional

- `TTS_TEXT_CHANNEL_ID`: ID de um único canal de texto que será lido. Vazio significa todos os canais de texto visíveis.
- `PYTHON_PATH`: nome/caminho do executável Python; padrão `python`.
- `FFMPEG_PATH`: nome/caminho do FFmpeg; padrão `ffmpeg`.
- `TTS_MAX_CHARS`: máximo de caracteres por mensagem (80 a 600; padrão 450).
- `TIKTOK_TTS_URL`: endereço do proxy comunitário usado por `lhays`; padrão `https://tiktok-tts.weilnet.workers.dev`. Não precisa de conta TikTok nem de cookie de sessão. Se falhar, o bot usa uma voz local do Windows como alternativa. O áudio gerado permanece em memória.
- `FISH_API_KEY`: chave privada da API Fish Audio necessária para todas as vozes marcadas como Fish Audio. Crie-a na página oficial `https://fish.audio/app/api-keys` e coloque-a no arquivo `.env`; não a compartilhe.
- `FISH_TTS_MODEL`: modelo de TTS da Fish Audio; por padrão `s2.1-pro-free`. O acesso e limites dependem da conta/plano. O texto é enviado à Fish Audio para gerar a fala.
- `TTS_ACL_ADMIN_USER_IDS`: IDs de usuário, separados por vírgulas, que podem alterar whitelist/blacklist.
- `TTS_ACL_ADMIN_ROLE_IDS`: IDs de cargo, separados por vírgulas, cujos membros podem alterar whitelist/blacklist.

## Diagnóstico quando não fala

A versão atual registra cada mensagem recebida no terminal com `[chat] MESSAGE_CREATE`. Use isso para identificar em qual etapa está parando:

- Se não aparecer `[chat] MESSAGE_CREATE`, confira se o bot está online e no mesmo servidor, e se tem `VIEW_CHANNEL` no canal onde você está escrevendo.
- Se aparecer que não encontrou call ocupada, entre em um canal de voz com pelo menos uma pessoa. O bot não pode escolher uma call vazia.
- Se gerar o áudio, mas informar que WebRTC não ficou pronto, confira se o bot tem `CONNECT` no canal de voz e envie o erro completo do terminal para diagnosticar a sinalização/ICE.
- Se aparecer erro de `python` ou `ffmpeg`, confira as dependências. Se o Edge TTS retornar 403, o bot usa a voz local do Windows. As vozes Fish Audio dependem da chave e do serviço Fish Audio; Lhays depende do proxy TikTok. Se o serviço da voz selecionada estiver indisponível, haverá fallback local. Confira no terminal as linhas `[TTS] Voz TikTok indisponível`, `[TTS] Fish Audio indisponível` e `[TTS] Fallback ativo`. Se a voz local falhar, instale uma voz de leitura no Windows.

A reprodução agora espera até 20 segundos por uma conexão de voz WebRTC pronta antes de enviar o áudio, evitando perder a mensagem durante a entrada na call.

## Notas importantes

- O bot precisa conseguir ver o canal de texto e ter `VIEW_CHANNEL`, `SEND_MESSAGES` e `CONNECT` no canal de voz.
- O áudio usa WebRTC e as credenciais ICE/TURN temporárias fornecidas pela rota `/ice` do VSync. Firewalls, bloqueio de UDP ou falha do TURN podem impedir o som.
- Para descobrir a call, o bot consulta o estado de voz do servidor. Se a mensagem for enviada por alguém que não está em uma call, ele tenta entrar na primeira call ocupada.
- O servidor limita entradas/trocas de call por bot; o código evita trocas rápidas.
- O áudio é gerado pelo pacote Python `edge-tts`, pela API da Fish Audio (vozes Fish Audio configuradas) ou pelo proxy comunitário para Lhays. Se o serviço online falhar (por exemplo, erro 403 ou proxy indisponível), o bot tenta automaticamente usar o mecanismo de voz local do Windows (System.Speech). Nesse modo alternativo, as opções do bot usam as vozes instaladas no Windows. O fallback prioriza primeiro o gênero selecionado e, entre as vozes desse gênero, português brasileiro. Se não houver nenhuma voz instalada do gênero pedido, ele mostra erro em vez de usar silenciosamente o gênero errado. Vozes diferentes da lista Edge (por exemplo, Francisca e Brenda) podem soar iguais quando o serviço Edge online está bloqueado e o Windows só tem uma voz instalada daquele gênero. Para obter timbres realmente diferentes no modo local, instale vozes adicionais em Configurações do Windows → Hora e idioma → Fala. A entrada do texto é transmitida como UTF-8/Base64 para preservar acentos como `á`, `ã`, `ç` e `é`. O fallback requer Windows PowerShell e FFmpeg disponível no PATH. O áudio é transmitido entre Python e FFmpeg por memória (pipes/buffers), sem criar arquivos de áudio temporários no disco. O arquivo `data/config.json` guarda a ativação, a voz padrão e as listas por servidor, além da preferência de voz de cada usuário dentro daquele servidor; não guarda o áudio nem o texto das mensagens.
- Esta é uma implementação inicial baseada nos contratos publicados na documentação do VSync. O protocolo de voz pode precisar de ajustes se o ambiente real devolver a sinalização SDP/ICE em formato diferente do documentado. A sintaxe do JavaScript pode ser verificada com `npm run check`, mas a conexão real precisa ser testada dentro do seu servidor VSync.


### Ajuste de velocidade e atraso

No arquivo `.env`, você pode configurar:

- `TTS_SPEED=1.20`: fala 20% mais rápida sem acelerar também o tom; use `1.00` para a velocidade normal. O programa limita o valor entre `1.00` e `1.50`.
- `TTS_QUEUE_LIMIT=12`: limita a fila de mensagens pendentes; quando ela enche, a mensagem mais antiga é descartada para não deixar o bot lendo mensagens muito atrasadas.
- `TTS_IDLE_LEAVE_MINUTES=5`: sai da call automaticamente após esse número de minutos sem mensagens de TTS. Padrão: 5 minutos; valores aceitos: 1 a 240. O bot não detecta conversa pelo microfone, então a inatividade é medida pelas mensagens que ele lê em voz alta.

O bot também espera a conexão de voz enquanto gera o áudio, escondendo parte do tempo de conexão.


## Segurança da whitelist/blacklist

A configuração das listas é separada por servidor. As alterações (`add`, `remove`, `clear`) devem ser aceitas somente para o dono do servidor ou um membro cuja permissão seja de administrador. Usuários comuns podem consultar a configuração, mas não alterá-la. Como as permissões disponíveis variam conforme a API da VSync, a verificação tenta ler o proprietário, permissões do membro e cargos com permissão de administrador. Se o servidor/API não fornecer essa informação, a alteração é negada por segurança.

Opcionalmente, `TTS_ACL_ADMIN_USER_IDS` e `TTS_ACL_ADMIN_ROLE_IDS` no `.env` podem autorizar administradores globais mantidos pelo responsável pelo bot. Esses valores são específicos da instalação do bot e não devem ser compartilhados.


## Importante ao atualizar para esta versão

O bot agora usa um proxy comunitário para as vozes TikTok e não precisa de `TIKTOK_SESSION_ID`. Se você já havia adicionado essa variável ao seu arquivo `.env`, remova a linha `TIKTOK_SESSION_ID=...` e mantenha `TIKTOK_TTS_URL=https://tiktok-tts.weilnet.workers.dev`. Não compartilhe cookies de sessão. Como o proxy é um serviço de terceiros, o texto das mensagens enviado a ele é processado externamente.


## Voz pessoal por usuário

A voz escolhida com `!tts voz NOME` é salva por pessoa e por servidor. Exemplo: se uma pessoa usar `!tts voz nobara`, só as mensagens dela serão lidas com Nobara; outra pessoa pode usar `!tts voz lhays` e terá Lhays nas próprias mensagens. Por compatibilidade, `!tts voz laizza` seleciona Nobara e `!tts voz brasileira` seleciona a voz feminina brasileira antiga. `!tts voz padrao` remove a preferência pessoal e volta à voz padrão já configurada no servidor. A troca não altera as preferências dos outros membros.

### Kaiser (Português BR)

Use `!tts voz kaiser` para selecionar Kaiser. O comando antigo `!tts voz extra` continua aceito como alias.

### Ajustes de velocidade

Esta versão usa mensagens de até 280 caracteres por padrão, fila de até 5 mensagens e velocidade 1.30x. A geração de voz continua dependendo do tempo de resposta da Fish Audio; `FISH_TTS_TIMEOUT=35` evita esperar indefinidamente por uma resposta lenta.


## Streaming de baixa latência (versão atualizada)

Para vozes Fish Audio, o bot usa WebSocket streaming com latência balanceada e encaminha blocos do áudio ao FFmpeg e à call assim que chegam. Os frames enviados ao VSync são copiados para buffers de exatamente 960 bytes, exigência do transmissor de áudio.

**Instale o SDK uma vez antes de abrir o bot:** feche o bot, abra CMD nesta pasta e execute `python -m pip install -r requirements.txt`. Se você usa `PYTHON_PATH` no `.env`, use esse mesmo executável no lugar de `python` para instalar. Mantenha `FISH_TTS_STREAMING=1` no `.env`. Defina `FISH_TTS_STREAMING=0` para desativar. Se o SDK não estiver instalado no Python usado pelo bot, ele avisará e tentará o modo REST, que pode demorar mais. A disponibilidade do modelo no endpoint de streaming também depende da conta/API.

### Vozes adicionais Fish Audio

- `!tts voz kaiser` — Kaiser, usando o link Fish Audio atualizado.
- `!tts voz brasileira` — voz feminina brasileira antiga.
- `!tts voz rick` — Rick (link `18a909f443c643a5b49c7b39f77fb201`).
- `!tts voz morty` — Morty (link `1e82d6a51def409792b9be325524ce0a`).

Os comandos antigos `!tts voz fish18a9` e `!tts voz fish1e82` continuam funcionando como aliases para Rick e Morty.
### Entonação pela pontuação

As vozes Fish Audio recebem tags curtas de personalidade em cada frase e mudanças mais fortes conforme a pontuação: `!` fica mais expressivo, `!!` e `!?` ficam mais intensos, `?` puxa a entonação de pergunta, `,` recebe pausa curta, `.` uma pausa breve e `~` fica brincalhão. O bot preserva as palavras da mensagem e insere apenas direções de interpretação compatíveis com o Fish S2. As vozes Edge/TikTok continuam usando a pontuação nativa do mecanismo de TTS. A intensidade final depende do modelo e da voz.

### Vozes Fish Audio adicionadas
- `!tts voz peridot` — Peridot (Steven Universe), ID `9b11ae0dfcc4495a807bf753f89db6f1`. Os aliases antigos `novavoz` e `nova` continuam funcionando.
- `!tts voz mu` — Mu de Áries (Saint Seiya), ID `1fb89a91a42542c18ffd871d4fcf1cd3`. Também aceita `aries` e `mu de aries`.


## Vozes novas: Gojo e Naoya

- `!tts voz gojo` — Satoru Gojo, com o perfil Fish Audio enviado.
- `!tts voz naoya` — Naoya Zenin, com o perfil Fish Audio enviado.

Também são aceitos os aliases `satoru`, `satoru gojo`, `gojo satoru`, `zenin`, `naoya zenin` e `zenin naoya`.

### Grito de "Explosão Galáctica" estilo anime

A frase recebe instruções especiais de interpretação e tratamento de áudio. Para aproximar a cena de Saint Seiya, selecione a voz Saga com `!tts voz saga`. O resultado ainda depende do modelo e do perfil de voz do Fish Audio; não é uma cópia exata da gravação do anime.
