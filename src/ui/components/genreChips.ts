import { createCarousel } from "../carousel";
import { h } from "../dom";
import { OB_TEXT } from "../onboarding/flow";

export type GenreOption = (typeof OB_TEXT.artists.genres)[number];

export interface GenreChipsOptions {
  activeGenre: GenreOption;
  signal: AbortSignal;
  onSelect: (genre: GenreOption) => void;
}

export interface GenreChipsController {
  root: HTMLElement;
  setActive(genre: GenreOption): void;
  destroy(): void;
}

export function createGenreChips(opts: GenreChipsOptions): GenreChipsController {
  let current = opts.activeGenre;
  const buttons: HTMLButtonElement[] = [];

  const track = h("div", { class: "ob-genre-chips-track" });

  for (const genre of OB_TEXT.artists.genres) {
    const isSelected = genre === current;
    const btn = h(
      "button",
      {
        type: "button",
        class: `ob-genre-chip ${isSelected ? "is-active" : ""}`,
        "aria-pressed": isSelected ? "true" : "false",
        dataset: { genre },
      },
      genre
    ) as HTMLButtonElement;

    btn.addEventListener(
      "click",
      () => {
        if (current === genre) return;
        current = genre;
        buttons.forEach((b) => {
          const match = b.dataset.genre === current;
          b.classList.toggle("is-active", match);
          b.setAttribute("aria-pressed", match ? "true" : "false");
        });
        opts.onSelect(current);
      },
      { signal: opts.signal }
    );

    buttons.push(btn);
    track.appendChild(btn);
  }

  const carousel = createCarousel(track, { signal: opts.signal, step: 220 });

  return {
    root: track,
    setActive(genre: GenreOption) {
      current = genre;
      buttons.forEach((b) => {
        const match = b.dataset.genre === current;
        b.classList.toggle("is-active", match);
        b.setAttribute("aria-pressed", match ? "true" : "false");
      });
    },
    destroy() {
      carousel.destroy();
    },
  };
}
