import { createGlassPlaceholderDataUri, type PlaceholderKind } from "../shared/placeholder";
import { safeUrl } from "./dom";

export function bindImageFallback(
  img: HTMLImageElement,
  chain: string[],
  kind: PlaceholderKind,
  seed: string,
  altText = ""
): void {
  img.decoding = "async";
  img.loading = "lazy";
  img.draggable = false;
  img.referrerPolicy = "no-referrer";
  img.alt = altText;

  const placeholderUri = createGlassPlaceholderDataUri(kind, seed);
  const validChain = chain
    .map((u) => safeUrl(u, ""))
    .filter((u) => Boolean(u));

  if (validChain.length === 0) {
    img.src = placeholderUri;
    return;
  }

  img.dataset.fallbackStep = "0";

  const onError = () => {
    const step = Number(img.dataset.fallbackStep || "0") + 1;
    img.dataset.fallbackStep = String(step);
    if (step < validChain.length) {
      img.src = validChain[step];
    } else {
      img.removeEventListener("error", onError);
      img.src = placeholderUri;
    }
  };

  img.addEventListener("error", onError);
  img.src = validChain[0];
}
