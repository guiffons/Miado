# MIADO — Plano Arquitetural e de Execução (Fases 0 a 8)

Reformulação estrutural do **MIADO** para garantir **áudio 100% completo (zero previews de 30 segundos)**, **visual Liquid Glass consistente entre desenvolvimento e produção**, **catálogo canônico sem mistura de artistas/faixas**, **segurança de dados com Firebase Authentication + Firestore** e **motor de recomendações e paradas em tempo real**.

---

## Decisões Confirmadas com o Usuário

> [!IMPORTANT]
> As seguintes decisões arquiteturais foram confirmadas e guiam todas as fases deste plano:

1. **Estratégia de Áudio Completo no Backend (Fase 2)**: **Multi-provedor com health-check e failover automático** (JioSaavn 320kbps nativo + instâncias Piped/Invidious verificadas com health-check periódico + SoundCloud ISRC/verificado + Internet Archive + catálogo verificado), com cache persistente por `trackId` e suporte integral a `HTTP Range (206 Partial Content)`.
2. **Modularização do Frontend (Fase 0)**: **Módulos ES em `src/` com bundling nativo pelo Vite**, mantendo a arquitetura em JavaScript puro (sem reescrever para React) e garantindo 100% de paridade entre `npm run dev` e `npm run build`.
3. **Acesso Inicial e Autenticação (Fases 6 e 7)**: **Modo visitante livre com login opcional para sincronizar**, permitindo explorar e ouvir músicas imediatamente com persistência local isolada e oferecendo login/cadastro via Firebase Auth (E-mail/Senha e Google) para sincronizar biblioteca, playlists, curtidas e perfil social na nuvem.

---

## 1. Mapa Completo do `index.html` (11.628 linhas)

