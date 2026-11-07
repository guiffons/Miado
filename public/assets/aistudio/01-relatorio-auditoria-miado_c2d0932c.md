# PARTE 1: LEDGER DE COBERTURA E RELATÓRIO DE AUDITORIA - MIADO-MAIN

## 0. Escopo, método e limitações (leia antes dos achados)

- Alvo: `Miado-main` (43 entradas no zip). Referência metodológica: `security-audit-skill-main/skills/security-audit/SKILL.md` (critério de fronteira de confiança + resultado concreto, severidade apenas para achados confirmados, `needs_validation` sem severidade).
- Passada única, sem sub-agentes, sem execução do aplicativo. Rede do sandbox desabilitada e dependências não instaladas. A única verificação local foi uma simulação de `path.resolve` em Node para o achado MIADO-01.
- Os guias complementares (`CLIENT-SIDE.md`, `WEB-PROTOCOL-AND-AUTH.md`, `DATA-ISOLATION-AND-LIFECYCLE.md`, `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md`, `HUNTING.md`, `ATTACK-CLASSES.md`) NÃO foram lidos integralmente nesta passada. A classificação usa as classes nomeadas em `SKILL.md` e na especificação recebida. Uma segunda passada com esses guias carregados pode ampliar a lista.
- Os validadores `validate-findings.cjs` e `validate-coverage-ledger.cjs` NÃO foram executados; não existe `findings.json` nem `coverage-ledger.json` desta passada. Esta é uma cobertura PARCIAL. Não há run anterior.
- Convenção de severidade: critical, high, medium, low, info. Quando a exploração depende de fato externo ao repositório (variável de ambiente, configuração do Firebase, ambiente de deploy), o achado recebe `[needs_validation]` e a severidade indicada é a potencial, não a confirmada.

## 1. Coverage Ledger

Estados: `covered` = lido integralmente; `partial` = lido em parte ou por busca dirigida; `not_reviewed` = não lido.

| Arquivo | Linhas | Estado | O que foi feito |
|---|---|---|---|
| server.ts | 4484 | partial | Lidas integralmente: 1-420, 476-535, 1840-2010, 2100-2760, 2955-3235, 3675-3700, 4000-4484. Não lidas: 420-476, 535-1840 (motor de resolução Piped/Invidious, JioSaavn, SoundCloud, Archive.org, Audius), 2010-2100, 2760-2955, 3235-3675 (/api/album, /api/artist), 3700-4000 (corpo de /api/search). Nessas faixas só foram inspecionados por busca os pontos de `fetch`, `Map` e `.set(`. |
| src/server/security.ts | 157 | covered | Verificação de ID token, headers, rate limiter, schemas Zod. |
| src/server/catalog.ts | 272 | partial | Apenas `isForbidden30sPreviewUrl` e `deduplicateCanonicalTracks`. |
| src/server/charts.ts | 297 | partial | Apenas o caminho de leitura/escrita de `charts-cache.json`. |
| src/server/recommendations.ts | 188 | not_reviewed | - |
| src/server/des.ts | 258 | not_reviewed | Decriptação DES de URLs do JioSaavn (ver nota de conformidade, seção 4). |
| src/server/__tests__/miado.test.ts | 7878 B | partial | Apenas títulos dos casos; nenhum teste cobre autenticação, SSRF ou path traversal. |
| firestore.rules | 5426 B | covered | Integral. |
| firebase-blueprint.json | 5283 B | covered | Integral. |
| firebase-applet-config.json | 558 B | covered | Chaves do cliente Firebase (públicas por projeto; não é achado). |
| index.html | 652 | partial | Linhas 1-60 + buscas por `innerHTML`, emojis, `title=`, `<script>`. |
| src/app/miadoClient.js | 9762 | partial | Busca dirigida: 49 ocorrências de `innerHTML` (8 lidas em contexto), `localStorage`, chamadas `fetch`, `timeupdate`, `prefetchNextTrack`, `handleImgError`, `fetchItunesJson`, `fetchCommunityProfiles`. O restante não foi lido linha a linha. |
| src/services/firebaseClient.ts | 347 | covered | Integral. Não há `onSnapshot`. |
| src/ui/ambientGlass.ts | 195 | partial | Primeiras 40 linhas. |
| src/styles/base.css | 95 KB | partial | Contagem de propriedades (`user-select`, `overflow-x`, `scroll-snap`, `box-shadow`). |
| src/styles/liquid-glass.css | 11 KB | partial | Tokens `:root` e contagem de propriedades. |
| src/main.ts, src/main.tsx, src/App.tsx, src/index.css | 17/5/8/1 | covered | `main.tsx`, `App.tsx` e `index.css` são resíduo do template React e não são carregados por `index.html` (que usa `/src/main.ts`). |
| data/miado-db.json | 191 B | covered | Vazio (`accounts: {}`). |
| data/resolved-streams-cache.json | 4.6 KB | partial | Início do arquivo: entradas `{url, source, durationSec}` sem timestamp nem TTL. |
| data/charts-cache.json | 109 KB | partial | Início do arquivo. |
| package.json, .env.example, .gitignore, metadata.json | - | covered | `.env.example` não declara `MIADO_SESSION_SECRET`. |
| vite.config.ts, tsconfig.json | - | covered | - |
| public/audio/lisboa_anavitoria.m4a | 5.2 MB | not_reviewed | Binário. |

