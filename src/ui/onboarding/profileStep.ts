import { sendEmailVerification, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db, sanitizeImageForRules } from "../../services/firebaseClient";
import type { Visibility } from "../../shared/types";
import { openAvatarEditor } from "../components/avatarEditor";
import { createField } from "../components/field";
import { createProfilePreview } from "../components/profilePreview";
import { createSegmented } from "../components/segmented";
import { createStepper } from "../components/stepper";
import { h, safeUrl } from "../dom";
import { icon, MIADO_CAT_LOGO_DATA_URI } from "../icons";
import { bindImageFallback } from "../images";
import { applyDynamicAccent, drawCheck, extractDominantHsl, shake } from "../motion";
import {
  isValidHandle,
  loadOnboardingDraft,
  normalizeHandle,
  OB_TEXT,
  saveOnboardingDraft,
  validateDisplayName,
  type HandleCheckStatus,
} from "./flow";

const CAT_PRESET_IDS = [
  "cat_1",
  "cat_2",
  "cat_3",
  "cat_4",
  "cat_5",
  "cat_6",
  "cat_7",
  "cat_8",
] as const;

export interface ProfileStepOptions {
  user: User;
  onboardingRoot: HTMLElement;
  existingHandle?: string;
  signal: AbortSignal;
  onNext: (savedProfile: {
    name: string;
    handle: string;
    bio: string;
    catId: string;
    avatarUrl: string;
    privacy: Visibility;
  }) => void;
}

export interface ProfileStepController {
  root: HTMLElement;
  titleEl: HTMLElement;
  destroy(): void;
}

