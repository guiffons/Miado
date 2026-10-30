# Miado - Streaming de Música Independente & Rede Social Musical

Plataforma de streaming musical e rede social com motor de áudio puro HTML5 em cascata de três camadas, zero anúncios, zero iframes de vídeo, interface com arquitetura Desktop (estilo Spotify) e Mobile nativo (estilo Apple Music Dark), discografia em alta definição (iniciando com Lady Gaga e pesquisa global via MusicBrainz & iTunes) e camada social colaborativa Miau.

### User Review & Critical Decisions

> [!IMPORTANT]
> As escolhas confirmadas durante a fase de entrevista definem os pilares da experiência do Miado:

- **Modo de Reprodução**: Fluxo híbrido com fallback instantâneo sem interrupção. O motor consulta instâncias comunitárias para streams completos e, caso haja latência (>3s) ou bloqueio de CORS, alterna sem travar para o stream direto de alta fidelidade do catálogo oficial.
- **Experiência da Tela Inicial**: Visão geral completa com álbuns aclamados, últimos lançamentos, destaques dos artistas mais conhecidos (com a discografia profunda da Lady Gaga em destaque especial), acesso rápido 3x2 e vitrines da comunidade.
- **Anti-Emoji & SVGs Customizados**: 100% dos ícones e a logo do gatinho com fones de ouvido são desenhados em SVG vetorial limpo.

---

### 1. Overview & Core Concept

- **O que faz**: O Miado entrega uma experiência de streaming de música limpa, rápida e focada em som de alta qualidade, metadados profundos (selos de estúdio, gravadora, ficha técnica completa) e interação social entre amigos sem algoritmos invasivos.
- **Público-Alvo**: Amantes de música, comunidades de fãs e ouvintes que buscam uma experiência sem distrações, capas em altíssima definição (1000x1000) e criação de playlists colaborativas instantâneas.
- **Diferencial Chave**: Reprodução de áudio puro via `<audio>` nativo conectado à Web Audio API com analisador espectral em tempo real a 60fps, fichas de lançamento no padrão Apple Music Dark e sincronização de playlists conjuntas via códigos Base64 portáteis e armazenamento persistente.

---

### 2. User Experience & Visual Design

#### A. Identidade Visual & Tema "Miado Dark"
- **Paleta de Cores**:
  - Fundo Primário: `#090710` (Preto profundo com subtom violeta espacial)
  - Superfícies e Cards: `#141022` com hover em `#1f1935` e bordas ultrafinas `rgba(168, 85, 247, 0.12)`
  - Acentos Primários: Roxo vibrante `#8b5cf6` e Lilás `#a855f7`
  - Tipografia: Texto primário `#ffffff`, secundário `#94a3b8`, metadados discretos `#64748b`
- **Mascote Oficial**: Gatinho minimalista com fones de ouvido estilizado em SVG vetorial no topo da navegação, perfil e telas de carregamento.
- **Tipografia e Metadados**: Formatação limpa sem pílulas estáticas repetitivas; uso de separadores tipográficos (`·`) para gênero, ano e contagem de faixas.

#### B. Arquitetura Desktop (Telas > 768px)
- **Barra Lateral Esquerda**: Logo do mascote + Miado, navegação principal (`Início`, `Buscar`, `Sua Biblioteca`, `Miau Social`), atalhos rápidos (`+ Criar Playlist`, `+ Playlist Conjunta`, `Músicas Curtidas`), e lista rolável de playlists.
- **Área Central Dinâmica**:
  - Cabeçalho com histórico (`<` e `>`), busca contextualizada e pílula de perfil do usuário (`@username`).
  - Saudação temporal (`Bom dia`, `Boa tarde`, `Boa noite`).
  - Grade 3x2 de Acesso Rápido com capas quadradas e botão Play roxo flutuante no hover.
  - Carrosséis com títulos e botão `VER TUDO` para lançamentos, discografia e álbuns icônicos.
- **Barra Lateral Direita Retrátil**: Alternável entre **Atividade dos Amigos** (o que cada amigo está ouvindo, status de escuta, botão para abrir playlist pública) e **Fila de Reprodução** reordenável.
- **Player Persistente (Rodapé 3 Colunas)**:
  - Esquerda: Capa expansível, título, artista clicável e botão de curtir.
  - Centro: Controles de reprodução (Shuffle, Anterior, Play/Pause circular em destaque, Próxima, Repeat) e barra de progresso com seek interativo.
  - Direita: Mini analisador de espectro de áudio em `<canvas>`, botão de Fila/Letra, controle deslizante de volume e alternador de tela cheia.

