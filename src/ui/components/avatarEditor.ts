import { h } from "../dom";
import { OB_TEXT } from "../onboarding/flow";

export const MAX_AVATAR_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_AVATAR_DATA_URL_CHARS = 100000;

export function encodeCanvasToBoundedJpeg(
  canvas: HTMLCanvasElement,
  maxChars = MAX_AVATAR_DATA_URL_CHARS
): string {
  for (let q = 80; q >= 50; q -= 5) {
    const quality = Number((q / 100).toFixed(2));
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= maxChars) {
      return dataUrl;
    }
  }
  throw new Error(OB_TEXT.profile.imageTooLarge);
}

export interface AvatarEditorOptions {
  file: File;
  parentSignal: AbortSignal;
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}

export function openAvatarEditor(opts: AvatarEditorOptions): () => void {
  if (opts.file.size > MAX_AVATAR_FILE_BYTES) {
    opts.onError(OB_TEXT.profile.imageTooLarge);
    return () => {};
  }

  const controller = new AbortController();
  const signal = AbortSignal.any([opts.parentSignal, controller.signal]);
  const prevFocused = document.activeElement as HTMLElement | null;

  let offsetX = 0;
  let offsetY = 0;
  let zoom = 1;
  let naturalWidth = 280;
  let naturalHeight = 280;
  let loadedImage: HTMLImageElement | null = null;

  const previewImg = h("img", {
    class: "ob-crop-source-img",
    alt: OB_TEXT.profile.title,
    draggable: "false",
  }) as HTMLImageElement;

  const updateTransform = () => {
    previewImg.style.setProperty("--crop-x", `${Math.round(offsetX)}px`);
    previewImg.style.setProperty("--crop-y", `${Math.round(offsetY)}px`);
    previewImg.style.setProperty("--crop-scale", zoom.toFixed(3));
  };

  const clampZoom = (nextZoom: number) => {
    zoom = Math.max(1, Math.min(4, Number(nextZoom) || 1));
    zoomSlider.value = String(zoom);
    updateTransform();
  };

  const viewport = h(
    "div",
    {
      class: "ob-crop-viewport",
      tabindex: "0",
      "aria-label": OB_TEXT.profile.changePhoto,
    },
    previewImg,
    h("div", { class: "ob-crop-circle-mask", "aria-hidden": "true" })
  );

  const zoomSliderId = "ob-avatar-zoom-range";
  const zoomLabel = h(
    "label",
    { for: zoomSliderId, class: "ob-visually-hidden" },
    OB_TEXT.profile.changePhoto
  );
  const zoomSlider = h("input", {
    id: zoomSliderId,
    class: "ob-crop-zoom-slider",
    type: "range",
    min: "1",
    max: "4",
    step: "0.05",
    value: "1",
  }) as HTMLInputElement;

  const btnCancel = h(
    "button",
    {
      type: "button",
      class: "ob-btn-secondary",
    },
    OB_TEXT.profile.cancel
  ) as HTMLButtonElement;

  const btnConfirm = h(
    "button",
    {
      type: "button",
      class: "ob-btn-primary",
    },
    OB_TEXT.profile.usePhoto
  ) as HTMLButtonElement;

  const titleEl = h(
    "h2",
    {
      id: "ob-crop-dialog-title",
      class: "ob-dialog-title",
      tabindex: "-1",
    },
    OB_TEXT.profile.changePhoto
  );

  const dialog = h(
    "div",
    {
      class: "ob-crop-dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "ob-crop-dialog-title",
    },
    titleEl,
    viewport,
    h("div", { class: "ob-crop-controls" }, zoomLabel, zoomSlider),
    h("div", { class: "ob-crop-actions" }, btnCancel, btnConfirm)
  );

  const backdrop = h("div", { class: "ob-crop-backdrop" }, dialog);
  document.body.appendChild(backdrop);

  const closeDialog = () => {
    controller.abort();
    backdrop.remove();
    if (prevFocused && typeof prevFocused.focus === "function") {
      prevFocused.focus();
    }
  };

  const reader = new FileReader();
  reader.onload = () => {
    const srcUrl = typeof reader.result === "string" ? reader.result : "";
    if (!srcUrl) {
      closeDialog();
      opts.onError(OB_TEXT.errors.generic);
      return;
    }
    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      naturalWidth = img.naturalWidth || 280;
      naturalHeight = img.naturalHeight || 280;
      previewImg.src = srcUrl;
      updateTransform();
      viewport.focus();
    };
    img.onerror = () => {
      closeDialog();
      opts.onError(OB_TEXT.errors.generic);
    };
    img.src = srcUrl;
  };
  reader.onerror = () => {
    closeDialog();
    opts.onError(OB_TEXT.errors.generic);
  };
  reader.readAsDataURL(opts.file);

  const confirmCrop = () => {
    if (!loadedImage) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        opts.onError(OB_TEXT.errors.generic);
        return;
      }

      const cropBoxSize = 280;
      const scaleToCover = Math.max(cropBoxSize / naturalWidth, cropBoxSize / naturalHeight);
      const drawW = naturalWidth * scaleToCover * zoom;
      const drawH = naturalHeight * scaleToCover * zoom;
      const ratio = 256 / cropBoxSize;

      ctx.fillStyle = "#09090d";
      ctx.fillRect(0, 0, 256, 256);

      const dx = (cropBoxSize / 2 - drawW / 2 + offsetX) * ratio;
      const dy = (cropBoxSize / 2 - drawH / 2 + offsetY) * ratio;
      ctx.drawImage(loadedImage, dx, dy, drawW * ratio, drawH * ratio);

      const jpegDataUrl = encodeCanvasToBoundedJpeg(canvas, MAX_AVATAR_DATA_URL_CHARS);
      closeDialog();
      opts.onConfirm(jpegDataUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : OB_TEXT.profile.imageTooLarge;
      closeDialog();
      opts.onError(msg);
    }
  };

  zoomSlider.addEventListener(
    "input",
    () => {
      clampZoom(Number(zoomSlider.value));
    },
    { signal }
  );

  const activePointers = new Map<number, { x: number; y: number }>();
  let lastPinchDist = 0;

  viewport.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch {}
      if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      }
    },
    { signal }
  );

  viewport.addEventListener(
    "pointermove",
    (e: PointerEvent) => {
      const prev = activePointers.get(e.pointerId);
      if (!prev) return;
      const curr = { x: e.clientX, y: e.clientY };
      activePointers.set(e.pointerId, curr);

      if (activePointers.size === 1) {
        offsetX += curr.x - prev.x;
        offsetY += curr.y - prev.y;
        updateTransform();
      } else if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (lastPinchDist > 0) {
          const factor = dist / lastPinchDist;
          clampZoom(zoom * factor);
        }
        lastPinchDist = dist;
      }
    },
    { signal }
  );

  const endPointer = (e: PointerEvent) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
      lastPinchDist = 0;
    }
    try {
      if (viewport.hasPointerCapture(e.pointerId)) {
        viewport.releasePointerCapture(e.pointerId);
      }
    } catch {}
  };

  viewport.addEventListener("pointerup", endPointer, { signal });
  viewport.addEventListener("pointercancel", endPointer, { signal });

  viewport.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.12 : -0.12;
      clampZoom(zoom + delta);
    },
    { passive: false, signal }
  );

  dialog.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDialog();
        opts.onCancel();
        return;
      }
      if (e.key === "Tab") {
        const focusables: HTMLElement[] = [viewport, zoomSlider, btnCancel, btnConfirm];
        const idx = focusables.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey) {
          if (idx <= 0) {
            e.preventDefault();
            focusables[focusables.length - 1].focus();
          }
        } else if (idx === focusables.length - 1) {
          e.preventDefault();
          focusables[0].focus();
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        offsetX -= 8;
        updateTransform();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        offsetX += 8;
        updateTransform();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        offsetY -= 8;
        updateTransform();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        offsetY += 8;
        updateTransform();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        clampZoom(zoom + 0.15);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        clampZoom(zoom - 0.15);
      } else if (e.key === "Enter" && document.activeElement !== btnCancel) {
        e.preventDefault();
        confirmCrop();
      }
    },
    { signal }
  );

  btnCancel.addEventListener(
    "click",
    () => {
      closeDialog();
      opts.onCancel();
    },
    { signal }
  );

  btnConfirm.addEventListener("click", confirmCrop, { signal });

  return closeDialog;
}
