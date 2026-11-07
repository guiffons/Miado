export interface CarouselOptions {
  signal: AbortSignal;
  step?: number;
  prevBtn?: HTMLButtonElement | null;
  nextBtn?: HTMLButtonElement | null;
}

export function createCarousel(
  root: HTMLElement,
  options: CarouselOptions
): { destroy(): void; update(): void } {
  const internalController = new AbortController();
  const combinedSignal = options.signal
    ? AbortSignal.any([options.signal, internalController.signal])
    : internalController.signal;

  root.tabIndex = root.tabIndex >= 0 ? root.tabIndex : 0;
  root.setAttribute("role", "region");
  root.setAttribute("aria-roledescription", "carrossel");

  let rafId = 0;
  const updateButtons = () => {
    const maxScroll = Math.max(0, root.scrollWidth - root.clientWidth);
    if (options.prevBtn) {
      options.prevBtn.disabled = root.scrollLeft <= 2;
    }
    if (options.nextBtn) {
      options.nextBtn.disabled = root.scrollLeft >= maxScroll - 2;
    }
  };

  const scheduleUpdate = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      updateButtons();
    });
  };

  const scrollStep = (dir: -1 | 1) => {
    const amount = options.step || Math.round(root.clientWidth * 0.85) || 320;
    root.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  if (options.prevBtn) {
    options.prevBtn.addEventListener("click", () => scrollStep(-1), { signal: combinedSignal });
  }
  if (options.nextBtn) {
    options.nextBtn.addEventListener("click", () => scrollStep(1), { signal: combinedSignal });
  }

  root.addEventListener("scroll", scheduleUpdate, { passive: true, signal: combinedSignal });

  root.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        root.scrollLeft += e.deltaY;
      }
    },
    { passive: false, signal: combinedSignal }
  );

  let isPointerDown = false;
  let startX = 0;
  let startScrollLeft = 0;
  let dragged = false;

  root.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      isPointerDown = true;
      dragged = false;
      startX = e.clientX;
      startScrollLeft = root.scrollLeft;
    },
    { signal: combinedSignal }
  );

  root.addEventListener(
    "pointermove",
    (e: PointerEvent) => {
      if (!isPointerDown || e.pointerType !== "mouse") return;
      const dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) > 5) {
        dragged = true;
        root.dataset.dragging = "true";
        try {
          root.setPointerCapture(e.pointerId);
        } catch {}
      }
      if (dragged) {
        root.scrollLeft = startScrollLeft - dx;
      }
    },
    { signal: combinedSignal }
  );

  const endPointer = (e: PointerEvent) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    delete root.dataset.dragging;
    try {
      if (root.hasPointerCapture(e.pointerId)) {
        root.releasePointerCapture(e.pointerId);
      }
    } catch {}
    if (dragged) {
      const suppressClick = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      root.addEventListener("click", suppressClick, { capture: true, once: true });
      dragged = false;
    }
  };

  root.addEventListener("pointerup", endPointer, { signal: combinedSignal });
  root.addEventListener("pointercancel", endPointer, { signal: combinedSignal });

  root.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollStep(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollStep(1);
      }
    },
    { signal: combinedSignal }
  );

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => scheduleUpdate());
    ro.observe(root);
  }

  updateButtons();

  return {
    update: updateButtons,
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      ro?.disconnect();
      internalController.abort();
    },
  };
}
