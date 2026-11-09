import { h } from "../dom";
import { bindImageFallback } from "../images";
import { applyDynamicAccent, extractDominantHsl, prefersReducedMotion } from "../motion";

export interface ShowcaseItem {
  title: string;
  artist: string;
  coverUrl: string;
}

export interface ShowcaseWallOptions {
  onboardingRoot: HTMLElement;
  signal: AbortSignal;
}

export interface ShowcaseWallController {
  root: HTMLElement;
  destroy(): void;
}

const CURATED_GLOBAL_SHOWCASE: ShowcaseItem[] = [
  { title: "BIRDS OF A FEATHER", artist: "Billie Eilish", coverUrl: "" },
  { title: "Blinding Lights", artist: "The Weeknd", coverUrl: "" },
  { title: "Espresso", artist: "Sabrina Carpenter", coverUrl: "" },
  { title: "Die With A Smile", artist: "Lady Gaga", coverUrl: "" },
  { title: "Good Luck, Babe!", artist: "Chappell Roan", coverUrl: "" },
  { title: "telepatía", artist: "Kali Uchis", coverUrl: "" },
  { title: "Kill Bill", artist: "SZA", coverUrl: "" },
  { title: "Cruel Summer", artist: "Taylor Swift", coverUrl: "" },
  { title: "As It Was", artist: "Harry Styles", coverUrl: "" },
  { title: "Levitating", artist: "Dua Lipa", coverUrl: "" },
  { title: "we can't be friends", artist: "Ariana Grande", coverUrl: "" },
  { title: "vampire", artist: "Olivia Rodrigo", coverUrl: "" },
  { title: "Summertime Sadness", artist: "Lana Del Rey", coverUrl: "" },
  { title: "See You Again", artist: "Tyler, The Creator", coverUrl: "" },
  { title: "DtMF", artist: "Bad Bunny", coverUrl: "" },
  { title: "luther", artist: "Kendrick Lamar", coverUrl: "" },
  { title: "APT.", artist: "ROSÉ", coverUrl: "" },
  { title: "Locked Out of Heaven", artist: "Bruno Mars", coverUrl: "" },
  { title: "Sweater Weather", artist: "The Neighbourhood", coverUrl: "" },
  { title: "505", artist: "Arctic Monkeys", coverUrl: "" },
  { title: "The Less I Know The Better", artist: "Tame Impala", coverUrl: "" },
  { title: "Pink + White", artist: "Frank Ocean", coverUrl: "" },
  { title: "Numb", artist: "Linkin Park", coverUrl: "" },
  { title: "FE!N", artist: "Travis Scott", coverUrl: "" },
];

function normalizeCoverDedupKey(url: string): string {
  return String(url || "")
    .trim()
    .toLowerCase()
    .replace(/\?.*$/, "")
    .replace(/\/\d+x\d+[a-z]*\.(jpg|jpeg|png|webp)$/i, "");
}

function normalizePrimaryArtistKey(artist: string): string {
  return String(artist || "")
    .toLowerCase()
    .split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bwith|\bx\b|\/|;)\s*/i)[0]
    .replace(/[^a-z0-9\u00C0-\u017F]/gi, "")
    .trim();
}

function normalizeTitleDedupKey(title: string): string {
  return String(title || "")
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9\u00C0-\u017F]/gi, "")
    .trim();
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return true;
  return window.innerWidth < 1024 || (window.matchMedia && !window.matchMedia("(min-width: 1024px)").matches);
}

