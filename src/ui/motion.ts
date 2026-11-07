import { h } from "./dom";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export async function stepTransition(
  from: HTMLElement | null,
  to: HTMLElement,
  direction: "forward" | "back",
  mountChange?: () => void
): Promise<void> {
  const reduced = prefersReducedMotion();
  const docAny = document as unknown as {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };

  document.documentElement.classList.remove("ob-vt-forward", "ob-vt-back");
  document.documentElement.classList.add(direction === "forward" ? "ob-vt-forward" : "ob-vt-back");

  if (typeof docAny.startViewTransition === "function" && !reduced) {
    try {
      const vt = docAny.startViewTransition(() => {
        if (mountChange) mountChange();
      });
      await vt.finished;
      return;
    } catch {
      if (mountChange) mountChange();
    }
  } else if (mountChange) {
    if (from && !reduced && typeof from.animate === "function") {
      from.style.setProperty("will-change", "transform, opacity");
      const outX = direction === "forward" ? "-24px" : "24px";
      try {
        await from.animate(
          [
            { opacity: 1, transform: "translateX(0px)" },
            { opacity: 0, transform: `translateX(${outX})` },
          ],
          { duration: 160, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        ).finished;
      } catch {}
      from.style.removeProperty("will-change");
    }
    mountChange();
  }

  if (typeof to.animate === "function") {
    to.style.setProperty("will-change", "transform, opacity");
    const inX = direction === "forward" ? "24px" : "-24px";
    try {
      const keyframes = reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: `translateX(${inX})` },
            { opacity: 1, transform: "translateX(0px)" },
          ];
      await to.animate(keyframes, {
        duration: reduced ? 120 : 280,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      }).finished;
    } catch {}
    to.style.removeProperty("will-change");
  }
}

export function shake(el: HTMLElement): void {
  if (prefersReducedMotion()) return;
  if (typeof el.animate !== "function") return;
  el.style.setProperty("will-change", "transform");
  const anim = el.animate(
    [
      { transform: "translateX(0px)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(4px)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(4px)" },
      { transform: "translateX(-2px)" },
      { transform: "translateX(2px)" },
      { transform: "translateX(0px)" },
    ],
    { duration: 240, easing: "ease-in-out" }
  );
  anim.onfinish = () => {
    el.style.removeProperty("will-change");
  };
}

