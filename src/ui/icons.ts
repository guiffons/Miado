export type IconName =
  | "mail"
  | "lock"
  | "eye"
  | "eye-off"
  | "camera"
  | "plus"
  | "check"
  | "close"
  | "alert"
  | "search"
  | "arrow-left"
  | "arrow-right"
  | "spinner"
  | "user"
  | "google"
  | "apple"
  | "logo";

const SVG_NS = "http://www.w3.org/2000/svg";

interface SvgNodeSpec {
  tag: "path" | "circle" | "rect" | "line" | "polyline";
  attrs: Record<string, string>;
}

const ICON_SPECS: Record<IconName, SvgNodeSpec[]> = {
  mail: [
    { tag: "rect", attrs: { x: "3", y: "5", width: "18", height: "14", rx: "3" } },
    { tag: "path", attrs: { d: "m3 7 9 6 9-6" } },
  ],
  lock: [
    { tag: "rect", attrs: { x: "4", y: "11", width: "16", height: "10", rx: "2.5" } },
    { tag: "path", attrs: { d: "M8 11V7a4 4 0 0 1 8 0v4" } },
  ],
  eye: [
    {
      tag: "path",
      attrs: {
        d: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z",
      },
    },
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "3" } },
  ],
  "eye-off": [
    {
      tag: "path",
      attrs: {
        d: "M10.6 5.7A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.2 17.2 0 0 1-3.2 4.1",
      },
    },
    {
      tag: "path",
      attrs: {
        d: "M6.4 6.5C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.9 0 3.6-.6 5-1.5",
      },
    },
    { tag: "path", attrs: { d: "M9.9 9.9a3 3 0 0 0 4.2 4.2" } },
    { tag: "line", attrs: { x1: "3", y1: "3", x2: "21", y2: "21" } },
  ],
  camera: [
    {
      tag: "path",
      attrs: {
        d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z",
      },
    },
    { tag: "circle", attrs: { cx: "12", cy: "13", r: "3.5" } },
  ],
  plus: [
    { tag: "line", attrs: { x1: "12", y1: "5", x2: "12", y2: "19" } },
    { tag: "line", attrs: { x1: "5", y1: "12", x2: "19", y2: "12" } },
  ],
  check: [{ tag: "path", attrs: { d: "M20 6 9 17l-5-5", class: "ob-icon-check-path" } }],
  close: [
    { tag: "line", attrs: { x1: "18", y1: "6", x2: "6", y2: "18" } },
    { tag: "line", attrs: { x1: "6", y1: "6", x2: "18", y2: "18" } },
  ],
  alert: [
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "9" } },
    { tag: "line", attrs: { x1: "12", y1: "8", x2: "12", y2: "12.5" } },
    { tag: "line", attrs: { x1: "12", y1: "16", x2: "12.01", y2: "16" } },
  ],
  search: [
    { tag: "circle", attrs: { cx: "11", cy: "11", r: "7.5" } },
    { tag: "line", attrs: { x1: "20", y1: "20", x2: "16.4", y2: "16.4" } },
  ],
  "arrow-left": [
    { tag: "line", attrs: { x1: "19", y1: "12", x2: "5", y2: "12" } },
    { tag: "polyline", attrs: { points: "12 19 5 12 12 5" } },
  ],
  "arrow-right": [
    { tag: "line", attrs: { x1: "5", y1: "12", x2: "19", y2: "12" } },
    { tag: "polyline", attrs: { points: "12 5 19 12 12 19" } },
  ],
  spinner: [
    {
      tag: "path",
      attrs: {
        d: "M21 12a9 9 0 1 1-6.22-8.56",
        class: "ob-spinner-arc",
      },
    },
  ],
  user: [
    { tag: "path", attrs: { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" } },
    { tag: "circle", attrs: { cx: "12", cy: "7", r: "4" } },
  ],
  google: [
    {
      tag: "path",
      attrs: {
        d: "M20.6 12.2c0-.6-.05-1.2-.16-1.8H12v3.4h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.66-3.86 2.66-6.58Z",
        fill: "currentColor",
        stroke: "none",
      },
    },
    {
      tag: "path",
      attrs: {
        d: "M12 21c2.42 0 4.46-.8 5.94-2.17l-2.9-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H3.98v2.33A9 9 0 0 0 12 21Z",
        fill: "currentColor",
        stroke: "none",
      },
    },
    {
      tag: "path",
      attrs: {
        d: "M6.97 13.73a5.4 5.4 0 0 1 0-3.46V7.94H3.98a9 9 0 0 0 0 8.12l2.99-2.33Z",
        fill: "currentColor",
        stroke: "none",
      },
    },
    {
      tag: "path",
      attrs: {
        d: "M12 6.57c1.32 0 2.5.45 3.44 1.35l2.58-2.58C16.45 3.9 14.42 3 12 3a9 9 0 0 0-8.02 4.94l2.99 2.33c.71-2.12 2.69-3.7 5.03-3.7Z",
        fill: "currentColor",
        stroke: "none",
      },
    },
  ],
  apple: [
    {
      tag: "path",
      attrs: {
        d: "M16.5 12.6c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.1.8-.6 0-1.6-.8-2.7-.8-1.4 0-2.7.8-3.4 2.1-1.5 2.5-.4 6.2 1 8.2.7 1 1.5 2.1 2.6 2.1 1 0 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.7 1.1 0 1.8-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3-.1 0-2.2-.8-2.2-3.2Z",
        fill: "currentColor",
        stroke: "none",
      },
    },
    {
      tag: "path",
      attrs: {
        d: "M14.5 6.3c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.6 1 .1 1.9-.5 2.5-1.2Z",
        fill: "currentColor",
        stroke: "none",
      },
    },
  ],
  logo: [
    {
      tag: "path",
      attrs: {
        d: "M5 9.5V4l3.6 2.7a7.5 7.5 0 0 1 6.8 0L19 4v5.5",
      },
    },
    {
      tag: "path",
      attrs: {
        d: "M14.5 10.5v6.2a2.8 2.8 0 1 1-1.8-2.6V8.8l4.3-.9v3",
      },
    },
  ],
};

export function icon(name: IconName, size: 20 | 24 = 20, extraClass = ""): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const cls = ["ob-icon", `ob-icon-${name}`, extraClass].filter(Boolean).join(" ");
  svg.setAttribute("class", cls);

  const nodes = ICON_SPECS[name] || ICON_SPECS.user;
  for (const spec of nodes) {
    const child = document.createElementNS(SVG_NS, spec.tag);
    for (const [k, v] of Object.entries(spec.attrs)) {
      child.setAttribute(k, v);
    }
    svg.appendChild(child);
  }
  return svg;
}
