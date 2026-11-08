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
