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
  { title: "BIRDS OF A FEATHER", artist: "Billie Eilish", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/600x600bb.jpg" },
  { title: "Blinding Lights", artist: "The Weeknd", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/2b/b9/fe/2bb9fef5-d7f3-8345-25a9-db0e79fde4e4/20UMGIM11048.rgb.jpg/600x600bb.jpg" },
  { title: "Espresso", artist: "Sabrina Carpenter", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/11/8c/31/118c316e-d5f2-e22a-0936-b6ca1a46a04a/24UMGIM61704.rgb.jpg/600x600bb.jpg" },
  { title: "Die With A Smile", artist: "Lady Gaga", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/15/95/29/15952972-23c1-13c7-e12e-5298f6dc46c8/24UMGIM85348.rgb.jpg/600x600bb.jpg" },
  { title: " Good Luck, Babe!", artist: "Chappell Roan", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/d1/54/26/d154261f-c588-88f1-965c-589f1f41d11a/24UMGIM28252.rgb.jpg/600x600bb.jpg" },
  { title: "telepatía", artist: "Kali Uchis", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/68/f7/03/68f70392-19e4-3081-9f36-62a51bf4c979/20UMGIM96901.rgb.jpg/600x600bb.jpg" },
  { title: "Kill Bill", artist: "SZA", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/a4/96/a7/a496a74b-f29b-9839-7252-415d031d3e3f/196589564924.jpg/600x600bb.jpg" },
  { title: "Cruel Summer", artist: "Taylor Swift", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/49/3d/ab/493dab56-f920-9043-6181-80993b8116c9/19UMGIM53909.rgb.jpg/600x600bb.jpg" },
  { title: "As It Was", artist: "Harry Styles", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/2a/19/fb/2a19fb85-2f70-9e44-f2a9-82abe679b88e/196589057068.jpg/600x600bb.jpg" },
  { title: "Levitating", artist: "Dua Lipa", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/e7/34/2c/e7342c01-f9a1-d0fd-a8fb-18e6a0fb0834/190295092665.jpg/600x600bb.jpg" },
  { title: "we can't be friends", artist: "Ariana Grande", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/46/0d/e1/460de1c5-f6b6-2311-5791-699482e52c87/24UMGIM00198.rgb.jpg/600x600bb.jpg" },
  { title: "vampire", artist: "Olivia Rodrigo", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/45/d2/6d/45d26d88-e6d7-0991-2633-825f36b63d3f/23UMGIM71510.rgb.jpg/600x600bb.jpg" },
  { title: "Summertime Sadness", artist: "Lana Del Rey", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5f/d2/c3/5fd2c3a4-33a9-5b67-1052-84bd65a523fd/14UMGIM09892.rgb.jpg/600x600bb.jpg" },
  { title: "See You Again", artist: "Tyler, The Creator", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/f6/46/93/f64693b8-3b5b-2c2e-526e-f7850a7c7026/886446606026.jpg/600x600bb.jpg" },
  { title: "DtMF", artist: "Bad Bunny", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/68/75/72/68757249-713d-72ec-9d16-b516958e0d8c/198704287947_Cover.jpg/600x600bb.jpg" },
  { title: "luther", artist: "Kendrick Lamar", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/71/15/79/711579a0-6e29-9843-65c0-69375a16a6c3/24UM1IM28971.rgb.jpg/600x600bb.jpg" },
  { title: "APT.", artist: "ROSÉ", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/85/d6/9e/85d69e10-8a53-b092-9214-29f21f9959ca/075679628114.jpg/600x600bb.jpg" },
  { title: "Locked Out of Heaven", artist: "Bruno Mars", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/6e/10/b7/6e10b724-e157-8942-3a9d-349b940e9745/075679957290.jpg/600x600bb.jpg" },
  { title: "Sweater Weather", artist: "The Neighbourhood", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/1c/9c/71/1c9c717a-3267-768f-1c4f-b1f81c2c5703/886443938229.jpg/600x600bb.jpg" },
  { title: "505", artist: "Arctic Monkeys", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/0f/95/d0/0f95d052-8421-c215-c4fd-b1c26a26f73e/mzi.bkrvgbme.jpg/600x600bb.jpg" },
  { title: "The Less I Know The Better", artist: "Tame Impala", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/a7/74/31/a77431b6-94fb-1a94-c26b-c056ef0f252e/15UMGIM23322.rgb.jpg/600x600bb.jpg" },
  { title: "Pink + White", artist: "Frank Ocean", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/56/14/c5/5614c5f8-d0a7-5a0c-951c-68702fd844e0/859718120263_cover.jpg/600x600bb.jpg" },
  { title: "Numb", artist: "Linkin Park", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/b8/1a/58/b81a588c-3625-1f90-b416-77b3dc5a973e/093624948995.jpg/600x600bb.jpg" },
  { title: "FE!N", artist: "Travis Scott", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/09/7d/b0/097db06f-8403-3cf7-7510-139e579ca66b/196871341882.jpg/600x600bb.jpg" },
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

export function createShowcaseWall(opts: ShowcaseWallOptions): ShowcaseWallController {
  const col1Inner = h("div", { class: "ob-wall-col-track ob-wall-col-1" });
  const col2Inner = h("div", { class: "ob-wall-col-track ob-wall-col-2" });
  const col3Inner = h("div", { class: "ob-wall-col-track ob-wall-col-3" });

  const captionTitle = h("span", { class: "ob-wall-caption-title" });
  const captionArtist = h("span", { class: "ob-wall-caption-artist" });
  const captionStatus = h("span", { class: "ob-wall-caption-status" }, "Clique em um álbum para ouvir");
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
  let previewAudio: HTMLAudioElement | null = null;
  let playingIndex: number | null = null;
  let userInteracted = false;

  const stopPreviewAudio = () => {
    if (previewAudio) {
      try {
        previewAudio.pause();
        previewAudio.removeAttribute("src");
      } catch {}
    }
    playingIndex = null;
    root.querySelectorAll(".ob-wall-tile.is-playing").forEach((el) => el.classList.remove("is-playing"));
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

        // Impede qualquer capa repetida, música repetida ou artista repetido na vitrine
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
          rec.tile.classList.toggle("is-focused", i === safeIdx);
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

      const toggleTilePreview = (recordIndex: number) => {
        userInteracted = true;
        setFocusedTile(recordIndex);
        const rec = allTileRecords[recordIndex];
        if (!rec) return;

        if (playingIndex === recordIndex && previewAudio && !previewAudio.paused) {
          stopPreviewAudio();
          return;
        }

        stopPreviewAudio();
        playingIndex = recordIndex;
        rec.tile.classList.add("is-playing");
        captionStatus.textContent = "Carregando prévia...";

        if (!previewAudio) {
          previewAudio = new Audio();
          previewAudio.volume = 0.65;
          previewAudio.addEventListener("playing", () => {
            captionStatus.textContent = "Tocando prévia · clique para pausar";
          });
          previewAudio.addEventListener("ended", () => {
            stopPreviewAudio();
          });
          previewAudio.addEventListener("error", () => {
            captionStatus.textContent = "Álbum selecionado";
            rec.tile.classList.remove("is-playing");
            playingIndex = null;
          });
        }

        previewAudio.src = `/api/stream?title=${encodeURIComponent(rec.item.title)}&artist=${encodeURIComponent(rec.item.artist)}`;
        previewAudio.play().catch(() => {
          captionStatus.textContent = "Álbum em destaque";
          rec.tile.classList.remove("is-playing");
          playingIndex = null;
        });
      };

      const buildColumnTiles = (colTrack: HTMLElement, list: ShowcaseItem[]) => {
        // Renderiza apenas capas únicas na coluna (sem duplicar a lista para não repetir capa igual)
        list.forEach((item) => {
          const recordIndex = allTileRecords.length;
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
            toggleTilePreview(recordIndex);
          });
          colTrack.appendChild(tile);
          allTileRecords.push({ tile, item });
        });
      };

      buildColumnTiles(col1Inner, colBuckets[0]);
      buildColumnTiles(col2Inner, colBuckets[1]);
      buildColumnTiles(col3Inner, colBuckets[2]);

      captionBox.addEventListener("click", () => {
        if (allTileRecords.length > 0) {
          toggleTilePreview(focusIdx);
        }
      });

      root.classList.remove("is-loading");

      setFocusedTile(0);
      focusTimer = setInterval(() => {
        if (opts.signal.aborted || userInteracted) return;
        focusIdx = (focusIdx + 1) % Math.max(1, allTileRecords.length);
        setFocusedTile(focusIdx);
      }, 6000);
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
    },
  };
}
