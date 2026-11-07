import type { User } from "firebase/auth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../services/firebaseClient";
import { createArtistCard, type ArtistCardController } from "../components/artistCard";
import { createField } from "../components/field";
import { createGenreChips, type GenreOption } from "../components/genreChips";
import { createSelectedTray } from "../components/selectedTray";
import { createStepper } from "../components/stepper";
import { h } from "../dom";
import { icon } from "../icons";
import { applyDynamicAccent, extractDominantHsl, staggerIn } from "../motion";
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  OB_TEXT,
  saveOnboardingDraft,
  type OnboardingArtistItem,
} from "./flow";

const INITIAL_CURATED_ARTISTS: OnboardingArtistItem[] = [
  { name: "Billie Eilish", genre: "Pop" },
  { name: "The Weeknd", genre: "R&B" },
  { name: "Linkin Park", genre: "Rock" },
  { name: "Sabrina Carpenter", genre: "Pop" },
  { name: "Kendrick Lamar", genre: "Rap" },
  { name: "Djavan", genre: "MPB" },
  { name: "Tame Impala", genre: "Indie" },
  { name: "Daft Punk", genre: "Eletronica" },
  { name: "Anitta", genre: "Funk" },
  { name: "Marilia Mendonca", genre: "Sertanejo" },
  { name: "SZA", genre: "R&B" },
  { name: "Metallica", genre: "Metal" },
  { name: "Arctic Monkeys", genre: "Rock" },
  { name: "Lana Del Rey", genre: "Indie" },
  { name: "Travis Scott", genre: "Rap" },
  { name: "Taylor Swift", genre: "Pop" },
  { name: "Jorge Ben Jor", genre: "MPB" },
  { name: "Bring Me The Horizon", genre: "Metal" },
  { name: "Frank Ocean", genre: "R&B" },
  { name: "Paramore", genre: "Rock" },
  { name: "Ghost", genre: "Metal" },
  { name: "Olivia Rodrigo", genre: "Pop" },
  { name: "Racionais MCs", genre: "Rap" },
  { name: "Tim Maia", genre: "MPB" },
];

export interface ArtistsStepOptions {
  user: User;
  onboardingRoot: HTMLElement;
  signal: AbortSignal;
  onBack: () => void;
  onComplete: (selectedArtists: OnboardingArtistItem[]) => void;
}

export interface ArtistsStepController {
  root: HTMLElement;
  titleEl: HTMLElement;
  destroy(): void;
}

