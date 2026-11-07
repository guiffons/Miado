````markdown
# ESPECIFICACAO: FLUXO DE PRIMEIRO ACESSO DO MIADO (ENTRAR, CRIAR PERFIL, ESCOLHER ARTISTAS)

Escopo: reconstruir a tela inicial exibida a usuarios novos ou sem onboarding concluido, em tres etapas (autenticacao, perfil, artistas), com versao de celular e versao de desktop com layout proprio. Esta especificacao vale sozinha. Se a refatoracao do Miado (tokens, `h()`, `icons.ts`, `images.ts`, `ListenerRegistry`, regras do Firestore com `handles`, `profiles`, `users`) ja foi aplicada, reutilizar esses modulos; se nao foi, criar os arquivos desta especificacao como modulos novos e substituir o bloco de onboarding de `src/app/miadoClient.js` (aproximadamente L5014-L5700) por uma unica chamada `mountOnboarding(container)`.

---

## 1. RESTRICOES OBRIGATORIAS

- R-01 Nenhum emoji e nenhum glifo nao vetorial em codigo, strings, CSS, JSON e logs. Todo icone e SVG inline (`src/ui/icons.ts`, viewBox 24x24, `stroke="currentColor"`, `stroke-width` 1.75, pontas arredondadas). Icones novos necessarios: `mail`, `lock`, `eye`, `eye-off`, `camera`, `plus`, `check`, `close`, `alert`, `search`, `arrow-left`, `arrow-right`, `spinner`, `user`, `google`, `apple` (as duas marcas como SVG monocromatico).
- R-02 A interface contem apenas rotulos de controle, dados reais e estados. Nenhum paragrafo que explique o app, nenhuma dica de uso, nenhuma referencia a outros aplicativos. Os textos permitidos estao na Secao 6; nenhuma outra string visivel pode ser criada.
- R-03 Proibido `innerHTML`, `outerHTML`, `insertAdjacentHTML`, atributos inline de evento e `style=` com dados dinamicos. DOM por `h()` (`textContent`, `setAttribute`); valores dinamicos de estilo por `el.style.setProperty`. URLs de imagem por `safeUrl()`.
- R-04 Nenhuma sombra de caixa. O unico `box-shadow` permitido e o filete interno `inset 0 1px 0 rgba(255,255,255,0.06)`. Sem brilho neon, sem `filter: drop-shadow`, sem `text-shadow`. Profundidade vem de translucidez, bordas e iluminacao ambiente da capa.
- R-05 Autenticacao somente por Firebase Auth (e-mail e senha, Google; Apple apenas se habilitado, Secao 5.3). Nenhum token em `localStorage`. Rascunho do onboarding apenas em `sessionStorage` (nome, handle, bio, artistas, etapa), com `try/catch`, apagado ao concluir.
- R-06 Escritas no Firestore seguem exatamente as regras: `serverTimestamp()` em `createdAt` e `updatedAt`; `handles/{handle}`, `profiles/{uid}` e `users/{uid}` gravados no mesmo `writeBatch`; `users.email` igual ao e-mail do token em minusculas; avatar no maximo 100000 caracteres; `favoriteArtists` com no maximo 60 itens; `bio` com no maximo 300 caracteres; `handle` com a expressao `^[a-z0-9_.]{2,28}$` (sem arroba).
- R-07 Acessibilidade: contraste minimo 4.5:1 para texto, alvos de toque de 44 px, `<label for>` em todo campo, regiao `aria-live="polite"` para validacao, foco movido para o titulo da etapa a cada troca, dialogos com `role="dialog"`, `aria-modal` e prisao de foco, `prefers-reduced-motion` respeitado (Secao 4.9).

---

## 2. DIRECAO VISUAL

Objetivo: aspecto de produto desenhado por pessoas, nao de tela gerada por IA. Elementos a evitar e substituicoes obrigatorias:

