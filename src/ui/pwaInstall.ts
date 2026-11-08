import { h } from "./dom";
import { icon } from "./icons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let isAppInstalled = false;

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const isStandaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
  const isNavStandalone = (window.navigator as any).standalone === true;
  return isStandaloneMedia || isNavStandalone;
}

export function isIosDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = (window.navigator.userAgent || "").toLowerCase();
  const isMobileUa = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(ua);
  const isSmallViewport = window.innerWidth <= 900;
  return isMobileUa || isSmallViewport;
}

export function initPwaInstall(): void {
  if (typeof window === "undefined") return;

  if (isStandalone()) {
    isAppInstalled = true;
  }

  updatePwaButtons(false);
  window.addEventListener("resize", () => updatePwaButtons(Boolean(deferredPrompt)));

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    updatePwaButtons(true);
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    isAppInstalled = true;
    updatePwaButtons(false);
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  (window as any).triggerPwaInstall = triggerPwaInstall;
}

function updatePwaButtons(canInstallPrompt: boolean): void {
  const isMobile = isMobileDevice();
  const buttons = document.querySelectorAll<HTMLElement>(
    "[data-pwa-install-btn], .sidebar-pwa-install-wrap, .top-pwa-btn, .pwa-floating-footer-tab"
  );
  buttons.forEach((btn) => {
    if (isAppInstalled || !isMobile) {
      btn.style.display = "none";
    } else {
      btn.style.display = "";
      if (!canInstallPrompt && !isIosDevice()) {
        btn.setAttribute("title", "Adicionar Miado à tela de início");
      }
    }
  });
}

export async function triggerPwaInstall(): Promise<void> {
  if (isStandalone() || isAppInstalled) {
    showToastNotification("O app Miado já está instalado no seu dispositivo!");
    return;
  }

  if (deferredPrompt) {
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        isAppInstalled = true;
        deferredPrompt = null;
        updatePwaButtons(false);
        showToastNotification("App adicionado à tela inicial com sucesso!");
      }
    } catch {
      // fallback
    }
    return;
  }

  if (isIosDevice()) {
    showIosInstallModal();
    return;
  }

  // Generic fallback instructions modal for Android/Chrome
  showGenericInstallModal();
}

function showToastNotification(text: string): void {
  const toast = document.getElementById("miado-toast");
  if (toast) {
    toast.textContent = text;
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), 3200);
  }
}

function showIosInstallModal(): void {
  let overlay = document.getElementById("modal-pwa-ios-instructions");
  if (!overlay) {
    overlay = h(
      "div",
      {
        id: "modal-pwa-ios-instructions",
        class: "modal-overlay active",
        style: "display:flex; align-items:center; justify-content:center; z-index:9999;",
      },
      h(
        "div",
        {
          class: "modal-dialog",
          style:
            "max-width:440px; padding:24px; border-radius:20px; background:rgba(18,18,24,0.92); border:1px solid rgba(255,255,255,0.15); backdrop-filter:blur(30px); -webkit-backdrop-filter:blur(30px);",
        },
        h(
          "div",
          {
            style:
              "display:flex; align-items:center; justify-content:space-between; margin-bottom:18px;",
          },
          h(
            "div",
            { style: "display:flex; align-items:center; gap:10px;" },
            h("img", {
              src: "/app-logo.jpg?v=3",
              alt: "Logo",
              style: "width:36px; height:36px; border-radius:10px; object-fit:cover;",
              referrerpolicy: "no-referrer",
            }),
            h(
              "h3",
              { style: "margin:0; font-size:1.1rem; font-weight:700; color:#fff;" },
              "Adicionar à Tela de Início"
            )
          ),
          h(
            "button",
            {
              type: "button",
              class: "track-icon-btn",
              onclick: () => overlay?.remove(),
              title: "Fechar",
              style: "border:none; background:transparent; color:#aaa; cursor:pointer;",
            },
            icon("close", 20)
          )
        ),
        h(
          "div",
          { style: "display:flex; flex-direction:column; gap:14px; font-size:0.9rem; color:#ddd;" },
          h(
            "div",
            { style: "display:flex; align-items:flex-start; gap:12px;" },
            h(
              "span",
              {
                style:
                  "background:rgba(147,51,234,0.3); color:#c084fc; font-weight:800; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; flex-shrink:0;",
              },
              "1"
            ),
            h(
              "div",
              null,
              "No Safari, toque no ícone de ",
              h("strong", { style: "color:#fff;" }, "Compartilhar"),
              " (o quadrado com a seta para cima na barra inferior)."
            )
          ),
          h(
            "div",
            { style: "display:flex; align-items:flex-start; gap:12px;" },
            h(
              "span",
              {
                style:
                  "background:rgba(147,51,234,0.3); color:#c084fc; font-weight:800; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; flex-shrink:0;",
              },
              "2"
            ),
            h(
              "div",
              null,
              "Role as opções para baixo e selecione ",
              h("strong", { style: "color:#fff;" }, "Adicionar à Tela de Início"),
              "."
            )
          ),
          h(
            "div",
            { style: "display:flex; align-items:flex-start; gap:12px;" },
            h(
              "span",
              {
                style:
                  "background:rgba(147,51,234,0.3); color:#c084fc; font-weight:800; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; flex-shrink:0;",
              },
              "3"
            ),
            h(
              "div",
              null,
              "Toque em ",
              h("strong", { style: "color:#fff;" }, "Adicionar"),
              " no canto superior direito para abrir o Miado como app."
            )
          )
        ),
        h(
          "button",
          {
            type: "button",
            class: "ob-btn-primary",
            style: "margin-top:20px; width:100%;",
            onclick: () => overlay?.remove(),
          },
          "Entendido"
        )
      )
    );
    document.body.appendChild(overlay);
  } else {
    overlay.style.display = "flex";
  }
}

