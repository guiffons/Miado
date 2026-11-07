import { createGlassPlaceholderDataUri, type PlaceholderKind } from "../shared/placeholder";

export function escapeHtml(val: unknown): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeUrl(raw: unknown, fallback = ""): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return fallback;
  if (s.startsWith("/api/") || s.startsWith("/audio/") || s.startsWith("/assets/")) {
    return s;
  }
  if (/^data:image\/(png|jpeg|webp|gif|svg\+xml);/i.test(s)) {
    return s;
  }
  try {
    const parsed = new URL(s);
    if (parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {}
  return fallback;
}

export type DomChild = Node | string | number | boolean | null | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, any> | null,
  ...children: DomChild[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "className" || key === "class") {
        el.className = String(value);
      } else if (key === "dataset" && typeof value === "object") {
        for (const [dk, dv] of Object.entries(value)) {
          if (dv !== undefined && dv !== null) {
            el.dataset[dk] = String(dv);
          }
        }
      } else if (key.startsWith("on") && typeof value === "function") {
        const evt = key.slice(2).toLowerCase();
        el.addEventListener(evt, value);
      } else if (key === "src" || key === "href") {
        el.setAttribute(key, safeUrl(value, ""));
      } else if (value === true) {
        el.setAttribute(key, "");
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }

  return el;
}

export function createGlassPlaceholder(kind: PlaceholderKind, seed: string): string {
  return createGlassPlaceholderDataUri(kind, seed);
}