| Evitar | Fazer |
|---|---|
| Gradiente violeta para magenta em botoes, titulos e bordas; brilho neon externo | Botao primario de cor solida (acento), sem gradiente, com filete interno claro no topo; foco indicado por borda mais clara e `outline: 2px solid rgba(255,255,255,0.16)` com `outline-offset: 2px` |
| Esferas de cor difusas decorativas e genericas | Iluminacao ambiente derivada de capas e fotos reais exibidas na propria tela, interpolada suavemente |
| Tudo centralizado e simetrico, com slogan generico | Hierarquia tipografica clara, alinhamento a esquerda dentro de cartoes, grade de 8 px, raios consistentes (12 e 18), colunas assimetricas no desktop |
| Circulo grande de vidro fosco com icone de camera | Seletor de avatar com anel tracejado de filete, icone `plus` e, ao passar o mouse ou focar, rotulo "Trocar"; predefinicoes de gato como alternativa imediata |
| Icones de tamanhos e espessuras variados | Um unico conjunto de SVG, 20 px nos controles e 24 px nos titulos, mesma espessura de traco |

Tokens (reutilizar `src/styles/tokens.css`; se nao existir, criar `src/styles/onboarding.css` com este bloco):

```css
:root {
  color-scheme: dark;
  --ob-bg: #09090d;
  --glass-structure-bg: rgba(16, 16, 20, 0.68);
  --glass-card-bg: rgba(255, 255, 255, 0.04);
  --glass-card-bg-hover: rgba(255, 255, 255, 0.07);
  --glass-border: 1px solid rgba(255, 255, 255, 0.08);
  --glass-border-strong: 1px solid rgba(255, 255, 255, 0.16);
  --glass-blur: blur(24px) saturate(180%);
  --glass-specular: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  --text-primary: rgba(255, 255, 255, 0.94);
  --text-secondary: rgba(255, 255, 255, 0.66);
  --text-tertiary: rgba(255, 255, 255, 0.46);
  --danger: hsl(2 78% 68%);
  --success: hsl(152 52% 58%);
  --accent-h: 262; --accent-s: 68%; --accent-l: 68%;          /* padrao: violeta plano, sem brilho */
  --accent: hsl(var(--accent-h) var(--accent-s) var(--accent-l));
  --on-accent: #101014;                                         /* texto escuro sobre o acento */
  --font-ui: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-display: "Outfit", var(--font-ui);
  --radius-md: 12px; --radius-lg: 18px; --radius-pill: 999px;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring: linear(0, 0.42 9%, 0.84 20%, 1.04 30%, 1.07 38%, 1.03 50%, 1 62%, 1 100%);
}
```

Acento dinamico: ao receber uma capa ou foto (`updateAmbientColorsFromCover`), calcular a cor dominante e definir `--accent-h/-s/-l` limitando saturacao a 55%-70% e luminosidade a 62%-72% (garante contraste do texto `--on-accent`). A troca anima por 600 ms registrando `@property --accent-h { syntax: "<number>"; inherits: true; initial-value: 262; }` (e `-s`, `-l` como `<percentage>`) com `transition` nessas propriedades no elemento raiz do onboarding.

Fundo: `--ob-bg` com camada de ruido estatico (SVG `feTurbulence`, opacidade 0.03, repetido, como `data:` URI) para evitar faixas de gradiente. Tres camadas de luz (`.ob-light`) de `radial-gradient` nas tres cores ambientes, opacidade 0.18, em movimento lento (Secao 4.1). Logotipo: marca vetorial monocromatica (orelhas de gato formando uma nota musical) em `--text-primary`, com a palavra "Miado" em `--font-display`, peso 650, `letter-spacing: -0.02em`; sem brilho.

Tipografia: titulos em `--font-display`, `letter-spacing: -0.02em`, tamanhos 1.5rem (celular) e 2.25rem (desktop); rotulos e campos em `--font-ui`, `letter-spacing: -0.005em`, 0.9375rem; numeros com `font-variant-numeric: tabular-nums`.

Superficies: cartao principal com `--glass-structure-bg`, `backdrop-filter: var(--glass-blur)` (e a versao `-webkit-`), borda `--glass-border`, raio 18 px; campos e cartoes internos com `--glass-card-bg`, borda `--glass-border`, borda `--glass-border-strong` em `:hover` e `:focus-visible`. Em `prefers-reduced-transparency: reduce` e em navegadores sem `backdrop-filter`, usar fundos solidos `#14141a` e `#1b1b22`. No maximo 4 superficies com `backdrop-filter` ao mesmo tempo em telas de ate 820 px.

---

## 3. FLUXO, ESTADOS E DADOS

