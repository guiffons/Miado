/**
 * Dynamic Ambient Color Extraction, MediaSession API, Swipe-Down & Keyboard Shortcuts (Fases 1 & 3)
 */

let ambientAnimFrame: number | null = null;
let currentAmbientColors: [[number, number, number], [number, number, number], [number, number, number]] = [
  [139, 92, 246],
  [59, 130, 246],
  [236, 72, 153]
];

function animateAmbientRgbTransition(
  target1: [number, number, number],
  target2: [number, number, number],
  target3: [number, number, number]
): void {
  if (ambientAnimFrame) {
    cancelAnimationFrame(ambientAnimFrame);
    ambientAnimFrame = null;
  }
  const startColors: [[number, number, number], [number, number, number], [number, number, number]] = [
    [...currentAmbientColors[0]],
    [...currentAmbientColors[1]],
    [...currentAmbientColors[2]]
  ];
  const duration = 680;
  const startTime = performance.now();

  const step = (now: number) => {
    const t = Math.min(1, (now - startTime) / duration);
    const ease = 1 - Math.pow(1 - t, 3); // cubic-out

    const lerp = (a: number, b: number) => Math.round(a + (b - a) * ease);

    const c1: [number, number, number] = [
      lerp(startColors[0][0], target1[0]),
      lerp(startColors[0][1], target1[1]),
      lerp(startColors[0][2], target1[2])
    ];
    const c2: [number, number, number] = [
      lerp(startColors[1][0], target2[0]),
      lerp(startColors[1][1], target2[1]),
      lerp(startColors[1][2], target2[2])
    ];
    const c3: [number, number, number] = [
      lerp(startColors[2][0], target3[0]),
      lerp(startColors[2][1], target3[1]),
      lerp(startColors[2][2], target3[2])
    ];

    currentAmbientColors = [c1, c2, c3];
    document.documentElement.style.setProperty("--ambient-c1", `${c1[0]}, ${c1[1]}, ${c1[2]}`);
    document.documentElement.style.setProperty("--ambient-c2", `${c2[0]}, ${c2[1]}, ${c2[2]}`);
    document.documentElement.style.setProperty("--ambient-c3", `${c3[0]}, ${c3[1]}, ${c3[2]}`);

    if (t < 1) {
      ambientAnimFrame = requestAnimationFrame(step);
    } else {
      ambientAnimFrame = null;
    }
  };

  ambientAnimFrame = requestAnimationFrame(step);
}

export function triggerLiquidGlassTrackTransition(): void {
  const targets = [
    document.getElementById("player-cover-img"),
    document.getElementById("mobile-thumb-img"),
    document.getElementById("fs-cover-img"),
    document.querySelector(".player-track-meta"),
    document.querySelector(".mobile-player-meta"),
    document.querySelector(".fs-track-meta"),
    document.querySelector(".player-footer"),
    document.getElementById("mobile-floating-player")
  ];

  for (const el of targets) {
    if (!el) continue;
    el.classList.remove("liquid-glass-switching");
    // Force reflow so rapid track changes re-trigger the animation smoothly
    void (el as HTMLElement).offsetWidth;
    el.classList.add("liquid-glass-switching");
  }
}

export function updateAmbientColorsFromCover(coverUrl: string): void {
  if (!coverUrl || coverUrl.startsWith("data:image/svg+xml")) {
    animateAmbientRgbTransition([147, 51, 234], [88, 28, 135], [180, 180, 200]);
    return;
  }

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      const size = 24;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      let r1 = 0, g1 = 0, b1 = 0, c1 = 0;
      let r2 = 0, g2 = 0, b2 = 0, c2 = 0;
      let r3 = 0, g3 = 0, b3 = 0, c3 = 0;

      for (let i = 0; i < data.length; i += 16) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // Ignore pure black or pure white pixels so the ambient glow stays rich
        if (lum < 22 || lum > 238) continue;

        const bucket = (i / 16) % 3;
        if (bucket === 0) {
          r1 += r; g1 += g; b1 += b; c1++;
        } else if (bucket === 1) {
          r2 += r; g2 += g; b2 += b; c2++;
        } else {
          r3 += r; g3 += g; b3 += b; c3++;
        }
      }

      const next1: [number, number, number] =
        c1 > 0 ? [Math.round(r1 / c1), Math.round(g1 / c1), Math.round(b1 / c1)] : [147, 51, 234];
      const next2: [number, number, number] =
        c2 > 0 ? [Math.round(r2 / c2), Math.round(g2 / c2), Math.round(b2 / c2)] : [88, 28, 135];
      const next3: [number, number, number] =
        c3 > 0 ? [Math.round(r3 / c3), Math.round(g3 / c3), Math.round(b3 / c3)] : [180, 180, 200];

      animateAmbientRgbTransition(next1, next2, next3);
    } catch {
      // Fallback to default Miado palette if canvas is tainted
    }
  };
  img.src = coverUrl;
}