| Intervalo de Linhas | Bloco / Módulo | Descrição e Responsabilidades Atuais | Destino na Fase 0 (`src/`) |
| :--- | :--- | :--- | :--- |
| **1 – 12** | `<head>` & Metadados | Meta tags, viewport (`maximum-scale=1.0, user-scalable=no` na linha 5), fontes (`Plus Jakarta Sans`, `Outfit`, `JetBrains Mono`). | `index.html` (limpo, sem bloqueio de zoom) |
| **13 – 2560** | `<style>` (CSS Inline) | **11 blocos de estilo**:<br>• `14–125`: Tokens CSS (`--bg-base: #07060b`), reset e base (`100vw`/`100vh`)<br>• `126–350`: Grid principal (`#app-shell`) e Sidebar esquerda (`#sidebar`)<br>• `351–507`: Viewport central (`#main-view`) e Topbar (`#topbar`)<br>• `508–737`: Home Grid, Acesso Rápido e Cards de Álbum/Artista<br>• `738–1315`: Views de Álbum, Artista e Tracklist<br>• `1316–1364`: Sidebar direita (`#right-sidebar`: Atividade e Fila)<br>• `1365–1468`: Player persistente de rodapé (`#player-bar`)<br>• `1469–1759`: Modais (`#modal-fullscreen-player`, `#modal-auth`, `#modal-profile`, `#modal-create-playlist`, `#modal-track-options`)<br>• `1760–1862`: Responsividade Mobile (`@media (max-width: 768px)`, `#mobile-bottom-nav`, `#mobile-mini-player`)<br>• `1863–2172`: Overrides de Liquid Glass (`blur(54px) saturate(240%) !important`, `blur(72px) saturate(270%) !important`, `backdrop-filter: none !important`)<br>• `2173–2560`: Menu de contexto estilo Spotify, barras de equalizador e utilitários | `src/styles/tokens.css`<br>`src/styles/glass.css`<br>`src/styles/layout.css`<br>`src/styles/components.css`<br>`src/styles/views.css`<br>`src/styles/mobile.css` |
| **2562 – 3159** | `<body>` (Estrutura DOM) | • `2564–2780`: `#app-shell` (`#sidebar`, `#main-view`, `#right-sidebar`)<br>• `2781–2910`: `#player-bar`, `#mobile-mini-player`, `#mobile-bottom-nav`<br>• `2911–3158`: Modais (`#modal-profile`, `#modal-create-playlist`, `#modal-collab`, `#modal-track-options`, `#modal-fullscreen-player`, `#modal-auth`, `#toast-container`, `<audio id="audio-element">`) | `index.html` (marcação estrutural sem scripts inline) |
| **3160 – 3238** | `<script type="module">` | Inicialização do Firebase via CDN `gstatic.com` v10.12.2 e objeto global `window.MiadoCloud` (`saveUserData`, `loadUserData`, `subscribeUserData`). | `src/services/firebase.ts` (SDK npm `firebase` local) |
| **3243 – 3537** | `<script>` — Seção 1: Utilitários Visuais e Imagens | `buildCuteCatSvg` (`3248`), `createSolidAlbumSvg` (`3274`), `showToast` (`3330`), `formatDurationMs` (`3339`), `upgradeTo1000x1000` (`3347`), `readImageFileAsCompressedDataUrl` (`3356`), `triggerImagePicker` (`3406`), `ensureTrackCoverUrl` (`3433`), `window.handleImgError` (`3460`). | `src/utils/svg.ts`<br>`src/utils/images.ts`<br>`src/utils/dom.ts` |
| **3538 – 4149** | `<script>` — Seção 2: Catálogo Semente e Deduplicação Cliente | `fetchItunesJson` (`3500`), `fetchDeezerJsonp` (`3543`), `normalizeTrackKey` (`3572`), `isOriginalStudioTrackClient` (`3591`), `deduplicateTracks` (`3607`), `patchPreloadedSeedAlbums` (`3655`), `PRELOADED_SEED_ALBUMS` e `CATALOG_ALBUMS` (`3680–4148`). | `src/catalog/seed.ts`<br>`src/catalog/normalizer.ts` |
| **4150 – 5279** | `<script>` — Seção 3: `AppState` e Persistência | `toProxyStreamUrl` (`4152`) e classe `AppState` (`4170–5278`): capas customizadas (`4211–4348`), seguir artistas/perfis (`4349–4509`), recomendações (`4510–4563`), fila e shuffle (`4564–4660`), hidratação/sync `/api/db` e Firestore (`4661–4904`), usuário, histórico, feed social, playlists e curtidas (`4905–5278`). | `src/state/AppState.ts` |
| **5280 – 5869** | `<script>` — Seção 4: `StreamResolver` | Resolução de faixas completas via `/api/resolve-full`, busca `/api/search`, fallback cliente e validação de duração. | `src/audio/StreamResolver.ts` |
| **5870 – 6563** | `<script>` — Seção 5: `AudioEngine` | Controle do `<audio>`, `AudioContext` + `AnalyserNode` (`5910`), `attemptPlayUrl` (`6101`), `playTrack` (`6141`), `nextTrack`/`prevTrack` (`6243–6299`), `addToQueueNext`/`addToQueueEnd` (`6300–6348`), volume e visualizador em `<canvas>` (`6461`). | `src/audio/AudioEngine.ts` |
| **6564 – 11626** | `<script>` — Seção 6: `UIManager` e Views | Classe `UIManager` (`6567–11600`):<br>• `6600–6793`: Menu de contexto estilo Spotify<br>• `6935–7182`: Navegação desktop e abas mobile<br>• `7183–7426`: Controles do player e tela cheia<br>• `7427–8040`: Modais (Auth, Onboarding, Perfil, Criar Playlist, Opções da Faixa)<br>• `8053–8136`: Roteador `navigateTo` e histórico `back`/`forward`<br>• `8137–8736`: `renderProfileView`<br>• `8737–9332`: `renderHomeView`<br>• `9333–9605`: `renderAlbumView`<br>• `9606–9870`: `renderSearchView`<br>• `9871–10063`: `renderLibraryView`<br>• `10064–10513`: `renderSocialView`<br>• `10514–10873`: `renderPlaylistView`<br>• `10874–10997`: `renderLikedTracksView`<br>• `10998–11271`: `renderArtistView`<br>• `11272–11600`: `renderSidebarPlaylists`, `renderRightSidebar`, `renderFriendsActivity`, `renderQueue`<br>• `11601–11625`: Bootstrap `DOMContentLoaded` | `src/ui/UIManager.ts`<br>`src/ui/contextMenu.ts`<br>`src/ui/modals.ts`<br>`src/views/HomeView.ts`<br>`src/views/AlbumView.ts`<br>`src/views/ArtistView.ts`<br>`src/views/PlaylistView.ts`<br>`src/views/ProfileView.ts`<br>`src/views/SearchView.ts`<br>`src/views/LibraryView.ts`<br>`src/views/SocialView.ts`<br>`src/main.ts` |