Maquina de estados (`src/ui/onboarding/flow.ts`): `auth` -> `profile` -> `artists` -> `done`. Condicoes de retomada ao abrir o app autenticado: sem documento `profiles/{uid}` ou sem handle -> `profile`; com perfil e `users.onboardingCompleted !== true` -> `artists`; com `onboardingCompleted === true` -> `done` (abre a Home). Voltar e permitido de `artists` para `profile`; de `profile` para `auth` somente se o usuario escolher sair (logout).

### 3.1 Etapa `auth`
- Controle segmentado "Entrar" e "Criar conta" com indicador deslizante. Campos: E-mail (`type="email"`, `autocomplete="email"`, `inputmode="email"`, `autocapitalize="off"`), Senha (`autocomplete="current-password"` ao entrar, `new-password` ao criar; botao `eye`/`eye-off` com `aria-pressed`).
- Decisao de produto: o campo aceita somente e-mail. O login por nome de usuario do mockup nao e implementado, porque resolver handle para e-mail sem autenticacao exporia a relacao handle-e-mail; `handles/{handle}` so e legivel por usuario autenticado.
- Criar conta: senha com no minimo 10 caracteres; medidor de forca de 4 segmentos (comprimento e variedade de classes de caracteres), expandido com a tecnica `grid-template-rows: 0fr -> 1fr`. Apos `createUserWithEmailAndPassword`, chamar `sendEmailVerification` e seguir para `profile` sem bloquear; exibir no cabecalho um indicador "E-mail nao verificado" com acao "Reenviar" (acoes sociais permanecem desabilitadas ate a verificacao, conforme regras do servidor).
- Google: `signInWithPopup`; em `auth/popup-blocked` ou em navegador embutido de aplicativo, usar `signInWithRedirect`.
- Erros mapeados (sem expor detalhes tecnicos): `auth/invalid-credential`, `auth/user-not-found`, `auth/wrong-password` -> "E-mail ou senha incorretos"; `auth/email-already-in-use` -> "E-mail ja cadastrado"; `auth/weak-password` -> "Minimo de 10 caracteres"; `auth/too-many-requests` -> "Muitas tentativas. Tente mais tarde"; `auth/network-request-failed` -> "Sem conexao"; demais -> "Nao foi possivel concluir".
- Acao secundaria "Explorar sem conta" somente se a flag `FEATURES.guest` for verdadeira; caso contrario, nao renderizar.

### 3.2 Etapa `profile`
- Avatar: abrir o seletor de arquivo (`accept="image/png,image/jpeg,image/webp"`, limite de 8 MB antes do recorte), abrir o editor de recorte em dialogo (Secao 5.4) e gerar JPEG 256x256 qualidade 0.8 como `data:` URI; se passar de 100000 caracteres, reduzir a qualidade em passos de 0.05 ate 0.5, e, se ainda exceder, exibir "Imagem muito grande". Alternativa: linha de predefinicoes de gato (`/api/cat-avatar?id=<catId>`), selecionaveis por teclado; a predefinicao inicial e `cat_1`.
- Nome de exibicao: 1 a 80 caracteres.
- Nome de usuario: prefixo visual "@" fora do valor do campo; o valor e normalizado em tempo real (minusculas, remocao de caracteres fora de `[a-z0-9_.]`, maximo 28). Verificacao de disponibilidade com debounce de 400 ms por `getDoc(doc(db, "handles", handle))` (usuario ja autenticado); estados: `invalid` (menos de 2 caracteres), `checking` (spinner), `available` (icone `check` desenhado), `taken` (icone `alert`). Se ocorrer corrida (handle tomado entre a verificacao e a gravacao), a gravacao falha por regra e o campo volta ao estado `taken`.
- Biografia opcional: ate 300 caracteres; contador visivel somente a partir de 250.
- Privacidade (controle segmentado de 3 posicoes, rotulo "Quem ve o que voce ouve"): "Todos", "Seguidores", "Ninguem", mapeados para `public`, `followers_only`, `private`; padrao "Seguidores". Grava `users.privacy = { presence, activity }` com o mesmo valor.
- Botao "Avancar" habilitado somente com nome valido e handle `available`. Ao avancar, executar o `writeBatch` (R-06) com `users/{uid}` (`onboardingCompleted: false`), `profiles/{uid}` e `handles/{handle}`; ao concluir, ir para `artists`.