export function createArtistsStep(opts: ArtistsStepOptions): ArtistsStepController {
  const draft = loadOnboardingDraft();
  const selectedMap = new Map<string, OnboardingArtistItem>();
  for (const item of draft.artists || []) {
    if (item && item.name) {
      selectedMap.set(item.name.toLowerCase(), item);
    }
  }

  let catalogPool: OnboardingArtistItem[] = [...INITIAL_CURATED_ARTISTS];
  let searchResultsPool: OnboardingArtistItem[] | null = null;
  let activeGenre: GenreOption = "Todos";
  let searchQuery = "";
  let discoverPage = 0;
  let isFetchingMore = false;
  let isSubmitting = false;

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let draftTimer: ReturnType<typeof setTimeout> | null = null;
  let similarTimer: ReturnType<typeof setTimeout> | null = null;
  let activeStaggerObserver: IntersectionObserver | null = null;
  let cardControllers = new Map<string, ArtistCardController>();

  const scheduleDraftSave = () => {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      saveOnboardingDraft({
        step: "artists",
        artists: Array.from(selectedMap.values()),
      });
    }, 300);
  };

  const brandLogo = h(
    "div",
    { class: "ob-brand" },
    h("span", { class: "ob-brand-mark" }, icon("logo", 24)),
    h("span", { class: "ob-brand-text" }, OB_TEXT.brand)
  );
  brandLogo.style.setProperty("view-transition-name", "ob-logo");

  const backBtn = h(
    "button",
    {
      type: "button",
      class: "ob-btn-back",
    },
    icon("arrow-left", 20),
    h("span", null, OB_TEXT.profile.back)
  ) as HTMLButtonElement;

  backBtn.addEventListener(
    "click",
    () => {
      opts.onBack();
    },
    { signal: opts.signal }
  );

  const stepper = createStepper({ step: 2 });

  const titleEl = h(
    "h1",
    {
      class: "ob-step-title",
      tabindex: "-1",
    },
    OB_TEXT.artists.title
  );

  const searchField = createField({
    id: "ob-artists-search",
    label: OB_TEXT.artists.searchPlaceholder,
    type: "search",
    leadingIcon: "search",
    signal: opts.signal,
    onInput: (val) => {
      searchQuery = val.trim();
      if (searchTimer) clearTimeout(searchTimer);
      if (!searchQuery) {
        searchResultsPool = null;
        renderGrid();
        return;
      }
      searchTimer = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/search?q=${encodeURIComponent(searchQuery)}&limit=24`,
            { signal: opts.signal }
          );
          if (!res.ok) return;
          const data = await res.json();
          const found: OnboardingArtistItem[] = [];
          const seen = new Set<string>();
          if (Array.isArray(data?.artists)) {
            for (const a of data.artists) {
              if (!a || !a.name) continue;
              const k = String(a.name).toLowerCase().trim();
              if (seen.has(k)) continue;
              seen.add(k);
              found.push({
                name: String(a.name),
                genre: a.genre || "Pop",
                coverUrl: a.coverUrl || `/api/artist-image?name=${encodeURIComponent(a.name)}`,
              });
            }
          }
          if (Array.isArray(data?.albums)) {
            for (const alb of data.albums) {
              if (!alb || !alb.artist) continue;
              const k = String(alb.artist).toLowerCase().trim();
              if (seen.has(k)) continue;
              seen.add(k);
              found.push({
                name: String(alb.artist),
                genre: "Pop",
                coverUrl: `/api/artist-image?name=${encodeURIComponent(alb.artist)}`,
              });
            }
          }
          searchResultsPool = found;
          renderGrid();
        } catch {}
      }, 280);
    },
  });

  const genreChips = createGenreChips({
    activeGenre: "Todos",
    signal: opts.signal,
    onSelect: (genre) => {
      activeGenre = genre;
      renderGrid();
    },
  });

  const gridEl = h("div", {
    class: "ob-artists-grid",
    role: "grid",
    "aria-label": OB_TEXT.artists.title,
  });

  const fetchSimilarArtists = (lastPickedName?: string) => {
    if (similarTimer) clearTimeout(similarTimer);
    if (selectedMap.size === 0) {
      tray.updateSimilar([], new Set());
      return;
    }
    similarTimer = setTimeout(async () => {
      try {
        const pickedNames = Array.from(selectedMap.values())
          .map((a) => a.name)
          .slice(0, 6);
        const res = await fetch(
          `/api/recommendations?artists=${encodeURIComponent(pickedNames.join(","))}`,
          { signal: opts.signal }
        );
        const similarList: OnboardingArtistItem[] = [];
        const selectedKeys = new Set(selectedMap.keys());
        const seen = new Set<string>(selectedKeys);

        if (res.ok) {
          const data = await res.json();
          const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
          for (const tr of tracks) {
            if (!tr || !tr.artist) continue;
            const k = String(tr.artist).toLowerCase().trim();
            if (seen.has(k)) continue;
            seen.add(k);
            similarList.push({
              name: String(tr.artist),
              coverUrl: `/api/artist-image?name=${encodeURIComponent(tr.artist)}`,
            });
            if (similarList.length >= 6) break;
          }
        }

        if (similarList.length < 3) {
          const targetArtist = lastPickedName
            ? catalogPool.find((a) => a.name.toLowerCase() === lastPickedName.toLowerCase())
            : null;
          const targetGenre = targetArtist?.genre;
          for (const candidate of catalogPool) {
            const ck = candidate.name.toLowerCase();
            if (seen.has(ck)) continue;
            if (!targetGenre || candidate.genre === targetGenre) {
              seen.add(ck);
              similarList.push(candidate);
              if (similarList.length >= 6) break;
            }
          }
        }

        tray.updateSimilar(similarList.slice(0, 6), selectedKeys);
      } catch {}
    }, 180);
  };

  const syncAllCardsSelectionState = () => {
    const atMax = selectedMap.size >= 60;
    for (const [key, ctrl] of cardControllers.entries()) {
      ctrl.setSelected(selectedMap.has(key), false);
      ctrl.setDisabled(atMax && !selectedMap.has(key));
    }
    tray.updateSelected(Array.from(selectedMap.values()));
  };

  const toggleArtist = (artist: OnboardingArtistItem) => {
    const key = artist.name.toLowerCase().trim();
    const wasSelected = selectedMap.has(key);
    if (wasSelected) {
      selectedMap.delete(key);
    } else {
      if (selectedMap.size >= 60) return;
      selectedMap.set(key, {
        name: artist.name,
        genre: artist.genre,
        coverUrl: artist.coverUrl || `/api/artist-image?name=${encodeURIComponent(artist.name)}`,
      });
      const coverUrl =
        artist.coverUrl || `/api/artist-image?name=${encodeURIComponent(artist.name)}`;
      extractDominantHsl(coverUrl).then((hsl) => {
        if (hsl && !opts.signal.aborted) {
          applyDynamicAccent(opts.onboardingRoot, hsl);
        }
      });
    }

    const ctrl = cardControllers.get(key);
    if (ctrl) {
      ctrl.setSelected(!wasSelected, true);
    }
    syncAllCardsSelectionState();
    scheduleDraftSave();
    fetchSimilarArtists(!wasSelected ? artist.name : undefined);
  };

  const handleComplete = async () => {
    if (isSubmitting || selectedMap.size < 3) return;
    isSubmitting = true;
    tray.setSubmitting(true);

    const chosen = Array.from(selectedMap.values()).slice(0, 60);
    const chosenNames = chosen.map((a) => a.name);
    const followedObjects = chosen.map((a) => ({
      name: a.name,
      role: a.genre || "Artista",
      coverUrl: a.coverUrl || `/api/artist-image?name=${encodeURIComponent(a.name)}`,
    }));

    try {
      const uid = opts.user.uid;
      await Promise.all([
        updateDoc(doc(db, "users", uid), {
          favoriteArtists: chosenNames,
          followedArtists: followedObjects,
          onboardingCompleted: true,
          updatedAt: serverTimestamp(),
        }),
        updateDoc(doc(db, "profiles", uid), {
          favoriteArtists: chosenNames,
          updatedAt: serverTimestamp(),
        }),
      ]);
    } catch {}

    clearOnboardingDraft();
    opts.onComplete(chosen);
  };

  const tray = createSelectedTray({
    selected: Array.from(selectedMap.values()),
    similar: [],
    isSubmitting: false,
    signal: opts.signal,
    onRemoveSelected: (name) => {
      const key = name.toLowerCase().trim();
      selectedMap.delete(key);
      syncAllCardsSelectionState();
      scheduleDraftSave();
      fetchSimilarArtists();
    },
    onToggleSimilar: (artist) => {
      if (!catalogPool.some((a) => a.name.toLowerCase() === artist.name.toLowerCase())) {
        catalogPool.unshift(artist);
      }
      toggleArtist(artist);
    },
    onSubmit: handleComplete,
  });

  const handleGridKeyboardNav = (key: string, currentBtn: HTMLButtonElement) => {
    const cards = Array.from(gridEl.querySelectorAll<HTMLButtonElement>(".ob-artist-card"));
    const idx = cards.indexOf(currentBtn);
    if (idx === -1 || cards.length === 0) return;

    const firstRect = cards[0].getBoundingClientRect();
    let cols = 1;
    for (let i = 1; i < cards.length; i++) {
      if (Math.abs(cards[i].getBoundingClientRect().top - firstRect.top) < 10) {
        cols++;
      } else {
        break;
      }
    }

    let nextIdx = idx;
    if (key === "ArrowRight") nextIdx = Math.min(cards.length - 1, idx + 1);
    else if (key === "ArrowLeft") nextIdx = Math.max(0, idx - 1);
    else if (key === "ArrowDown") nextIdx = Math.min(cards.length - 1, idx + cols);
    else if (key === "ArrowUp") nextIdx = Math.max(0, idx - cols);
    else if (key === "Home") nextIdx = 0;
    else if (key === "End") nextIdx = cards.length - 1;

    cards.forEach((c, i) => {
      c.tabIndex = i === nextIdx ? 0 : -1;
    });
    cards[nextIdx]?.focus();
  };

  const getFilteredArtists = (): OnboardingArtistItem[] => {
    if (searchQuery && searchResultsPool) {
      return searchResultsPool;
    }
    const seen = new Set<string>();
    const list: OnboardingArtistItem[] = [];
    for (const art of catalogPool) {
      const k = art.name.toLowerCase().trim();
      if (seen.has(k)) continue;
      if (activeGenre !== "Todos") {
        const matchesGenre =
          (art.genre || "").toLowerCase() === activeGenre.toLowerCase() ||
          selectedMap.has(k);
        if (!matchesGenre) continue;
      }
      seen.add(k);
      list.push(art);
    }
    return list;
  };

  const renderGrid = () => {
    if (activeStaggerObserver) {
      activeStaggerObserver.disconnect();
      activeStaggerObserver = null;
    }
    gridEl.textContent = "";
    cardControllers.clear();

    const list = getFilteredArtists();
    const atMax = selectedMap.size >= 60;
    const cardEls: HTMLElement[] = [];

    list.forEach((artist, idx) => {
      const key = artist.name.toLowerCase().trim();
      const isSel = selectedMap.has(key);
      const ctrl = createArtistCard({
        artist,
        selected: isSel,
        disabled: atMax && !isSel,
        tabIndex: idx === 0 ? 0 : -1,
        signal: opts.signal,
        onToggle: (art) => toggleArtist(art),
        onNavigateKey: handleGridKeyboardNav,
      });
      cardControllers.set(key, ctrl);
      gridEl.appendChild(ctrl.el);
      cardEls.push(ctrl.el);
    });

    activeStaggerObserver = staggerIn(cardEls, { max: 24, delay: 50 });
  };

  const loadInitialChartsAndDiscover = async () => {
    try {
      const res = await fetch("/api/charts", { signal: opts.signal });
      if (res.ok) {
        const data = await res.json();
        const topArtists = Array.isArray(data?.top100Artists) ? data.top100Artists : [];
        const existingKeys = new Set(catalogPool.map((a) => a.name.toLowerCase().trim()));
        for (const a of topArtists) {
          if (!a || !a.name) continue;
          const k = String(a.name).toLowerCase().trim();
          if (existingKeys.has(k)) continue;
          existingKeys.add(k);
          catalogPool.push({
            name: String(a.name),
            genre: a.genre || "Pop",
            coverUrl: a.coverUrl || `/api/artist-image?name=${encodeURIComponent(a.name)}`,
          });
        }
        if (!searchQuery) {
          renderGrid();
        }
      }
    } catch {}
  };

  const loadMoreDiscoverPage = async () => {
    if (isFetchingMore || discoverPage >= 4 || searchQuery) return;
    isFetchingMore = true;
    const nextPage = discoverPage + 1;
    try {
      const res = await fetch(`/api/discover-more?page=${nextPage}`, {
        signal: opts.signal,
      });
      if (res.ok) {
        const data = await res.json();
        const moreArtists = Array.isArray(data?.artists) ? data.artists : [];
        if (moreArtists.length > 0) {
          discoverPage = nextPage;
          const existingKeys = new Set(catalogPool.map((a) => a.name.toLowerCase().trim()));
          const appendedEls: HTMLElement[] = [];
          const atMax = selectedMap.size >= 60;

          for (const a of moreArtists) {
            if (!a || !a.name) continue;
            const k = String(a.name).toLowerCase().trim();
            if (existingKeys.has(k)) continue;
            existingKeys.add(k);
            const item: OnboardingArtistItem = {
              name: String(a.name),
              genre: a.genre || "Pop",
              coverUrl: a.coverUrl || `/api/artist-image?name=${encodeURIComponent(a.name)}`,
            };
            catalogPool.push(item);

            if (activeGenre === "Todos" || item.genre === activeGenre) {
              const isSel = selectedMap.has(k);
              const ctrl = createArtistCard({
                artist: item,
                selected: isSel,
                disabled: atMax && !isSel,
                tabIndex: -1,
                signal: opts.signal,
                onToggle: (art) => toggleArtist(art),
                onNavigateKey: handleGridKeyboardNav,
              });
              cardControllers.set(k, ctrl);
              gridEl.appendChild(ctrl.el);
              appendedEls.push(ctrl.el);
            }
          }
          if (appendedEls.length > 0) {
            staggerIn(appendedEls, { max: 12, delay: 40 });
          }
        }
      }
    } catch {
    } finally {
      isFetchingMore = false;
    }
  };

  gridEl.addEventListener(
    "scroll",
    () => {
      if (
        gridEl.scrollTop + gridEl.clientHeight >=
        gridEl.scrollHeight - 220
      ) {
        loadMoreDiscoverPage();
      }
    },
    { passive: true, signal: opts.signal }
  );

  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "/" && !inInput) {
        e.preventDefault();
        searchField.focus();
      }
    },
    { signal: opts.signal }
  );

  renderGrid();
  loadInitialChartsAndDiscover();
  if (selectedMap.size > 0) {
    fetchSimilarArtists();
  }

  const topHeader = h(
    "header",
    { class: "ob-artists-topbar" },
    h(
      "div",
      { class: "ob-artists-topbar-head" },
      h("div", { class: "ob-artists-nav-left" }, brandLogo, backBtn),
      stepper
    ),
    titleEl,
    searchField.root,
    genreChips.root
  );

  const mainCenter = h("div", { class: "ob-artists-center-zone" }, topHeader, gridEl);

  const layout = h(
    "div",
    { class: "ob-artists-layout" },
    mainCenter,
    tray.desktopPanel,
    tray.mobileTray
  );

  const root = h("section", { class: "ob-step-artists" }, layout);

  return {
    root,
    titleEl,
    destroy() {
      if (searchTimer) clearTimeout(searchTimer);
      if (draftTimer) clearTimeout(draftTimer);
      if (similarTimer) clearTimeout(similarTimer);
      if (activeStaggerObserver) activeStaggerObserver.disconnect();
      genreChips.destroy();
    },
  };
}
