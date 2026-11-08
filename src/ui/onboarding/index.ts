import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../services/firebaseClient";
import { h } from "../dom";
import { stepTransition } from "../motion";
import {
  clearOnboardingDraft,
  isValidHandle,
  normalizeHandle,
  resolveInitialStep,
  saveOnboardingDraft,
  type OnboardingStep,
} from "./flow";
import { createAuthStep } from "./authStep";
import { createProfileStep } from "./profileStep";
import { createArtistsStep } from "./artistsStep";

export interface OnboardingMountOptions {
  onComplete?: (uid: string) => void;
}

export function mountOnboarding(
  container: HTMLElement,
  options: OnboardingMountOptions = {}
): () => void {
  const rootAbort = new AbortController();
  let stepAbort: AbortController | null = null;
  let activeStepDestroy: (() => void) | null = null;
  let activeStepEl: HTMLElement | null = null;
  let currentStepId: OnboardingStep | null = null;
  let isTransitioning = false;
  let unmounted = false;

  const light1 = h("div", { class: "ob-light ob-light-1" });
  const light2 = h("div", { class: "ob-light ob-light-2" });
  const light3 = h("div", { class: "ob-light ob-light-3" });
  const noiseLayer = h("div", { class: "ob-noise-layer" });

  const ambientStage = h(
    "div",
    { class: "ob-ambient-stage", "aria-hidden": "true" },
    light1,
    light2,
    light3,
    noiseLayer
  );

  const stageEl = h("main", { class: "ob-stage" });
  const rootEl = h("div", { class: "ob-root" }, ambientStage, stageEl);

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  container.appendChild(rootEl);

  const cleanupActiveStep = () => {
    if (stepAbort) {
      stepAbort.abort();
      stepAbort = null;
    }
    if (activeStepDestroy) {
      try {
        activeStepDestroy();
      } catch {
        // ignore cleanup error
      }
      activeStepDestroy = null;
    }
  };

  const inspectUserOnboardingStep = async (
    user: User | null,
    isExplicitLogin = false
  ): Promise<{ step: OnboardingStep; existingHandle?: string }> => {
    if (!user) return { step: "auth" };
    try {
      const [userSnap, profileSnap] = await Promise.all([
        getDoc(doc(db, "users", user.uid)).catch(() => null),
        getDoc(doc(db, "profiles", user.uid)).catch(() => null),
      ]);
      const userData = userSnap && userSnap.exists() ? userSnap.data() : null;
      const profileData = profileSnap && profileSnap.exists() ? profileSnap.data() : null;

      const w = window as any;
      const stateUser = w.miadoState?.user;
      const stateHasEmail = Boolean(
        stateUser?.email &&
          stateUser.email !== "usr_guest@miado.app" &&
          (!user.email || stateUser.email.toLowerCase() === user.email.toLowerCase())
      );

      const rawHandle = String(
        profileData?.handle ||
          userData?.handle ||
          (stateHasEmail ? stateUser?.username || stateUser?.handle : "") ||
          ""
      );
      const bareHandle = normalizeHandle(rawHandle);
      const rawName = String(
        profileData?.name ||
          userData?.name ||
          (stateHasEmail && stateUser?.name !== "Visitante" ? stateUser?.name : "") ||
          user.displayName ||
          ""
      ).trim();

      const hasProfile = Boolean(
        ((profileSnap && profileSnap.exists()) || (userSnap && userSnap.exists()) || stateHasEmail) &&
          isValidHandle(bareHandle) &&
          rawName.length >= 1
      );
      const onboardingCompleted = Boolean(
        (userData && userData.onboardingCompleted === true) ||
          (isExplicitLogin && hasProfile) ||
          (stateHasEmail && stateUser?.onboardingCompleted === true)
      );

      if (hasProfile && !onboardingCompleted) {
        saveOnboardingDraft({
          name: rawName,
          handle: bareHandle,
          bio: String(profileData?.bio || userData?.bio || ""),
          catId: String(userData?.catId || "cat_1"),
          avatarUrl: String(
            profileData?.avatarUrl || userData?.avatarUrl || "/api/cat-avatar?id=cat_1"
          ),
        });
      }

      if (isExplicitLogin && (hasProfile || userSnap?.exists() || profileSnap?.exists() || stateHasEmail)) {
        return { step: "done", existingHandle: bareHandle };
      }

      const step = resolveInitialStep({
        isAuthenticated: true,
        hasProfile,
        handle: bareHandle,
        onboardingCompleted,
      });

      return { step, existingHandle: bareHandle };
    } catch {
      return { step: isExplicitLogin ? "done" : "profile" };
    }
  };

  const finishOnboarding = async (user: User | null) => {
    if (unmounted) return;
    clearOnboardingDraft();
    localStorage.setItem("miado_active_session_v1", "true");
    localStorage.setItem("miado_user_onboarded_v1", "true");
    if (user?.uid) {
      localStorage.setItem("miado_user_uid", user.uid);
    }
    const welcomeEl = document.getElementById("miado-welcome-screen");
    if (welcomeEl) {
      welcomeEl.classList.remove("active", "closing");
    }
    rootEl.classList.add("is-exiting");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 200));
    const uid = user?.uid || "";
    unmount();
    if (options.onComplete) {
      options.onComplete(uid);
    }
  };

  const renderStep = async (
    nextStep: OnboardingStep,
    direction: "forward" | "back",
    userOverride?: User | null,
    existingHandle?: string
  ) => {
    if (unmounted) return;
    if (nextStep === "done") {
      await finishOnboarding(userOverride !== undefined ? userOverride : auth.currentUser);
      return;
    }
    if (isTransitioning) return;

    isTransitioning = true;
    const prevEl = activeStepEl;
    cleanupActiveStep();

    stepAbort = new AbortController();
    const signal = stepAbort.signal;
    const activeUser = userOverride !== undefined ? userOverride : auth.currentUser;

    let nextRoot: HTMLElement;
    let nextTitleEl: HTMLElement;
    let focusInitialFn: (() => void) | null = null;

    if (nextStep === "auth") {
      const ctrl = createAuthStep({
        onboardingRoot: rootEl,
        signal,
        onAuthenticated: async (authedUser, isNewRegistration) => {
          if (unmounted) return;
          isTransitioning = false;
          if (isNewRegistration) {
            saveOnboardingDraft({ step: "profile" });
            await renderStep("profile", "forward", authedUser);
            return;
          }
          const w = window as any;
          if (w.miadoFirestore && typeof w.miadoFirestore.hydrateCurrentUser === "function") {
            try {
              await w.miadoFirestore.hydrateCurrentUser();
            } catch {}
          }
          const inspected = await inspectUserOnboardingStep(authedUser, true);
          await renderStep(inspected.step, "forward", authedUser, inspected.existingHandle);
        },
      });
      nextRoot = ctrl.root;
      nextTitleEl = ctrl.titleEl;
      focusInitialFn = () => ctrl.focusInitial();
      activeStepDestroy = () => ctrl.destroy();
    } else if (nextStep === "profile") {
      if (!activeUser) {
        isTransitioning = false;
        await renderStep("auth", "back", null);
        return;
      }
      const ctrl = createProfileStep({
        user: activeUser,
        onboardingRoot: rootEl,
        existingHandle,
        signal,
        onNext: () => {
          saveOnboardingDraft({ step: "artists" });
          void renderStep("artists", "forward", activeUser);
        },
      });
      nextRoot = ctrl.root;
      nextTitleEl = ctrl.titleEl;
      activeStepDestroy = () => ctrl.destroy();
    } else {
      if (!activeUser) {
        isTransitioning = false;
        await renderStep("auth", "back", null);
        return;
      }
      const ctrl = createArtistsStep({
        user: activeUser,
        onboardingRoot: rootEl,
        signal,
        onBack: () => {
          void renderStep("profile", "back", activeUser, existingHandle);
        },
        onComplete: () => {
          void renderStep("done", "forward", activeUser);
        },
      });
      nextRoot = ctrl.root;
      nextTitleEl = ctrl.titleEl;
      activeStepDestroy = () => ctrl.destroy();
    }

    activeStepEl = nextRoot;
    currentStepId = nextStep;

    if (prevEl && prevEl !== nextRoot) {
      await stepTransition(prevEl, nextRoot, direction, () => {
        if (prevEl.parentNode === stageEl) {
          stageEl.removeChild(prevEl);
        }
        stageEl.appendChild(nextRoot);
      });
    } else {
      stageEl.appendChild(nextRoot);
    }

    isTransitioning = false;
    queueMicrotask(() => {
      try {
        if (nextStep === "auth" && focusInitialFn) {
          focusInitialFn();
        } else {
          nextTitleEl.focus();
        }
      } catch {
        // ignore focus error
      }
    });
  };

  const unsubAuth = onAuthStateChanged(auth, async (user) => {
    if (unmounted) return;
    if (!currentStepId) {
      const inspected = await inspectUserOnboardingStep(user, false);
      await renderStep(inspected.step, "forward", user, inspected.existingHandle);
    }
  });

  const unmount = () => {
    if (unmounted) return;
    unmounted = true;
    rootAbort.abort();
    unsubAuth();
    cleanupActiveStep();
    if (rootEl.parentNode) {
      rootEl.parentNode.removeChild(rootEl);
    }
  };

  return unmount;
}