export function createShowcaseWall(opts: ShowcaseWallOptions): ShowcaseWallController {
  const col1Inner = h("div", { class: "ob-wall-col-track ob-wall-col-1" });
  const col2Inner = h("div", { class: "ob-wall-col-track ob-wall-col-2" });
  const col3Inner = h("div", { class: "ob-wall-col-track ob-wall-col-3" });

  const captionTitle = h("span", { class: "ob-wall-caption-title" });
  const captionArtist = h("span", { class: "ob-wall-caption-artist" });
  const captionStatus = h("span", { class: "ob-wall-caption-status" }, "Carregando destaques...");
  const captionBox = h("div", { class: "ob-wall-caption" }, captionTitle, captionArtist, captionStatus);

  const col1Wrap = h("div", { class: "ob-wall-col" }, col1Inner);
  const col2Wrap = h("div", { class: "ob-wall-col" }, col2Inner);
  const col3Wrap = h("div", { class: "ob-wall-col" }, col3Inner);

  const columnsStage = h("div", { class: "ob-wall-columns" }, col1Wrap, col2Wrap, col3Wrap);

  const root = h(
    "div",
    {
      class: "ob-showcase-wall is-loading",
      role: "region",
      "aria-label": "Álbuns em destaque no momento",
    },
    columnsStage,
    captionBox
  );

  let focusTimer: ReturnType<typeof setInterval> | null = null;
  let rafId: number | null = null;
  let previewAudio: HTMLAudioElement | null = null;
  let playingIndex: number | null = null;
  const userHoveredCols = new Set<HTMLElement>();
  const userInteractingCols = new Set<HTMLElement>();

  const stopPreviewAudio = () => {
    if (previewAudio) {
      try {
        previewAudio.pause();
        previewAudio.removeAttribute("src");
      } catch {}
    }
    playingIndex = null;
    root.querySelectorAll(".ob-wall-tile.is-playing, .ob-wall-tile.is-spotlight").forEach((el) => {
      el.classList.remove("is-playing");
      el.classList.remove("is-spotlight");
    });
    captionStatus.textContent = "Clique na capa para prévia";
  };

  const populateWall = async () => {
    try {
      let apiItems: any[] = [];
      try {
        const res = await fetch("/api/charts", { signal: opts.signal });
        if (res.ok) {
          const data = await res.json();
          apiItems = [
            ...(Array.isArray(data?.globalTop100) ? data.globalTop100 : []),
            ...(Array.isArray(data?.topSongs) ? data.topSongs : []),
          ];
        }
      } catch {}

      const combinedPool = [...apiItems, ...CURATED_GLOBAL_SHOWCASE];

      const items: ShowcaseItem[] = [];
      const seenTitles = new Set<string>();
      const seenArtists = new Set<string>();
      const seenCovers = new Set<string>();

      for (const item of combinedPool) {
        if (!item || !item.title || !item.artist) continue;
        const cleanTitle = String(item.title).trim();
        const cleanArtist = String(item.artist).trim();
        const titleKey = normalizeTitleDedupKey(cleanTitle);
        const artistKey = normalizePrimaryArtistKey(cleanArtist);
        if (!titleKey || !artistKey) continue;

        const rawCover = String(item.coverUrl || "").trim();
        const coverUrl =
          rawCover ||
          `/api/cover?title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(cleanArtist)}`;
        const coverKey = rawCover ? normalizeCoverDedupKey(rawCover) : `${titleKey}|${artistKey}`;

        if (seenTitles.has(titleKey) || seenArtists.has(artistKey) || seenCovers.has(coverKey)) {
          continue;
        }
        seenTitles.add(titleKey);
        seenArtists.add(artistKey);
        seenCovers.add(coverKey);

        items.push({
          title: cleanTitle,
          artist: cleanArtist,
          coverUrl,
        });
        if (items.length >= 24) break;
      }

      if (items.length < 6) {
        root.classList.add("is-hidden");
        return;
      }

      const colBuckets: [ShowcaseItem[], ShowcaseItem[], ShowcaseItem[]] = [[], [], []];
      items.forEach((it, idx) => {
        colBuckets[idx % 3].push(it);
      });

      const allTileRecords: Array<{ tile: HTMLElement; item: ShowcaseItem }> = [];
      let focusIdx = 0;

      const setFocusedTile = (index: number) => {
        if (allTileRecords.length === 0) return;
        const safeIdx = ((index % allTileRecords.length) + allTileRecords.length) % allTileRecords.length;
        focusIdx = safeIdx;
        allTileRecords.forEach((rec, i) => {
          const isTarget = i === safeIdx;
          rec.tile.classList.toggle("is-focused", isTarget);
          rec.tile.classList.toggle("is-spotlight", isTarget);
        });
        const focused = allTileRecords[safeIdx];
        if (focused) {
          captionTitle.textContent = focused.item.title;
          captionArtist.textContent = focused.item.artist;
          extractDominantHsl(focused.item.coverUrl).then((hsl) => {
            if (hsl && !opts.signal.aborted) {
              applyDynamicAccent(opts.onboardingRoot, hsl);
            }
          });
        }
      };

      const playTileAudio = (recordIndex: number, soft = true) => {
        if (isMobileViewport()) {
          stopPreviewAudio();
          return;
        }
        const rec = allTileRecords[recordIndex];
        if (!rec) return;

        stopPreviewAudio();
        playingIndex = recordIndex;
        rec.tile.classList.add("is-playing");
        rec.tile.classList.add("is-spotlight");
        captionStatus.textContent = "Tocando baixinho · 30s de prévia";

        if (!previewAudio) {
          previewAudio = new Audio();
          previewAudio.addEventListener("ended", () => {
            stopPreviewAudio();
            spotlightRandomSong(true);
          });
          previewAudio.addEventListener("error", () => {
            if (playingIndex === recordIndex) {
              rec.tile.classList.remove("is-playing");
              captionStatus.textContent = "Álbum em destaque";
            }
          });
        }

        // Toca baixinho de fundo (~0.16) como pedido
        previewAudio.volume = soft ? 0.16 : 0.45;
        previewAudio.src = `/api/stream?title=${encodeURIComponent(rec.item.title)}&artist=${encodeURIComponent(rec.item.artist)}`;

        const playPromise = previewAudio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Autoplay bloqueado pelo navegador antes do primeiro gesto
            captionStatus.textContent = "Clique para tocar prévia";
            const unlockAudio = () => {
              window.removeEventListener("pointerdown", unlockAudio);
              window.removeEventListener("keydown", unlockAudio);
              if (previewAudio && previewAudio.src) {
                previewAudio.play().catch(() => {});
                captionStatus.textContent = "Tocando baixinho · 30s de prévia";
              }
            };
            window.addEventListener("pointerdown", unlockAudio, { once: true });
            window.addEventListener("keydown", unlockAudio, { once: true });
          });
        }
      };

      const spotlightRandomSong = (autoPlay = true) => {
        if (allTileRecords.length === 0 || opts.signal.aborted) return;
        let nextIdx = Math.floor(Math.random() * allTileRecords.length);
        if (allTileRecords.length > 1 && nextIdx === focusIdx) {
          nextIdx = (nextIdx + 1) % allTileRecords.length;
        }
        setFocusedTile(nextIdx);
        if (autoPlay && !isMobileViewport()) {
          playTileAudio(nextIdx, true);
        }
      };

      const schedule30sSpotlightTimer = () => {
        if (focusTimer) clearInterval(focusTimer);
        if (isMobileViewport()) return;
        focusTimer = setInterval(() => {
          if (opts.signal.aborted || isMobileViewport()) {
            stopPreviewAudio();
            return;
          }
          spotlightRandomSong(true);
        }, 30000);
      };

      const toggleTilePreview = (recordIndex: number) => {
        setFocusedTile(recordIndex);
        const rec = allTileRecords[recordIndex];
        if (!rec) return;

        if (playingIndex === recordIndex && previewAudio && !previewAudio.paused) {
          stopPreviewAudio();
          return;
        }

        playTileAudio(recordIndex, true);
        schedule30sSpotlightTimer();
      };

      const buildColumnTiles = (colTrack: HTMLElement, list: ShowcaseItem[]) => {
        // Renderiza duas passadas para permitir scroll infinito contínuo e sem costuras
        const fullList = [...list, ...list];
        fullList.forEach((item, passIdx) => {
          const isPrimaryPass = passIdx < list.length;
          const assignedIndex = isPrimaryPass ? allTileRecords.length : (passIdx % list.length);

          const img = h("img", {
            class: "ob-wall-cover-img",
            alt: `${item.title} - ${item.artist}`,
            draggable: "false",
          }) as HTMLImageElement;
          bindImageFallback(
            img,
            [
              item.coverUrl,
              `/api/cover?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}`,
            ],
            "album",
            `${item.title}-${item.artist}`,
            item.title
          );
          const badge = h(
            "div",
            { class: "ob-wall-tile-overlay" },
            h("span", { class: "ob-wall-tile-title" }, item.title),
            h("span", { class: "ob-wall-tile-artist" }, item.artist)
          );
          const tile = h(
            "button",
            {
              type: "button",
              class: "ob-wall-tile",
              title: `${item.title} — ${item.artist}`,
            },
            img,
            badge
          );
          tile.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTilePreview(assignedIndex);
          });
          colTrack.appendChild(tile);

          if (isPrimaryPass) {
            allTileRecords.push({ tile, item });
          }
        });
      };

      buildColumnTiles(col1Inner, colBuckets[0]);
      buildColumnTiles(col2Inner, colBuckets[1]);
      buildColumnTiles(col3Inner, colBuckets[2]);

      // Configura pausa suave no scroll quando o usuário passa o mouse ou interage
      const colWraps = [col1Wrap, col2Wrap, col3Wrap];
      colWraps.forEach((wrap) => {
        wrap.addEventListener("pointerenter", () => userHoveredCols.add(wrap));
        wrap.addEventListener("pointerleave", () => userHoveredCols.delete(wrap));

        let wheelTimer: ReturnType<typeof setTimeout> | null = null;
        const markInteracting = () => {
          userInteractingCols.add(wrap);
          if (wheelTimer) clearTimeout(wheelTimer);
          wheelTimer = setTimeout(() => {
            userInteractingCols.delete(wrap);
          }, 3200);
        };
        wrap.addEventListener("wheel", markInteracting, { passive: true });
        wrap.addEventListener("touchstart", markInteracting, { passive: true });
      });

      // Posição inicial da coluna do meio ligeiramente deslocada para efeito parallax estético
      col2Wrap.scrollTop = 450;
      const colScrollAccumulator = [0, 450, 0];

      // Loop de movimentação contínua e suave das 3 colunas em velocidades relaxadas
      const speeds = [0.18, -0.14, 0.22]; // Coluna 1 desce suave, Coluna 2 sobe suave, Coluna 3 desce sutilmente
      const runScrollLoop = () => {
        if (opts.signal.aborted) return;
        if (!prefersReducedMotion()) {
          colWraps.forEach((wrap, i) => {
            if (userHoveredCols.has(wrap) || userInteractingCols.has(wrap)) {
              colScrollAccumulator[i] = wrap.scrollTop;
              return;
            }
            const spd = speeds[i];
            colScrollAccumulator[i] += spd;
            const halfHeight = wrap.scrollHeight / 2;
            if (halfHeight > 100) {
              if (colScrollAccumulator[i] >= halfHeight) {
                colScrollAccumulator[i] -= halfHeight;
              } else if (colScrollAccumulator[i] <= 0 && spd < 0) {
                colScrollAccumulator[i] += halfHeight;
              }
            }
            wrap.scrollTop = Math.round(colScrollAccumulator[i]);
          });
        }
        rafId = requestAnimationFrame(runScrollLoop);
      };
      rafId = requestAnimationFrame(runScrollLoop);

      captionBox.addEventListener("click", () => {
        if (allTileRecords.length > 0) {
          toggleTilePreview(focusIdx);
        }
      });

      root.classList.remove("is-loading");

      // Inicia com um álbum em destaque. Só toca áudio de prévia se for Desktop (>= 1024px)
      const canAutoPlay = !isMobileViewport();
      spotlightRandomSong(canAutoPlay);
      if (canAutoPlay) {
        schedule30sSpotlightTimer();
      }

      if (typeof window !== "undefined" && window.matchMedia) {
        const mql = window.matchMedia("(min-width: 1024px)");
        const onBpChange = (e: MediaQueryListEvent) => {
          if (!e.matches) {
            stopPreviewAudio();
            if (focusTimer) {
              clearInterval(focusTimer);
              focusTimer = null;
            }
          }
        };
        mql.addEventListener("change", onBpChange);
      }
    } catch {
      root.classList.add("is-hidden");
    }
  };

  populateWall();

  return {
    root,
    destroy() {
      stopPreviewAudio();
      if (focusTimer) {
        clearInterval(focusTimer);
        focusTimer = null;
      }
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}