---

## 2. Diagnóstico Profundo da Camada de Áudio (`/api/resolve-full`, `/api/stream` e Player)

### A. Por que ainda ocorrem músicas de 30 segundos (Causa Raiz)
1. **Vazamento silencioso em `resolveFullLengthTrackUrl` (`server.ts`, linhas 1201, 1233 e 1474)**:
   - Nas linhas `1201` (iTunes) e `1233` (Deezer), ao buscar a duração canônica da faixa, o servidor atribui `officialStudioMasterUrl = String(exactHit.previewUrl)` ou `String(exactDz.preview)` — que são **previews de 30 segundos**.
   - Na linha `1474`, quando os provedores principais falham ou sofrem timeout, o servidor executa:
     ```ts
     if (officialStudioMasterUrl) {
       return { url: officialStudioMasterUrl, source: "Miado Studio Fallback", duration: expectedSec };
     }
     ```
     Ou seja: o backend mente dizendo que a faixa tem `duration: expectedSec` (ex.: 210s), mas entrega a URL de 30 segundos da Apple/Deezer!
2. **Catálogo semente (`index.html`, linhas 3680–4148)**:
   - O objeto `PRELOADED_SEED_ALBUMS` em `index.html` contém centenas de propriedades `previewUrl` e `streamUrl` apontando diretamente para `https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview.../mzaf_...plus.aac.p.m4a` (30s).
   - Na função `toProxyStreamUrl` (`index.html`, linha 4152), a URL bruta `u` (que é o preview da Apple) é passada no query param `?url=...` para `/api/stream`. Se a resolução completa falhar, qualquer tentativa de usar `rawUrl` cai no preview de 30s.
3. **Mapeamentos incorretos no `VERIFIED_STUDIO_CATALOG` (`server.ts`, linhas 687–910)**:
   - Algumas faixas foram mapeadas para arquivos de áudio de outras músicas como placeholder:
     - Sabrina Carpenter: `"manchild"` → `Bed Chem.m4a` (linha 692); `"tears"` → `Sharpest Tool.m4a` (linha 693); `"feather"` → `Espresso.m4a` (linha 691).
     - Yung Lixo: `"valores"` e `"o segredo da floresta"` → `Flores de Outro Carnaval.mp3` (linhas 888–889); `"o show"` → `Sucesso FM.mp3` (linha 890).

### B. Por que algumas faixas falham ao carregar ou dão timeout
1. **Descriptografia DES-ECB do JioSaavn via processo filho (`server.ts`, linhas 534–549)**:
   - A função `decryptSaavnUrl` chama `execFileSync(process.execPath, ["--openssl-legacy-provider", "-e", script])` de forma **síncrona** para cada candidato do JioSaavn. Isso bloqueia o event loop do Node.js, adiciona ~150–400ms por chamada e falha em ambientes onde `--openssl-legacy-provider` não é suportado ou excede o timeout de 2000ms.
   - **Solução**: Implementar DES-ECB puro em TypeScript/JavaScript em memória (zero processos filhos, execução em `< 0.1ms`).
2. **Instâncias Piped/Invidious instáveis e timeout curto (`server.ts`, linhas 978–1085)**:
   - As 6 instâncias fixas (`pipedapi.ducks.party`, `api.piped.private.coffee`, `pipedapi.tokhmi.xyz`, `pipedapi.r4fo.com`, `inv.tux.pizza`, `iv.melmac.space`) não passam por health-check prévio e usam timeout de 2800ms sem circuit-breaker.
3. **Filtro excessivamente rígido no SoundCloud (`server.ts`, linhas 1354–1362)**:
   - `trySoundCloud` exige simultaneamente `t.user?.verified`, `t.publisher_metadata?.isrc`, diferença de duração `<= 8s` e igualdade exata de string entre o nome da conta e o artista (`userNorm === aNorm`), descartando faixas oficiais de artistas cujo handle no SoundCloud difere levemente ou não preenche metadados de ISRC em todas as faixas.