## 2. Findings (confirmados e `[needs_validation]`)

### MIADO-01 - critical - Leitura arbitrária de arquivos sem autenticação em `GET /api/stream`
- Local: `server.ts` L4287 (`rawUrlParam`), L4320 e L4323 (`targetUrl = rawUrlParam`), L4327-4335 (`path.resolve` + `res.sendFile`). Função: handler `/api/stream`.
- Classe: path traversal / arbitrary file read.
- Fronteira e resultado: qualquer cliente anônimo controla `url`. Se `url` começa com `/audio/` ou `public/audio/`, o valor é concatenado a `public/` e resolvido com `path.resolve(process.cwd(), ...)` sem checar que o resultado permanece dentro de `public/audio`. `res.sendFile` recebe o caminho já normalizado (sem `..`), então a proteção de `send` contra `..` não atua.
- Evidência local: simulação em Node com cwd `/app` resolveu `/audio/../../../etc/passwd` para `/etc/passwd`, `public/audio/../../server.ts` para `/app/server.ts`, `public/audio/../../data/miado-db.json` para `/app/data/miado-db.json`. `isForbidden30sPreviewUrl` não bloqueia esses valores.
- Impacto: leitura de código-fonte, de `data/miado-db.json` (campos públicos e `_encryptedVault`), de `firebase-applet-config.json` e de qualquer arquivo legível pelo processo cujo caminho não tenha segmento iniciado por ponto (o `send` ignora dotfiles por padrão, então `.env` provavelmente não é servido). O cabeçalho `Content-Type` é forçado a `audio/mp4`, mas o corpo é o arquivo. Combinado com MIADO-04, permite decifrar o cofre de contas.
- `[needs_validation]` (apenas o alcance): se `/proc/self/environ` retorna conteúdo útil via `sendFile` (arquivos de `/proc` reportam tamanho 0).
- Correção mínima: remover o ramo `url`-para-arquivo; servir áudio local somente por identificador de catálogo (`id` -> caminho fixo em allowlist), ou validar `path.relative(AUDIO_ROOT, filePath)` sem `..` e extensão `.m4a`. Teste de regressão: `url=/audio/../../../etc/passwd` deve retornar 400/404.