export function drawCheck(svgPath: SVGElement | null): void {
  if (!svgPath) return;
  const geom = svgPath as unknown as { getTotalLength?: () => number };
  const length = typeof geom.getTotalLength === "function" ? geom.getTotalLength() : 28;
  svgPath.style.setProperty("stroke-dasharray", `${length}`);
  if (prefersReducedMotion() || typeof svgPath.animate !== "function") {
    svgPath.style.setProperty("stroke-dashoffset", "0");
    return;
  }
  svgPath.style.setProperty("stroke-dashoffset", `${length}`);
  const anim = svgPath.animate(
    [{ strokeDashoffset: `${length}` }, { strokeDashoffset: "0" }],
    { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
  );
  anim.onfinish = () => {
    svgPath.style.setProperty("stroke-dashoffset", "0");
  };
}

export function rollNumber(el: HTMLElement, value: number | string): void {
  const nextStr = String(value);
  const prevStr = el.dataset.currentRollValue ?? el.textContent ?? "";
  el.dataset.currentRollValue = nextStr;

  if (prevStr === nextStr || prefersReducedMotion() || typeof el.animate !== "function") {
    el.textContent = nextStr;
    return;
  }

  el.textContent = "";
  const oldSpan = h("span", { class: "ob-roll-digit-old" }, prevStr);
  const newSpan = h("span", { class: "ob-roll-digit-new" }, nextStr);
  el.appendChild(oldSpan);
  el.appendChild(newSpan);

  try {
    oldSpan.animate(
      [
        { opacity: 1, transform: "translateY(0%)" },
        { opacity: 0, transform: "translateY(-100%)" },
      ],
      { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
    );
    const inAnim = newSpan.animate(
      [
        { opacity: 0, transform: "translateY(100%)" },
        { opacity: 1, transform: "translateY(0%)" },
      ],
      { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
    );
    inAnim.onfinish = () => {
      el.textContent = nextStr;
    };
  } catch {
    el.textContent = nextStr;
  }
}

export function staggerIn(
  elements: HTMLElement[],
  options: { max?: number; delay?: number } = {}
): IntersectionObserver | null {
  const max = options.max ?? 24;
  const delay = options.delay ?? 50;
  const reduced = prefersReducedMotion();

  const immediate = elements.slice(0, max);
  const deferred = elements.slice(max);

  immediate.forEach((el, idx) => {
    el.style.setProperty("--i", String(idx));
    if (typeof el.animate === "function") {
      el.style.setProperty("will-change", "transform, opacity");
      const keyframes = reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "translateY(12px)" },
            { opacity: 1, transform: "translateY(0px)" },
          ];
      const anim = el.animate(keyframes, {
        duration: reduced ? 120 : 320,
        delay: reduced ? 0 : idx * delay,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      });
      anim.onfinish = () => {
        el.style.removeProperty("will-change");
      };
    }
  });

  if (deferred.length === 0 || typeof IntersectionObserver === "undefined") {
    return null;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const target = entry.target as HTMLElement;
          io.unobserve(target);
          if (typeof target.animate === "function") {
            target.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: reduced ? 120 : 200,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              fill: "both",
            });
          }
        }
      }
    },
    { rootMargin: "120px" }
  );

  for (const el of deferred) {
    io.observe(el);
  }
  return io;
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function clampAccentHsl(raw: { h: number; s: number; l: number }): {
  h: number;
  s: number;
  l: number;
} {
  const h = ((Math.round(raw.h) % 360) + 360) % 360;
  const s = Math.max(55, Math.min(70, Math.round(raw.s)));
  const l = Math.max(62, Math.min(72, Math.round(raw.l)));
  return { h, s, l };
}

export function applyDynamicAccent(
  root: HTMLElement,
  color: { h: number; s: number; l: number; rgb?: [number, number, number] }
): void {
  const clamped = clampAccentHsl(color);
  root.style.setProperty("--accent-h", String(clamped.h));
  root.style.setProperty("--accent-s", `${clamped.s}%`);
  root.style.setProperty("--accent-l", `${clamped.l}%`);
  if (color.rgb) {
    const [r, g, b] = color.rgb;
    root.style.setProperty("--ambient-c1", `${r}, ${g}, ${b}`);
    root.style.setProperty(
      "--ambient-c2",
      `${Math.max(20, r - 35)}, ${Math.max(20, g - 20)}, ${Math.min(255, b + 30)}`
    );
    root.style.setProperty(
      "--ambient-c3",
      `${Math.min(255, r + 35)}, ${Math.max(20, g - 30)}, ${Math.max(20, b - 15)}`
    );
  }
}

export function extractDominantHsl(
  imageUrl: string
): Promise<{ h: number; s: number; l: number; rgb: [number, number, number] } | null> {
  return new Promise((resolve) => {
    if (!imageUrl || imageUrl.startsWith("data:image/svg+xml")) {
      resolve({ h: 262, s: 68, l: 68, rgb: [139, 92, 246] });
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum < 25 || lum > 235) continue;
          rSum += r;
          gSum += g;
          bSum += b;
          count++;
        }
        if (count === 0) {
          resolve({ h: 262, s: 68, l: 68, rgb: [139, 92, 246] });
          return;
        }
        const rAvg = Math.round(rSum / count);
        const gAvg = Math.round(gSum / count);
        const bAvg = Math.round(bSum / count);
        const hsl = clampAccentHsl(rgbToHsl(rAvg, gAvg, bAvg));
        resolve({ ...hsl, rgb: [rAvg, gAvg, bAvg] });
      } catch {
        resolve({ h: 262, s: 68, l: 68, rgb: [139, 92, 246] });
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}
