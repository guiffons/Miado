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

export function createShowcaseWall(opts: ShowcaseWallOptions): ShowcaseWallController {
  const col1Inner = h("div", { class: "ob-wall-col-track ob-wall-col-1" });
  const col2Inner = h("div", { class: "ob-wall-col-track ob-wall-col-2" });
  const col3Inner = h("div", { class: "ob-wall-col-track ob-wall-col-3" });

  const captionTitle = h("span", { class: "ob-wall-caption-title" });
  const captionArtist = h("span", { class: "ob-wall-caption-artist" });
  const captionBox = h("div", { class: "ob-wall-caption" }, captionTitle, captionArtist);

  const columnsStage = h(
    "div",
    { class: "ob-wall-columns" },
    h("div", { class: "ob-wall-col" }, col1Inner),
    h("div", { class: "ob-wall-col" }, col2Inner),
    h("div", { class: "ob-wall-col" }, col3Inner)
  );

  const root = h(
    "div",
    {
      class: "ob-showcase-wall is-loading",
      "aria-hidden": "true",
    },
    columnsStage,
    captionBox
  );

  let focusTimer: ReturnType<typeof setInterval> | null = null;
  let parallaxRaf = 0;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  const canParallax = () =>
    !prefersReducedMotion() &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const stepParallax = () => {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    columnsStage.style.setProperty(
      "transform",
      `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`
    );
    if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
      parallaxRaf = requestAnimationFrame(stepParallax);
    } else {
      parallaxRaf = 0;
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener(
      "pointermove",
      (e: PointerEvent) => {
        if (!canParallax()) return;
        const nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
        const ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
        targetX = Math.max(-8, Math.min(8, nx * 8));
        targetY = Math.max(-8, Math.min(8, ny * 8));
        if (!parallaxRaf) {
          parallaxRaf = requestAnimationFrame(stepParallax);
        }
      },
      { passive: true, signal: opts.signal }
    );
  }

  const populateWall = async () => {
    try {
      const res = await fetch("/api/charts", { signal: opts.signal });
      if (!res.ok) {
        root.classList.add("is-hidden");
        return;
      }
      const data = await res.json();
      const rawItems: any[] = [
        ...(Array.isArray(data?.trendingBrazil) ? data.trendingBrazil : []),
        ...(Array.isArray(data?.globalTop100) ? data.globalTop100 : []),
      ];

      const items: ShowcaseItem[] = [];
      const seen = new Set<string>();
      for (const item of rawItems) {
        if (!item || !item.title || !item.artist) continue;
        const key = `${String(item.title).toLowerCase()}|${String(item.artist).toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const coverUrl =
          item.coverUrl ||
          `/api/cover?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}`;
        items.push({
          title: String(item.title),
          artist: String(item.artist),
          coverUrl,
        });
        if (items.length >= 18) break;
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

      const buildColumnTiles = (colTrack: HTMLElement, list: ShowcaseItem[]) => {
        const doubled = [...list, ...list];
        doubled.forEach((item, idx) => {
          const img = h("img", { class: "ob-wall-cover-img" }) as HTMLImageElement;
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
          const tile = h("div", { class: "ob-wall-tile" }, img);
          colTrack.appendChild(tile);
          if (idx < list.length) {
            allTileRecords.push({ tile, item });
          }
        });
      };

      buildColumnTiles(col1Inner, colBuckets[0]);
      buildColumnTiles(col2Inner, colBuckets[1]);
      buildColumnTiles(col3Inner, colBuckets[2]);

      root.classList.remove("is-loading");

      let focusIdx = 0;
      const setFocusedTile = (index: number) => {
        if (allTileRecords.length === 0) return;
        const safeIdx = index % allTileRecords.length;
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

      setFocusedTile(0);
      focusTimer = setInterval(() => {
        if (opts.signal.aborted) return;
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
      if (focusTimer) {
        clearInterval(focusTimer);
        focusTimer = null;
      }
      if (parallaxRaf) {
        cancelAnimationFrame(parallaxRaf);
        parallaxRaf = 0;
      }
    },
  };
}