### MIADO-02 - critical - Leitura sem autenticação de dados privados de qualquer conta (`GET /api/user/firestore-sync?uid=`)
- Local: `server.ts` L4084-4120; origem dos uids em `GET /api/profiles` L4121 (campo `id` de cada perfil, preenchido com `uid` em L2500 e L4143).
- Classe: IDOR / broken object level authorization.
- Fronteira e resultado: rota sem `resolveAuthenticatedUser`. Retorna `account.user` (inclui `email`), `likedTracks`, `playlists`, `recentHistory`. O diretório público `/api/profiles` expõe o `uid` de cada usuário, então a enumeração é direta.
- Correção mínima: remover a rota (Firestore é a fonte de dados) ou exigir token e comparar `authUser.uid === uid`. Remover `id`=`uid` do payload público.

### MIADO-03 - high - Escrita e criação sem autenticação de contas, preferências e perfis
- Local: `POST /api/user/firestore-sync` L4003-4083 (uid/email vêm do corpo; cria conta com `passwordHash: ""` ou sobrescreve `user`, `likedTracks`, `playlists`, `recentHistory`, `handle` sem checar unicidade); `POST /api/user/preferences` L2642-2750 (`targetEmail = authUser?.email || email` do corpo: sem token, qualquer e-mail existente é alterado); `POST /api/profiles` L4174-4213 (cria/sobrescreve qualquer perfil por `@handle`, `avatarUrl`/`bannerUrl` sem sanitização).
- Classe: missing authentication / mass assignment / impersonation.
- Impacto: adulteração do perfil público e das playlists de terceiros; criação ilimitada de contas e perfis (crescimento de disco e de memória); personificação de handle.
- Correção mínima: `requireAuth` em todas as rotas de escrita; derivar identidade apenas do token; ignorar `email`/`uid` do corpo; validar com os schemas Zod que já existem em `security.ts` L138-157 e hoje não são usados (nenhum `.parse` em `server.ts`).

### MIADO-04 - critical (potencial) `[needs_validation]` - Segredo de sessão determinístico
- Local: `server.ts` L33-35 (`SESSION_SECRET` cai para `sha256(__dirname + ":miado_runtime_ephemeral_key")`), L119-131 (`verifySessionToken`), L156 (`DB_ENCRYPTION_KEY` derivada do mesmo segredo). `.env.example` não menciona `MIADO_SESSION_SECRET`.
- Classe: insecure default secret / forgeable token.
- Resultado: sem a variável de ambiente, o segredo é calculável a partir de um caminho previsível (`/app`, caminho obtido também via MIADO-01). Com ele, um atacante forja `miado_session` para qualquer e-mail (aceito por `resolveAuthenticatedUser`) e decifra `_encryptedVault` (contas, hashes e salts de senha).
- Fato externo: se o deploy define `MIADO_SESSION_SECRET` com valor forte. Validar com `process.env.MIADO_SESSION_SECRET` no ambiente de execução.
- Correção mínima: falhar na inicialização em produção quando a variável faltar ou tiver menos de 32 bytes; comparar assinatura com `crypto.timingSafeEqual` (L124 usa `!==`).

### MIADO-05 - high - SSRF e proxy aberto
- Local: `/api/stream` L4387 e L4416 (`fetchWithTimeout(targetUrl, { redirect: "follow" })`, `targetUrl` vem de `url`), `/api/artist-image` L2976-L3059 (`explicitUrl` com prefixo `http`), `/api/cover` L3100-L3115 (`rawUrl` com `^https?://`).
- Classe: SSRF (sem allowlist de host, sem bloqueio de IP privado/loopback/link-local, redirecionamentos seguidos, sem limite de bytes).
- Resultado: requisições do servidor a hosts internos e à rede do contêiner; o corpo é devolvido ao chamador (em `/api/stream` com `Access-Control-Allow-Origin: *`). O servidor também serve como relé de banda para terceiros.
- `[needs_validation]`: alcance interno real depende do ambiente (Cloud Run bloqueia o metadata server sem o cabeçalho `Metadata-Flavor`, que o chamador não controla aqui).
- Correção mínima: função única `safeFetch` com allowlist de domínios de CDN (dzcdn.net, mzstatic.com, saavncdn.com, archive.org, sndcdn.com, audius, instâncias Piped/Invidious configuradas), resolução DNS com bloqueio de faixas privadas, `redirect: "manual"` com revalidação, limite de bytes e timeout que cobre o corpo.

