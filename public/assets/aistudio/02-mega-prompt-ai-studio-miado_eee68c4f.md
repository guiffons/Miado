````markdown
# ESPECIFICACAO DE REFATORACAO COMPLETA: MIADO

Projeto: plataforma web de streaming de audio e rede social musical (Express + Vite, TypeScript, Firebase Auth e Cloud Firestore, caches JSON locais). Esta especificacao substitui qualquer instrucao anterior. Ela e dividida em seis secoes numeradas; toda saida de codigo segue a Secao 6.

Referencias de linha apontam para o estado atual dos arquivos: `server.ts` (4484 linhas), `src/app/miadoClient.js` (9762 linhas), `src/server/security.ts`, `src/services/firebaseClient.ts`, `firestore.rules`. As faixas `server.ts` L420-L1840, L2010-L2100, L2760-L2955, L3235-L3675 e L3700-L4000 NAO foram auditadas linha a linha: ao migra-las, localizar todo uso de `fetchWithTimeout`, `fetch`, `Map`, `fs.` e aplicar as regras da Secao 4.

---

## 1. ARQUITETURA DO SISTEMA E MAPA DE ARQUIVOS COMPLETO

### 1.1 Invariantes globais (valem para todo arquivo gerado)

- I-01 Nenhum emoji e nenhum glifo nao vetorial em codigo, HTML, CSS, JSON, strings de interface, logs ou comentarios. Os caracteres U+2713, U+2715 e U+2665 (marca de verificacao, X de fechar e coracao) hoje presentes na interface sao substituidos por SVG. Letras acentuadas do portugues e pontuacao ASCII sao permitidas.
- I-02 Todo icone e SVG inline vindo de `src/ui/icons.ts` (viewBox 24x24, `stroke="currentColor"`, `fill="none"` salvo icones preenchidos, `stroke-width` 1.75, `stroke-linecap="round"`, `stroke-linejoin="round"`).
- I-03 A interface exibe apenas dados reais de midia, estados sociais e controles diretos. Remover todo texto que explique como o app funciona, notas de desenvolvimento, dicas de uso e referencias a apps de inspiracao. Lista obrigatoria de remocao ou substituicao: `title="Expandir Player Apple Music"` (index.html L142) vira `title="Expandir player"`; "Catalogo completo carregado para manter o app rapido" (miadoClient.js L3807, L3808, L3945, L4062) e removido (nenhum texto no lugar); "Toque ou role para carregar mais artistas" (L4074) e removido; "Carregando faixas oficiais na ordem de estudio e capa 1000x1000 HD do album..." (L7467) vira indicador de carregamento sem texto (esqueleto visual); "Nenhum seguidor ainda. Compartilhe seu perfil na comunidade para conquistar seguidores!" (L6277) vira "Nenhum seguidor"; textos de estado vazio ficam em uma frase curta e factual. Nenhuma string da interface contem os nomes Spotify, Apple, Netflix ou "estilo".
- I-04 Proibido `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, atributos inline de evento (`onerror=`, `onclick=`) e atributo `style=` com dados dinamicos. Toda DOM dinamica e criada por `h()` (`src/ui/dom.ts`) com `textContent` e `setAttribute`. A unica excecao e `src/ui/icons.ts`, que monta SVG a partir de constantes estaticas via `DOMParser`.
- I-05 Toda URL de imagem ou link vinda de API externa ou do Firestore passa por `safeUrl()` (`new URL()`, esquema `https:` ou caminho `/api/...`; `data:image/(png|jpeg|webp);base64,` apenas para avatar e banner com limite de tamanho).
- I-06 A identidade do usuario e exclusivamente o `uid` do Firebase Auth. A autenticacao local por e-mail e senha (`/api/auth/*`), as sessoes HMAC e o cofre `_encryptedVault` sao removidos. Nenhuma rota usa `email` ou `uid` do corpo da requisicao como identidade.
- I-07 Toda requisicao de saida do servidor usa `safeFetch` (Secao 4.1.2). `fetchWithTimeout` e removido.
- I-08 Toda escrita em `data/*.json` passa por `JsonStore` (Secao 4.1.3): serializada, atomica, com versao de esquema.
- I-09 Todo modulo novo ou reescrito e TypeScript em modo `strict`. `src/app/miadoClient.js` e dividido em modulos `.ts` e removido ao final.
- I-10 Nenhum segredo no repositorio. Variaveis de ambiente sao validadas na inicializacao por Zod; em producao o processo encerra se uma variavel obrigatoria faltar.
- I-11 Mensagens de erro enviadas ao cliente nao contem `e.message`, pilha ou caminhos (hoje ha `res.status(500).json({ error: e?.message ... })` em varias rotas). Formato unico: `{ "error": "<codigo_curto>", "requestId": "<id>" }`.

### 1.2 Topologia de runtime

- Um processo Node (`tsx server.ts`) escutando em `0.0.0.0:PORT`. Em `NODE_ENV=production` serve `dist/` (resultado de `vite build`); em desenvolvimento monta Vite em modo middleware com `server.fs.strict = true` e `server.fs.deny` contendo `data/**`, `server.ts`, `src/server/**`, `firestore.rules`, `.env*`, `**/*.pem`.
- O navegador fala com Firebase Auth e Firestore diretamente (SDK modular) e com o servidor Express apenas para: catalogo e busca, imagens (capa, artista, gato), resolucao e proxy de stream e escrita de faixas em playlists com validacao de permissao.
- O servidor valida ID tokens do Firebase localmente (Secao 4.1.5) e, quando precisa ler ou escrever no Firestore em nome do usuario, usa a API REST do Firestore com o proprio ID token do usuario no cabecalho `Authorization: Bearer`, de modo que `firestore.rules` e aplicada tambem no servidor.
- Dados de usuario residem somente no Firestore. `data/` guarda apenas estado operacional do servidor e caches.

### 1.3 Mapa de arquivos (cada arquivo, responsabilidade exata e acao)

Raiz:

| Arquivo | Responsabilidade apos a refatoracao | Acao |
|---|---|---|
| `server.ts` | Somente bootstrap, no maximo 150 linhas: carregar `config`, criar `app`, definir `trust proxy` por `TRUST_PROXY_HOPS`, registrar middlewares na ordem (requestId, cabecalhos de seguranca e CSP, limitador global, `express.json({ limit: "100kb" })`, autenticacao opcional), montar os routers de `src/server/routes/*`, tratador de erros, Vite (dev) ou `dist/` (producao), `listen`, encerramento gracioso que descarrega os caches (`SIGTERM`, `SIGINT`). Nenhuma regra de negocio. | reescrever |
| `index.html` | Shell estatico: `<aside id="sidebar-left">`, `<main id="viewport">`, `<aside id="panel-right">`, `<footer id="player-bar">`, contêiner de toasts, elemento `<audio id="audio-player">` sem `crossorigin`, `<noscript>`, um unico `<script type="module" src="/src/main.ts">`. Sem script inline, sem handler inline, sem `style=`, sem texto meta-explicativo. Links de fontes via `fonts.googleapis.com` com `preconnect`. | reescrever |
| `firestore.rules` | Regras da Secao 2.3. | reescrever |
| `firebase-blueprint.json` | Entidades e caminhos da Secao 2.4. | reescrever |
| `firebase-applet-config.json` | Configuracao publica do cliente Firebase. Nao alterar. | manter |
| `package.json` | Secao 4.7. | alterar |
| `vite.config.ts` | Remover plugins `react()` e `tailwindcss()`; manter alias `@`; `server.hmr` e `watch` conforme as variaveis `DISABLE_HMR` ja existentes (nao alterar esse bloco); adicionar `server.fs.strict` e `server.fs.deny`; `build.target = "es2022"`. | alterar |
| `tsconfig.json` | `strict: true`, `noUncheckedIndexedAccess: true`, remover `jsx` e `experimentalDecorators`; `include: ["src", "server.ts", "scripts"]`. | alterar |
| `.env.example` | `PORT`, `NODE_ENV`, `APP_URL`, `TRUST_PROXY_HOPS` (inteiro, padrao 1), `FRAME_ANCESTORS` (lista CSP, padrao `'self'`), `PIPED_INVIDIOUS_INSTANCES` (JSON opcional). Remover `MIADO_SESSION_SECRET` e `GEMINI_API_KEY` se nenhum codigo os importar apos a refatoracao (verificar por busca). | alterar |
| `.gitignore` | Acrescentar `data/*.tmp`, `data/*.bak`, `data/legacy/`, `data/*.corrupt-*`. | alterar |
| `metadata.json` | Sem alteracao. | manter |
| `scripts/check-forbidden.mjs` | Varre `src/**`, `index.html` e `server.ts`: falha se encontrar `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function`, `onerror=`, `onclick=` fora de `src/ui/icons.ts`, qualquer emoji (regex Unicode `\p{Extended_Pictographic}`) ou os caracteres U+2713, U+2715, U+2665 em arquivos de interface, e `box-shadow` com qualquer valor diferente de `none` ou do hairline permitido (Secao 3.1). | criar |

Dados (`data/`):

| Arquivo | Conteudo e regras | Acao |
|---|---|---|
| `data/miado-db.json` | Somente estado operacional do servidor: `{ "schemaVersion": 2, "legacyPurgedAt": null }`. Sem contas, sem hashes, sem perfis. Escrito apenas via `JsonStore`. | reescrever |
| `data/resolved-streams-cache.json` | `{ "schemaVersion": 2, "entries": { "<tituloNorm>\|<artistaNorm>": { "url": string, "source": string, "durationSec": number, "host": string, "resolvedAt": number, "expiresAt": number } } }`. TTL por host (Secao 4.1.4). No maximo 2000 entradas (LRU). Nenhuma URL de preview de 30 s. Gravacao atomica e com debounce de 2 s. | reescrever |
| `data/charts-cache.json` | `{ "schemaVersion": 2, "entry": { "payload": object, "fetchedAt": number, "expiresAt": number } }`, TTL 1 h, stale-while-revalidate ate 24 h. Gravacao atomica. | reescrever |
| `data/legacy/` | Destino do `miado-db.json` legado se contiver `_encryptedVault`: o arquivo e movido (renomeado) na inicializacao sem ser lido nem decifrado; `legacyPurgedAt` recebe a data. | criar na inicializacao |
| `public/audio/lisboa_anavitoria.m4a` | Servido apenas pela faixa de catalogo com id `local:lisboa_anavitoria` (mapa fixo id -> arquivo em `src/server/streams/localAudio.ts`). | manter |

Servidor (`src/server/`):

| Arquivo | Responsabilidade | Acao |
|---|---|---|
| `config.ts` | Le e valida `process.env` com Zod; exporta objeto imutavel; em producao encerra se faltar variavel obrigatoria. | criar |
| `security.ts` | Verificacao local de ID token Firebase (4.1.5), middlewares `attachAuth`, `requireAuth`, `requireVerifiedUser`; cabecalhos de seguranca e CSP unicos; `createRateLimiter` com mapa limitado e podado. Remove `verifyFirebaseIdToken` baseado em `accounts:lookup`, o cache de tokens e os schemas Zod nao usados. | reescrever |
| `schemas.ts` | Schemas Zod `.strict()` de todas as entradas de API (Secao 2.5). | criar |
| `net/allowlists.ts` | Constantes de hosts permitidos por categoria (API, imagem, stream). Derivar a lista dos hostnames realmente usados em `server.ts` (busca por `https://`) e em `catalog.ts`; sem curingas globais. | criar |
| `net/safeFetch.ts` | `safeFetchBuffer` e `safeFetchStream` (4.1.2). | criar |
| `storage/jsonStore.ts` | `JsonStore<T>` (4.1.3). | criar |
| `storage/ttlLruCache.ts` | `TtlLruCache<K, V>` com limite de itens e de bytes e TTL. | criar |
| `storage/streamCache.ts` | Cache de streams resolvidos sobre `JsonStore` + `TtlLruCache`. | criar |
| `storage/chartsCache.ts` | Cache de paradas sobre `JsonStore`. Substitui a leitura e escrita diretas de `charts.ts` L249-L260. | criar |
| `streams/resolver.ts` | Motor de resolucao migrado de `server.ts` L420-L1840 (Piped, Invidious, JioSaavn, Audius, Archive.org, SoundCloud) mantendo a logica de selecao, trocando `fetchWithTimeout` por `safeFetch`, com timeout por instancia de 3500 ms, TTL e sem `sc-buffer` ilimitado. | criar |
| `streams/localAudio.ts` | Mapa fixo de ids locais para arquivos em `public/audio`. | criar |
| `routes/health.ts` | `GET /api/health` com `{ status, instanceCount }`. | criar |
| `routes/media.ts` | `GET /api/cat-avatar`, `GET /api/cover`, `GET /api/artist-image`. | criar |
| `routes/catalog.ts` | `GET /api/search`, `/api/album`, `/api/artist`, `/api/discover-more`, `/api/recommendations`, `/api/charts`. | criar |
| `routes/stream.ts` | `GET /api/resolve-full`, `GET /api/stream`. | criar |
| `routes/playlists.ts` | `POST /api/playlists/:playlistId/tracks`, `DELETE /api/playlists/:playlistId/tracks/:trackKey`. | criar |
| `firestoreRest.ts` | Cliente minimo da API REST do Firestore (get, create, delete de documento) com conversao de tipos (`stringValue`, `integerValue`, `timestampValue`, `arrayValue`, `mapValue`) usando o ID token do usuario. | criar |
| `catalog.ts` | Manter funcoes de dedupe e classificacao de faixas. Ajustar `isForbidden30sPreviewUrl` para tambem rejeitar `preview` em qualquer segmento de caminho e query. | alterar |
| `charts.ts` | Usar `chartsCache`; usar `safeFetch`. | alterar |
| `recommendations.ts` | Manter. | manter |
| `des.ts` | Manter sem alteracoes (ver 5, item RT-21 sobre revisao juridica externa). | manter |
| `__tests__/miado.test.ts` | Manter. | manter |
| `__tests__/security.test.ts`, `__tests__/jsonStore.test.ts`, `__tests__/ttlLruCache.test.ts`, `__tests__/safeFetch.test.ts`, `__tests__/playlistsRoute.test.ts` | Secao 4.8. | criar |

Compartilhado (`src/shared/`):

| Arquivo | Responsabilidade | Acao |
|---|---|---|
| `types.ts` | Tipos da Secao 2.1, usados por cliente e servidor. | criar |
| `keys.ts` | `normalizeStr`, `normalizeSongTitleKey`, `buildTrackKey(title, artist)` (minusculas, sem acentos, `[a-z0-9_.:-]`, maximo 120 caracteres) usados pelos dois lados para chaves identicas. | criar |

Cliente (`src/`):

| Arquivo | Responsabilidade | Acao |
|---|---|---|
| `main.ts` | Bootstrap: importa estilos, inicializa Firebase, store, roteador, player; registra `ListenerRegistry`; sem globais em `window` (remove `window.miadoState`, `window.miadoUI`, `window.handleImgError`, `window.handleCatAvatarError`). | reescrever |
| `main.tsx`, `App.tsx`, `index.css` | Resquicio do template React, nao carregado por `index.html`. | remover |
| `app/miadoClient.js` | Dividido nos modulos abaixo e removido. | remover |
| `app/store.ts` | Estado em memoria tipado (usuario, privacidade, fila, faixa atual, curtidas, playlists carregadas), `subscribe(selector, fn)`, persistencia em `localStorage` somente de preferencias locais (volume, ultimo item da fila) com `try/catch` e chave versionada; nunca grava token. | criar |
| `app/router.ts` | Roteador por hash (`#/home`, `#/search/<q>`, `#/album/<id>`, `#/artist/<nome>`, `#/library`, `#/social`, `#/profile/<handle>`, `#/playlist/<id>`); cada rota monta uma view e chama o `unmount` da anterior. | criar |
| `app/api.ts` | Cliente HTTP tipado das rotas do servidor; injeta `Authorization: Bearer <idToken atual>` obtido de `auth.currentUser.getIdToken()` a cada chamada (sem copiar o token para `localStorage`); `AbortSignal` obrigatorio nas chamadas de busca e resolucao. | criar |
| `services/firebaseClient.ts` | Inicializacao modular do Firebase (`initializeApp`, `getAuth`, `initializeFirestore` com `persistentLocalCache`), funcoes de login (e-mail e senha, Google), `sendEmailVerification`, logout, exclusao de conta e exportacao de dados (le as subcolecoes e baixa um JSON), `ListenerRegistry`. Remove `testConnection` e a leitura de `test/connection`. Remove gravacao de `miado_auth_token` e `miado_user_uid`. | reescrever |
| `services/listenerRegistry.ts` | `register(scope, unsubscribe)`, `disposeScope(scope)`, `disposeAll()`, `size()`; limite de 40 listeners simultaneos (excedente lanca erro em desenvolvimento e registra aviso em producao). | criar |
| `social/profiles.ts` | Criacao e edicao de perfil com reserva de handle (lote atomico: `handles/{handle}` + `profiles/{uid}` + `users/{uid}`), busca por prefixo de handle, seguir e deixar de seguir (`follows/{followerId_followeeId}`). | criar |
| `social/presence.ts` | Publicador e leitor de presenca (4.4). | criar |
| `social/activity.ts` | Publicacao e leitura de atividade (4.4). | criar |
| `social/playlists.ts` | CRUD de playlists, colaboradores, visibilidade; `canEdit(playlist, uid)` e `canView(playlist, uid, followsOwner)` usados pela interface (espelham as regras); adicao e remocao de faixa via `api.ts` (servidor). | criar |
| `player/audioEngine.ts` | Elemento `<audio>`, controle de reproducao, fila, repeticao, aleatorio, `MediaSession`, eventos `play`, `pause`, `trackChange`, `ended`, `error`, pre-resolucao em 80% (4.3). | criar |
| `player/streamResolver.ts` | Cascata de resolucao com `AbortController` de 4000 ms por instancia e rotacao (4.3). | criar |
| `ui/dom.ts` | `h(tag, props, ...children)`, `clear(el)`, `mount(container, node)`, `safeUrl(value, opts)`, `bindEvents(root, signal)`. | criar |
| `ui/icons.ts` | Mapa nome -> SVG estatico; funcao `icon(name, opts)` retorna `SVGElement`. Inclui `check`, `close`, `heart`, `heart-filled`, `play`, `pause`, `skip-next`, `skip-prev`, `shuffle`, `repeat`, `volume`, `volume-mute`, `queue`, `search`, `home`, `library`, `users`, `user`, `plus`, `chevron-left`, `chevron-right`, `more`, `music-note`. | criar |
| `ui/images.ts` | `bindImageFallback(img, chain, kind, seed)` e `createGlassPlaceholder(kind, seed)` (3.6). | criar |
| `ui/carousel.ts` | `createCarousel(root, options)` (3.4). | criar |
| `ui/components/*.ts` | `trackRow.ts`, `mediaCard.ts`, `sectionHeader.ts`, `toast.ts`, `contextMenu.ts`, `modal.ts`, `seekBar.ts`, `volume.ts`, `profileCard.ts`, `playlistCard.ts`, cada um exporta uma funcao que retorna `HTMLElement` por `h()`. | criar |
| `ui/views/*.ts` | `home.ts`, `search.ts`, `album.ts`, `artist.ts`, `library.ts`, `playlist.ts`, `social.ts`, `profile.ts`, `auth.ts` (entrar e criar conta), `onboarding.ts`; cada uma exporta `mount(container, params, ctx): () => void`, o retorno e o `unmount`. | criar |
| `ui/ambientGlass.ts` | Manter extracao de cores da capa, `MediaSession`, atalhos de teclado e gesto de deslizar para baixo; remover qualquer `box-shadow`; capas carregadas apenas de `/api/cover` (mesma origem). | alterar |
| `styles/tokens.css` | Tokens da Secao 3.1. | criar |
| `styles/liquid-glass.css` | Superficies, componentes e carrossel (3.2 a 3.5). | reescrever |
| `styles/base.css` | Reset e estilos de layout que sobreviverem; remover todas as sombras e todos os `scroll-snap-type: x mandatory`; reduzir ao necessario apos a reescrita dos componentes. | reescrever |
| `rules/firestore.rules.test.ts` | Testes de regras com `@firebase/rules-unit-testing` (5.2). | criar |

---

## 2. CONTRATOS DE DADOS, SCHEMAS DO FIRESTORE E REGRAS DE SEGURANCA

### 2.1 Tipos TypeScript (`src/shared/types.ts`)

```ts
export type Visibility = "public" | "followers_only" | "private";
export type PresenceState = "playing" | "paused" | "idle";
export type ActivityType = "track_play" | "like" | "playlist_create" | "follow";

export interface TrackRef {
  trackKey: string;          // buildTrackKey(title, artist), ate 120 caracteres
  title: string;             // 1..200
  artist: string;            // 1..200
  albumTitle?: string;       // ate 200
  coverUrl?: string;         // "/api/cover?..." ou "https://..." ate 2000
  durationSec: number;       // inteiro 0..7200
}

export interface UserPrivacy {
  presence: Visibility;
  activity: Visibility;
}

// users/{uid}  (privado: somente o dono le e escreve)
export interface UserDoc {
  uid: string;
  email: string;             // igual ao e-mail do token, em minusculas
  name: string;              // 1..80
  handle: string;            // ^[a-z0-9_.]{2,28}$ , sem "@"
  bio?: string;              // ate 300
  catId: string;             // 1..40
  avatarUrl?: string;        // ver isImageRef
  bannerUrl?: string;
  favoriteArtists?: string[];   // ate 60
  favoriteGenres?: string[];    // ate 30
  followedArtists?: string[];   // ate 200
  privacy: UserPrivacy;
  onboardingCompleted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;      // sempre serverTimestamp()
}

// users/{uid}/likes/{trackKey}
export interface LikedTrackDoc extends TrackRef { likedAt: Timestamp; }

// users/{uid}/history/{eventId}
export interface HistoryEventDoc extends TrackRef { playedAt: Timestamp; completed?: boolean; }

// handles/{handle}  (unicidade de @handle)
export interface HandleDoc { uid: string; createdAt: Timestamp; }

// profiles/{uid}  (cartao publico lido por usuarios autenticados nao anonimos)
export interface ProfileDoc {
  uid: string;
  name: string;
  handle: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  favoriteArtists?: string[];   // ate 60
  updatedAt: Timestamp;
}

// follows/{followerId}_{followeeId}
export interface FollowDoc { followerId: string; followeeId: string; createdAt: Timestamp; }

// presence/{uid}  (um documento por usuario, sobrescrito a cada mudanca de estado)
export interface PresenceTrack {
  trackKey: string; title: string; artist: string; coverUrl?: string; durationSec: number;
}
export interface PresenceDoc {
  uid: string;
  visibility: Visibility;       // igual a users/{uid}.privacy.presence
  state: PresenceState;
  track?: PresenceTrack;        // ausente quando visibility == "private" ou state == "idle"
  updatedAt: Timestamp;
}

// activity/{activityId}
export interface ActivityDoc {
  actorId: string;
  type: ActivityType;
  visibility: Visibility;       // igual a users/{actorId}.privacy.activity, nunca "private"
  track?: PresenceTrack;
  playlistId?: string;
  targetUid?: string;
  createdAt: Timestamp;
}

// playlists/{playlistId}
export interface PlaylistDoc {
  ownerId: string;
  collaboratorIds: string[];    // ate 20, nao contem ownerId
  visibility: Visibility;
  name: string;                 // 1..80
  description?: string;         // ate 300
  coverUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// playlists/{playlistId}/tracks/{trackKey}
export interface PlaylistTrackDoc extends TrackRef { addedBy: string; addedAt: Timestamp; }
```

`Timestamp` e o tipo `Timestamp` do SDK `firebase/firestore` no cliente. Em `src/shared/types.ts` declarar `type Timestamp = { seconds: number; nanoseconds: number }` e adaptar nas bordas.

### 2.2 Colecoes, leitores e escritores

| Caminho | Le | Escreve |
|---|---|---|
| `users/{uid}` e subcolecoes `likes`, `history` | somente `uid` | somente `uid` |
| `handles/{handle}` | usuario autenticado nao anonimo | cria somente o dono que tambem grava `profiles/{uid}.handle == handle` no mesmo lote; apaga somente o dono quando o perfil deixa de usar o handle |
| `profiles/{uid}` | usuario autenticado nao anonimo (lista com `limit <= 30`) | somente `uid` |
| `follows/{followerId}_{followeeId}` | seguidor ou seguido | cria e apaga somente o seguidor |
| `presence/{uid}` | dono; demais por `visibility` (`public`: autenticados; `followers_only`: quem segue; `private`: ninguem) | somente `uid` |
| `activity/{id}` | mesma regra de visibilidade | cria e apaga somente o autor |
| `playlists/{id}` | dono e colaboradores sempre; demais por `visibility` | dono: tudo exceto `ownerId` e `createdAt`; colaborador: somente `updatedAt` |
| `playlists/{id}/tracks/{trackKey}` | quem pode ler a playlist | cria dono ou colaborador com `addedBy == uid`; apaga dono, ou colaborador apenas a propria adicao |

Tudo o que nao esta na tabela e negado.

### 2.3 `firestore.rules` (codigo completo e fechado)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ----------------------------- auxiliares -----------------------------
    function signedIn() {
      return request.auth != null
        && request.auth.token.firebase.sign_in_provider != 'anonymous';
    }
    function isSelf(uid) {
      return signedIn() && request.auth.uid == uid;
    }
    function isStr(v, minLen, maxLen) {
      return v is string && v.size() >= minLen && v.size() <= maxLen;
    }
    function optStr(d, k, maxLen) {
      return !(k in d) || (d[k] is string && d[k].size() <= maxLen);
    }
    function optList(d, k, maxLen) {
      return !(k in d) || (d[k] is list && d[k].size() <= maxLen);
    }
    function isVisibility(v) {
      return v is string && v in ['public', 'followers_only', 'private'];
    }
    function isHandle(h) {
      return h is string && h.matches('^[a-z0-9_.]{2,28}$');
    }
    function isTrackKey(k) {
      return k is string && k.matches('^[a-z0-9_.:-]{1,120}$');
    }
    function isImageRef(v, maxLen) {
      return v is string && v.size() <= maxLen
        && (v.matches('^/api/cat-avatar\\?id=[a-z0-9_]{1,40}$')
            || v.matches('^https://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]{4,2000}$')
            || v.matches('^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'));
    }
    function isCoverRef(v) {
      return v is string && v.size() <= 2000
        && (v.matches('^/api/cover\\?.{0,1990}$') || v.matches('^https://.{4,1990}$'));
    }
    function isTrackFields(d) {
      return isStr(d.title, 1, 200)
        && isStr(d.artist, 1, 200)
        && optStr(d, 'albumTitle', 200)
        && (!('coverUrl' in d) || isCoverRef(d.coverUrl))
        && d.durationSec is int && d.durationSec >= 0 && d.durationSec <= 7200;
    }
    function isPresenceTrack(t) {
      return t is map
        && t.keys().hasAll(['trackKey', 'title', 'artist', 'durationSec'])
        && t.keys().hasOnly(['trackKey', 'title', 'artist', 'coverUrl', 'durationSec'])
        && isTrackKey(t.trackKey)
        && isStr(t.title, 1, 200)
        && isStr(t.artist, 1, 200)
        && (!('coverUrl' in t) || isCoverRef(t.coverUrl))
        && t.durationSec is int && t.durationSec >= 0 && t.durationSec <= 7200;
    }
    function follows(followerUid, followeeUid) {
      return exists(/databases/$(database)/documents/follows/$(followerUid + '_' + followeeUid));
    }
    function canSee(ownerId, visibility) {
      return isSelf(ownerId)
        || (signedIn()
            && (visibility == 'public'
                || (visibility == 'followers_only' && follows(request.auth.uid, ownerId))));
    }
    function privacyAfter(uid) {
      return getAfter(/databases/$(database)/documents/users/$(uid)).data.privacy;
    }
    function playlistDoc(pid) {
      return get(/databases/$(database)/documents/playlists/$(pid)).data;
    }
    function isCollaborator(p) {
      return signedIn() && request.auth.uid in p.collaboratorIds;
    }
    function canSeePlaylist(p) {
      return isSelf(p.ownerId) || isCollaborator(p) || canSee(p.ownerId, p.visibility);
    }

    // ------------------------------- users --------------------------------
    function isValidUser(d) {
      return d.keys().hasAll(['uid', 'email', 'name', 'handle', 'catId', 'privacy',
                              'onboardingCompleted', 'createdAt', 'updatedAt'])
        && d.keys().hasOnly(['uid', 'email', 'name', 'handle', 'bio', 'catId', 'avatarUrl',
                             'bannerUrl', 'favoriteArtists', 'favoriteGenres',
                             'followedArtists', 'privacy', 'onboardingCompleted',
                             'createdAt', 'updatedAt'])
        && d.uid == request.auth.uid
        && 'email' in request.auth.token
        && d.email is string
        && d.email.lower() == request.auth.token.email.lower()
        && isStr(d.name, 1, 80)
        && isHandle(d.handle)
        && optStr(d, 'bio', 300)
        && isStr(d.catId, 1, 40)
        && (!('avatarUrl' in d) || isImageRef(d.avatarUrl, 100000))
        && (!('bannerUrl' in d) || isImageRef(d.bannerUrl, 150000))
        && optList(d, 'favoriteArtists', 60)
        && optList(d, 'favoriteGenres', 30)
        && optList(d, 'followedArtists', 200)
        && d.privacy is map
        && d.privacy.keys().hasAll(['presence', 'activity'])
        && d.privacy.keys().hasOnly(['presence', 'activity'])
        && isVisibility(d.privacy.presence)
        && isVisibility(d.privacy.activity)
        && d.onboardingCompleted is bool
        && d.createdAt is timestamp
        && d.updatedAt == request.time;
    }
    function isValidLike(d, key) {
      return d.keys().hasAll(['trackKey', 'title', 'artist', 'durationSec', 'likedAt'])
        && d.keys().hasOnly(['trackKey', 'title', 'artist', 'albumTitle', 'coverUrl',
                             'durationSec', 'likedAt'])
        && d.trackKey == key
        && isTrackFields(d)
        && d.likedAt == request.time;
    }
    function isValidHistory(d) {
      return d.keys().hasAll(['trackKey', 'title', 'artist', 'durationSec', 'playedAt'])
        && d.keys().hasOnly(['trackKey', 'title', 'artist', 'albumTitle', 'coverUrl',
                             'durationSec', 'playedAt', 'completed'])
        && isTrackKey(d.trackKey)
        && isTrackFields(d)
        && (!('completed' in d) || d.completed is bool)
        && d.playedAt == request.time;
    }

    match /users/{uid} {
      allow read: if isSelf(uid);
      allow create: if isSelf(uid)
        && isValidUser(request.resource.data)
        && request.resource.data.createdAt == request.time;
      allow update: if isSelf(uid)
        && isValidUser(request.resource.data)
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.email == resource.data.email;
      allow delete: if isSelf(uid);

      match /likes/{trackKey} {
        allow read, delete: if isSelf(uid);
        allow create: if isSelf(uid) && isTrackKey(trackKey)
          && isValidLike(request.resource.data, trackKey);
        allow update: if false;
      }
      match /history/{eventId} {
        allow read, delete: if isSelf(uid);
        allow create: if isSelf(uid)
          && eventId.matches('^[A-Za-z0-9_-]{1,40}$')
          && isValidHistory(request.resource.data);
        allow update: if false;
      }
    }

    // ------------------------------ handles -------------------------------
    match /handles/{handle} {
      allow read: if signedIn();
      allow create: if signedIn()
        && isHandle(handle)
        && request.resource.data.keys().hasAll(['uid', 'createdAt'])
        && request.resource.data.keys().hasOnly(['uid', 'createdAt'])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.createdAt == request.time
        && existsAfter(/databases/$(database)/documents/profiles/$(request.auth.uid))
        && getAfter(/databases/$(database)/documents/profiles/$(request.auth.uid)).data.handle == handle;
      allow update: if false;
      allow delete: if signedIn()
        && resource.data.uid == request.auth.uid
        && (!existsAfter(/databases/$(database)/documents/profiles/$(request.auth.uid))
            || getAfter(/databases/$(database)/documents/profiles/$(request.auth.uid)).data.handle != handle);
    }

    // ------------------------------ profiles ------------------------------
    function isValidProfile(d) {
      return d.keys().hasAll(['uid', 'name', 'handle', 'updatedAt'])
        && d.keys().hasOnly(['uid', 'name', 'handle', 'bio', 'avatarUrl', 'bannerUrl',
                             'favoriteArtists', 'updatedAt'])
        && d.uid == request.auth.uid
        && isStr(d.name, 1, 80)
        && isHandle(d.handle)
        && optStr(d, 'bio', 300)
        && (!('avatarUrl' in d) || isImageRef(d.avatarUrl, 100000))
        && (!('bannerUrl' in d) || isImageRef(d.bannerUrl, 150000))
        && optList(d, 'favoriteArtists', 60)
        && d.updatedAt == request.time
        && existsAfter(/databases/$(database)/documents/handles/$(d.handle))
        && getAfter(/databases/$(database)/documents/handles/$(d.handle)).data.uid == request.auth.uid;
    }

    match /profiles/{uid} {
      allow get: if signedIn();
      allow list: if signedIn() && request.query.limit <= 30;
      allow create, update: if isSelf(uid) && isValidProfile(request.resource.data);
      allow delete: if isSelf(uid);
    }

    // ------------------------------- follows ------------------------------
    match /follows/{followId} {
      allow read: if signedIn()
        && (resource.data.followerId == request.auth.uid
            || resource.data.followeeId == request.auth.uid);
      allow create: if signedIn()
        && request.resource.data.keys().hasAll(['followerId', 'followeeId', 'createdAt'])
        && request.resource.data.keys().hasOnly(['followerId', 'followeeId', 'createdAt'])
        && request.resource.data.followerId == request.auth.uid
        && isStr(request.resource.data.followeeId, 1, 128)
        && request.resource.data.followeeId != request.auth.uid
        && followId == request.auth.uid + '_' + request.resource.data.followeeId
        && request.resource.data.createdAt == request.time
        && exists(/databases/$(database)/documents/profiles/$(request.resource.data.followeeId));
      allow update: if false;
      allow delete: if signedIn() && resource.data.followerId == request.auth.uid;
    }

    // ------------------------------- presence -----------------------------
    function isValidPresence(d, uid) {
      return d.keys().hasAll(['uid', 'visibility', 'state', 'updatedAt'])
        && d.keys().hasOnly(['uid', 'visibility', 'state', 'track', 'updatedAt'])
        && d.uid == uid
        && isVisibility(d.visibility)
        && d.visibility == privacyAfter(uid).presence
        && d.state in ['playing', 'paused', 'idle']
        && (d.visibility == 'private'
            ? !('track' in d)
            : (!('track' in d) || isPresenceTrack(d.track)))
        && d.updatedAt == request.time;
    }

    match /presence/{uid} {
      allow get: if canSee(uid, resource.data.visibility);
      allow list: if false;
      allow create, update: if isSelf(uid) && isValidPresence(request.resource.data, uid);
      allow delete: if isSelf(uid);
    }

    // ------------------------------- activity -----------------------------
    match /activity/{activityId} {
      allow get: if canSee(resource.data.actorId, resource.data.visibility);
      allow list: if canSee(resource.data.actorId, resource.data.visibility)
        && request.query.limit <= 50;
      allow create: if signedIn()
        && request.resource.data.keys().hasAll(['actorId', 'type', 'visibility', 'createdAt'])
        && request.resource.data.keys().hasOnly(['actorId', 'type', 'visibility', 'track',
                                                 'playlistId', 'targetUid', 'createdAt'])
        && request.resource.data.actorId == request.auth.uid
        && request.resource.data.type in ['track_play', 'like', 'playlist_create', 'follow']
        && request.resource.data.visibility == privacyAfter(request.auth.uid).activity
        && request.resource.data.visibility != 'private'
        && (!('track' in request.resource.data) || isPresenceTrack(request.resource.data.track))
        && optStr(request.resource.data, 'playlistId', 40)
        && optStr(request.resource.data, 'targetUid', 128)
        && request.resource.data.createdAt == request.time;
      allow update: if false;
      allow delete: if signedIn() && resource.data.actorId == request.auth.uid;
    }

    // ------------------------------- playlists ----------------------------
    function isValidPlaylist(d) {
      return d.keys().hasAll(['ownerId', 'collaboratorIds', 'visibility', 'name',
                              'createdAt', 'updatedAt'])
        && d.keys().hasOnly(['ownerId', 'collaboratorIds', 'visibility', 'name', 'description',
                             'coverUrl', 'createdAt', 'updatedAt'])
        && isStr(d.ownerId, 1, 128)
        && d.collaboratorIds is list
        && d.collaboratorIds.size() <= 20
        && !(d.ownerId in d.collaboratorIds)
        && isVisibility(d.visibility)
        && isStr(d.name, 1, 80)
        && optStr(d, 'description', 300)
        && (!('coverUrl' in d) || isImageRef(d.coverUrl, 2000))
        && d.updatedAt == request.time;
    }

    match /playlists/{playlistId} {
      allow get: if signedIn() && canSeePlaylist(resource.data);
      allow list: if signedIn() && canSeePlaylist(resource.data) && request.query.limit <= 50;
      allow create: if isSelf(request.resource.data.ownerId)
        && isValidPlaylist(request.resource.data)
        && request.resource.data.createdAt == request.time;
      allow update: if signedIn()
        && ((isSelf(resource.data.ownerId)
             && isValidPlaylist(request.resource.data)
             && request.resource.data.ownerId == resource.data.ownerId
             && request.resource.data.createdAt == resource.data.createdAt)
            || (isCollaborator(resource.data)
                && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['updatedAt'])
                && request.resource.data.updatedAt == request.time));
      allow delete: if isSelf(resource.data.ownerId);

      match /tracks/{trackKey} {
        allow read: if signedIn() && canSeePlaylist(playlistDoc(playlistId));
        allow create: if signedIn()
          && (isSelf(playlistDoc(playlistId).ownerId) || isCollaborator(playlistDoc(playlistId)))
          && isTrackKey(trackKey)
          && request.resource.data.keys().hasAll(['trackKey', 'title', 'artist', 'durationSec',
                                                  'addedBy', 'addedAt'])
          && request.resource.data.keys().hasOnly(['trackKey', 'title', 'artist', 'albumTitle',
                                                   'coverUrl', 'durationSec', 'addedBy', 'addedAt'])
          && request.resource.data.trackKey == trackKey
          && request.resource.data.addedBy == request.auth.uid
          && request.resource.data.addedAt == request.time
          && isTrackFields(request.resource.data);
        allow update: if false;
        allow delete: if signedIn()
          && (isSelf(playlistDoc(playlistId).ownerId)
              || (isCollaborator(playlistDoc(playlistId))
                  && resource.data.addedBy == request.auth.uid));
      }
    }

    // ------------------------- negacao padrao -----------------------------
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Notas de implementacao das regras: o cliente grava `createdAt`, `updatedAt`, `likedAt`, `playedAt` e `addedAt` sempre com `serverTimestamp()`. A reserva de handle, a criacao do perfil e a atualizacao de `users/{uid}.handle` acontecem em um unico `writeBatch`. A troca de `privacy` e a atualizacao de `presence/{uid}` acontecem no mesmo `writeBatch` (as regras usam `getAfter`).

### 2.4 `firebase-blueprint.json`

Regenerar o arquivo mantendo a estrutura `{ "entities": {...}, "firestore": {...} }` ja usada. Entidades (JSON Schema, `type: "object"`, com `properties` e `required` espelhando a Secao 2.1, `maxLength` identicos aos limites das regras): `UserAccount`, `LikedTrack`, `HistoryEvent`, `Handle`, `Profile`, `Follow`, `Presence`, `Activity`, `Playlist`, `PlaylistTrack`. Campos de data usam `"type": "string", "format": "date-time"`. Mapa `firestore`:

- `/users/{userId}` -> `UserAccount` (descricao: documento privado, somente o dono)
- `/users/{userId}/likes/{trackKey}` -> `LikedTrack`
- `/users/{userId}/history/{eventId}` -> `HistoryEvent`
- `/handles/{handle}` -> `Handle`
- `/profiles/{userId}` -> `Profile`
- `/follows/{followId}` -> `Follow`
- `/presence/{userId}` -> `Presence`
- `/activity/{activityId}` -> `Activity`
- `/playlists/{playlistId}` -> `Playlist`
- `/playlists/{playlistId}/tracks/{trackKey}` -> `PlaylistTrack`

Remover do blueprint os campos `likedTracks`, `playlists`, `recentHistory`, `followingProfiles` do documento `UserAccount` e o campo `isSelf` de `Profile`. Limites de `avatarUrl` e `bannerUrl`: 100000 e 150000 caracteres.

### 2.5 Contratos de API (`src/server/schemas.ts`, todos `.strict()`)

- `GET /api/health` -> `{ status: "ok", instanceCount: number }`
- `GET /api/charts` -> query vazia (o parametro `refresh` do cliente e ignorado; a atualizacao forcada interna ocorre no maximo uma vez a cada 5 minutos por processo).
- `GET /api/search` -> `q` (string 1..100, apos `trim`), `page` (inteiro 1..4, padrao 1), `limit` (inteiro 1..45, padrao 30).
- `GET /api/album` -> `collectionId` (somente digitos, ate 20), `dzAlbumId` (somente digitos, ate 20), `title` (ate 120), `artist` (ate 120); ao menos um identificador ou o par `title`+`artist`.
- `GET /api/artist` -> `name` (1..120).
- `GET /api/discover-more` -> `page` (inteiro 1..6).
- `GET /api/recommendations` -> `artists` (lista separada por virgula, no maximo 6 itens, cada um ate 80).
- `GET /api/cat-avatar` -> `id` (um dos identificadores de `REAL_CAT_MULTI_SOURCES`, validado por enum).
- `GET /api/cover` -> `title` (ate 120), `artist` (ate 120), `url` opcional: somente `https:` e host da allowlist de imagens (`net/allowlists.ts`); a chave de cache inclui o hash SHA-1 da URL normalizada.
- `GET /api/artist-image` -> `name` (1..120), `url` opcional com a mesma regra de `/api/cover`; a chave de cache inclui o hash da URL.
- `GET /api/resolve-full` -> `title` (1..200), `artist` (ate 200), `instanceIdx` (inteiro 0..N-1 opcional), `fresh` (`"1"` opcional, forca nova resolucao com limite de 1 por chave a cada 30 s). Resposta: `{ isFullStream, source, durationSec, url: "/api/stream?title=..&artist=..&full=1", expiresAt, instanceCount }`.
- `GET /api/stream` -> `title` (1..200), `artist` (ate 200), `full` (`"1"`), e opcionalmente `id` (apenas `local:<nome>` mapeado em `localAudio.ts`). O parametro `url` NAO existe: qualquer chave desconhecida resulta em 400.
- `POST /api/playlists/:playlistId/tracks` (autenticada, usuario verificado) -> corpo `{ title, artist, albumTitle?, coverUrl?, durationSec }`; resposta 201 `{ trackKey }`; 403 sem permissao; 404 se a playlist nao existir ou nao for visivel.
- `DELETE /api/playlists/:playlistId/tracks/:trackKey` (autenticada) -> 204.
- Rotas removidas: `/api/db`, `/api/account`, `/api/account/export`, `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/user/preferences`, `/api/user/firestore-sync`, `/api/profiles` (GET, POST, DELETE).

---

## 3. ESPECIFICACAO DO DESIGN SYSTEM LIQUID GLASS E CORRECOES DE UI/UX

### 3.1 Tokens (`src/styles/tokens.css`)

```css
:root {
  color-scheme: dark;

  /* superficies */
  --glass-structure-bg: rgba(16, 16, 20, 0.68);
  --glass-card-bg: rgba(255, 255, 255, 0.04);
  --glass-card-bg-hover: rgba(255, 255, 255, 0.07);
  --glass-border: 1px solid rgba(255, 255, 255, 0.08);
  --glass-border-strong: 1px solid rgba(255, 255, 255, 0.16);
  --glass-blur: blur(24px) saturate(180%);
  --glass-specular: inset 0 1px 0 rgba(255, 255, 255, 0.06); /* unico box-shadow permitido */
  --surface-solid: #14141a;                                    /* fallback sem transparencia */

  /* iluminacao ambiente derivada da capa ativa (ambientGlass.ts atualiza os tres canais) */
  --ambient-c1: 139, 92, 246;
  --ambient-c2: 59, 130, 246;
  --ambient-c3: 236, 72, 153;
  --accent: rgb(var(--ambient-c1));

  /* texto */
  --text-primary: rgba(255, 255, 255, 0.94);
  --text-secondary: rgba(255, 255, 255, 0.66);
  --text-tertiary: rgba(255, 255, 255, 0.46);

  /* tipografia */
  --font-ui: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-display: "Outfit", var(--font-ui);
  --tracking-display: -0.02em;
  --tracking-ui: -0.005em;
  --fs-xs: 0.75rem;  --fs-sm: 0.8125rem; --fs-md: 0.9375rem;
  --fs-lg: 1.125rem; --fs-xl: 1.5rem;    --fs-2xl: 2.25rem;

  /* geometria */
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 18px; --radius-pill: 999px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px;
  --left-w: 280px; --right-w: 340px; --player-h: 88px;
  --carousel-item-w: 176px;

  /* movimento */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --t-transform: transform 0.25s var(--ease-out);
  --t-surface: background-color 0.2s ease, border-color 0.2s ease;
}