### 3.3 Etapa `artists`
- Fontes de dados reais: busca pelo campo via `GET /api/search?q=` (artistas), sugestoes iniciais de `GET /api/charts` (`top100Artists`) e `GET /api/discover-more?page=`, filtros de genero reaproveitando o mapeamento de generos ja usado no onboarding atual (`availableGenres`, `displayArtists`). Fotos por `/api/artist-image?name=` com `bindImageFallback` (cadeia de fallback com placeholder SVG em Liquid Glass, nunca icone quebrado).
- Grade responsiva de cartoes de artista (foto circular, nome em uma linha com reticencias); selecionar e alternar; minimo 3, maximo 60 (ao atingir 60, cartoes nao selecionados ficam `aria-disabled`).
- Filtros de genero em carrossel de chips (usar `createCarousel` quando disponivel): "Rock", "Pop", "Rap", "MPB", "Indie", "Eletronica", "Funk", "Sertanejo", "R&B", "Metal"; "Todos" como primeiro chip. A busca por texto tem prioridade sobre o chip.
- Apos selecionar um artista, mostrar a faixa "Artistas parecidos" (3 a 6 itens, vindos de `GET /api/recommendations?artists=<selecionados ate 6>`), com cartoes do mesmo tipo, entrando com a animacao da Secao 4.7.
- Botao final: com menos de 3 selecionados, desabilitado com o rotulo "Escolha 3 artistas (n/3)"; com 3 ou mais, habilitado com "Tudo pronto (n)". Ao concluir, `updateDoc` em `users/{uid}` com `favoriteArtists`, `onboardingCompleted: true`, `updatedAt`, limpar `sessionStorage` e ir para a Home com a transicao da Secao 4.8.
- Rascunho: o conjunto selecionado e a etapa sao gravados em `sessionStorage` a cada mudanca (com debounce de 300 ms).

---

## 4. ANIMACOES (especificacao de cada movimento)

Regras gerais: animar somente `transform`, `opacity` e `clip-path`; nunca animar o raio de `backdrop-filter`, `width`, `height` ou `top/left`. `will-change` apenas durante a animacao e removido ao fim. Meta: 60 quadros por segundo em Android de faixa media. Implementar helpers em `src/ui/motion.ts`: `prefersReducedMotion()`, `stepTransition(from, to, direction)`, `shake(el)`, `drawCheck(svgPath)`, `rollNumber(el, value)`, `staggerIn(elements, { max: 24, delay: 50 })`.

- 4.1 Luzes ambientes: tres camadas `.ob-light` com `transform: translate3d()` em keyframes de 48 s, 62 s e 75 s (`alternate`, `ease-in-out`), deslocamento maximo de 8vmax; cores `--ambient-c1..c3`, transicao de cor de 800 ms quando a capa ou foto ativa muda.
- 4.2 Entrada do cartao: `opacity 0 -> 1` e `translateY(16px) -> 0` em 480 ms `--ease-out`; filhos diretos com atraso `calc(var(--i) * 60ms)` (variavel `--i` definida por `style.setProperty`).
- 4.3 Troca de modo (Entrar/Criar conta): o indicador do controle segmentado desliza por `transform: translateX()` em 260 ms; os campos adicionais (medidor de forca) expandem por `grid-template-rows` em 240 ms; o rotulo do botao primario faz fundo cruzado de 160 ms.
- 4.4 Campos: rotulo flutuante (sobe e reduz para 0.75rem por `transform` em 160 ms quando ha foco ou valor); borda de `0.08` para `0.16` em 200 ms; erro: `shake` de 240 ms (`translateX` de +-4 px, 3 ciclos) e mensagem deslizando 6 px com `opacity`; valido: icone `check` com `stroke-dashoffset` de 220 ms.
- 4.5 Botao primario: `:active` com `scale(0.97)` em 120 ms; estado de carregamento: o rotulo some (`opacity`) e um arco SVG gira (`rotate` linear 800 ms, infinito); sucesso: o arco se transforma em `check` desenhado por 220 ms antes da troca de etapa.
- 4.6 Transicao entre etapas: usar `document.startViewTransition` quando existir, com `view-transition-name` nos elementos compartilhados (`ob-logo`, `ob-avatar`, `ob-primary`) e `::view-transition-old/new(root)` com deslocamento horizontal de 24 px e fundo cruzado de 320 ms; direcao `forward` para a esquerda e `back` para a direita (classe no `html` definida antes de iniciar a transicao). Sem suporte: `stepTransition` faz saida (`opacity` e `translateX(-24px)`, 160 ms) e entrada (`translateX(24px) -> 0`, 280 ms). O indicador de etapas anima o preenchimento por `transform: scaleX()` em 400 ms.
- 4.7 Cartao de artista: ao selecionar, o anel de selecao e um `circle` SVG cujo `stroke-dashoffset` vai ao zero em 260 ms; o selo `check` entra com `scale(0 -> 1)` em 220 ms usando `--ease-spring`; o cartao faz `scale(1.04)` em 250 ms; `navigator.vibrate?.(8)` em dispositivos com suporte; desselecionar reverte em 180 ms. Cartoes que entram (busca, filtro, "Artistas parecidos") usam `staggerIn` limitado aos 24 primeiros visiveis; os demais entram por `IntersectionObserver` com `opacity` de 200 ms. O contador do botao usa `rollNumber` (digito antigo sobe e o novo entra por baixo, 220 ms, em contêiner com `overflow: hidden`). Ao selecionar, a cor ambiente e o acento passam para a cor dominante da foto (4.1 e Secao 2).
- 4.8 Conclusao: o cartao encolhe para `scale(0.98)` com `opacity` 0 em 240 ms, as luzes ambientes aumentam a opacidade para 0.28 por 400 ms e a Home entra com `opacity` e `translateY(12px)` em 420 ms.
- 4.9 Movimento reduzido: com `prefers-reduced-motion: reduce`, todas as animacoes acima passam a `opacity` em 120 ms; luzes ambientes ficam estaticas; sem `shake`, sem vibracao, sem rolagem suave; `stepTransition` usa apenas fundo cruzado.
- 4.10 Paralaxe de desktop (somente `(hover: hover) and (pointer: fine)` e sem movimento reduzido): a parede de capas (Secao 5.1) desloca no maximo 8 px em `translate3d` seguindo o ponteiro, atualizada por `requestAnimationFrame` e suavizada com fator 0.08.