### MIADO-06 - high - Reflexão de `Content-Type` e envenenamento de cache em `/api/artist-image` e `/api/cover`
- Local: `server.ts` L3059-3070 e L3115-3127 (o `Content-Type` vem do upstream sem exigir `image/*`; só `/api/cat-avatar` verifica `startsWith("image/")`); chave de cache de `/api/artist-image` é apenas `normalizeStr(name)` (L2965), independente de `url`.
- Classe: cache poisoning / content-type confusion / hosting de conteúdo ativo na origem do app.
- Resultado: um atacante hospeda HTML, chama `/api/artist-image?name=lady gaga&url=https://atacante/x.html` e o servidor passa a servir esse conteúdo, como `text/html`, na origem do Miado, para todos os usuários que abrirem a URL (e substitui a imagem do artista para todos até reiniciar o processo).
- Correção mínima: ignorar `url` fornecida pelo cliente (resolver somente por `name` e por fontes confiáveis), exigir `image/png|jpeg|webp|gif`, enviar `X-Content-Type-Options: nosniff` e `Content-Disposition: inline; filename=...`, `Content-Security-Policy: sandbox` nessas respostas, e incluir a origem na chave de cache.

### MIADO-07 - high - XSS armazenado e refletido por ausência total de escape de saída
- Local: `src/app/miadoClient.js` - 49 atribuições a `innerHTML`, nenhuma função de escape no arquivo, nenhum DOMPurify. Exemplos: L6286 e L6322 (`<img src="${u.avatarUrl}" alt="${u.name}">`), L8281-8291 (perfis da comunidade), L7800/L7807 (`"${cleanTerm}"` do campo de busca), L8867 (`"${query}"`), L8881-8886 (`onerror="window.handleImgError(this, '${tr.title.replace(/'/g, "")}', ...)"` - só remove aspas simples, `"` e `\` quebram o atributo), L6131-6132 e L6406 (bio/handle).
- Classe: DOM XSS (stored + reflected).
- Cadeia confirmada: `POST /api/profiles` (sem autenticação) grava `avatarUrl` bruto -> `GET /api/profiles` -> `fetchCommunityProfiles` L1488-1511 -> `communityProfiles` -> `innerHTML` L8281. Um `avatarUrl` com `x" onerror="...` executa script no navegador de todo usuário que abra a lista de perfis. `sanitizeText` (L133) remove tags `<...>` mas preserva `"` e não é aplicado a `avatarUrl`/`bannerUrl`.
- Alcance do roubo: o token de sessão é gravado em `localStorage` (`miado_auth_token`, L1743 e `firebaseClient.ts`), legível por script; o cookie `HttpOnly` não protege contra isso.
- `[needs_validation]`: títulos vindos de Audius/Archive.org (conteúdo enviado por terceiros) chegando a esses mesmos sinks via `/api/search`.
- Correção mínima: substituir templates `innerHTML` por construção via `createElement`/`textContent` ou um helper `h()` que escapa por padrão; validar URLs de imagem por `new URL()` + esquema `https:` ou caminho `/api/...`; remover handlers inline (`onerror=`) em favor de listeners; adicionar CSP sem `unsafe-inline`.

### MIADO-08 - high - Autorização ausente em `DELETE /api/profiles/:handle`
- Local: `server.ts` L4214-4232. Exige token válido, mas não compara o `handle` com o do usuário autenticado.
- Resultado: qualquer conta autenticada remove o perfil público de qualquer outra.
- Correção mínima: comparar o handle do perfil com o handle da conta autenticada (ou, após a migração, com `uid`).

### MIADO-09 - medium - Força bruta de senha e enumeração de contas
- Local: `server.ts` L2391 e L2556 (`ip = String(req.headers["x-forwarded-for"] || ...)`: o valor bruto do cabeçalho é a chave do limitador; trocar o cabeçalho a cada tentativa contorna o limite), L2405 (senha mínima de 4 caracteres), L2575 e L2580 (404 "Conta não encontrada" x 401 "Senha incorreta"), L91 (`crypto.scryptSync` bloqueia o event loop por tentativa).
- Resultado: tentativas ilimitadas contra um e-mail conhecido, enumeração de e-mails cadastrados e degradação de disponibilidade por CPU.
- Correção mínima: `req.ip` com `trust proxy` configurado corretamente, limite por conta além do limite por IP, resposta única para credencial inválida, `crypto.scrypt` assíncrono, senha mínima de 10 caracteres. (A recomendação estrutural do Mega Prompt é eliminar a autenticação local e usar somente Firebase Auth.)

### MIADO-10 - medium `[needs_validation]` - Identidade por e-mail sem verificação
- Local: `src/server/security.ts` L38-79 (`verifyFirebaseIdToken` usa `u.email` de `accounts:lookup` sem checar `emailVerified`); contas locais indexadas por e-mail em `accounts[email]` (por exemplo L2412) sem verificação de posse; `firebaseClient.ts` usa `createUserWithEmailAndPassword`.
- Resultado potencial: quem registra (no Firebase ou na rota local) um e-mail alheio sem verificar posse passa a ser tratado pelo servidor como o dono da conta indexada por esse e-mail (`GET /api/db` retorna a conta inteira).
- Fato externo: provedor Email/Password habilitado no projeto Firebase e política de verificação.
- Correção mínima: exigir `emailVerified === true` ao vincular por e-mail; preferir `uid` como chave primária.

### MIADO-11 - medium - Ausência de validação de schema e mass assignment
- Local: `POST /api/db` L2226-2350 (`...body.user` em `mergedUser`, `followedArtists`, `followingProfiles` e `customAlbumCovers` sem limite de tamanho/forma; só `slice` em `likedTracks`/`playlists`); `express.json({ limit: "10mb" })` L1880 roda antes do limitador (que só existe nessa rota); os schemas Zod de `security.ts` não são importados.
- Resultado: persistência de campos arbitrários no cofre, inflar disco/memória, perfis com campos inesperados.
- Correção mínima: `schema.strict().parse(body)` por rota, limite de corpo de 100 KB nas rotas de usuário e 10 MB apenas onde necessário.

### MIADO-12 - medium - Exaustão de recursos
- Local: `scBufferCache` L510 (buffers completos de áudio, gravados em L1681, sem despejo; `delete` só em L4304); `artistImageCache`, `coverImageCache`, `fullStreamCache` (L483-514) sem limite; `tokenVerificationCache` e `rateBuckets` em `security.ts` e `authRateMap` em `server.ts` L144 nunca são podados; `fetchWithTimeout` L536-554 limpa o timer ao receber os cabeçalhos, então a leitura do corpo (`arrayBuffer()`) fica sem timeout e sem teto de bytes; `persistFullStreamCacheEntry` L496-508 reescreve o arquivo inteiro, de forma síncrona, a cada nova chave (`title|artist` controlados pelo cliente via `/api/resolve-full`); nenhuma rota GET de `/api/*` tem rate limit (cota de Deezer/iTunes/JioSaavn pode ser consumida por terceiros).
- Resultado: crescimento ilimitado de memória e disco, bloqueio do event loop e indisponibilidade.
- Correção mínima: cache LRU com teto de itens e bytes e TTL; `safeFetch` com teto de bytes e timeout total; limitador global por IP em `/api`.

### MIADO-13 - medium - Corrida e corrupção de persistência
- Local: `POST /api/db` L2228 (`readDb()`) antes de `await resolveAuthenticatedUser` L2231 e `writeDb` L2335: o snapshot lido fica obsoleto durante o `await`, e `writeDb` (L203-225) substitui `accounts` inteiro, perdendo escritas concorrentes (por exemplo, registros simultâneos). `resolved-streams-cache.json` (L496-508) e `charts-cache.json` (`charts.ts` L260) são gravados com `fs.writeFileSync` direto, sem arquivo temporário nem `rename`: queda no meio da escrita corrompe o JSON (o `catch {}` mascara e zera o cache). Entradas sem timestamp: URLs expiradas só são descartadas após uma falha de `fetch`.
- Correção mínima: fila de escrita serializada (mutex), `writeFile` em temporário + `fsync` + `rename`, esquema versionado com `expiresAt` por entrada.

### MIADO-14 - medium `[needs_validation]` - Servidor de desenvolvimento Vite no caminho de produção
- Local: `package.json` (`"start": "tsx server.ts"`), `server.ts` L4466-4476 (`NODE_ENV !== "production"` monta `vite.middlewares`, que serve a raiz do projeto).
- Resultado potencial: se o deploy não define `NODE_ENV=production`, arquivos do projeto (`data/miado-db.json`, `server.ts`, configurações) ficam alcançáveis por URL estática, dependendo das regras `server.fs` do Vite instalado.
- Fato externo: valor de `NODE_ENV` no runtime e comportamento do Vite 8 instalado.
- Correção mínima: `start` com `NODE_ENV=production` e `vite build` prévio; mover `data/` para fora da raiz servida.

### MIADO-15 - low - Regras do Firestore (`firestore.rules`)
- L97-99: `match /test/{docId} { allow read: if true; }` permite leitura sem autenticação (usado por `testConnection` em `firebaseClient.ts`).
- L85-86: `profiles` com `allow read: if isAuthenticated()` inclui sessões anônimas e permite `list` de todos os perfis (enumeração; cada documento aceita até 2.000.000 caracteres por campo de imagem, perto do limite de 1 MiB por documento).
- `users.email` não é comparado com `request.auth.token.email`; `username` do perfil não tem unicidade (impersonação de handle); não existem coleções, regras nem campos para playlists colaborativas (`ownerId`, `collaboratorIds`, `visibility`), seguidores, atividade ou presença: hoje as playlists são um array dentro de `users/{uid}`, impossível de compartilhar com controle de acesso.
- O que está correto: `users` é legível apenas pelo dono; `hasOnly` limita chaves; negação padrão no final.

### MIADO-16 - low - Cabeçalhos, sessão e CORS
- Dois blocos de cabeçalhos conflitantes: `X-XSS-Protection: 1; mode=block` (`server.ts` L1876) e depois `0` (`security.ts` L99); sem `Content-Security-Policy`, sem `frame-ancestors`/`X-Frame-Options` (clickjacking); `Referrer-Policy` definido duas vezes com valores diferentes.
- Cookie `miado_session` com `SameSite=None` (L2523, L2604, L2637) e aceito em rotas que alteram estado; hoje a ausência de CORS com preflight aprovado limita o CSRF, mas o atributo amplia a superfície sem necessidade.
- `POST /api/auth/logout` (L2635) não invalida o token (30 dias, sem revogação no servidor); verificação de assinatura não é de tempo constante (L124).
- `Access-Control-Allow-Origin: *` em `/api/stream` (L4331, L4349, L4407, L4444).

### MIADO-17 - low - Fallback JSONP do iTunes executa script de terceiro na origem
- Local: `src/app/miadoClient.js` `fetchItunesJson`: `script.src = url + "&callback=..."` (L435; há também JSONP do Deezer em L469). Compromisso ou interceptação do host executa código no contexto do app.

### MIADO-18 - info
- `firebase-applet-config.json` contém `apiKey`, `appId` e `oAuthClientId`: são identificadores públicos de cliente Firebase; a proteção depende das regras do Firestore e das restrições de chave no console. Não foi tratado como vazamento de segredo.

## 3. Desvios em relação à especificação de UI/UX e de módulos (base para o Mega Prompt)

- UI-01 Carrosséis: `scroll-snap-type: x mandatory` em `base.css` L2777, L2949, L2974, L3036 (a especificação exige `proximity`); `overscroll-behavior` não aparece em nenhum arquivo CSS; não há suporte à roda do mouse/trackpad nem botões laterais.
- UI-02 Seleção e arrasto: `user-select` aparece 5 vezes em `base.css` e nenhuma em `liquid-glass.css`; `-webkit-user-drag` não aparece.
- UI-03 Sombras: 74 ocorrências de `box-shadow` em `base.css` e 14 em `liquid-glass.css` (a especificação proíbe sombras pesadas).
- UI-04 Glifos não vetoriais na interface: o caractere U+2715 (X de fechar) em `index.html` L108 e em `miadoClient.js` L7697; o caractere U+2713 (marca de verificação) em `miadoClient.js` L5098, L5847, L6109, L6294, L6330, L8300, L8399.
- UI-05 Texto meta-explicativo ou referência a inspiração: `title="Expandir Player Apple Music"` em `index.html` L142; mensagens como "Catálogo completo carregado para manter o app rápido" (L3807, L3945), "Toque ou role para carregar mais artistas" (L4074), "Carregando faixas oficiais na ordem de estúdio e capa 1000x1000 HD do álbum..." (L7467), "Nenhum seguidor ainda. Compartilhe seu perfil na comunidade para conquistar seguidores!" (L6277).
- UI-06 Fallbacks de imagem: existem `handleImgError`, `handleCatAvatarError`, `createSolidAlbumSvg`, `createSolidArtistSvg`, `buildCuteCatSvg`, mas o SVG de fallback do servidor (`/api/cover`, `/api/artist-image`) usa estilo sólido roxo, fora do Liquid Glass, e a cadeia primário -> secundário -> placeholder não é única entre as telas.
- UI-07 Motor de áudio: pré-resolução só ocorre logo após iniciar a faixa (`prefetchNextTrack` L3415/L3422) e somente chama `/api/resolve-full`; a especificação exige disparo em 80% do progresso. A rotação de instâncias Piped/Invidious está no servidor (instâncias em L471-480, timeout de 2800 ms) e não há `AbortController` por instância controlado pelo cliente com limite de 4000 ms. O cache de streams não tem TTL.
- UI-08 Presença e listeners: não existe `onSnapshot` nem presença "Ouvindo agora" no Firestore (`currentTrack` é texto fixo "Ouvindo no Miado" no servidor local). `timeupdate` (L3146) atualiza apenas o DOM, com limite de 160 ms; não grava no Firestore. A privacidade (`public`, `followers_only`, `private`) não existe como dado nem como regra.
- UI-09 Arquitetura do cliente: um único arquivo de 9762 linhas (`miadoClient.js`, JavaScript sem tipos) concentra estado, API, player e todas as views.

## 4. Observação fora do escopo de segurança (conformidade)

O servidor envia cabeçalhos `X-Forwarded-For: 49.36.128.1` e `CF-IPCountry: IN` ao JioSaavn (`SAAVN_GLOBAL_HEADERS`, L252), decifra URLs de mídia (`des.ts`) e obtém faixas completas de instâncias Piped/Invidious e SoundCloud. Isso contorna restrições de região e de acesso desses provedores e tende a violar termos de serviço e direitos autorais de conteúdo. Não é um achado de segurança do código, mas é risco jurídico/operacional do produto e merece revisão do responsável antes de publicação.

## 5. Resumo

| Severidade | Quantidade | IDs |
|---|---|---|
| critical | 3 (1 potencial) | MIADO-01, MIADO-02, MIADO-04 (`[needs_validation]`) |
| high | 5 | MIADO-03, MIADO-05, MIADO-06, MIADO-07, MIADO-08 |
| medium | 6 (2 `[needs_validation]`) | MIADO-09, MIADO-10, MIADO-11, MIADO-12, MIADO-13, MIADO-14 |
| low | 3 | MIADO-15, MIADO-16, MIADO-17 |
| info | 1 | MIADO-18 |

Prioridade de correção: MIADO-01, MIADO-02, MIADO-03, MIADO-04 e MIADO-05 antes de qualquer outra mudança. Esses cinco são alcançáveis por qualquer cliente anônimo com uma única requisição HTTP.
