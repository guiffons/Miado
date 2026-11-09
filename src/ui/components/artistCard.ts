import { h } from "../dom";
import { icon } from "../icons";
import { bindImageFallback } from "../images";
import { prefersReducedMotion } from "../motion";
import type { OnboardingArtistItem } from "../onboarding/flow";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface ArtistCardOptions {
  artist: OnboardingArtistItem;
  selected: boolean;
  disabled: boolean;
  tabIndex?: number;
  signal: AbortSignal;
  onToggle: (artist: OnboardingArtistItem, cardEl: HTMLButtonElement) => void;
  onNavigateKey?: (key: string, currentCard: HTMLButtonElement) => void;
}

export interface ArtistCardController {
  el: HTMLButtonElement;
  setSelected(selected: boolean, animate?: boolean): void;
  setDisabled(disabled: boolean): void;
}

export function createArtistCard(opts: ArtistCardOptions): ArtistCardController {
  const name = opts.artist.name;
  const coverChain = [
    opts.artist.coverUrl || "",
    `/api/artist-image?name=${encodeURIComponent(name)}`,
  ].filter(Boolean);

  const img = h("img", {
    class: "ob-artist-card-img",
    alt: "",
  }) as HTMLImageElement;
  img.loading = "eager";
  bindImageFallback(img, coverChain, "artist", name, "");

  const ringSvg = document.createElementNS(SVG_NS, "svg");
  ringSvg.setAttribute("viewBox", "0 0 100 100");
  ringSvg.setAttribute("class", "ob-artist-ring-svg");
  ringSvg.setAttribute("aria-hidden", "true");

  const ringCircle = document.createElementNS(SVG_NS, "circle");
  ringCircle.setAttribute("cx", "50");
  ringCircle.setAttribute("cy", "50");
  ringCircle.setAttribute("r", "47");
  ringCircle.setAttribute("fill", "none");
  ringCircle.setAttribute("stroke", "currentColor");
  ringCircle.setAttribute("stroke-width", "3");
  ringCircle.setAttribute("stroke-dasharray", "296");
  ringCircle.setAttribute("stroke-dashoffset", opts.selected ? "0" : "296");
  ringSvg.appendChild(ringCircle);

  const checkBadge = h(
    "span",
    {
      class: `ob-artist-check-badge ${opts.selected ? "is-selected" : ""}`,
      "aria-hidden": "true",
    },
    icon("check", 20)
  );

  const avatarWrap = h("div", { class: "ob-artist-avatar-wrap" }, img, ringSvg, checkBadge);
  const nameLabel = h("span", { class: "ob-artist-card-name" }, name);

  let isSelected = opts.selected;
  let isDisabled = opts.disabled;

  const btn = h(
    "button",
    {
      type: "button",
      class: [
        "ob-artist-card",
        isSelected ? "is-selected" : "",
        isDisabled && !isSelected ? "is-disabled" : "",
      ]
        .filter(Boolean)
        .join(" "),
      "aria-pressed": isSelected ? "true" : "false",
      ...(isDisabled && !isSelected ? { "aria-disabled": "true" } : {}),
      tabindex: String(opts.tabIndex ?? -1),
      dataset: { artistName: name },
    },
    avatarWrap,
    nameLabel
  ) as HTMLButtonElement;

  const updateVisual = (nextSelected: boolean, animate = true) => {
    isSelected = nextSelected;
    btn.classList.toggle("is-selected", isSelected);
    btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
    checkBadge.classList.toggle("is-selected", isSelected);
    ringCircle.setAttribute("stroke-dashoffset", isSelected ? "0" : "296");

    if (animate && !prefersReducedMotion()) {
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(8);
        }
      } catch {}

      if (typeof btn.animate === "function") {
        btn.style.setProperty("will-change", "transform");
        const anim = btn.animate(
          isSelected
            ? [
                { transform: "scale(1)" },
                { transform: "scale(1.04)" },
                { transform: "scale(1)" },
              ]
            : [
                { transform: "scale(1.02)" },
                { transform: "scale(0.98)" },
                { transform: "scale(1)" },
              ],
          {
            duration: isSelected ? 250 : 180,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          }
        );
        anim.onfinish = () => {
          btn.style.removeProperty("will-change");
        };
      }
    }
  };

  btn.addEventListener(
    "click",
    () => {
      if (isDisabled && !isSelected) return;
      opts.onToggle(opts.artist, btn);
    },
    { signal: opts.signal }
  );

  btn.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (
        e.key === "ArrowRight" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Home" ||
        e.key === "End"
      ) {
        if (opts.onNavigateKey) {
          e.preventDefault();
          opts.onNavigateKey(e.key, btn);
        }
      }
    },
    { signal: opts.signal }
  );

  return {
    el: btn,
    setSelected(selected: boolean, animate = true) {
      updateVisual(selected, animate);
    },
    setDisabled(disabled: boolean) {
      isDisabled = disabled;
      const shouldDisable = isDisabled && !isSelected;
      btn.classList.toggle("is-disabled", shouldDisable);
      if (shouldDisable) {
        btn.setAttribute("aria-disabled", "true");
      } else {
        btn.removeAttribute("aria-disabled");
      }
    },
  };
}