---

## 5. LAYOUTS

Pontos de quebra: celular ate 639 px; tablet 640 a 1023 px; desktop a partir de 1024 px. Usar `100dvh`, `env(safe-area-inset-*)` e `min-height: 0` nos contêineres com rolagem; botao primario fixo na base com `padding-bottom: max(16px, env(safe-area-inset-bottom))` no celular.

### 5.1 Desktop, etapa `auth` (2 colunas, 56% e 44%)
- Coluna esquerda ("parede"): tres colunas verticais de capas reais obtidas de `GET /api/charts` (`trendingBrazil` e `globalTop100`), cada coluna em rolagem infinita lenta e em sentido alternado (por `transform: translateY` em keyframes de 90 s, 110 s e 130 s, conteudo duplicado para loop continuo), capas de 160 a 200 px, raio 12 px, borda `--glass-border`, sem sombras, imagens por `bindImageFallback` e `loading="lazy"`. Uma capa por vez fica "em foco" a cada 6 s (opacidade 1 e as demais 0.55, transicao de 600 ms) e empresta suas cores ao ambiente; legenda pequena no canto inferior esquerdo com titulo e artista reais da capa em foco. Sem slogan, sem paragrafo. A parede nao e exibida quando `/api/charts` falha (a coluna mostra apenas as luzes ambientes).
- Coluna direita: cartao de vidro com largura maxima de 420 px, centralizado verticalmente, conteudo alinhado a esquerda: marca, controle segmentado, campos, botao primario, divisor com o texto "ou", botoes "Continuar com o Google" (e "Continuar com a Apple" se habilitado) lado a lado em duas colunas quando houver os dois. Foco inicial no campo de e-mail; `Enter` envia; ordem de tabulacao natural.

### 5.2 Desktop, etapa `profile` (formulario e pre-visualizacao ao vivo)
- Grade de 12 colunas, largura maxima de 1120 px, centralizada: formulario nas colunas 1 a 7, pre-visualizacao nas colunas 8 a 12 (alinhada ao topo, `position: sticky; top: 24px`).
- Pre-visualizacao: o proprio componente `profileCard` do app, exibindo em tempo real avatar, nome, `@handle`, biografia e os tres primeiros artistas ja escolhidos (se houver), com banner gerado a partir da cor dominante do avatar (gradiente de duas luminosidades da mesma matiz, sem brilho). Atualiza a cada tecla sem reflow (somente `textContent`).
- Indicador de etapas vertical na lateral esquerda do formulario (Conta, Perfil, Artistas) com a etapa atual em `aria-current="step"`.