@media (prefers-reduced-transparency: reduce) {
  :root { --glass-structure-bg: var(--surface-solid); --glass-card-bg: #1b1b22; --glass-card-bg-hover: #22222b; --glass-blur: none; }
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  :root { --glass-structure-bg: var(--surface-solid); --glass-card-bg: #1b1b22; --glass-card-bg-hover: #22222b; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

Regra de sombras: o unico `box-shadow` permitido em todo o CSS e `var(--glass-specular)` (filete interno de 1 px) e `none`. Todas as 74 ocorrencias de `box-shadow` em `base.css` e as 14 de `liquid-glass.css` sao removidas ou trocadas por borda e contraste de superficie. `text-shadow` e `filter: drop-shadow` tambem sao proibidos. A verificacao esta em `scripts/check-forbidden.mjs`.

Contraste: `--text-secondary` sobre `--glass-structure-bg` deve atingir razao minima 4.5:1 (WCAG AA); se o calculo contra a pior combinacao de capa ambiente falhar, elevar a opacidade para 0.72.

### 3.2 Superficies, grid e componentes (`src/styles/liquid-glass.css`)

```css
html, body { height: 100dvh; margin: 0; overflow: hidden; background: #07060b; color: var(--text-primary);
  font-family: var(--font-ui); letter-spacing: var(--tracking-ui); }

.glass-panel {
  background: var(--glass-structure-bg);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  box-shadow: var(--glass-specular);
}
.glass-card {
  background: var(--glass-card-bg);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  border-radius: var(--radius-md);
  transition: var(--t-transform), var(--t-surface);
}
.glass-card:hover, .glass-card:focus-visible { background: var(--glass-card-bg-hover); border: var(--glass-border-strong); }
.glass-card:focus-visible, .icon-btn:focus-visible, .nav-item:focus-visible, .track-row:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.16); outline-offset: 2px;
}
.glass-card:hover { transform: translateY(-2px); }

/* fundo ambiente */
#miado-ambient-backdrop { position: fixed; inset: 0; z-index: -1; pointer-events: none; }
.ambient-orb { position: absolute; width: 60vmax; height: 60vmax; border-radius: 50%; opacity: 0.22; filter: blur(80px); transition: background 0.8s ease; }
.ambient-orb-1 { left: -10vmax; top: -15vmax; background: rgb(var(--ambient-c1)); }
.ambient-orb-2 { right: -15vmax; top: 10vmax; background: rgb(var(--ambient-c2)); }
.ambient-orb-3 { left: 20vmax; bottom: -25vmax; background: rgb(var(--ambient-c3)); }

/* grid funcional */
.app-shell {
  display: grid; height: 100dvh;
  grid-template-columns: var(--left-w) minmax(0, 1fr) var(--right-w);
  grid-template-rows: minmax(0, 1fr) var(--player-h);
  grid-template-areas: "left main right" "player player player";
  gap: var(--space-2); padding: var(--space-2);
  padding-top: max(var(--space-2), env(safe-area-inset-top));
  padding-bottom: max(var(--space-2), env(safe-area-inset-bottom));
}
#sidebar-left { grid-area: left; } #viewport { grid-area: main; } #panel-right { grid-area: right; } #player-bar { grid-area: player; }
#sidebar-left, #viewport, #panel-right { min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; border-radius: var(--radius-lg); }
#viewport { padding: var(--space-5); scroll-behavior: smooth; }
#player-bar { border-radius: var(--radius-lg); display: grid; grid-template-columns: 1fr minmax(320px, 560px) 1fr; align-items: center; padding: 0 var(--space-4); }

@media (max-width: 1200px) { .app-shell { grid-template-columns: var(--left-w) minmax(0, 1fr); grid-template-areas: "left main" "player player"; } #panel-right { position: fixed; right: var(--space-2); top: var(--space-2); bottom: calc(var(--player-h) + var(--space-3)); width: min(var(--right-w), 92vw); transform: translateX(110%); transition: var(--t-transform); z-index: 30; } #panel-right[data-open="true"] { transform: none; } }
@media (max-width: 820px) { .app-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) var(--player-h) 64px; grid-template-areas: "main" "player" "left"; } #sidebar-left { display: flex; flex-direction: row; overflow: hidden; } }

/* tipografia */
h1, h2, h3, .section-title { font-family: var(--font-display); letter-spacing: var(--tracking-display); font-weight: 700; }
.track-title { font-size: var(--fs-md); font-weight: 600; } .track-meta { font-size: var(--fs-sm); color: var(--text-secondary); }

/* linha de faixa */
.track-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: var(--space-3); align-items: center; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--glass-card-bg); border: var(--glass-border); transition: var(--t-surface); }
.track-row:hover, .track-row:focus-visible { background: var(--glass-card-bg-hover); border: var(--glass-border-strong); }
.cover { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-sm); background: var(--glass-card-bg); }
.icon-btn { display: inline-grid; place-items: center; min-width: 44px; min-height: 44px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--text-secondary); transition: var(--t-surface), var(--t-transform); }
.icon-btn:hover { color: var(--text-primary); background: var(--glass-card-bg-hover); } .icon-btn:active { transform: scale(0.94); }
.icon-btn svg { width: 20px; height: 20px; }
```

### 3.3 Barra de busca de progresso e volume

`seekBar.ts` e `volume.ts` usam `input[type=range]` estilizado por `appearance: none` (trilha de 4 px em `rgba(255,255,255,0.16)`, preenchimento com `var(--accent)`, polegar visivel apenas em `:hover` e `:focus-visible`). Atualizacao do preenchimento por `style.setProperty("--fill", pct + "%")` (CSSOM, compativel com CSP). O valor e atualizado em `timeupdate` limitado a 160 ms, com `requestAnimationFrame`, e somente enquanto a aba esta visivel.

### 3.4 Correcao definitiva do scroll e swipe horizontal (carrosseis de charts, recomendacoes e lancamentos)

```css
.carousel {
  display: flex;
  gap: var(--space-4);
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  scroll-padding-inline: var(--space-5);
  scrollbar-width: none;
  padding-block: var(--space-2);
}
.carousel::-webkit-scrollbar { display: none; }
.carousel > .carousel-item { flex: 0 0 var(--carousel-item-w); scroll-snap-align: start; min-width: 0; }
.carousel[data-dragging="true"] { scroll-snap-type: none; cursor: grabbing; }
.carousel-wrap { position: relative; }
.carousel-btn { position: absolute; top: 40%; z-index: 2; opacity: 0; transition: opacity 0.2s ease; }
.carousel-wrap:hover .carousel-btn, .carousel-btn:focus-visible { opacity: 1; }
.carousel-btn[data-dir="prev"] { left: var(--space-2); } .carousel-btn[data-dir="next"] { right: var(--space-2); }
.carousel-btn[disabled] { opacity: 0; pointer-events: none; }
@media (hover: none) { .carousel-btn { display: none; } }
```

Remover `scroll-snap-type: x mandatory` de `base.css` (L2777, L2949, L2974, L3036) e qualquer regra anterior de carrossel conflitante (`!important` incluido).

`src/ui/carousel.ts` exporta `createCarousel(root: HTMLElement, options: { signal: AbortSignal; step?: number }): { destroy(): void; update(): void }` com este comportamento exato:

1. Botoes laterais `prev` e `next` (icones `chevron-left` e `chevron-right`, `aria-label` "Anterior" e "Proximo"); clique chama `root.scrollBy({ left: +-0.85 * root.clientWidth, behavior: "smooth" })`.
2. Estado dos botoes (`disabled` nas extremidades) atualizado por listener de `scroll` passivo limitado por `requestAnimationFrame` e por `ResizeObserver`.
3. Trackpad e gesto horizontal funcionam nativamente (deltas em X). Roda de mouse vertical converte para horizontal somente com `Shift` pressionado (`wheel` com `{ passive: false }`, `preventDefault` apenas nesse caso), para nao sequestrar a rolagem vertical da pagina.
4. Arrastar com mouse (`pointerType === "mouse"`): `pointerdown` inicia, `pointermove` aplica `scrollLeft -= dx`, define `data-dragging="true"` apos 5 px de deslocamento, `setPointerCapture`; em `pointerup` o primeiro `click` seguinte e suprimido se houve arraste. Toque usa o scroll nativo (sem handler).
5. Teclado: com o carrossel focado (`tabindex="0"`, `role="region"`, `aria-roledescription="carrossel"`), `ArrowLeft` e `ArrowRight` rolam um passo.
6. Todos os listeners usam o `signal` recebido; `destroy()` aborta e desconecta o `ResizeObserver`.

### 3.5 Selecao de texto e arrasto fantasma

```css
.app-shell, .app-shell button, .glass-card, .track-row, .cover, .carousel, .carousel-item,
.section-title, .section-header, #player-bar, .seek, .volume, .nav-item {
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
}
.app-shell img, .app-shell svg, .app-shell a { -webkit-user-drag: none; user-drag: none; }
input, textarea, [contenteditable="true"], [data-selectable] {
  -webkit-user-select: text; user-select: text; -webkit-touch-callout: default;
}
```

Campos de texto, a biografia do perfil e os elementos com `data-selectable` permanecem selecionaveis. Adicionar em `main.ts` um listener unico `dragstart` no `document` com `preventDefault()` quando `event.target` for `HTMLImageElement` ou `SVGElement`.

### 3.6 Fallback visual em cadeia e placeholder SVG em Liquid Glass (`src/ui/images.ts`)

`bindImageFallback(img: HTMLImageElement, chain: string[], kind: "album" | "artist" | "avatar", seed: string): void`:

1. Define `img.decoding = "async"`, `img.loading = "lazy"`, `img.draggable = false`, `alt` quando fornecido (vazio para imagens decorativas).
2. Define `img.src = chain[0]`; `chain` e montada assim: album -> [coverUrl original validada por `safeUrl`, `/api/cover?title=..&artist=..`]; artista -> [imagem do artista validada, `/api/artist-image?name=..`]; avatar -> [`avatarUrl` validada, `/api/cat-avatar?id=<catId>`].
3. Listener `error` (via `addEventListener`, `{ once: false }`) avanca para o proximo item da cadeia; contador em `img.dataset.fallbackStep`; ao esgotar, define `img.src = createGlassPlaceholder(kind, seed)` e remove o listener. Nunca fica visivel o icone de imagem quebrada: enquanto nenhuma fonte carregou, a imagem tem `visibility: hidden` e o contêiner mostra o placeholder como `background-image` ate o evento `load`.
4. `createGlassPlaceholder(kind, seed)` retorna um data URI `data:image/svg+xml;utf8,` + `encodeURIComponent(svg)`. O SVG e geometrico, deterministico por `seed` (hash FNV-1a de 32 bits -> matiz H1 e H2), 600x600, sem texto e sem emoji:
   - fundo: `linearGradient` de `hsl(H1 40% 18%)` a `hsl(H2 45% 10%)`;
   - dois ou tres circulos e um retangulo arredondado com `fill="rgba(255,255,255,0.05)"` e `stroke="rgba(255,255,255,0.12)"` de 2 px, posicionados por derivacao do hash;
   - `album`: arcos concentricos centrais (disco estilizado) sem furo; `artist` e `avatar`: circulo com `clipPath` circular e silhueta geometrica (circulo de cabeca e arco de ombros);
   - um `feGaussianBlur` leve em um circulo de realce (`rgba(255,255,255,0.10)`) para sugerir vidro; sem sombras.
5. O SVG de fallback gerado no servidor (`/api/cover`, `/api/artist-image` quando nenhuma fonte responde) usa o mesmo gerador em `src/shared/placeholder.ts` (funcao pura, sem DOM), de modo que cliente e servidor produzam o mesmo visual.

---

## 4. PLANO DE IMPLEMENTACAO E REFATORACAO MODULO POR MODULO

### 4.1 Servidor

#### 4.1.1 `config.ts`
Zod: `PORT` (inteiro, padrao 3000), `NODE_ENV` (`development` | `production` | `test`, padrao `development`), `APP_URL` (opcional), `TRUST_PROXY_HOPS` (inteiro 0..5, padrao 1), `FRAME_ANCESTORS` (padrao `'self'`), `PIPED_INVIDIOUS_INSTANCES` (JSON opcional; padrao as instancias hoje em `server.ts` L471-L480). Falha de validacao em producao encerra o processo com codigo 1.

#### 4.1.2 `net/safeFetch.ts`
Assinaturas:

```ts
export interface SafeFetchOptions {
  allowHosts: readonly (string | RegExp)[];   // igualdade exata ou sufixo com fronteira de ponto
  timeoutMs: number;                          // total, inclui a leitura do corpo
  maxBytes: number;                           // teto de bytes do corpo
  maxRedirects?: number;                      // padrao 3
  headers?: Record<string, string>;
  acceptContentType?: RegExp;                 // ex.: /^image\/(png|jpeg|webp|gif)/
  signal?: AbortSignal;
}
export async function safeFetchBuffer(url: string, o: SafeFetchOptions): Promise<{ status: number; headers: Headers; body: Buffer; finalUrl: string }>;
export async function safeFetchStream(url: string, o: SafeFetchOptions): Promise<{ status: number; headers: Headers; stream: ReadableStream<Uint8Array>; finalUrl: string; abort(): void }>;
```

Algoritmo, para a URL inicial e para cada redirecionamento:
1. `new URL(url)`; rejeitar se `username` ou `password` nao vazios; permitir `https:`; permitir `http:` apenas para hosts marcados explicitamente como `http` na allowlist; porta somente 80 ou 443.
2. Hostname deve casar a allowlist (igualdade ou sufixo com fronteira, por exemplo `.saavncdn.com`); rejeitar IP literal.
3. Resolver com `dns.promises.lookup(host, { all: true })`; rejeitar se qualquer endereco for privado ou reservado (`isPrivateAddress`): IPv4 `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.0.0.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `224.0.0.0/4`, `240.0.0.0/4`; IPv6 `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `64:ff9b::/96` e enderecos IPv4 mapeados (`::ffff:a.b.c.d`) validados como IPv4.
4. Fixar o IP validado na conexao (anti DNS rebinding) com um `Agent` do pacote `undici` cujo `connect.lookup` devolve somente os enderecos ja validados; usar `fetch` do `undici` com `dispatcher` e `redirect: "manual"`.
5. Seguir no maximo `maxRedirects` redirecionamentos 301, 302, 303, 307 e 308, revalidando todo o passo 1 a 4 para cada `Location`.
6. Um unico `AbortController` e criado antes do primeiro `fetch` e SO e limpo quando o corpo termina ou o fluxo e encerrado (corrige `fetchWithTimeout` L536-L554, que limpa o timer ao receber os cabecalhos). `signal` externo e combinado com `AbortSignal.any`.
7. `safeFetchBuffer` le o corpo com contador de bytes e aborta ao exceder `maxBytes` (erro `body_too_large`); `Content-Length` acima do teto e rejeitado antes de ler. `acceptContentType` e verificado nos cabecalhos finais.
8. Erros lancam `SafeFetchError` com `code` (`host_not_allowed`, `private_address`, `too_many_redirects`, `timeout`, `body_too_large`, `bad_content_type`, `upstream_status`); nenhum detalhe e repassado ao cliente.

Limites por uso: imagens `maxBytes` 4 MB, `timeoutMs` 5000; JSON de catalogo `maxBytes` 2 MB, `timeoutMs` 4200; stream de audio: `safeFetchStream` sem `maxBytes` mas com `timeoutMs` de 8000 para obter os cabecalhos e encerramento por `abort()` quando o cliente fecha a conexao.

#### 4.1.3 `storage/jsonStore.ts`
`class JsonStore<T extends { schemaVersion: number }>` com `constructor(file, { defaults, schemaVersion, migrate?, maxBytes, flushDebounceMs? })`, `get(): T` (copia imutavel), `update(mutator: (draft: T) => void): Promise<void>`, `flush(): Promise<void>`.
- Todas as mutacoes passam por uma cadeia de promessas (mutex): `this.queue = this.queue.then(() => run())`, de modo que 100 atualizacoes concorrentes se aplicam em sequencia sem perda.
- Escrita atomica: serializar, rejeitar se maior que `maxBytes`, abrir `file + ".tmp"` com `fs.promises.open(path, "w")`, escrever, `fh.sync()`, fechar, `fs.promises.rename(tmp, file)`, manter copia `file + ".bak"` do ultimo arquivo valido antes do `rename`.
- Carga: se o JSON for invalido, mover o arquivo para `file + ".corrupt-<timestamp>"`, tentar `.bak`, senao usar `defaults`; aplicar `migrate` quando `schemaVersion` for menor; nunca engolir erros de forma silenciosa (registrar com `console.warn` sem dados do conteudo).
- `flushDebounceMs` agrupa gravacoes; `process.on("SIGTERM"|"SIGINT"|"beforeExit")` chama `flush()` de todos os stores registrados.

#### 4.1.4 `storage/ttlLruCache.ts` e `storage/streamCache.ts`
- `TtlLruCache<K, V>({ maxEntries, maxBytes, ttlMs, sizeOf })`: `get` remove entradas expiradas; `set` aplica LRU; `prune()` em intervalo de 60 s com `timer.unref()`. Usos e limites: capas e fotos de artista `maxBytes` 64 MB e 2 MB por item; avatares de gato 8 MB; buffers de audio do SoundCloud (substitui `scBufferCache`, L510 e L1681) `maxBytes` 128 MB, 25 MB por item, TTL 30 min; cache de certificados do Firebase.
- `streamCache`: entradas `{ url, source, durationSec, host, resolvedAt, expiresAt }`. `expiresAt`: para URLs com parametro `expire=<epoch>` (googlevideo) usar esse valor menos 60 s; `saavncdn.com` 6 h; `archive.org` 24 h; demais 2 h. `get` descarta entradas expiradas e remove do arquivo; ate 2000 entradas, descartando a menos recente; gravacao via `JsonStore` com debounce de 2000 ms (substitui `persistFullStreamCacheEntry`, L496-L508). A chave e `${normalizeSongTitleKey(title)}|${normalizeStr(primaryArtist)}`; chaves do cliente passam por `schemas.ts` (limite de tamanho) antes de chegar ao cache.

#### 4.1.5 `security.ts`
1. `verifyFirebaseIdToken(token)`: separar o JWT em 3 partes (rejeitar tamanho acima de 4096); cabecalho com `alg === "RS256"` e `kid`; obter o certificado X.509 de `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com` via `safeFetchBuffer` (host na allowlist), cache por `max-age` do cabecalho `Cache-Control`; verificar a assinatura com `crypto.createPublicKey(cert)` e `crypto.verify("RSA-SHA256", ...)`; validar `aud === projectId`, `iss === "https://securetoken.google.com/" + projectId`, `sub` nao vazio com no maximo 128 caracteres, `exp > agora`, `iat <= agora + 60`, `auth_time <= agora + 60`. Retornar `{ uid: sub, email, emailVerified: email_verified === true, provider: firebase.sign_in_provider }`. `projectId` vem de `firebase-applet-config.json`. Nao ha cache de token; o ID token e reverificado a cada requisicao (custo local e baixo).
2. `attachAuth` (opcional) le somente `Authorization: Bearer`; cookies nao sao mais usados. `requireAuth` responde 401 sem token valido. `requireVerifiedUser` exige `emailVerified === true` e `provider !== "anonymous"`, resposta 403.
3. Cabecalhos unicos (um unico middleware): `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy: autoplay=(self), microphone=(), camera=(), geolocation=()`; `Cross-Origin-Opener-Policy: same-origin-allow-popups`; remover `X-XSS-Protection`. CSP em producao: `default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; frame-src https://accounts.google.com https://*.firebaseapp.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors ${FRAME_ANCESTORS}`. Em desenvolvimento usar `Content-Security-Policy-Report-Only` com a mesma politica mais `'unsafe-eval'` e `ws:` exigidos pelo Vite. Sem `'unsafe-inline'` em `script-src` e `style-src`.
4. `createRateLimiter({ windowMs, max, keyFn })`: chave padrao `req.ip` (o `trust proxy` e definido por `TRUST_PROXY_HOPS`; NUNCA ler `x-forwarded-for` diretamente); mapa com no maximo 50000 chaves e poda por intervalo; resposta 429 com `Retry-After`. Limites: global em `/api` 300 por minuto por IP; `/api/search`, `/api/album`, `/api/artist`, `/api/discover-more`, `/api/recommendations` 60 por minuto; `/api/cover`, `/api/artist-image`, `/api/cat-avatar` 240 por minuto; `/api/resolve-full` 60 por minuto; `/api/stream` 120 por minuto; `/api/playlists/*` 30 por minuto por `uid`.
5. Tratador de erros final: log com `requestId`, resposta `{ error, requestId }`.

#### 4.1.6 `streams/resolver.ts` e `routes/stream.ts`
- Migrar de `server.ts` (L420-L1840) as funcoes de resolucao e pontuacao mantendo o comportamento. Substituir cada `fetchWithTimeout` por `safeFetchBuffer` com a allowlist de API ou de stream correspondente. Cada instancia Piped ou Invidious tem timeout de 3500 ms; uma instancia que falha 3 vezes seguidas entra em quarentena de 5 minutos (estado em memoria).
- `GET /api/resolve-full`: com `instanceIdx`, resolve somente naquela instancia (timeout 3500 ms) e grava no `streamCache`; sem `instanceIdx`, percorre as instancias em ordem rotativa. Resposta inclui `expiresAt` e `instanceCount`. `fresh=1` ignora o cache para a chave (limite 1 por 30 s por chave).
- `GET /api/stream?title&artist&full=1`: obter a entrada no `streamCache` (ou resolver); validar o cabecalho `Range` com a expressao `^bytes=\d{0,12}-\d{0,12}$` (um unico intervalo), senao 416; `safeFetchStream` com `Range`; tipo de conteudo limitado a `audio/mp4`, `audio/mpeg`, `audio/webm`, `audio/ogg` (mesma deducao de `safeContentType` em L4372-L4381); `Cache-Control: private, max-age=300`; sem `Access-Control-Allow-Origin`; encadear com `stream/promises.pipeline` e `abort()` quando `req` fecha. Em falha do upstream: remover a chave do cache, resolver novamente uma vez e, se falhar, responder 404 `{ "error": "stream_unavailable" }`.
- `GET /api/stream?id=local:<nome>`: servir apenas arquivos do mapa fixo `localAudio.ts`, com `res.sendFile` em caminho absoluto fixo (`dotfiles: "deny"`), `Content-Type: audio/mp4`, `Accept-Ranges: bytes`. O ramo atual de `server.ts` L4327-L4335 (que resolve caminhos a partir do parametro `url`) e removido por completo.

#### 4.1.7 `routes/media.ts` e `routes/catalog.ts`
- Todas as saidas de imagem: `Content-Type` fixado a partir do tipo detectado (`image/png`, `image/jpeg`, `image/webp`, `image/gif`) por assinatura magica dos primeiros bytes, nao pelo cabecalho do upstream; `X-Content-Type-Options: nosniff`; `Content-Security-Policy: sandbox; default-src 'none'`; `Cache-Control: public, max-age=86400`. Rejeitar o corpo se a assinatura nao for de imagem.
- Chave de cache de `/api/artist-image` = `normalizeStr(name)` + `|` + SHA-1 de `url` normalizada (ou vazio); de `/api/cover` = chave atual + SHA-1 de `url`. Eliminar o cache indexado somente por nome (L2965).
- `/api/cat-avatar`: validar `id` por enum e aplicar a mesma deteccao de assinatura; o `res.redirect` final aponta para uma constante fixa.
- Rotas de catalogo: parse Zod `.strict()` da query; resposta de erro padronizada; sem `e.message` ao cliente. Aplicar `safeFetchBuffer` a todas as chamadas de Deezer, iTunes, JioSaavn, Audius e Archive.org. Os cabecalhos sinteticos `X-Forwarded-For` e `CF-IPCountry` de `SAAVN_GLOBAL_HEADERS` (L252) NAO devem ser reproduzidos no codigo novo: removê-los e registrar a decisao em comentario curto; se o provedor deixar de responder, a faixa cai para as demais fontes.

#### 4.1.8 `routes/playlists.ts` e `firestoreRest.ts`
`POST /api/playlists/:playlistId/tracks` (cadeia de middlewares: limitador por `uid`, `requireAuth`, `requireVerifiedUser`, validacao Zod do corpo):
1. `GET` do documento `playlists/{playlistId}` pela API REST do Firestore com o ID token do usuario. Resposta 403 do Firestore -> 404 ao cliente (nao revelar existencia); 404 -> 404.
2. Verificacao explicita no servidor: `ownerId === uid` ou `collaboratorIds.includes(uid)`; caso contrario 403. `visibility` nao concede escrita.
3. Canonizar a faixa: `trackKey = buildTrackKey(title, artist)`; `coverUrl` somente se for `/api/cover?...` ou host da allowlist de imagens, senao descartada; `durationSec` inteiro 0..7200; recusar faixas rejeitadas por `isOriginalStudioTrack` quando o produto assim exigir.
4. `POST` em `playlists/{playlistId}/tracks?documentId=<trackKey>` pela REST com o ID token, com `addedBy = uid` e `addedAt = <request time>` (a regra exige `request.time`: usar `commit` com `updateTransforms` `setToServerValue: REQUEST_TIME`) e, no mesmo `commit`, `updatedAt` da playlist com `REQUEST_TIME`.
5. Resposta 201 `{ trackKey }`. A exclusao segue o mesmo caminho com a regra de que colaborador remove somente o que adicionou.
Os testes usam um `fetch` simulado que implementa a decisao de permissao para provar que o servidor nega antes de chamar a escrita.

### 4.2 `server.ts` (reescrita final)
Ordem de middlewares: `requestId` -> cabecalhos de seguranca e CSP -> `express.json({ limit: "100kb" })` -> limitador global de `/api` -> `attachAuth` -> routers (`health`, `media`, `catalog`, `stream`, `playlists`) -> 404 JSON para `/api/*` -> estaticos (`dist/` em producao; Vite em desenvolvimento com `server.fs.deny`) -> tratador de erros. `app.set("trust proxy", cfg.TRUST_PROXY_HOPS)` antes de qualquer middleware que use `req.ip`. Na inicializacao: se `data/miado-db.json` contiver `_encryptedVault`, mover o arquivo para `data/legacy/miado-db.<timestamp>.json` sem le-lo e gravar o novo estado. Encerramento gracioso com `server.close()` e `flush()` dos stores.

### 4.3 Motor de audio no cliente

`player/streamResolver.ts`:
```ts
export interface ResolvedStream { url: string; expiresAt: number; source: string; durationSec: number; }
export async function resolveStream(track: TrackRef, opts: { signal: AbortSignal; instanceCount: number; fresh?: boolean }): Promise<ResolvedStream>;
```
- Para `i` de 0 a `instanceCount - 1` (comecando por `lastGoodInstance` e rotacionando): criar `AbortController` com `setTimeout(abort, 4000)` combinado ao `signal` recebido; chamar `GET /api/resolve-full?title&artist&instanceIdx=i` (e `fresh=1` quando `fresh`); erro HTTP, falha de rede, timeout ou `isFullStream === false` avanca para a proxima instancia.
- Apos obter a URL, validar a decodificacao: atribuir `audio.src` e aguardar `canplay` ou `error` por ate 4000 ms; `MediaError.code` igual a 3 ou 4, ou falha de CORS/rede, avanca para a proxima instancia. A primeira instancia que atinge `canplay` e guardada em `lastGoodInstance`.
- Se todas falharem: emitir `playback-unavailable`; a interface exibe estado "Faixa indisponivel" no item da fila e avanca para a proxima faixa apos 1200 ms.
- Invalidacao de URL expirada: se `audio` emitir `error` quando `Date.now() >= expiresAt - 30000` ou o erro ocorrer depois de ja ter reproduzido, chamar `resolveStream(track, { fresh: true })` uma vez e retomar da posicao atual.

`player/audioEngine.ts` (pre-resolucao em 80%): no handler `timeupdate` (limitado a 160 ms) calcular `ratio = currentTime / duration`; quando `ratio >= 0.8` e `prefetchedFor !== proximaFaixa.trackKey`, iniciar `resolveStream(proxima, { signal: prefetchController.signal })` e guardar o resultado em `prefetched: Map<trackKey, ResolvedStream>`. `playTrack` usa a entrada se `expiresAt - agora > 30000`. O `prefetchController` e abortado e o mapa limpo quando a fila muda, o usuario troca de faixa ou ocorre `ended`. Remover a pre-resolucao disparada logo apos iniciar a faixa (`prefetchNextTrack`, miadoClient.js L3415 e L3422).

### 4.4 Social em tempo real (Firestore)

`services/listenerRegistry.ts`: `register(scope, unsubscribe)`. O roteador cria o escopo `view:<rota>` ao montar cada view e chama `disposeScope` no `unmount`. Escopos globais: `session` (listener do proprio `users/{uid}` para `privacy`, criado apos login, descartado no logout), `presence-friends` (ate 30 listeners de documento, um por perfil seguido visivel, recriados quando a lista de seguidos muda), `playlist:<id>` (somente a playlist aberta). Todo `onSnapshot` recebe callback de erro. Em logout: `disposeAll()`. Teste: apos navegar por todas as views 10 vezes, `registry.size()` volta ao valor basal.

`social/presence.ts`:
- Entrada: eventos do `audioEngine` `play`, `pause`, `trackChange`, `ended` e do `auth` (logout -> escreve `idle` antes de sair, em melhor esforco). NUNCA escrever em `timeupdate`, `progress` ou outro evento continuo.
- Debounce de 1500 ms (trailing, agrupa trocas rapidas de faixa). Antes de gravar, comparar `(state, trackKey, visibility)` com o ultimo valor gravado e pular se igual. Intervalo minimo entre gravacoes: 5000 ms (descartar intermediarias, manter a mais recente).
- Privacidade lida de `users/{uid}.privacy.presence` (mantida em memoria pelo listener `session`): `private` -> grava `visibility: "private"` sem `track`; `followers_only` e `public` -> grava `track` completo. A alteracao de privacidade e gravada em `writeBatch` com a atualizacao de `presence/{uid}`.
- Leitura: `onSnapshot(doc(db, "presence", uid))` por perfil seguido. Regra de exibicao de estado ao vivo sem heartbeat: `playing` e valido enquanto `agora - updatedAt < (track.durationSec + 90) * 1000`; `paused` e valido por 15 minutos; depois disso, o perfil aparece como sem atividade. Documento negado pelas regras (`permission-denied`) e tratado como sem atividade, sem erro visivel.

`social/activity.ts`: publica `track_play` quando a faixa completa 30 s de reproducao ou termina (`ended`), no maximo uma vez por `trackKey` a cada 10 minutos, somente se `privacy.activity !== "private"`. Leitura do feed: uma consulta por perfil seguido (`where("actorId", "==", uid)`, `orderBy("createdAt", "desc")`, `limit(20)`), no maximo 10 consultas em paralelo, mescladas e ordenadas no cliente; cada consulta e um listener registrado no escopo `view:social`.

`social/playlists.ts`: `canEdit(p, uid)` = `p.ownerId === uid || p.collaboratorIds.includes(uid)`; `canView(p, uid, followsOwner)` = `canEdit || p.visibility === "public" || (p.visibility === "followers_only" && followsOwner)`; a interface oculta controles de edicao quando `canEdit` e falso e nunca depende apenas disso: o servidor e as regras repetem a verificacao. Adicionar e remover faixas chama `api.ts` (rotas da secao 4.1.8). Colaboradores sao adicionados pelo dono por `@handle` (`handles/{handle}` -> `uid`), maximo 20. Alterar `visibility` e permitido somente ao dono.

### 4.5 Cliente: migracao de `miadoClient.js`

Dividir o arquivo por responsabilidade. Mapeamento aproximado de blocos atuais (numeros de linha de `miadoClient.js`) para modulos novos:

| Bloco atual | Destino |
|---|---|
| L1-L260 (reset de esquema em `localStorage`, utilitarios de handle, toast, handlers de imagem) | `app/store.ts` (sem reset por versao), `ui/components/toast.ts`, `ui/images.ts` |
| L400-L1210 (resolvedor de catalogo, JSONP do iTunes e do Deezer, capas) | `app/api.ts` (somente rotas do servidor); o JSONP (L403-L440 e L469) e removido e o catalogo e consumido apenas de `/api/*` |
| L1218-L2140 (`MiadoState`: usuario, amigos, perfis, sincronizacao) | `app/store.ts`, `social/profiles.ts`, `services/firebaseClient.ts` |
| L3100-L3460 (player, `timeupdate`, `playTrack`, `prefetchNextTrack`) | `player/audioEngine.ts`, `player/streamResolver.ts` |
| L4081-L4420 (menu de contexto, fila, modal de playlist) | `ui/components/contextMenu.ts`, `ui/components/modal.ts`, `ui/views/library.ts` |
| L5014-L5700 (onboarding e autenticacao) | `ui/views/onboarding.ts`, `ui/views/auth.ts` |
| L6079-L6450 (perfil) | `ui/views/profile.ts` |
| L7690-L8000 (busca) | `ui/views/search.ts` |
| L8197-L8620 (social e feed) | `ui/views/social.ts` |
| L8660-L9013 (playlist) | `ui/views/playlist.ts` |
| L9136-L9320 (artista) | `ui/views/artist.ts` |
| L9411-L9650 (barra lateral e painel direito) | `ui/views/library.ts`, `ui/components/playlistCard.ts` |

Regras para toda view: (a) `mount(container, params, ctx)` constroi a arvore por `h()` e devolve `unmount`; (b) todo `addEventListener` usa `{ signal }` de um `AbortController` do escopo da view; (c) todo `setInterval`, `setTimeout`, `ResizeObserver`, `IntersectionObserver` e `onSnapshot` e registrado e descartado no `unmount`; (d) carrosseis sao criados por `createCarousel`; (e) imagens por `bindImageFallback`; (f) nenhum dado externo ou de perfil e inserido sem passar por `textContent` ou `safeUrl`; (g) icones por `icon(name)`; (h) textos conforme I-03.

Autenticacao no cliente: somente Firebase Auth (e-mail e senha, Google). Cadastro por e-mail e senha chama `sendEmailVerification`; ate a verificacao, as acoes sociais (seguir, presenca, atividade, playlists publicas, adicionar faixas) ficam desabilitadas na interface com o rotulo "Verifique seu e-mail" e o botao "Reenviar". O token e obtido sob demanda por `getIdToken()`; nada de token em `localStorage`. Upload de avatar e banner: reduzir no cliente por `canvas` para no maximo 256x256 (JPEG qualidade 0.8) e 1200x400, validar tamanho em caracteres contra os limites das regras (100000 e 150000) antes de gravar.

### 4.6 Estilos
Reescrever `styles/liquid-glass.css` e `styles/base.css` conforme a Secao 3, removendo todas as sombras, os `scroll-snap-type: x mandatory`, regras duplicadas com `!important` e seletores sem uso. `ui/ambientGlass.ts` continua atualizando `--ambient-c1..c3` a partir da capa ativa (24x24 pixels, ignorando luminancia abaixo de 22 e acima de 238) e, ao falhar o carregamento, restaura os valores padrao de `tokens.css`.

### 4.7 `package.json`
Scripts: `"dev": "tsx server.ts"`, `"build": "vite build"`, `"start": "vite build && NODE_ENV=production tsx server.ts"`, `"lint": "tsc --noEmit && node scripts/check-forbidden.mjs"`, `"test": "vitest run"`, `"test:rules": "firebase emulators:exec --only firestore \"vitest run src/rules\""`. Dependencias: adicionar `undici`; remover somente o que nao for mais importado apos a refatoracao (verificar por busca antes de remover): `react`, `react-dom`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `tailwindcss`, `autoprefixer`, `lucide-react`, `motion`, `@google/genai`, `play-dl`. Dev: adicionar `@firebase/rules-unit-testing` e `firebase-tools`. Manter `express`, `firebase`, `vite`, `vitest`, `zod`, `dotenv`, `tsx`, `typescript`, `@types/*` necessarios.

### 4.8 Testes (Vitest)
- `security.test.ts`: assinatura adulterada, token expirado, `aud` e `iss` errados rejeitados (par de chaves RSA gerado no teste e certificado simulado); `requireVerifiedUser` nega `emailVerified: false`; limitador ignora `X-Forwarded-For` forjado quando `trust proxy` e 1 e o socket e o mesmo; `GET /api/stream?url=/audio/../../../etc/passwd` retorna 400 (chave desconhecida); `GET /api/stream?id=local:../../etc/passwd` retorna 400.
- `safeFetch.test.ts`: `isPrivateAddress` para todas as faixas listadas e IPv4 mapeado em IPv6; host fora da allowlist; redirecionamento para IP privado bloqueado (resolvedor simulado); teto de bytes; timeout durante a leitura do corpo.
- `jsonStore.test.ts`: 100 atualizacoes concorrentes resultam em contador 100; arquivo `.tmp` nunca fica como arquivo principal; JSON corrompido e movido para `.corrupt-*` e o `.bak` e carregado.
- `ttlLruCache.test.ts`: expiracao, despejo por itens e por bytes.
- `playlistsRoute.test.ts`: dono permitido, colaborador permitido, terceiro 403, playlist invisivel 404, corpo com `uid` forjado ignorado.
- `src/rules/firestore.rules.test.ts`: casos da Secao 5, item RT-02.
- `ui/__tests__/dom.test.ts`: `h()` com `textContent` neutraliza `<img onerror=...>`; `safeUrl` rejeita `javascript:` e `data:text/html`; varredura de padroes proibidos retorna vazio.

---

## 5. CHECKLIST DE VALIDACAO EM RUNTIME (`[needs_validation]`)

Cada item depende de ambiente externo ao repositorio ou de execucao real; nenhum deve ser dado como concluido sem a evidencia indicada.

| ID | Ponto de integracao | Como validar | Evidencia esperada |
|---|---|---|---|
| RT-01 | Firebase Auth: provedores | No console do Firebase, confirmar Email/Password e Google habilitados e a protecao contra enumeracao de e-mail; criar usuario sem verificar e tentar seguir alguem, gravar presenca e adicionar faixa | Acoes sociais negadas pelas regras e pelo servidor ate `email_verified` |
| RT-02 | Regras do Firestore (emulador) | `npm run test:rules` com `@firebase/rules-unit-testing` cobrindo: leitura do proprio `users` OK e de outro negada; usuario anonimo negado em tudo; reserva de handle duplicado negada; perfil com handle sem documento em `handles` negado; seguir com `followId` diferente de `followerId_followeeId` negado; presenca `public` lida por qualquer autenticado; `followers_only` negada a nao seguidor e permitida ao seguidor; `private` negada a todos menos o dono; presenca com `visibility` diferente da privacidade do usuario negada; atividade com `visibility: "private"` negada; playlist com `ownerId` diferente do `uid` negada; colaborador alterando `name` negado e alterando so `updatedAt` permitido; faixa com `addedBy` diferente negada; nao colaborador adicionando faixa negado; playlist `followers_only` lida por nao seguidor negada; colaborador removendo faixa de outro negado; colecao desconhecida e `test/*` negadas | Todos os casos passam |
| RT-03 | Consultas versus regras | No emulador, executar as consultas reais do cliente: `playlists` por `ownerId == uid`, por `collaboratorIds array-contains uid`, `activity` por `actorId == X` com `limit(20)`, `profiles` por prefixo de handle com `limit(20)` | Consultas aceitas; ajustar apenas as consultas, nao afrouxar regras |
| RT-04 | Regras implantadas | Publicar `firestore.rules` no projeto e repetir 5 casos criticos no Rules Playground do console | Mesmo resultado do emulador |
| RT-05 | Verificacao de token no servidor | Chamar `POST /api/playlists/:id/tracks` com ID token real, expirado, de outro projeto e com assinatura adulterada | 201, 401, 401, 401; rotacao de certificados atendida apos o `max-age` |
| RT-06 | Leitura de arquivo no stream | `curl "/api/stream?url=/audio/../../../etc/passwd"`, `curl "/api/stream?url=public/audio/../../server.ts"`, `curl "/api/stream?id=local:../x"` | 400 em todos; `curl "/api/stream?id=local:lisboa_anavitoria"` retorna o audio com `Accept-Ranges` |
| RT-07 | SSRF | `curl "/api/cover?title=a&artist=b&url=http://127.0.0.1:3000/api/health"`, `url=http://169.254.169.254/`, `url=https://host-fora-da-allowlist/x.png`; host da allowlist que redireciona para IP privado | 400 em todos, sem requisicao de saida registrada para o destino interno |
| RT-08 | Rebinding de DNS | Hostname de teste sob DNS controlado que alterna entre IP publico e `127.0.0.1` entre a validacao e a conexao | Conexao usa o IP validado; nenhuma conexao a `127.0.0.1` `[needs_validation]` (exige DNS controlavel) |
| RT-09 | Tipo de conteudo e cache de imagens | Servir de host de teste (na allowlist, ambiente local) um HTML com extensao `.png`; chamar `/api/artist-image?name=x&url=<essa URL>` duas vezes com URLs distintas para o mesmo `name` | 502 ou 415 por assinatura invalida; entradas de cache distintas por URL |
| RT-10 | Proxy de audio | Requisicao com `Range: bytes=0-1023` e `bytes=abc`; upstream lento (corpo parado) e interrupcao pelo cliente | 206 com `Content-Range` correto; 416; conexao ao upstream encerrada em ate o timeout; sem vazamento de handles (monitorar `process._getActiveHandles().length`) |
| RT-11 | Persistencia atomica | Script que dispara 200 gravacoes concorrentes em `resolved-streams-cache.json` e encerra o processo com `kill -9` em ponto aleatorio, 50 repeticoes | Arquivo principal sempre JSON valido; nenhuma perda de entradas confirmadas antes do `flush`; `.corrupt-*` nunca criado em execucao normal |
| RT-12 | TTL do cache de streams | Inserir entrada com `expiresAt` no passado e requisitar a faixa | Entrada descartada, nova resolucao, arquivo atualizado |
| RT-13 | Limitador atras de proxy real | Implantar no ambiente alvo (AI Studio / Cloud Run), medir `req.ip` com `TRUST_PROXY_HOPS` 1 e 2, tentar contornar com `X-Forwarded-For` forjado | `req.ip` e o IP do cliente; cabecalho forjado nao altera a chave `[needs_validation]` (numero de saltos depende da infraestrutura) |
| RT-14 | CSP e incorporacao | Build de producao: console do navegador sem violacoes; login Google por popup funciona com `Cross-Origin-Opener-Policy: same-origin-allow-popups`; pre-visualizacao do AI Studio carrega o app em iframe com `FRAME_ANCESTORS` incluindo a origem do AI Studio | Sem violacoes; login e iframe funcionam `[needs_validation]` (origem do AI Studio varia) |
| RT-15 | Presenca e listeners | Instrumentar contagem de gravacoes no emulador: reproduzir 5 minutos sem trocar de faixa; pular 10 faixas em 5 s; alternar `privacy.presence` | Zero gravacoes por `timeupdate`; 1 gravacao agrupada para os 10 saltos; mudanca de privacidade reflete em `presence/{uid}` no mesmo lote; `registry.size()` estavel apos navegar por todas as views 10 vezes |
| RT-16 | Pre-resolucao em 80% | Registrar horario das chamadas a `/api/resolve-full` durante a reproducao | Chamada da proxima faixa ocorre uma vez quando `currentTime/duration >= 0.8`; cancelada ao pular |
| RT-17 | Cascata de audio | Simular falha da instancia 0 (HTTP 500), instancia 1 lenta (maior que 4000 ms) e instancia 2 com audio invalido | Rotacao ate a instancia valida; estado "Faixa indisponivel" e avanco em 1200 ms se todas falharem |
| RT-18 | Carrosseis | Testar em Chrome, Firefox, Safari desktop, Safari iOS e Chrome Android: toque, trackpad com dois dedos, arrastar com mouse, `Shift` + roda, teclado, botoes laterais e seus estados desabilitados | Sem gesto de voltar do navegador nas extremidades; nenhum clique fantasma apos arrastar |
| RT-19 | Selecao e arrasto | Triplo clique em cards, titulos e barras; arrastar capas | Nada e selecionado nem arrastado; campos de texto e biografia continuam selecionaveis |
| RT-20 | Fallbacks de imagem | Bloquear `cdn-images.dzcdn.net` e depois `/api/cover` nas ferramentas de desenvolvimento | Cadeia avanca ate o placeholder SVG; icone de imagem quebrada nunca visivel; limites de tamanho de avatar (100000 caracteres) respeitados pelas regras |
| RT-21 | Conformidade de provedores | Revisao juridica externa do uso de `des.ts`, de instancias Piped/Invidious e do SoundCloud para obter faixas completas | Parecer do responsavel; decisao registrada fora do codigo |
| RT-22 | Servidor de desenvolvimento | Em `npm run dev`: `curl /data/miado-db.json`, `/server.ts`, `/src/server/security.ts`, `/firestore.rules` | 403 ou 404 (por `server.fs.deny`); validar com a versao do Vite instalada `[needs_validation]` |
| RT-23 | Legado | Iniciar com um `data/miado-db.json` antigo contendo `_encryptedVault` | Arquivo movido para `data/legacy/`, novo `miado-db.json` com `schemaVersion: 2`, nada decifrado |
| RT-24 | Padroes proibidos | `npm run lint` e busca por `\p{Extended_Pictographic}`, U+2713, U+2715, U+2665, `innerHTML`, `box-shadow` | Saida vazia, exceto `src/ui/icons.ts` e o filete `--glass-specular` |
| RT-25 | Limites das regras | Gravar avatar de 99000 e 101000 caracteres; perfil com `bio` de 301 caracteres; `collaboratorIds` com 21 itens | Aceito, negado, negado, negado |

---

## 6. DIRETRIZ FINAL DE ENTREGA DE CODIGO

1. Gerar o codigo COMPLETO de todos os arquivos criados, reescritos ou alterados, um bloco de codigo por arquivo, cada bloco precedido da linha `ARQUIVO: <caminho relativo>`. Para arquivos removidos, emitir apenas a linha `REMOVER: <caminho>`.
2. Proibido omitir trechos: nenhum comentario do tipo "resto do codigo permanece igual", "..." ou "codigo existente aqui", nenhum placeholder, nenhum `TODO` e nenhuma funcao vazia. Se um arquivo existente for alterado, emitir o arquivo inteiro com as alteracoes aplicadas.
3. Proibido qualquer emoji e qualquer glifo nao vetorial em todo o texto emitido (codigo, strings, comentarios, logs, JSON e mensagens de interface).
4. Ordem de emissao: (1) `package.json`, `vite.config.ts`, `tsconfig.json`, `.env.example`, `.gitignore`; (2) `firestore.rules`, `firebase-blueprint.json`; (3) `src/shared/*`; (4) `src/server/config.ts`, `net/*`, `storage/*`, `schemas.ts`, `security.ts`, `firestoreRest.ts`, `streams/*`; (5) `src/server/routes/*`, `catalog.ts`, `charts.ts`; (6) `server.ts`; (7) `data/*.json` iniciais; (8) `src/styles/*`; (9) `src/ui/dom.ts`, `icons.ts`, `images.ts`, `carousel.ts`, `ambientGlass.ts`, `ui/components/*`; (10) `src/services/*`; (11) `src/social/*`; (12) `src/player/*`; (13) `src/app/*` e `src/ui/views/*`; (14) `src/main.ts`, `index.html`; (15) `scripts/check-forbidden.mjs` e todos os testes; (16) lista final de arquivos criados, alterados e removidos.
5. Se o limite de saida for atingido, encerrar exatamente ao final de um arquivo completo (nunca no meio de um arquivo), emitir a linha `CONTINUA: <proximo caminho>` e retomar nesse arquivo quando o usuario enviar a mensagem `continuar`.
6. Preservar comportamento existente nao citado nesta especificacao (algoritmos de pontuacao e classificacao de faixas, filtro de versoes de estudio, dedupe, recomendacoes). Onde a especificacao diz "migrar", mover a logica sem reescrever a regra de negocio; onde diz "trocar", alterar somente o mecanismo indicado.
7. Ao final, executar mentalmente `npm run lint` e `npm test` sobre o codigo emitido e corrigir qualquer violacao antes de encerrar. Nao declarar como validado nenhum item da Secao 5: eles permanecem como `[needs_validation]` ate haver evidencia de execucao real.
````