4. **Falta de validação de duração real antes de entregar o stream**:
   - Nenhuma camada verifica se o arquivo final retornado realmente possui `>= 60s` antes de confirmar a resolução.

---

## 3. Achados Gerais (Visual, Segurança e Catálogo)

### A. Visual & Paridade Dev vs. Produção
1. **Por que o Liquid Glass some ou muda em produção (`vite build`)**:
   - O `index.html` usa `<script>` clássico (sem `type="module"`). O Vite em modo dev serve o arquivo bruto, mas no `vite build` o empacotador tenta processar assets de forma diferente e não aplica o pipeline de módulos ES/CSS do Vite.
   - O fundo `--bg-base: #07060b` é 100% chapado ("zero degradê"). `backdrop-filter: blur(...)` sobre uma cor sólida uniforme produz exatamente a mesma cor sólida — o efeito de vidro líquido só aparece quando há gradientes luminosos ou cores da capa do álbum por trás.
   - Há abuso de `blur(54px) saturate(240%) !important` e `blur(72px) saturate(270%) !important` misturados com `backdrop-filter: none !important` (linhas 1863–2172), causando artefatos de recorte em Chromium/WebKit e queda de FPS em dispositivos móveis.
2. **Bug de capa de playlist sobrescrevendo capas de músicas**:
   - Quando o usuário altera a capa personalizada de uma playlist, o renderizador da playlist passa `playlist.coverUrl` como fallback prioritário ou sobrescreve a capa das faixas individuais que pertencem a álbuns oficiais (ex.: músicas da Billie Eilish passando a exibir a foto da playlist). Cada faixa deve sempre preservar seu próprio `track.coverUrl` / `track.albumCoverUrl` original.

### B. Vulnerabilidades Críticas de Segurança (`server.ts`)
1. **Vazamento de conta em `GET /api/db` (linha 1656)**: Quando nenhum token Bearer é enviado, a rota usa `db.activeAccountEmail` global, entregando os dados da última conta logada para qualquer visitante anônimo.
2. **Escrita não autenticada em `POST /api/db` (linha 1688)**: Aceita `req.body.accountEmail` sem validar token, permitindo sobrescrever qualquer conta.
3. **Remoção pública em `DELETE /api/profiles/:handle` (linha 3196)**: Qualquer cliente pode apagar perfis sem autenticação.
4. **Segredo fixo no código (linha 19)**: `SESSION_SECRET` possui fallback hardcoded `"miado_lossless_pro_secret_key_2026_v3"`.
5. **Credenciais em `data/miado-db.json`**: Contém e-mail e `passwordHash` em arquivo local no repositório/disco efêmero.

### C. Mistura de Artistas e Filtros de Catálogo (`server.ts`)
1. **Colapso de colaborações em `deduplicateSongsList` (linha 414)**: Usa `String(s.artist || "").split(/[,&/]/)[0]`, descartando co-artistas e feats e fundindo faixas distintas.
2. **Falsos positivos em `NON_ORIGINAL_PATTERNS` (linhas 217–267) e `HARD_REJECT_WORDS` (linhas 552–563)**: Bloqueiam palavras legítimas em títulos de estúdio como `"show"` (*O Show* — Yung Lixo), `"tour"`, `"interlude"`, `"skit"`, `"mc "`, `"carnaval"`, `"ensaio"`.

---

## 4. Arquitetura Alvo

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           MIADO CLIENT (Vite ES Modules)                         │
│                                                                                  │
│  ┌─────────────────────────┐  ┌────────────────────────┐  ┌───────────────────┐  │
│  │   UI & Liquid Glass     │  │  AudioEngine (HTML5)   │  │ Auth & Cloud Sync │  │
│  │ • Dynamic Cover Ambient │  │ • Zero 30s Guarantee   │  │ • Guest Mode Free │  │
│  │ • Tokenized Glass 1/2/3 │  │ • Next-Track Prefetch  │  │ • Firebase Auth   │  │
│  │ • Smooth Mini->Full     │  │ • MediaSession & Keys  │  │ • Firestore Rules │  │
│  │ • Spotify Queue & Menu  │  │ • WebAudio Visualizer  │  │ • Bearer ID Token │  │
│  └────────────┬────────────┘  └───────────┬────────────┘  └─────────┬─────────┘  │
└───────────────┼───────────────────────────┼─────────────────────────┼────────────┘
                │                           │                         │
                ▼                           ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         MIADO SERVER (Express + TypeScript)                      │
