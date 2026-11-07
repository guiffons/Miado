import { h } from "../dom";
import { icon } from "../icons";
import { bindImageFallback } from "../images";
import { prefersReducedMotion, rollNumber, staggerIn } from "../motion";
import { OB_TEXT, type OnboardingArtistItem } from "../onboarding/flow";
import { createArtistCard } from "./artistCard";

export interface SelectedTrayOptions {
  selected: OnboardingArtistItem[];
  similar: OnboardingArtistItem[];
  isSubmitting: boolean;
  signal: AbortSignal;
  onRemoveSelected: (name: string) => void;
  onToggleSimilar: (artist: OnboardingArtistItem, cardEl: HTMLButtonElement) => void;
  onSubmit: () => void;
}

export interface SelectedTrayController {
  desktopPanel: HTMLElement;
  mobileTray: HTMLElement;
  updateSelected(selected: OnboardingArtistItem[]): void;
  updateSimilar(similar: OnboardingArtistItem[], selectedNames: Set<string>): void;
  setSubmitting(submitting: boolean): void;
}

export function createSelectedTray(opts: SelectedTrayOptions): SelectedTrayController {
  let currentSelected = [...opts.selected];
  let isExpandedMobile = false;

  const desktopList = h("div", { class: "ob-selected-list" });
  const mobileSheetList = h("div", { class: "ob-selected-list" });
  const mobileAvatarRow = h("div", { class: "ob-tray-avatar-strip" });

  const desktopEmptyCounter = h("div", { class: "ob-selected-empty-counter" }, "0/3");

  const similarTitle = h(
    "h3",
    { class: "ob-tray-section-title" },
    OB_TEXT.artists.similarArtists
  );
  const similarGrid = h("div", { class: "ob-similar-grid" });
  const similarSection = h(
    "div",
    { class: "ob-similar-section is-hidden" },
    similarTitle,
    similarGrid
  );

  const buildPrimaryButton = () => {
    const prefixSpan = h("span", { class: "ob-btn-Counter-prefix" });
    const rollWrap = h("span", { class: "ob-roll-wrap" });
    const suffixSpan = h("span", { class: "ob-btn-counter-suffix" });
    const labelWrap = h("span", { class: "ob-btn-label" }, prefixSpan, rollWrap, suffixSpan);
    const spinnerWrap = h(
      "span",
      { class: "ob-btn-spinner", "aria-hidden": "true" },
      icon("spinner", 20, "is-spinning")
    );

    const btn = h(
      "button",
      {
        type: "button",
        class: "ob-btn-primary ob-artists-submit-btn",
        disabled: currentSelected.length < 3,
      },
      labelWrap,
      spinnerWrap
    ) as HTMLButtonElement;

    btn.addEventListener(
      "click",
      (e: MouseEvent) => {
        e.stopPropagation();
        if (currentSelected.length < 3) return;
        opts.onSubmit();
      },
      { signal: opts.signal }
    );

    const syncCount = (count: number) => {
      const safe = Math.max(0, Math.min(60, count));
      btn.disabled = safe < 3;
      if (safe < 3) {
        prefixSpan.textContent = `${OB_TEXT.artists.chooseThreePrefix} (`;
        rollNumber(rollWrap, safe);
        suffixSpan.textContent = "/3)";
      } else {
        prefixSpan.textContent = `${OB_TEXT.artists.allReadyPrefix} (`;
        rollNumber(rollWrap, safe);
        suffixSpan.textContent = ")";
      }
    };

    syncCount(currentSelected.length);
    return { btn, syncCount };
  };

  const desktopPrimary = buildPrimaryButton();
  const mobilePrimary = buildPrimaryButton();

  const buildSelectedRow = (art: OnboardingArtistItem) => {
    const img = h("img", {
      class: "ob-selected-row-img",
      alt: art.name,
    }) as HTMLImageElement;
    bindImageFallback(
      img,
      [art.coverUrl || `/api/artist-image?name=${encodeURIComponent(art.name)}`],
      "artist",
      art.name,
      art.name
    );

    const removeBtn = h(
      "button",
      {
        type: "button",
        class: "ob-selected-remove-btn",
        "aria-label": `${OB_TEXT.artists.remove} ${art.name}`,
      },
      icon("close", 20)
    ) as HTMLButtonElement;

    const row = h(
      "div",
      { class: "ob-selected-row", dataset: { selectedArtist: art.name } },
      img,
      h("span", { class: "ob-selected-row-name" }, art.name),
      removeBtn
    );

    removeBtn.addEventListener(
      "click",
      (e: MouseEvent) => {
        e.stopPropagation();
        if (!prefersReducedMotion() && typeof row.animate === "function") {
          const anim = row.animate(
            [
              { opacity: 1, transform: "scale(1)" },
              { opacity: 0, transform: "scale(0.94)" },
            ],
            { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
          );
          anim.onfinish = () => {
            opts.onRemoveSelected(art.name);
          };
        } else {
          opts.onRemoveSelected(art.name);
        }
      },
      { signal: opts.signal }
    );

    return row;
  };

  const renderLists = () => {
    desktopList.textContent = "";
    mobileSheetList.textContent = "";
    mobileAvatarRow.textContent = "";

    const isEmpty = currentSelected.length === 0;
    desktopEmptyCounter.classList.toggle("is-hidden", !isEmpty);
    desktopList.classList.toggle("is-hidden", isEmpty);

    for (const art of currentSelected) {
      desktopList.appendChild(buildSelectedRow(art));
      mobileSheetList.appendChild(buildSelectedRow(art));
    }

    for (const art of currentSelected.slice(0, 5)) {
      const miniImg = h("img", {
        class: "ob-tray-mini-avatar",
        alt: art.name,
      }) as HTMLImageElement;
      bindImageFallback(
        miniImg,
        [art.coverUrl || `/api/artist-image?name=${encodeURIComponent(art.name)}`],
        "artist",
        art.name,
        art.name
      );
      mobileAvatarRow.appendChild(miniImg);
    }

    if (currentSelected.length === 0) {
      mobileAvatarRow.appendChild(h("span", { class: "ob-tray-mini-count" }, "0/3"));
    }

    desktopPrimary.syncCount(currentSelected.length);
    mobilePrimary.syncCount(currentSelected.length);
  };

  const desktopHeader = h(
    "h2",
    { class: "ob-tray-section-title" },
    OB_TEXT.artists.yourArtists
  );

  const desktopPanel = h(
    "aside",
    {
      class: "ob-artists-right-panel",
      "aria-label": OB_TEXT.artists.yourArtists,
    },
    desktopHeader,
    desktopEmptyCounter,
    desktopList,
    similarSection,
    h("div", { class: "ob-tray-footer" }, desktopPrimary.btn)
  );

  const mobileSheetHeader = h(
    "div",
    { class: "ob-mobile-sheet-header" },
    h("span", { class: "ob-tray-section-title" }, OB_TEXT.artists.yourArtists),
    h(
      "button",
      {
        type: "button",
        class: "ob-selected-remove-btn",
        "aria-label": OB_TEXT.artists.yourArtists,
      },
      icon("close", 20)
    )
  );

  const mobileSheet = h(
    "div",
    { class: "ob-mobile-sheet is-hidden" },
    mobileSheetHeader,
    mobileSheetList
  );

  const mobileBar = h(
    "div",
    { class: "ob-mobile-tray-bar" },
    mobileAvatarRow,
    mobilePrimary.btn
  );

  const mobileTray = h("div", { class: "ob-mobile-tray" }, mobileSheet, mobileBar);

  mobileAvatarRow.addEventListener(
    "click",
    () => {
      if (currentSelected.length === 0) return;
      isExpandedMobile = !isExpandedMobile;
      mobileSheet.classList.toggle("is-hidden", !isExpandedMobile);
    },
    { signal: opts.signal }
  );

  mobileSheetHeader.addEventListener(
    "click",
    () => {
      isExpandedMobile = false;
      mobileSheet.classList.add("is-hidden");
    },
    { signal: opts.signal }
  );

  renderLists();

  return {
    desktopPanel,
    mobileTray,
    updateSelected(selected: OnboardingArtistItem[]) {
      currentSelected = [...selected];
      if (currentSelected.length === 0 && isExpandedMobile) {
        isExpandedMobile = false;
        mobileSheet.classList.add("is-hidden");
      }
      renderLists();
    },
    updateSimilar(similar: OnboardingArtistItem[], selectedNames: Set<string>) {
      similarGrid.textContent = "";
      const visible = similar.slice(0, 6);
      if (visible.length === 0 || currentSelected.length === 0) {
        similarSection.classList.add("is-hidden");
        return;
      }
      similarSection.classList.remove("is-hidden");
      const cards: HTMLElement[] = [];
      for (const item of visible) {
        const key = item.name.toLowerCase();
        const card = createArtistCard({
          artist: item,
          selected: selectedNames.has(key),
          disabled: selectedNames.size >= 60 && !selectedNames.has(key),
          tabIndex: 0,
          signal: opts.signal,
          onToggle: opts.onToggleSimilar,
        });
        similarGrid.appendChild(card.el);
        cards.push(card.el);
      }
      staggerIn(cards, { max: 6, delay: 40 });
    },
    setSubmitting(submitting: boolean) {
      desktopPrimary.btn.classList.toggle("is-loading", submitting);
      mobilePrimary.btn.classList.toggle("is-loading", submitting);
      desktopPrimary.btn.disabled = submitting || currentSelected.length < 3;
      mobilePrimary.btn.disabled = submitting || currentSelected.length < 3;
    },
  };
}