#### C. Arquitetura Mobile Nativa (Telas <= 768px)
- **Topo**: Saudação com brilho radial roxo suave e botão de perfil.
- **Grade 2x3 Compacta**: Acesso rápido a álbuns e playlists com 1 toque.
- **Carrosséis Horizontais Touch**: Scroll-snap suave para coleções e discografias.
- **Mini-Player Flutuante Glassmorphism**: Fixado acima da barra inferior com capa arredondada, nome da faixa e botões Play/Próxima.
- **Barra de Navegação Inferior**: 4 abas fixas (`Início`, `Buscar`, `Biblioteca`, `Miau`).

#### D. View Dedicada de Álbum & Perfil de Artista (Estilo Apple Music Dark)
- Capa em alta definição (1000x1000) com sombra projetada.
- Título imponente, artista em destaque roxo clicável e metadados (`GÊNERO · ANO`).
- Botões gêmeos largos de ação: **Reproduzir** e **Aleatório**.
- Sinopse editorial expandível e selos técnicos (`Miado Lossless`, `Hi-Res Audio`, `Miado Digital Master`).
- Tracklist numerada com estrela de popularidade, duração, avatar do colaborador (em playlists conjuntas) e menu de ações contextuais.

---

### 3. Key Product Decisions & Trade-Offs

- **Motor de Áudio em Cascata (Zero Iframes / Zero Anúncios)**:
  - *Decisão*: Priorizar instâncias abertas (Piped/Invidious) para áudio puro e chavear instantaneamente para o stream do catálogo oficial caso haja lentidão (>3s) ou falha de CORS.
  - *Benefício*: O usuário tem 100% de garantia de reprodução imediata com áudio puro de estúdio sem anúncios e sem quebras.
- **Web Audio API com Fallback Procedural**:
  - *Decisão*: Ligar o `<audio>` a um `AudioContext` com `createMediaElementSource` e `AnalyserNode`. Se políticas de CORS de fontes externas bloquearem o stream de bytes brutos no AudioContext, um oscilador procedural sincronizado gera a animação das barras roxas a 60fps sem interrupção.
- **Playlists Conjuntas Base64 & LocalStorage**:
  - *Decisão*: Permitir exportar e importar playlists instantaneamente por código Base64 ou salvar localmente, registrando o `@username` e avatar de quem inseriu cada faixa.
  - *Benefício*: Permite compartilhamento direto entre amigos sem depender de servidores centralizados ou cadastros complexos.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                                MIADO WEB                               │
│                                                                        │
│  ┌───────────────────────┐  ┌────────────────────────────────────────┐  │
│  │   UI & Layout Engine  │  │         Audio Engine (HTML5)           │  │
│  │ - Sidebar & Top Bar   │  │ - <audio crossorigin="anonymous">      │  │
│  │ - Home / Album / Perf │  │ - Layer 1: Piped / Invidious Streams   │  │
│  │ - Social & Playlists  │  │ - Layer 2: Archive / Direct URLs       │  │
│  │ - Mobile Bottom Nav   │  │ - Layer 3: Instant High-Res Fallback   │  │
│  └──────────┬────────────┘  └───────────────────┬────────────────────┘  │
│             │                                   │                       │
│             ▼                                   ▼                       │
│  ┌───────────────────────┐  ┌────────────────────────────────────────┐  │
│  │ Local State & Social  │  │       Web Audio & Visualizer           │  │
│  │ - User Profile & Bio  │  │ - AudioContext + AnalyserNode (60fps)  │  │
│  │ - Liked Songs & Queue │  │ - Canvas Spectrum Analyzer             │  │
│  │ - Shared Playlists B64│  │ - Procedural Audio Wave Fallback       │  │
│  └───────────────────────┘  └────────────────────────────────────────┘  │
│                                                                        │
│               External Data: MusicBrainz & iTunes API                  │
└────────────────────────────────────────────────────────────────────────┘
```

#### Modelo de Dados e Entidades Principais
1. **Track**: `id`, `title`, `artist`, `album`, `duration`, `coverUrl`, `streamUrl`, `year`, `genre`, `addedBy` (`username`, `avatar`).
2. **Album**: `id`, `title`, `artist`, `coverUrl`, `releaseDate`, `year`, `genre`, `label`, `tracks`, `editorial`, `technicalBadges`.
3. **UserProfile**: `name`, `username`, `bio`, `avatarUrl`, `likedTrackIds`, `history`, `friends`.
4. **Playlist**: `id`, `name`, `description`, `coverUrl`, `isCollaborative`, `collaborators`, `tracks`.

#### Integridade de Código
- Código completo autocontido com suporte a Desktop responsivo e Mobile touch app-like.
- Verificação rigorosa contra qualquer caractere emoji, implementando biblioteca de ícones SVG precisa e consistente.
- Transições de tela com histórico de navegação funcional (`back`/`forward`).