### 5.3 Desktop, etapa `artists` (tres zonas)
- Barra superior fixa: campo de busca (icone `search`, atalho `/` para focar) e carrossel de chips de genero.
- Centro: grade `repeat(auto-fill, minmax(132px, 1fr))` com rolagem vertical independente (`overscroll-behavior: contain`); navegacao por teclado em grade com foco itinerante (setas movem, `Espaco` e `Enter` alternam, `Home` e `End` vao ao primeiro e ao ultimo).
- Painel direito fixo de 340 px com "Seus artistas": lista dos selecionados (foto 36 px, nome, botao `close` para remover, animacao de saida de 180 ms), abaixo a faixa "Artistas parecidos", e na base o botao primario com contador. Quando nenhum artista esta selecionado, o painel mostra apenas o contador "0/3" e o botao desabilitado.
- Celular e tablet: o painel direito vira uma bandeja inferior recolhida (altura de 72 px com os avatares dos selecionados em fila e o botao primario); tocar na bandeja a expande como folha de vidro com a lista completa.

### 5.4 Editor de recorte de avatar (dialogo)
Dialogo de vidro com area de recorte circular de 280 px sobre a imagem; arrastar (ponteiro) para reposicionar; controle deslizante de zoom de 1x a 4x e `Ctrl`+roda no desktop; `pinch` no toque (dois ponteiros); teclado: setas movem 8 px, `+` e `-` alteram o zoom, `Enter` confirma, `Esc` cancela. Saida: JPEG 256x256 (Secao 3.2). Botoes "Cancelar" e "Usar foto".

### 5.5 Celular
Estrutura do mockup, refinada: marca no topo; titulo da etapa; campos empilhados; botao primario fixo na base; chips de genero em carrossel com rolagem horizontal sem selecao de texto (`user-select: none`, `overscroll-behavior-x: contain`, `scroll-snap-type: x proximity`); grade de artistas de 3 colunas; bandeja de selecionados da Secao 5.3.

### 5.6 Tablet
Cartao unico de largura maxima de 520 px centralizado nas etapas `auth` e `profile`; grade de artistas de 4 a 5 colunas com a bandeja inferior do celular.

---

## 6. TEXTOS PERMITIDOS (PT-BR, unicos visiveis)

Marca: "Miado". Etapa `auth`: "Entrar", "Criar conta", "E-mail", "Senha", "Mostrar senha", "Ocultar senha", "ou", "Continuar com o Google", "Continuar com a Apple", "E-mail nao verificado", "Reenviar". Etapa `profile`: "Perfil", "Etapa 1 de 2", "Adicionar foto", "Trocar", "Nome de exibicao", "Nome de usuario", "Biografia (opcional)", "Quem ve o que voce ouve", "Todos", "Seguidores", "Ninguem", "Avancar", "Voltar", "Disponivel", "Em uso", "Verificando", "Cancelar", "Usar foto", "Imagem muito grande". Etapa `artists`: "Artistas", "Etapa 2 de 2", "Pesquisar artistas e bandas", "Todos" e os nomes de genero da Secao 3.3, "Seus artistas", "Artistas parecidos", "Remover", "Escolha 3 artistas (n/3)", "Tudo pronto (n)". Mensagens de erro: as da Secao 3.1 mais "Campo obrigatorio", "E-mail invalido", "Nome muito longo", "Usuario invalido". Nenhuma outra string e permitida.

---

## 7. ARQUIVOS

Criar (ou ajustar, se ja existirem): `src/ui/onboarding/flow.ts`, `src/ui/onboarding/index.ts` (`mountOnboarding(container): () => void`, retorna `unmount` que remove listeners, observers, timers e a transicao ativa), `src/ui/onboarding/authStep.ts`, `profileStep.ts`, `artistsStep.ts`, `src/ui/components/field.ts`, `segmented.ts`, `stepper.ts`, `avatarEditor.ts`, `artistCard.ts`, `genreChips.ts`, `showcaseWall.ts`, `profilePreview.ts`, `selectedTray.ts`, `src/ui/motion.ts`, `src/styles/onboarding.css`, `src/ui/__tests__/onboarding.test.ts`. Alterar: `src/ui/icons.ts` (icones da R-01), `src/main.ts` (chamar `mountOnboarding` quando o usuario esta sem sessao ou sem onboarding concluido), `index.html` (nenhum texto novo). Remover o bloco de onboarding antigo de `src/app/miadoClient.js` se esse arquivo ainda existir.