function showGenericInstallModal(): void {
  let overlay = document.getElementById("modal-pwa-generic-instructions");
  if (!overlay) {
    overlay = h(
      "div",
      {
        id: "modal-pwa-generic-instructions",
        class: "modal-overlay active",
        style: "display:flex; align-items:center; justify-content:center; z-index:9999;",
      },
      h(
        "div",
        {
          class: "modal-dialog",
          style:
            "max-width:440px; padding:24px; border-radius:20px; background:rgba(18,18,24,0.92); border:1px solid rgba(255,255,255,0.15); backdrop-filter:blur(30px); -webkit-backdrop-filter:blur(30px);",
        },
        h(
          "div",
          {
            style:
              "display:flex; align-items:center; justify-content:space-between; margin-bottom:18px;",
          },
          h(
            "div",
            { style: "display:flex; align-items:center; gap:10px;" },
            h("img", {
              src: "/app-logo.jpg?v=3",
              alt: "Logo",
              style: "width:36px; height:36px; border-radius:10px; object-fit:cover;",
              referrerpolicy: "no-referrer",
            }),
            h(
              "h3",
              { style: "margin:0; font-size:1.1rem; font-weight:700; color:#fff;" },
              "Instalar no Celular"
            )
          ),
          h(
            "button",
            {
              type: "button",
              class: "track-icon-btn",
              onclick: () => overlay?.remove(),
              title: "Fechar",
              style: "border:none; background:transparent; color:#aaa; cursor:pointer;",
            },
            icon("close", 20)
          )
        ),
        h(
          "div",
          { style: "display:flex; flex-direction:column; gap:14px; font-size:0.9rem; color:#ddd;" },
          h(
            "div",
            { style: "display:flex; align-items:flex-start; gap:12px;" },
            h(
              "span",
              {
                style:
                  "background:rgba(147,51,234,0.3); color:#c084fc; font-weight:800; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; flex-shrink:0;",
              },
              "1"
            ),
            h(
              "div",
              null,
              "Abra o menu do seu navegador (os 3 pontos verticais ",
              h("strong", { style: "color:#fff;" }, "⋮"),
              " no Chrome ou Opera)."
            )
          ),
          h(
            "div",
            { style: "display:flex; align-items:flex-start; gap:12px;" },
            h(
              "span",
              {
                style:
                  "background:rgba(147,51,234,0.3); color:#c084fc; font-weight:800; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; flex-shrink:0;",
              },
              "2"
            ),
            h(
              "div",
              null,
              "Toque em ",
              h("strong", { style: "color:#fff;" }, "Instalar aplicativo"),
              " ou ",
              h("strong", { style: "color:#fff;" }, "Adicionar à tela inicial"),
              "."
            )
          ),
          h(
            "div",
            { style: "display:flex; align-items:flex-start; gap:12px;" },
            h(
              "span",
              {
                style:
                  "background:rgba(147,51,234,0.3); color:#c084fc; font-weight:800; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; flex-shrink:0;",
              },
              "3"
            ),
            h(
              "div",
              null,
              "Confirme tocando em ",
              h("strong", { style: "color:#fff;" }, "Instalar"),
              ". O ícone do Miado será adicionado à sua tela inicial."
            )
          )
        ),
        h(
          "button",
          {
            type: "button",
            class: "ob-btn-primary",
            style: "margin-top:20px; width:100%;",
            onclick: () => overlay?.remove(),
          },
          "Fechar"
        )
      )
    );
    document.body.appendChild(overlay);
  } else {
    overlay.style.display = "flex";
  }
}
