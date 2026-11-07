export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  const str = String(input || "miado");
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export type PlaceholderKind = "album" | "artist" | "avatar";

export function createGlassPlaceholderSvg(
  kind: PlaceholderKind,
  seed: string,
  _subtitle?: string
): string {
  const rx = kind === "album" ? 0 : 300;
  const centerIcon =
    kind === "album"
      ? `<g transform="translate(225, 225) scale(6.25)" fill="none" stroke="rgba(255, 255, 255, 0.35)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">
           <path d="M9 18V5l12-2v13"/>
           <circle cx="6" cy="18" r="3" fill="rgba(255, 255, 255, 0.2)"/>
           <circle cx="18" cy="16" r="3" fill="rgba(255, 255, 255, 0.2)"/>
         </g>`
      : `<g fill="rgba(255, 255, 255, 0.28)">
           <circle cx="300" cy="236" r="76"/>
           <path d="M168 468 C168 378 432 378 432 468 Z"/>
         </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
    <defs>
      <radialGradient id="blurGrad" cx="15%" cy="15%" r="95%" fx="10%" fy="10%">
        <stop offset="0%" stop-color="rgb(147, 51, 234)" stop-opacity="0.88"/>
        <stop offset="45%" stop-color="rgb(88, 28, 135)" stop-opacity="0.94"/>
        <stop offset="72%" stop-color="rgb(180, 180, 200)" stop-opacity="0.65"/>
        <stop offset="100%" stop-color="rgb(255, 255, 255)" stop-opacity="0.42"/>
      </radialGradient>
      <radialGradient id="silverGlow" cx="76%" cy="24%" r="62%">
        <stop offset="0%" stop-color="rgb(245, 245, 255)" stop-opacity="0.65"/>
        <stop offset="55%" stop-color="rgb(168, 85, 247)" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="rgb(59, 7, 100)" stop-opacity="0"/>
      </radialGradient>
      <filter id="noiseFilter">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
      </filter>
    </defs>
    <rect width="600" height="600" rx="${rx}" fill="#1a0b2e"/>
    <rect width="600" height="600" rx="${rx}" fill="url(#blurGrad)"/>
    <rect width="600" height="600" rx="${rx}" fill="url(#silverGlow)"/>
    <rect width="600" height="600" rx="${rx}" filter="url(#noiseFilter)" opacity="0.08"/>
    ${centerIcon}
  </svg>`;
}

export function createGlassPlaceholderDataUri(
  kind: PlaceholderKind,
  seed: string,
  subtitle?: string
): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(createGlassPlaceholderSvg(kind, seed, subtitle))}`;
}