│                                                                                  │
│  ┌─────────────────────────┐  ┌────────────────────────┐  ┌───────────────────┐  │
│  │ Catalog & Real Charts   │  │ Full-Audio Resolver    │  │ Security & Recs   │  │
│  │ • Canonical Artist/Track│  │ • Pure JS DES-ECB Saavn│  │ • Firebase Admin  │  │
│  │ • ISRC + Full Credits   │  │ • Health-Checked Piped │  │ • Helmet/CORS/Zod │  │
│  │ • Deezer/Apple/Last.fm  │  │ • SoundCloud + Archive │  │ • Signal Recs API │  │
│  │ • 1h SWR Cache          │  │ • Range 206 Proxy      │  │ • Rate Limiting   │  │
│  └─────────────────────────┘  └────────────────────────┘  └───────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Ordem das Fases, Entregáveis e Matriz de Riscos

### Fase 0 — Paridade Dev vs. Produção e Modularização Base
- **Ações**:
  - Extrair o CSS inline (`linhas 13–2560`) para `src/styles/` importado via módulo principal.
  - Extrair o JavaScript (`linhas 3160–11626`) para módulos ES organizados em `src/` (`src/main.ts`, `src/state/`, `src/audio/`, `src/ui/`, `src/views/`, `src/catalog/`, `src/utils/`), substituindo o script CDN do Firebase pelo pacote npm `firebase` já instalado.
  - Configurar `vite.config.ts` e `package.json` (`build`, `start`, `test` com `vitest`) garantindo que `npm run build` processe e empacote todos os módulos CSS/TS/JS em `dist/` com paridade visual e funcional idêntica ao `npm run dev`.
- **Risco & Mitigação**: Referências globais em atributos `onclick`/`onerror` no HTML gerado dinamicamente → expor adaptadores seguros no `window` durante a transição e migrar gradualmente para delegação de eventos.

### Fase 1 — Liquid Glass Robusto e Responsivo
- **Ações**:
  - Criar tokens `--glass-1` (`blur(16px) saturate(165%)`), `--glass-2` (`blur(24px) saturate(180%)`) e `--glass-3` (`blur(28px) saturate(190%)`) com bordas luminosas sutis (`1px solid rgba(255,255,255,0.10)`), sombra externa e highlight especular interno, removendo todos os `blur(54px/72px) !important` e `backdrop-filter: none !important`.
  - Implementar camada de iluminação ambiente dinâmica (`AmbientBackdrop`): extrair as 3 cores dominantes da capa em reprodução via `<canvas>` (com fallback para a paleta violeta/índigo do Miado) e alimentar blobs suaves no fundo para que o vidro líquido sempre tenha matéria cromática real para refratar e desfocar.
  - Adicionar fallbacks `@supports not (backdrop-filter: blur(1px))`, suporte a `prefers-reduced-transparency`, `prefers-reduced-motion` e `prefers-contrast: more`, e limitar a no máximo 3 camadas com `backdrop-filter` simultâneas no mobile.
  - Substituir `100vw`/`100vh` por `100%`/`100dvh` com `env(safe-area-inset-*)` e remover `maximum-scale=1.0, user-scalable=no` do viewport.
  - Corrigir o bug visual no hover dos botões de curtir (`♥`) e adicionar (`+`) na tracklist e o alinhamento vertical padronizado dos botões `"Seguindo"` nos cards.

