import "./styles/base.css";
import "./styles/liquid-glass.css";
import "./styles/onboarding.css";
import { initFirebaseClient } from "./services/firebaseClient";
import { initMiadoClient } from "./app/miadoClient.js";
import { initEnhancements } from "./ui/ambientGlass";
import { createGlassPlaceholderDataUri } from "./shared/placeholder";
import { escapeHtml, safeUrl, h } from "./ui/dom";
import { bindImageFallback } from "./ui/images";
import { createCarousel } from "./ui/carousel";
import { mountOnboarding } from "./ui/onboarding";
import { initPwaInstall } from "./ui/pwaInstall";

import { buildTrackKey } from "./shared/keys";
import {
  initIndexedDbStore,
  resolveActiveUserKey,
  saveProfileInstant,
  saveLibraryInstant,
  saveHistoryInstant,
  enqueueOutbox,
  persistFromMiadoState,
} from "./services/indexedDbStore";

export function resolveUniqueTrackId(track: any): {
  id: string;
  trackUid: string;
  provider: string;
} {
  const rawId = String(track?.id || track?.trackId || "").trim();
  const title = String(track?.title || track?.trackName || "").trim();
  const artist = String(track?.artist || track?.artistName || "").trim();
  const key = buildTrackKey(title, artist) || "track";

  let provider = String(track?.provider || "").trim().toLowerCase();
  let normalizedId = rawId;

  if (rawId.startsWith("dz_")) {
    provider = "deezer";
  } else if (rawId.startsWith("it_")) {
    provider = "itunes";
  } else if (rawId.startsWith("saavn_")) {
    provider = "saavn";
  } else if (/^\d+$/.test(rawId)) {
    provider = provider || "itunes";
    normalizedId = `it_${rawId}`;
  } else {
    provider = provider || "catalog";
    let h = 2166136261;
    const seed = `${key}|${title.toLowerCase()}|${artist.toLowerCase()}`;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const hex = (h >>> 0).toString(16).padStart(8, "0");
    normalizedId = rawId || `trk_${hex}_${key.slice(0, 24)}`;
  }

  const trackUid = `${provider}:${normalizedId}:${key}`;
  return { id: normalizedId, trackUid, provider };
}

export async function updateProfile(profileData?: any): Promise<boolean> {
  const w = window as any;
  const userKey = resolveActiveUserKey(profileData || w.miadoState);
  await saveProfileInstant(userKey, profileData || w.miadoState?.user || {});
  void persistFromMiadoState(w.miadoState);
  if (w.miadoFirestore && typeof w.miadoFirestore.updateProfile === "function") {
    const ok = await w.miadoFirestore.updateProfile(profileData);
    if (!ok) {
      await enqueueOutbox("updateProfile", profileData || w.miadoState?.user || {}, userKey);
    }
    return ok;
  }
  await enqueueOutbox("updateProfile", profileData || w.miadoState?.user || {}, userKey);
  return false;
}

export async function saveUserLibrary(libraryData?: any): Promise<boolean> {
  const w = window as any;
  const userKey = resolveActiveUserKey(w.miadoState);
  await saveLibraryInstant(userKey, {
    likedTracks: libraryData?.likedTracks ?? w.miadoState?.likedTracks,
    followedArtists: libraryData?.followedArtists ?? w.miadoState?.followedArtists,
    playlists: libraryData?.playlists ?? w.miadoState?.playlists,
    friends: libraryData?.friends ?? w.miadoState?.friends,
  });
  if (Array.isArray(libraryData?.recentHistory || w.miadoState?.history)) {
    await saveHistoryInstant(userKey, libraryData?.recentHistory || w.miadoState?.history || []);
  }
  void persistFromMiadoState(w.miadoState);
  if (w.miadoFirestore && typeof w.miadoFirestore.saveUserLibrary === "function") {
    const ok = await w.miadoFirestore.saveUserLibrary(libraryData);
    if (!ok) {
      await enqueueOutbox("saveUserLibrary", libraryData || {}, userKey);
    }
    return ok;
  }
  await enqueueOutbox("saveUserLibrary", libraryData || {}, userKey);
  return false;
}

function bootstrapMiadoApp() {
  const w = window as any;
  initIndexedDbStore();
  w.miadoPlaceholder = createGlassPlaceholderDataUri;
  w.miadoDom = { escapeHtml, safeUrl, h, bindImageFallback, createCarousel };
  w.miadoTrackIdentity = { resolveUniqueTrackId };
  w.miadoPersistence = {
    updateProfile,
    saveUserLibrary,
    flushRetryQueue: async () => {
      if (w.miadoFirestore && typeof w.miadoFirestore.flushRetryQueue === "function") {
        await w.miadoFirestore.flushRetryQueue();
      }
    },
  };

  let activeOnboardingUnmount: (() => void) | null = null;

  const ensureOnboardingContainer = (): HTMLElement => {
    let el = document.getElementById("miado-onboarding-root");
    if (!el) {
      el = h("div", { id: "miado-onboarding-root" });
      document.body.appendChild(el);
    }
    return el;
  };

  w.miadoMountOnboarding = (forceRemount = false) => {
    const container = ensureOnboardingContainer();
    if (activeOnboardingUnmount) {
      if (!forceRemount && container.querySelector(".ob-root:not(.is-exiting)")) {
        return activeOnboardingUnmount;
      }
      try {
        activeOnboardingUnmount();
      } catch {
        // ignore unmount error
      }
      activeOnboardingUnmount = null;
    }
    container.style.display = "block";
    activeOnboardingUnmount = mountOnboarding(container, {
      onComplete: async () => {
        activeOnboardingUnmount = null;
        try {
          if (w.miadoFirestore && typeof w.miadoFirestore.hydrateCurrentUser === "function") {
            await w.miadoFirestore.hydrateCurrentUser();
          }
          if (w.miadoUI) {
            w.miadoUI.syncHeaderUserUI?.();
            w.miadoUI.renderSidebarPlaylists?.();
            w.miadoUI.syncAccountStateAcrossApp?.();
          }
        } catch {
          // ignore post-onboarding hydration warning
        }
      },
    });
    return activeOnboardingUnmount;
  };

  document.addEventListener("dragstart", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLImageElement ||
      target instanceof SVGElement ||
      target instanceof HTMLAnchorElement
    ) {
      event.preventDefault();
    }
  });

  initPwaInstall();
  initFirebaseClient();
  initMiadoClient();
  initEnhancements();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapMiadoApp, { once: true });
} else {
  bootstrapMiadoApp();
}