export function initEnhancements(): void {
  const w = window as any;
  w.triggerLiquidGlassTrackTransition = triggerLiquidGlassTrackTransition;

  // Watch player cover image changes to update dynamic ambient Liquid Glass colors & MediaSession
  const coverImg = document.getElementById("player-cover-img") as HTMLImageElement | null;
  if (coverImg) {
    let lastCoverSrc = coverImg.src || "";
    const obs = new MutationObserver(() => {
      if (coverImg.src && coverImg.src !== lastCoverSrc) {
        lastCoverSrc = coverImg.src;
        triggerLiquidGlassTrackTransition();
        updateAmbientColorsFromCover(coverImg.src);
      }
      syncMediaSession();
    });
    obs.observe(coverImg, { attributes: true, attributeFilter: ["src"] });
    if (coverImg.src) {
      updateAmbientColorsFromCover(coverImg.src);
    }
  }

  function syncMediaSession(): void {
    try {
      if (!("mediaSession" in navigator)) return;
      const state = w.miadoState;
      const engine = w.miadoEngine;
      const tr = state?.currentTrack;
      if (!tr) return;

      navigator.mediaSession.metadata = new MediaMetadata({
        title: tr.title || "Miado",
        artist: tr.artist || "Artista",
        album: tr.albumTitle || "Miado Lossless HD",
        artwork: tr.coverUrl && !tr.coverUrl.startsWith("data:")
          ? [{ src: tr.coverUrl, sizes: "512x512", type: "image/jpeg" }]
          : []
      });

      navigator.mediaSession.setActionHandler("play", () => engine?.togglePlay());
      navigator.mediaSession.setActionHandler("pause", () => engine?.togglePlay());
      navigator.mediaSession.setActionHandler("previoustrack", () => engine?.prevTrack());
      navigator.mediaSession.setActionHandler("nexttrack", () => engine?.nextTrack());
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (engine?.audio && typeof details.seekTime === "number") {
          engine.audio.currentTime = details.seekTime;
        }
      });
    } catch {}
  }

  // Global keyboard shortcuts (Space, J, L, M, /) when not typing in an input/textarea
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const isInput =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable);

    if (e.key === "/" && !isInput) {
      e.preventDefault();
      const searchInput = document.getElementById("top-search-input") as HTMLInputElement | null;
      searchInput?.focus();
      return;
    }

    if (isInput) return;
    const engine = w.miadoEngine;
    if (!engine) return;

    if (e.code === "Space") {
      e.preventDefault();
      engine.togglePlay();
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      engine.toggleMute();
    } else if (e.key === "j" || e.key === "J") {
      if (engine.audio && engine.audio.duration) {
        engine.audio.currentTime = Math.max(0, engine.audio.currentTime - 10);
      }
    } else if (e.key === "l" || e.key === "L") {
      if (engine.audio && engine.audio.duration) {
        engine.audio.currentTime = Math.min(engine.audio.duration, engine.audio.currentTime + 10);
      }
    }
  });

  // Gesto seguro de deslizar para baixo no Player em Tela Cheia (apenas na pílula superior ou header)
  const fsModal = document.getElementById("modal-fullscreen-player");
  if (fsModal) {
    let startY = 0;
    let isPillDrag = false;

    fsModal.addEventListener(
      "touchstart",
      (e: TouchEvent) => {
        if (e.touches.length === 1) {
          const target = e.target as HTMLElement | null;
          const isHeaderOrHandle = target && (target.closest(".fs-grab-pill") || target.closest(".fs-player-header"));
          if (isHeaderOrHandle) {
            startY = e.touches[0].clientY;
            isPillDrag = true;
          } else {
            isPillDrag = false;
          }
        }
      },
      { passive: true }
    );

    fsModal.addEventListener(
      "touchend",
      (e: TouchEvent) => {
        if (!isPillDrag) return;
        isPillDrag = false;
        const endY = e.changedTouches[0]?.clientY || startY;
        // Exige arrasto intencional de no mínimo 120px para baixo na área superior
        if (endY - startY >= 120) {
          fsModal.classList.remove("active");
        }
      },
      { passive: true }
    );
  }
}