### Fase 2 — Áudio 100% Completo e Resolução Infalível (Zero 30s)
- **Ações**:
  - **Erradicação de Previews de 30s**:
    - Remover `officialStudioMasterUrl = exactHit.previewUrl` e `exactDz.preview` de `server.ts` (`linhas 1201, 1233, 1474`).
    - Remover todas as URLs `AudioPreview...plus.aac.p.m4a` de `PRELOADED_SEED_ALBUMS` e banir qualquer fallback para `preview` ou `previewUrl` no cliente e no servidor.
    - Corrigir todas as entradas incorretas no `VERIFIED_STUDIO_CATALOG` (*Manchild*, *Tears*, *Feather* da Sabrina Carpenter; *Valores*, *O Segredo da Floresta*, *O Show* do Yung Lixo; *L'AMOUR DE MA VIE* da Billie Eilish).
  - **Motor Multi-Provedor com Health-Check e Failover Automático**:
    - **Provedor 1 (JioSaavn 320kbps)**: Implementar descriptografia DES-ECB nativa em puro TypeScript (zero `execFileSync`), eliminando o gargalo de processo filho e timeouts.
    - **Provedor 2 (Pool Piped / Invidious com Health-Check)**: Manter pool dinâmico de instâncias com health-check periódico em background, ranking por latência e circuit-breaker automático para instâncias offline.
    - **Provedor 3 (SoundCloud Full Stream)**: Ajustar matcher para validar ISRC ou combinação `(título normalizado + artista + tolerância de duração ±15s)` e garantir que a faixa não seja `snipped`/preview (`duration >= 60s` e `full_duration === duration`).
    - **Provedor 4 (Internet Archive / Catálogo Verificado)**: Busca direta por metadados oficiais com validação de duração.
  - **Validação Estrita e Proxy de Streaming (`/api/stream`)**:
    - Rejeitar no backend qualquer stream cuja duração seja `< 60s` (exceto interlúdios reais catalogados cujo tempo oficial no álbum seja `< 60s`, desde que correspondam a 100% da duração oficial da faixa e nunca a um corte de 30s).
    - Suporte completo a `Range` (`206 Partial Content`, `Accept-Ranges: bytes`, `Content-Range`, `Content-Length`) com retry automático e rotação de provedor em caso de `403`/`429`/`5xx`.
    - Cache em memória + persistência em disco por `trackId` com TTL para URLs resolvidas.
    - Pré-resolução e prefetch automático da próxima faixa da fila (`state.queue[state.currentIndex + 1]`) no frontend.

### Fase 3 — Polimento de UI no Nível Spotify / Apple Music
- **Ações**:
  - Corrigir definitivamente o isolamento de capas: alterar a capa de uma playlist altera exclusivamente `playlist.coverUrl`, mantendo intactas as capas originais de cada música dentro da playlist.
  - Garantir `window.handleImgError` infalível com fallback imediato para `createSolidAlbumSvg` em todas as tags `<img>` do app.
  - Transição fluida entre mini-player e player em tela cheia, com gesto swipe-down para fechar no mobile e alvos de toque `>= 44x44px`.
  - Fila de reprodução (`Adicionar à fila` / `Tocar a seguir`) funcionando identicamente ao Spotify (fila prioritária `upNextQueue` reproduzida antes da sequência normal do álbum/playlist), com reordenação drag-and-drop e limpeza com 1 clique.
  - Mosaico automático 2x2 de capas para playlists sem capa customizada.
  - Menu de contexto unificado (clique direito no desktop e toque longo no mobile), integração completa com `navigator.mediaSession` e atalhos de teclado (`Espaço`, `J`/`L`, `M`, `/`).
  - Remoção de dicas/textos explicativos prolixos da interface para manter o layout limpo e conciso.

### Fase 4 — Catálogo Limpo (Sem Mistura de Artistas ou Faixas)
- **Ações**:
  - Adotar modelo canônico `Artist`, `Album` e `Track` com `artistIds: string[]` e `artists: { id: string; name: string; role: 'primary' | 'featured' }[]`, preservando todos os créditos sem truncar no primeiro artista.
  - Na página de um artista (`renderArtistView` / `/api/artist`), filtrar faixas e álbuns pelo `artistId` canônico do Deezer/MusicBrainz, separando claramente **Álbuns**, **Singles & EPs** e **Aparições / Feats**.
  - Deduplicar faixas por `ISRC` (quando disponível) ou pela chave composta `(normalizedTitle + conjunto completo de artistIds + albumId)`.
  - Refinar `NON_ORIGINAL_PATTERNS` e `HARD_REJECT_WORDS` usando expressões regulares com fronteiras de palavra (`\b`) contextualizadas (ex.: rejeitar `"live at ..."`, `"ao vivo em ..."` quando não fizer parte do álbum original, mas permitir títulos legítimos como *"O Show"*, *"Interlude"*, *"Skit"*, *"Tour"*).
  - Criar suíte automatizada Vitest (`src/catalog/__tests__/catalog.test.ts`) validando artistas como Sabrina Carpenter, Billie Eilish, JÃO, Lady Gaga, The Weeknd, Yung Lixo, Kali Uchis e Dua Lipa (garantindo zero faixas de terceiros infiltradas e zero previews de 30s).

### Fase 5 — "Do Momento" em Tempo Real (Paradas e Lançamentos)
- **Ações**:
  - Criar serviço de agregação `src/server/charts.ts` consultando em tempo real as paradas do Deezer (`/chart/0/tracks`, `/chart/0/albums`, `/chart/0/artists` e charts regionais do Brasil), Apple Music RSS e Last.fm.
  - Implementar cache em memória + arquivo com TTL de 1 hora e estratégia `stale-while-revalidate` (resposta instantânea em `< 50ms` mesmo sob falha externa).
  - Expor rota `/api/charts` com seções reais: **Em Alta no Brasil**, **Top 100 Global**, **Novos Lançamentos da Semana** e **Top 100 Artistas do Momento**, atualizando a aba `Início`.

### Fase 6 — Autenticação Segura e Persistência Endurecida
- **Ações**:
  - **Modo Visitante + Firebase Auth**: Manter o acesso imediato em modo visitante (estado salvo apenas no `localStorage` do navegador do próprio visitante, sem tocar em contas do servidor) e integrar login/cadastro real via Firebase Authentication (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `GoogleAuthProvider`).
  - **Firestore & Regras de Segurança**: Persistir perfis públicos (`profiles/{uid}`), dados privados (`users/{uid}`) e playlists (`playlists/{playlistId}`) no Firestore, atualizando `firestore.rules` com validação estrita de `request.auth.uid`.
  - **Hardening do `server.ts`**:
    - Verificar `Authorization: Bearer <idToken>` no backend com `firebase-admin` para qualquer rota autenticada.
    - Remover `/api/auth/register|login|logout`, `activeAccountEmail`, escrita aberta em `POST /api/db`, deleção aberta em `DELETE /api/profiles/:handle`, `SESSION_SECRET` hardcoded e armazenamento de senhas em `data/miado-db.json`.
    - Adicionar `helmet` (CSP compatível com imagens/streams e Firebase), CORS restrito, validação de schemas com `zod` e rate-limiting por IP.
    - Criar script idempotente de migração e endpoints LGPD de exportação (`GET /api/account/export`) e exclusão (`DELETE /api/account`).

### Fase 7 — Onboarding Multi-Etapas e Perfil Completo
- **Ações**:
  - Fluxo de onboarding e edição de perfil em 5 etapas fluidas: (1) Conta/Handle `@username` com checagem de disponibilidade em tempo real, (2) Foto de perfil com recorte circular em `<canvas>` exportado em WebP (`<= 256x256`) ou escolha de avatar SVG do gatinho, (3) Escolha de `>= 3` artistas favoritos com busca ao vivo, (4) Gêneros favoritos, (5) Conclusão animada.
  - No perfil próprio ou de outros usuários (`renderProfileView`), permitir visualizar e clicar nas abas/listas de **Seguindo (Artistas e Perfis)**, **Seguidores**, **Playlists Públicas** e **Músicas Curtidas**.

### Fase 8 — Motor de Recomendações Baseado em Sinais Reais
- **Ações**:
  - Criar módulo puro e testável `src/server/recommendations.ts` que calcula o vetor de afinidade do usuário (artistas, gêneros, década/ano) aplicando decaimento temporal exponencial sobre sinais reais: play completo (`+3.0`), like (`+4.0`), adição à playlist (`+3.5`), busca (`+1.5`), skip antes de 30s (`-2.5`).
  - Combinar **80% explotação** (faixas inéditas dos artistas/gêneros de maior afinidade e artistas similares via Deezer `/artist/:id/related`) + **20% exploração** (descobertas bem avaliadas nas paradas atuais fora da bolha imediata).
  - Adicionar testes unitários em Vitest validando o ranking e a diversidade das recomendações.
