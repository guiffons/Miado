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

function bootstrapMiadoApp() {
  const w = window as any;
  w.miadoPlaceholder = createGlassPlaceholderDataUri;
  w.miadoDom = { escapeHtml, safeUrl, h, bindImageFallback, createCarousel };

  let activeOnboardingUnmount: (() => void) | null = null;

  const ensureOnboardingContainer = (): HTMLElement => {
    let el = document.getElementById("miado-onboarding-root");
    if (!el) {
      el = h("div", { id: "miado-onboarding-root" });
      document.body.appendChild(el);
    }
    return el;
  };

  w.miadoMountOnboarding = () => {
    if (activeOnboardingUnmount) {
      return activeOnboardingUnmount;
    }
    const container = ensureOnboardingContainer();
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

  initFirebaseClient();
  initMiadoClient();
  initEnhancements();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapMiadoApp, { once: true });
} else {
  bootstrapMiadoApp();
}