Todo `addEventListener` usa `{ signal }` de um `AbortController` por etapa; todo `setTimeout`, `setInterval`, `IntersectionObserver`, `ResizeObserver` e animacao de Web Animations e registrado e cancelado no `unmount` e na troca de etapa.

Testes (Vitest): normalizacao e validacao de handle; maquina de estados e retomada; medidor de forca; mapeamento de erros do Firebase para as mensagens da Secao 3.1; selecao minima e maxima de artistas e rotulo do botao; geracao do JPEG dentro do limite de 100000 caracteres (com `canvas` simulado); `h()` neutraliza `<img onerror=...>` em nome, bio e nome de artista; varredura de padroes proibidos (emoji, `innerHTML`, `box-shadow` fora do filete) sobre os arquivos novos.

---

## 8. CHECKLIST DE VALIDACAO (`[needs_validation]`)

- OB-01 Provedor Apple: so renderizar o botao se o provedor estiver habilitado e configurado no console do Firebase (ID de servico, chave e dominio autorizado); testar o login em Safari e Chrome. Depende de conta e configuracao externas.
- OB-02 Login Google por popup em Safari iOS, Chrome Android e navegadores embutidos; confirmar o retorno por redirecionamento.
- OB-03 Regras do Firestore no emulador: lote `users` + `profiles` + `handles` aceito; handle duplicado negado; `email` diferente do token negado; avatar de 101000 caracteres negado; `favoriteArtists` com 61 itens negado.
- OB-04 Corrida de handle: dois navegadores reservando o mesmo handle quase ao mesmo tempo; um deve falhar e voltar ao estado `taken`.
- OB-05 Retomada: encerrar a aba nas etapas `profile` e `artists` e reabrir autenticado; deve voltar a etapa correta com o rascunho de `sessionStorage` quando disponivel.
- OB-06 Desempenho: gravar no painel Performance durante a troca de etapas e a selecao de artistas em Android de faixa media; sem tarefas longas acima de 50 ms nem quedas abaixo de 55 quadros por segundo; contar superficies com `backdrop-filter` (no maximo 4 em telas de ate 820 px).
- OB-07 `document.startViewTransition`: validar em Chrome, Edge, Safari recente e Firefox (fallback de `stepTransition` quando ausente).
- OB-08 Acessibilidade: leitor de tela (VoiceOver e TalkBack) percorrendo as tres etapas; foco no titulo a cada troca; navegacao em grade por teclado; prisao de foco no editor de recorte; contraste medido do texto secundario e do texto sobre o acento nos extremos de cor dominante.
- OB-09 Movimento reduzido: ativar a preferencia no sistema e conferir que nao ha deslocamentos, rotacoes nem vibracao.
- OB-10 Limite de requisicoes: abrir a etapa `artists` e rolar toda a grade; `/api/artist-image` e `/api/search` nao devem receber 429 com o limite de 240 e 60 por minuto; no maximo 6 requisicoes de imagem simultaneas.
- OB-11 Fallback de imagem: bloquear `/api/artist-image` e `/api/charts` nas ferramentas de desenvolvimento; a grade mostra o placeholder SVG em Liquid Glass e a parede desaparece sem erro visivel.
- OB-12 Padroes proibidos: `npm run lint` e busca por emojis, `innerHTML`, `box-shadow` e strings fora da Secao 6 retornam vazio nos arquivos novos.

---

## 9. DIRETRIZ DE ENTREGA

Gerar o codigo COMPLETO de todos os arquivos criados ou alterados, um bloco por arquivo, cada um precedido da linha `ARQUIVO: <caminho>`. Proibido omitir trechos, usar "..." ou comentarios como "resto do codigo permanece igual", deixar `TODO` ou funcoes vazias. Proibido qualquer emoji. Se o limite de saida for atingido, parar ao final de um arquivo completo, emitir `CONTINUA: <proximo caminho>` e retomar quando o usuario enviar `continuar`. Ao final, listar arquivos criados, alterados e removidos. Nenhum item da Secao 8 deve ser declarado validado sem evidencia de execucao real.
````