export function createProfileStep(opts: ProfileStepOptions): ProfileStepController {
  const draft = loadOnboardingDraft();
  let currentName = draft.name || opts.user.displayName || "";
  let currentHandle = normalizeHandle(draft.handle || opts.existingHandle || "");
  let currentBio = draft.bio || "";
  let currentCatId = draft.catId || "cat_1";
  let currentAvatarUrl =
    draft.avatarUrl ||
    (opts.user.photoURL ? safeUrl(opts.user.photoURL, "/api/cat-avatar?id=cat_1") : "/api/cat-avatar?id=cat_1");
  let currentPrivacy: Visibility = draft.privacy || "public";
  let handleStatus: HandleCheckStatus = "idle";
  let handleDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let draftDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let activeCropCleanup: (() => void) | null = null;
  let isSaving = false;

  const scheduleDraftSave = () => {
    if (draftDebounceTimer) clearTimeout(draftDebounceTimer);
    draftDebounceTimer = setTimeout(() => {
      saveOnboardingDraft({
        step: "profile",
        name: currentName,
        handle: currentHandle,
        bio: currentBio,
        catId: currentCatId,
        avatarUrl: currentAvatarUrl,
        privacy: currentPrivacy,
      });
    }, 300);
  };

  let verificationBanner: HTMLElement | null = null;
  if (opts.user && !opts.user.emailVerified) {
    const resendBtn = h(
      "button",
      {
        type: "button",
        class: "ob-verify-resend-btn",
      },
      OB_TEXT.auth.resend
    ) as HTMLButtonElement;

    resendBtn.addEventListener(
      "click",
      async () => {
        resendBtn.disabled = true;
        try {
          if (auth.currentUser) {
            await sendEmailVerification(auth.currentUser);
          }
        } catch {}
      },
      { signal: opts.signal }
    );

    verificationBanner = h(
      "div",
      { class: "ob-verify-banner" },
      icon("alert", 20),
      h("span", { class: "ob-verify-text" }, OB_TEXT.auth.unverified),
      resendBtn
    );
  }

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

  const stepper = createStepper({ step: 1, verticalOnDesktop: true });

  const titleEl = h(
    "h1",
    {
      class: "ob-step-title",
      tabindex: "-1",
    },
    OB_TEXT.profile.title
  );

  const avatarImg = h("img", {
    class: "ob-avatar-picker-img",
    alt: OB_TEXT.profile.title,
  }) as HTMLImageElement;

  const updateAvatarDisplay = (url: string) => {
    currentAvatarUrl = url;
    bindImageFallback(avatarImg, [url, "/api/cat-avatar?id=cat_1"], "avatar", "self", "");
    preview.updateAvatar(url);
    extractDominantHsl(url).then((hsl) => {
      if (hsl && !opts.signal.aborted) {
        applyDynamicAccent(opts.onboardingRoot, hsl);
      }
    });
  };

  const fileInput = h("input", {
    id: "ob-profile-avatar-file",
    class: "ob-visually-hidden",
    type: "file",
    accept: "image/png,image/jpeg,image/webp",
  }) as HTMLInputElement;

  const avatarPickerBtn = h(
    "button",
    {
      type: "button",
      class: "ob-avatar-picker-btn",
      "aria-label": OB_TEXT.profile.addPhoto,
    },
    avatarImg,
    h("span", { class: "ob-avatar-ring-plus", "aria-hidden": "true" }, icon("plus", 20)),
    h("span", { class: "ob-avatar-hover-label", "aria-hidden": "true" }, OB_TEXT.profile.changePhoto)
  ) as HTMLButtonElement;
  avatarPickerBtn.style.setProperty("view-transition-name", "ob-avatar");

  const avatarErrorMsg = h("div", {
    class: "ob-field-message",
    "aria-live": "polite",
  });

  avatarPickerBtn.addEventListener(
    "click",
    () => {
      fileInput.value = "";
      fileInput.click();
    },
    { signal: opts.signal }
  );

  fileInput.addEventListener(
    "change",
    () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      avatarErrorMsg.className = "ob-field-message";
      avatarErrorMsg.textContent = "";
      if (activeCropCleanup) activeCropCleanup();
      activeCropCleanup = openAvatarEditor({
        file,
        parentSignal: opts.signal,
        onConfirm: (dataUrl) => {
          activeCropCleanup = null;
          updateAvatarDisplay(dataUrl);
          catPresetButtons.forEach((b) => {
            b.classList.remove("is-active");
            b.setAttribute("aria-checked", "false");
          });
          scheduleDraftSave();
        },
        onCancel: () => {
          activeCropCleanup = null;
        },
        onError: (msg) => {
          activeCropCleanup = null;
          avatarErrorMsg.className = "ob-field-message is-error is-visible";
          avatarErrorMsg.textContent = msg;
        },
      });
    },
    { signal: opts.signal }
  );

  const catPresetButtons: HTMLButtonElement[] = [];
  const catRow = h("div", {
    class: "ob-cat-presets-row",
    role: "radiogroup",
    "aria-label": OB_TEXT.profile.addPhoto,
  });

  CAT_PRESET_IDS.forEach((catId, idx) => {
    const url = `/api/cat-avatar?id=${catId}`;
    const isSelected = currentAvatarUrl === url || (idx === 0 && !currentAvatarUrl);
    const img = h("img", { class: "ob-cat-preset-img", alt: catId }) as HTMLImageElement;
    bindImageFallback(img, [url], "avatar", catId, catId);

    const btn = h(
      "button",
      {
        type: "button",
        role: "radio",
        class: `ob-cat-preset-btn ${isSelected ? "is-active" : ""}`,
        "aria-checked": isSelected ? "true" : "false",
        "aria-label": `${OB_TEXT.profile.changePhoto} ${idx + 1}`,
        tabindex: isSelected ? "0" : "-1",
        dataset: { catId },
      },
      img
    ) as HTMLButtonElement;

    const selectPreset = () => {
      currentCatId = catId;
      updateAvatarDisplay(url);
      catPresetButtons.forEach((b, i) => {
        const active = i === idx;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-checked", active ? "true" : "false");
        b.tabIndex = active ? 0 : -1;
      });
      scheduleDraftSave();
    };

    btn.addEventListener("click", selectPreset, { signal: opts.signal });
    btn.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const nextIdx = (idx + dir + CAT_PRESET_IDS.length) % CAT_PRESET_IDS.length;
        catPresetButtons[nextIdx]?.focus();
        catPresetButtons[nextIdx]?.click();
      },
      { signal: opts.signal }
    );

    catPresetButtons.push(btn);
    catRow.appendChild(btn);
  });

  const avatarSection = h(
    "div",
    { class: "ob-avatar-section" },
    h("div", { class: "ob-avatar-picker-row" }, avatarPickerBtn, fileInput),
    avatarErrorMsg
  );

  const preview = createProfilePreview({
    name: currentName,
    handle: currentHandle,
    bio: currentBio,
    avatarUrl: currentAvatarUrl,
    artists: draft.artists || [],
  });

  updateAvatarDisplay(currentAvatarUrl);

  const syncNextButtonState = () => {
    const nameValid = validateDisplayName(currentName).valid;
    const handleReady = isValidHandle(currentHandle) && handleStatus === "available";
    nextBtn.disabled = isSaving || !(nameValid && handleReady);
  };

  let handleCheckSeq = 0;
  let handleManuallyEdited = Boolean(draft.handle || opts.existingHandle);

  const triggerHandleAvailabilityCheck = (rawValue: string, isAutoSuggestion = false) => {
    const normalized = normalizeHandle(rawValue);
    currentHandle = normalized;
    if (handleField.getValue() !== normalized) {
      handleField.setValue(normalized);
    }
    preview.updateText({ handle: normalized });
    scheduleDraftSave();

    if (handleDebounceTimer) {
      clearTimeout(handleDebounceTimer);
      handleDebounceTimer = null;
    }

    if (!isValidHandle(normalized)) {
      handleStatus = "invalid";
      handleField.setHandleStatus(normalized.length === 0 ? "idle" : "invalid");
      syncNextButtonState();
      return;
    }

    handleStatus = "checking";
    handleField.setHandleStatus("checking");
    syncNextButtonState();

    const seq = ++handleCheckSeq;
    handleDebounceTimer = setTimeout(async () => {
      try {
        const [snapResult, apiCheckResult] = await Promise.allSettled([
          getDoc(doc(db, "handles", normalized)),
          fetch(
            `/api/check-handle?handle=${encodeURIComponent(normalized)}&email=${encodeURIComponent(opts.user.email || "")}`,
            { signal: opts.signal }
          ).then((r) => (r.ok ? r.json() : null)),
        ]);

        if (seq !== handleCheckSeq || opts.signal.aborted) return;

        let takenByFirestore = false;
        if (snapResult.status === "fulfilled" && snapResult.value && snapResult.value.exists()) {
          const ownerUid = (snapResult.value as any).data()?.uid;
          if (ownerUid && ownerUid !== opts.user.uid) {
            takenByFirestore = true;
          }
        }

        let takenByApi = false;
        if (apiCheckResult.status === "fulfilled" && apiCheckResult.value) {
          if (apiCheckResult.value.available === false) {
            takenByApi = true;
          }
        }

        const isTaken = takenByFirestore || takenByApi;

        if (!isTaken) {
          handleStatus = "available";
          handleField.setHandleStatus("available");
        } else if (isAutoSuggestion && !handleManuallyEdited) {
          const base = normalized.slice(0, 18) || "user";
          const fallbackCandidate = normalizeHandle(
            `${base}${Math.floor(1000 + Math.random() * 9000)}`
          );
          triggerHandleAvailabilityCheck(fallbackCandidate, false);
          return;
        } else {
          handleStatus = "taken";
          handleField.setHandleStatus("taken");
        }
      } catch {
        if (seq !== handleCheckSeq || opts.signal.aborted) return;
        handleStatus = "available";
        handleField.setHandleStatus("available");
      }
      syncNextButtonState();
    }, 350);
  };

  const nameField = createField({
    id: "ob-profile-name",
    label: OB_TEXT.profile.displayName,
    type: "text",
    autocomplete: "name",
    maxLength: 80,
    value: currentName,
    leadingIcon: "user",
    signal: opts.signal,
    onInput: (val) => {
      currentName = val;
      const v = validateDisplayName(val);
      if (!v.valid && val.length > 0) {
        nameField.setError(v.error);
      } else {
        nameField.clearError();
      }
      preview.updateText({ name: val });
      if (!handleManuallyEdited && val.trim().length >= 2) {
        const suggested = normalizeHandle(val);
        if (suggested.length >= 2) {
          triggerHandleAvailabilityCheck(suggested, true);
        }
      }
      scheduleDraftSave();
      syncNextButtonState();
    },
  });

  const handleField = createField({
    id: "ob-profile-handle",
    label: OB_TEXT.profile.username,
    type: "text",
    autocomplete: "username",
    autocapitalize: "off",
    maxLength: 28,
    value: currentHandle,
    prefixText: "@",
    signal: opts.signal,
    onInput: (val) => {
      handleManuallyEdited = true;
      triggerHandleAvailabilityCheck(val, false);
    },
  });

  const bioField = createField({
    id: "ob-profile-bio",
    label: OB_TEXT.profile.bio,
    type: "text",
    maxLength: 100,
    value: currentBio,
    showBioCounterFrom: 1,
    signal: opts.signal,
    onInput: (val) => {
      currentBio = val.slice(0, 100);
      preview.updateText({ bio: currentBio });
      scheduleDraftSave();
    },
  });

  const privacySegmented = createSegmented<Visibility>({
    items: [
      { value: "public", label: OB_TEXT.profile.privacyAll },
      { value: "followers_only", label: OB_TEXT.profile.privacyFollowers },
      { value: "private", label: OB_TEXT.profile.privacyNobody },
    ],
    value: currentPrivacy,
    ariaLabel: OB_TEXT.profile.privacyLabel,
    signal: opts.signal,
    onChange: (val) => {
      currentPrivacy = val;
      scheduleDraftSave();
    },
  });

  const privacySection = h(
    "div",
    { class: "ob-privacy-section" },
    h("span", { class: "ob-privacy-label" }, OB_TEXT.profile.privacyLabel),
    privacySegmented.root
  );

  const formErrorEl = h("div", {
    class: "ob-form-error",
    "aria-live": "polite",
  });

  const nextLabel = h("span", { class: "ob-btn-label" }, OB_TEXT.profile.next);
  const nextSpinner = h(
    "span",
    { class: "ob-btn-spinner", "aria-hidden": "true" },
    icon("spinner", 20, "is-spinning")
  );
  const nextCheckSvg = icon("check", 20);
  const nextCheckSlot = h("span", { class: "ob-btn-check", "aria-hidden": "true" }, nextCheckSvg);

  const nextBtn = h(
    "button",
    {
      type: "button",
      class: "ob-btn-primary",
      disabled: true,
    },
    nextLabel,
    nextSpinner,
    nextCheckSlot
  ) as HTMLButtonElement;
  nextBtn.style.setProperty("view-transition-name", "ob-primary");

  const saveProfileBatch = async () => {
    const nameCheck = validateDisplayName(currentName);
    if (!nameCheck.valid) {
      nameField.setError(nameCheck.error);
      return;
    }
    if (!isValidHandle(currentHandle) || handleStatus !== "available") {
      handleField.setHandleStatus("invalid");
      return;
    }

    isSaving = true;
    nextBtn.classList.add("is-loading");
    nextBtn.disabled = true;
    formErrorEl.className = "ob-form-error";
    formErrorEl.textContent = "";

    const safeGetDoc = async (docRef: any, timeoutMs = 1500): Promise<any> => {
      try {
        return await Promise.race([
          getDoc(docRef),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
        ]);
      } catch {
        return null;
      }
    };

    try {
      const uid = opts.user.uid;
      const userDocRef = doc(db, "users", uid);
      const profDocRef = doc(db, "profiles", uid);
      const handleDocRef = doc(db, "handles", currentHandle);

      const [existingUserSnap, existingHandleSnap] = await Promise.all([
        safeGetDoc(userDocRef),
        safeGetDoc(handleDocRef),
      ]);

      if (existingHandleSnap && existingHandleSnap.exists() && existingHandleSnap.data()?.uid !== uid) {
        isSaving = false;
        nextBtn.classList.remove("is-loading");
        handleStatus = "taken";
        handleField.setHandleStatus("taken");
        syncNextButtonState();
        return;
      }

      const prevHandle = existingUserSnap && existingUserSnap.exists()
        ? normalizeHandle(existingUserSnap.data()?.handle || "")
        : "";
      const cleanEmail = String(opts.user.email || "").toLowerCase();
      const safeAvatar = sanitizeImageForRules(
        currentAvatarUrl,
        100000,
        "/api/cat-avatar?id=cat_1"
      );
      const cleanName = currentName.trim().slice(0, 80);
      const cleanBio = currentBio.trim().slice(0, 100);
      const existingFavs = existingUserSnap && existingUserSnap.exists() && Array.isArray(existingUserSnap.data()?.favoriteArtists)
        ? existingUserSnap.data()?.favoriteArtists.slice(0, 60)
        : (draft.artists || []).map((a) => a.name).slice(0, 60);

      try {
        const batch = writeBatch(db);
        batch.set(userDocRef, {
          uid,
          email: cleanEmail,
          name: cleanName,
          handle: currentHandle,
          bio: cleanBio,
          catId: currentCatId,
          avatarUrl: safeAvatar,
          bannerUrl: "",
          favoriteArtists: existingFavs,
          favoriteGenres: [],
          followedArtists: [],
          privacy: {
            presence: currentPrivacy,
            activity: currentPrivacy,
          },
          onboardingCompleted: false,
          createdAt: existingUserSnap && existingUserSnap.exists() && existingUserSnap.data()?.createdAt
            ? existingUserSnap.data()?.createdAt
            : serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        batch.set(profDocRef, {
          uid,
          name: cleanName,
          handle: currentHandle,
          bio: cleanBio,
          avatarUrl: safeAvatar,
          bannerUrl: "",
          favoriteArtists: existingFavs,
          updatedAt: serverTimestamp(),
        });

        if (!existingHandleSnap || !existingHandleSnap.exists()) {
          batch.set(handleDocRef, {
            uid,
            createdAt: serverTimestamp(),
          });
        }

        if (prevHandle && prevHandle !== currentHandle && isValidHandle(prevHandle)) {
          batch.delete(doc(db, "handles", prevHandle));
        }

        await Promise.race([
          batch.commit(),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (batchErr) {
        // If Firestore rules or offline delay occurs, still proceed with draft & local state
        console.warn("Firestore save fallback:", batchErr);
      }

      saveOnboardingDraft({
        step: "artists",
        name: cleanName,
        handle: currentHandle,
        bio: cleanBio,
        catId: currentCatId,
        avatarUrl: safeAvatar,
        privacy: currentPrivacy,
      });

      const w = window as any;
      if (w.miadoState && w.miadoState.user) {
        w.miadoState.user.name = cleanName;
        w.miadoState.user.handle = `@${currentHandle}`;
        w.miadoState.user.username = `@${currentHandle}`;
        w.miadoState.user.bio = cleanBio;
        w.miadoState.user.avatarUrl = safeAvatar;
        w.miadoState.user.catId = currentCatId;
        w.miadoState.user.privacy = {
          presence: currentPrivacy,
          activity: currentPrivacy,
        };
      }

      nextBtn.classList.remove("is-loading");
      nextBtn.classList.add("is-success");
      const checkPath = nextCheckSvg.querySelector(".ob-icon-check-path") as SVGElement | null;
      drawCheck(checkPath);

      setTimeout(() => {
        opts.onNext({
          name: cleanName,
          handle: currentHandle,
          bio: cleanBio,
          catId: currentCatId,
          avatarUrl: safeAvatar,
          privacy: currentPrivacy,
        });
      }, 220);
    } catch (err) {
      console.warn("Profile step caught error, fallback to advance:", err);
      const cleanName = currentName.trim().slice(0, 80);
      const cleanBio = currentBio.trim().slice(0, 100);
      const safeAvatar = sanitizeImageForRules(
        currentAvatarUrl,
        100000,
        "/api/cat-avatar?id=cat_1"
      );
      saveOnboardingDraft({
        step: "artists",
        name: cleanName,
        handle: currentHandle,
        bio: cleanBio,
        catId: currentCatId,
        avatarUrl: safeAvatar,
        privacy: currentPrivacy,
      });
      opts.onNext({
        name: cleanName,
        handle: currentHandle,
        bio: cleanBio,
        catId: currentCatId,
        avatarUrl: safeAvatar,
        privacy: currentPrivacy,
      });
    }
  };

  nextBtn.addEventListener("click", saveProfileBatch, { signal: opts.signal });

  if (currentHandle) {
    triggerHandleAvailabilityCheck(currentHandle, !handleManuallyEdited);
  } else if (currentName.trim().length >= 2) {
    const baseSuggested = normalizeHandle(currentName);
    triggerHandleAvailabilityCheck(
      baseSuggested.length >= 2
        ? baseSuggested
        : `user${Math.floor(10000 + Math.random() * 90000)}`,
      true
    );
  } else if (opts.user.providerData?.some((p) => p.providerId === "google.com")) {
    triggerHandleAvailabilityCheck(`user${Math.floor(10000 + Math.random() * 90000)}`, true);
  }

  const formCard = h(
    "div",
    { class: "ob-glass-card ob-profile-form-card" },
    verificationBanner,
    h("div", { class: "ob-profile-header-row" }, brandLogo, stepper),
    titleEl,
    avatarSection,
    nameField.root,
    handleField.root,
    bioField.root,
    privacySection,
    formErrorEl,
    h("div", { class: "ob-sticky-bottom-action" }, nextBtn)
  );

  const grid = h(
    "div",
    { class: "ob-profile-grid-12" },
    h("div", { class: "ob-profile-col-form" }, formCard),
    h("div", { class: "ob-profile-col-preview" }, preview.root)
  );

  const root = h("section", { class: "ob-step-profile" }, grid);

  return {
    root,
    titleEl,
    destroy() {
      if (handleDebounceTimer) clearTimeout(handleDebounceTimer);
      if (draftDebounceTimer) clearTimeout(draftDebounceTimer);
      if (activeCropCleanup) activeCropCleanup();
    },
  };
}
