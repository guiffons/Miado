import { h, safeUrl } from "../dom";
import { bindImageFallback } from "../images";
import { extractDominantHsl } from "../motion";
import { OB_TEXT, type OnboardingArtistItem } from "../onboarding/flow";

export interface ProfilePreviewState {
  name: string;
  handle: string;
  bio: string;
  avatarUrl: string;
  artists: OnboardingArtistItem[];
}

export interface ProfilePreviewController {
  root: HTMLElement;
  updateText(data: { name?: string; handle?: string; bio?: string }): void;
  updateAvatar(avatarUrl: string): void;
  updateArtists(artists: OnboardingArtistItem[]): void;
}

export function createProfilePreview(initial: ProfilePreviewState): ProfilePreviewController {
  const bannerEl = h("div", { class: "ob-preview-banner" });

  const avatarImg = h("img", {
    class: "ob-preview-avatar",
    alt: OB_TEXT.profile.title,
  }) as HTMLImageElement;

  const nameEl = h(
    "div",
    { class: "ob-preview-name" },
    initial.name || OB_TEXT.profile.displayName
  );
  const handleEl = h(
    "div",
    { class: "ob-preview-handle" },
    `@${initial.handle || "miado"}`
  );
  const bioEl = h("div", { class: "ob-preview-bio" }, initial.bio || "");

  const artistsRow = h("div", { class: "ob-preview-artists" });

  const renderArtists = (artists: OnboardingArtistItem[]) => {
    artistsRow.textContent = "";
    const topThree = artists.slice(0, 3);
    for (const art of topThree) {
      const chipImg = h("img", {
        class: "ob-preview-artist-img",
        alt: art.name,
      }) as HTMLImageElement;
      bindImageFallback(
        chipImg,
        [art.coverUrl || `/api/artist-image?name=${encodeURIComponent(art.name)}`],
        "artist",
        art.name,
        art.name
      );
      const chip = h(
        "div",
        { class: "ob-preview-artist-chip" },
        chipImg,
        h("span", { class: "ob-preview-artist-name" }, art.name)
      );
      artistsRow.appendChild(chip);
    }
  };

  const applyAvatar = (url: string) => {
    const clean = safeUrl(url, "/api/cat-avatar?id=cat_1");
    bindImageFallback(avatarImg, [clean, "/api/cat-avatar?id=cat_1"], "avatar", "preview", "");
    extractDominantHsl(clean).then((hsl) => {
      if (hsl) {
        bannerEl.style.setProperty("--preview-h", String(hsl.h));
        bannerEl.style.setProperty("--preview-s", `${hsl.s}%`);
      }
    });
  };

  applyAvatar(initial.avatarUrl);
  renderArtists(initial.artists);

  const root = h(
    "aside",
    {
      class: "ob-profile-preview",
      "aria-label": OB_TEXT.profile.title,
    },
    bannerEl,
    h(
      "div",
      { class: "ob-preview-body" },
      h("div", { class: "ob-preview-avatar-wrap" }, avatarImg),
      nameEl,
      handleEl,
      bioEl,
      artistsRow
    )
  );

  return {
    root,
    updateText(data: { name?: string; handle?: string; bio?: string }) {
      if (data.name !== undefined) {
        nameEl.textContent = data.name.trim() || OB_TEXT.profile.displayName;
      }
      if (data.handle !== undefined) {
        handleEl.textContent = `@${data.handle.trim() || "miado"}`;
      }
      if (data.bio !== undefined) {
        bioEl.textContent = data.bio;
      }
    },
    updateAvatar(avatarUrl: string) {
      applyAvatar(avatarUrl);
    },
    updateArtists(artists: OnboardingArtistItem[]) {
      renderArtists(artists);
    },
  };
}
