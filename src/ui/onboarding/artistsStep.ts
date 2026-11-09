import type { User } from "firebase/auth";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../services/firebaseClient";
import { createArtistCard, type ArtistCardController } from "../components/artistCard";
import { createField } from "../components/field";
import { createGenreChips, type GenreOption } from "../components/genreChips";
import { createSelectedTray } from "../components/selectedTray";
import { createStepper } from "../components/stepper";
import { h } from "../dom";
import { icon, MIADO_CAT_LOGO_DATA_URI } from "../icons";
import { applyDynamicAccent, extractDominantHsl, staggerIn } from "../motion";
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  OB_TEXT,
  saveOnboardingDraft,
  type OnboardingArtistItem,
} from "./flow";

const INITIAL_CURATED_ARTISTS: OnboardingArtistItem[] = [
  { name: "Billie Eilish", genre: "Pop", coverUrl: "https://cdn-images.dzcdn.net/images/artist/8eab1a9a644889aabaca1e193e05f984/500x500-000000-80-0-0.jpg" },
  { name: "The Weeknd", genre: "R&B", coverUrl: "https://cdn-images.dzcdn.net/images/artist/581693b4724a7fcfa754455101e13a44/500x500-000000-80-0-0.jpg" },
  { name: "Linkin Park", genre: "Rock", coverUrl: "https://cdn-images.dzcdn.net/images/artist/4886905210739af3438990897bad3a98/500x500-000000-80-0-0.jpg" },
  { name: "Sabrina Carpenter", genre: "Pop", coverUrl: "https://cdn-images.dzcdn.net/images/artist/4a9cdc7737e2a0e59b4917b47884b859/500x500-000000-80-0-0.jpg" },
  { name: "Kendrick Lamar", genre: "Rap", coverUrl: "https://cdn-images.dzcdn.net/images/artist/be0a7c550567f4af0ed202d7235b74d6/500x500-000000-80-0-0.jpg" },
  { name: "Djavan", genre: "MPB", coverUrl: "https://cdn-images.dzcdn.net/images/artist/c7183e3802a594964d9f3b2e981b77e0/500x500-000000-80-0-0.jpg" },
  { name: "Tame Impala", genre: "Indie", coverUrl: "https://cdn-images.dzcdn.net/images/artist/879015e713cc6ad6ffaeec154c027505/500x500-000000-80-0-0.jpg" },
  { name: "Daft Punk", genre: "Eletronica", coverUrl: "https://cdn-images.dzcdn.net/images/artist/638e69b9caaf9f9f3f8826febea7b543/500x500-000000-80-0-0.jpg" },
  { name: "Anitta", genre: "Funk", coverUrl: "https://cdn-images.dzcdn.net/images/artist/e1a33054b719a936f00dc2050f3c90a9/500x500-000000-80-0-0.jpg" },
  { name: "Marilia Mendonca", genre: "Sertanejo", coverUrl: "https://cdn-images.dzcdn.net/images/artist/1ee9d64e22df6a19b21698995ae90fdf/500x500-000000-80-0-0.jpg" },
  { name: "SZA", genre: "R&B", coverUrl: "https://cdn-images.dzcdn.net/images/artist/8ced041da2bed70d5715f0860956169b/500x500-000000-80-0-0.jpg" },
  { name: "Metallica", genre: "Metal", coverUrl: "https://cdn-images.dzcdn.net/images/artist/056578a9c2007f69ce198c81875eca41/500x500-000000-80-0-0.jpg" },
  { name: "Arctic Monkeys", genre: "Rock", coverUrl: "https://cdn-images.dzcdn.net/images/artist/6c03e4c7c36800897fd468633286db24/500x500-000000-80-0-0.jpg" },
  { name: "Lana Del Rey", genre: "Indie", coverUrl: "https://cdn-images.dzcdn.net/images/artist/8994d3be1a59a72f887f1f8afd2d4c6c/500x500-000000-80-0-0.jpg" },
  { name: "Travis Scott", genre: "Rap", coverUrl: "https://cdn-images.dzcdn.net/images/artist/8d8316146026d7e6ce377e314536df62/500x500-000000-80-0-0.jpg" },
  { name: "Taylor Swift", genre: "Pop", coverUrl: "https://cdn-images.dzcdn.net/images/artist/cc2495870fe1a792ad0cdb05501ad5ec/500x500-000000-80-0-0.jpg" },
  { name: "Jorge Ben Jor", genre: "MPB", coverUrl: "https://cdn-images.dzcdn.net/images/artist/286f47429fd6072dc1a4c4203e373f9f/500x500-000000-80-0-0.jpg" },
  { name: "Bring Me The Horizon", genre: "Metal", coverUrl: "https://cdn-images.dzcdn.net/images/artist/d159e783c1f419ae27fd2deca5b89b54/500x500-000000-80-0-0.jpg" },
  { name: "Frank Ocean", genre: "R&B", coverUrl: "https://cdn-images.dzcdn.net/images/artist/882155c08dc31d6464d6d580083c968c/500x500-000000-80-0-0.jpg" },
  { name: "Paramore", genre: "Rock", coverUrl: "https://cdn-images.dzcdn.net/images/artist/60dc1956a36a5e552384b4a32b0cbf9b/500x500-000000-80-0-0.jpg" },
  { name: "Ghost", genre: "Metal", coverUrl: "https://cdn-images.dzcdn.net/images/artist/d5b38f1d0d9b0c219549aa3add5169a4/500x500-000000-80-0-0.jpg" },
  { name: "Olivia Rodrigo", genre: "Pop", coverUrl: "https://cdn-images.dzcdn.net/images/artist/2c9e480317183c037eaebcd7ba96daf4/500x500-000000-80-0-0.jpg" },
  { name: "Racionais MCs", genre: "Rap", coverUrl: "https://cdn-images.dzcdn.net/images/artist/eb2451cb8d2eefe925a8ecffc8ff5e55/500x500-000000-80-0-0.jpg" },
  { name: "Tim Maia", genre: "MPB", coverUrl: "https://cdn-images.dzcdn.net/images/artist/fa32f3688e3b5901b7588020b0377623/500x500-000000-80-0-0.jpg" },
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
    h(
      "span",
      { class: "ob-brand-mark" },
      h("img", {
        src: MIADO_CAT_LOGO_DATA_URI,
        alt: "Miado Logo",
        class: "ob-brand-logo-img",
        draggable: "false",
      })
    )
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

  const isCollabName = (s: string) =>
    /\b(feat\.?|ft\.?|featuring|with|part\.?)\b/i.test(s) ||
    ((/\s&\s/.test(s) || s.includes(",")) &&
      !/^(tyler, the creator|simon & garfunkel|earth, wind & fire|florence \+ the machine|tasha & tracie|sandy & junior|jorge & mateus|henrique & juliano|matheus & kauan)$/i.test(
        s.trim()
      ));

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
              if (!a || !a.name || isCollabName(String(a.name))) continue;
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
              if (!alb || !alb.artist || isCollabName(String(alb.artist))) continue;
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
          const normQ = searchQuery.toLowerCase().trim();
          found.sort((a, b) => {
            const aName = a.name.toLowerCase().trim();
            const bName = b.name.toLowerCase().trim();
            const aExact = aName === normQ ? 4 : aName.startsWith(normQ) ? 3 : aName.includes(normQ) ? 2 : 0;
            const bExact = bName === normQ ? 4 : bName.startsWith(normQ) ? 3 : bName.includes(normQ) ? 2 : 0;
            if (aExact !== bExact) return bExact - aExact;
            return aName.localeCompare(bName);
          });
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
            if (!tr || !tr.artist || isCollabName(String(tr.artist))) continue;
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

    const w = window as any;
    const savedDraft = loadOnboardingDraft();
    const uid = opts.user.uid;
    const email = String(opts.user.email || w.miadoState?.user?.email || "").toLowerCase();
    const cleanName = (savedDraft.name || w.miadoState?.user?.name || opts.user.displayName || "Ouvinte").slice(0, 80);
    const bareH = (
      savedDraft.handle ||
      w.miadoState?.user?.username ||
      w.miadoState?.user?.handle ||
      "ouvinte"
    )
      .replace(/^@+/, "")
      .toLowerCase()
      .replace(/[^a-z0-9_.]/g, "")
      .slice(0, 28) || "ouvinte";
    const displayH = `@${bareH}`;
    const catId =
      typeof savedDraft.catId === "string" && /^cat_[1-8]$/.test(savedDraft.catId)
        ? savedDraft.catId
        : "cat_1";
    const avatarUrl = savedDraft.avatarUrl || w.miadoState?.user?.avatarUrl || `/api/cat-avatar?id=${catId}`;
    const bio = (savedDraft.bio || w.miadoState?.user?.bio || "").slice(0, 300);
    const privacy =
      savedDraft.privacy === "public" ||
      savedDraft.privacy === "followers_only" ||
      savedDraft.privacy === "private"
        ? savedDraft.privacy
        : "followers_only";

    try {
      await Promise.all([
        updateDoc(doc(db, "users", uid), {
          name: cleanName,
          handle: bareH,
          bio,
          avatarUrl,
          catId,
          favoriteArtists: chosenNames,
          followedArtists: chosenNames,
          privacy: { presence: privacy, activity: privacy },
          onboardingCompleted: true,
          updatedAt: serverTimestamp(),
        }).catch(() =>
          setDoc(
            doc(db, "users", uid),
            {
              uid,
              email,
              name: cleanName,
              handle: bareH,
              bio,
              avatarUrl,
              catId,
              favoriteArtists: chosenNames,
              followedArtists: chosenNames,
              privacy: { presence: privacy, activity: privacy },
              onboardingCompleted: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          ).catch(() => {})
        ),
        setDoc(
          doc(db, "profiles", uid),
          {
            uid,
            name: cleanName,
            handle: bareH,
            bio,
            avatarUrl,
            favoriteArtists: chosenNames,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => {}),
        setDoc(doc(db, "handles", bareH), { uid, createdAt: serverTimestamp() }).catch(() => {}),
      ]);
    } catch {}

    try {
      const token = localStorage.getItem("miado_auth_token") || "";
      fetch("/api/user/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: cleanName,
          handle: displayH,
          username: displayH,
          bio,
          customAvatar: avatarUrl,
          favoriteArtists: chosenNames,
          followedArtists: chosenNames,
          onboardingCompleted: true,
        }),
      }).catch(() => {});
    } catch {}

    try {
      localStorage.setItem("miado_user_uid", uid);
      localStorage.setItem("miado_active_session_v1", "true");
      localStorage.setItem("miado_user_onboarded_v1", "true");

      if (w.miadoState) {
        w.miadoState.hydrateFromFirestore({
          uid,
          email,
          name: cleanName,
          username: displayH,
          handle: displayH,
          bio,
          avatarUrl,
          favoriteArtists: chosenNames,
          followedArtists: followedObjects,
          onboardingCompleted: true,
        });
        if (typeof w.miadoState.saveFavoriteArtists === "function") {
          void w.miadoState.saveFavoriteArtists(chosenNames, []);
        }
        if (typeof w.miadoState.createOrUpdateCommunityProfile === "function") {
          void w.miadoState.createOrUpdateCommunityProfile({
            name: cleanName,
            username: displayH,
            bio,
            avatarUrl,
            favoriteArtists: chosenNames,
          });
        }
        if (w.miadoFirestore && typeof w.miadoFirestore.saveUserState === "function") {
          void w.miadoFirestore.saveUserState(w.miadoState);
        }
      }
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
          if (!a || !a.name || isCollabName(String(a.name))) continue;
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
            if (!a || !a.name || isCollabName(String(a.name))) continue;
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
