import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  type User,
} from "firebase/auth";
import { auth } from "../../services/firebaseClient";
import { createField } from "../components/field";
import { createSegmented } from "../components/segmented";
import { createShowcaseWall } from "../components/showcaseWall";
import { h } from "../dom";
import { icon } from "../icons";
import { drawCheck, shake } from "../motion";
import {
  evaluatePasswordStrength,
  FEATURES,
  isValidEmail,
  mapFirebaseError,
  OB_TEXT,
  type AuthMode,
} from "./flow";

export interface AuthStepOptions {
  onboardingRoot: HTMLElement;
  signal: AbortSignal;
  onAuthenticated: (user: User, isNewRegistration: boolean) => void;
}

export interface AuthStepController {
  root: HTMLElement;
  titleEl: HTMLElement;
  focusInitial(): void;
  destroy(): void;
}

export function createAuthStep(opts: AuthStepOptions): AuthStepController {
  let currentMode: AuthMode = "login";
  let isSubmitting = false;

  const wall = createShowcaseWall({
    onboardingRoot: opts.onboardingRoot,
    signal: opts.signal,
  });

  const brandLogo = h(
    "div",
    { class: "ob-brand", dataset: { vt: "ob-logo" } },
    h("span", { class: "ob-brand-mark" }, icon("logo", 24)),
    h("span", { class: "ob-brand-text" }, OB_TEXT.brand)
  );
  brandLogo.style.setProperty("view-transition-name", "ob-logo");

  const titleEl = h(
    "h1",
    {
      class: "ob-step-title",
      tabindex: "-1",
    },
    OB_TEXT.auth.login
  );

  const segmented = createSegmented<AuthMode>({
    items: [
      { value: "login", label: OB_TEXT.auth.login },
      { value: "register", label: OB_TEXT.auth.register },
    ],
    value: "login",
    ariaLabel: OB_TEXT.brand,
    signal: opts.signal,
    onChange: (nextMode) => {
      currentMode = nextMode;
      titleEl.textContent =
        currentMode === "login" ? OB_TEXT.auth.login : OB_TEXT.auth.register;
      passwordField.input.setAttribute(
        "autocomplete",
        currentMode === "login" ? "current-password" : "new-password"
      );
      strengthCollapse.classList.toggle("is-expanded", currentMode === "register");
      emailField.clearError();
      passwordField.clearError();
      globalErrorEl.className = "ob-form-error";
      globalErrorEl.textContent = "";

      if (typeof submitLabel.animate === "function") {
        submitLabel.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 160,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
      }
      submitLabel.textContent =
        currentMode === "login" ? OB_TEXT.auth.login : OB_TEXT.auth.register;
      updateStrengthMeter(passwordField.getValue());
    },
  });

  const strengthBars = [
    h("span", { class: "ob-strength-seg" }),
    h("span", { class: "ob-strength-seg" }),
    h("span", { class: "ob-strength-seg" }),
    h("span", { class: "ob-strength-seg" }),
  ];

  const strengthTrack = h("div", { class: "ob-strength-track", "aria-hidden": "true" }, ...strengthBars);
  const strengthInner = h("div", { class: "ob-strength-inner" }, strengthTrack);
  const strengthCollapse = h("div", { class: "ob-strength-collapse" }, strengthInner);

  const updateStrengthMeter = (pwd: string) => {
    const res = evaluatePasswordStrength(pwd);
    strengthBars.forEach((seg, idx) => {
      seg.classList.toggle("is-filled", idx < res.score);
      seg.dataset.level = String(res.score);
    });
  };

  const emailField = createField({
    id: "ob-auth-email",
    label: OB_TEXT.auth.email,
    type: "email",
    autocomplete: "email",
    inputmode: "email",
    autocapitalize: "off",
    leadingIcon: "mail",
    signal: opts.signal,
    onInput: () => {
      emailField.clearError();
      globalErrorEl.className = "ob-form-error";
      globalErrorEl.textContent = "";
    },
    onEnter: () => {
      passwordField.focus();
    },
  });

  const passwordField = createField({
    id: "ob-auth-password",
    label: OB_TEXT.auth.password,
    type: "password",
    autocomplete: "current-password",
    leadingIcon: "lock",
    showPasswordToggle: true,
    signal: opts.signal,
    onInput: (val) => {
      passwordField.clearError();
      globalErrorEl.className = "ob-form-error";
      globalErrorEl.textContent = "";
      if (currentMode === "register") {
        updateStrengthMeter(val);
      }
    },
    onEnter: () => {
      handleSubmit();
    },
  });

  const globalErrorEl = h("div", {
    class: "ob-form-error",
    "aria-live": "polite",
  });

  const submitLabel = h("span", { class: "ob-btn-label" }, OB_TEXT.auth.login);
  const submitSpinner = h(
    "span",
    { class: "ob-btn-spinner", "aria-hidden": "true" },
    icon("spinner", 20, "is-spinning")
  );
  const submitCheckSvg = icon("check", 20);
  const submitCheckSlot = h(
    "span",
    { class: "ob-btn-check", "aria-hidden": "true" },
    submitCheckSvg
  );

  const submitBtn = h(
    "button",
    {
      type: "button",
      class: "ob-btn-primary",
    },
    submitLabel,
    submitSpinner,
    submitCheckSlot
  ) as HTMLButtonElement;
  submitBtn.style.setProperty("view-transition-name", "ob-primary");

  const setButtonState = (state: "idle" | "loading" | "success") => {
    submitBtn.classList.toggle("is-loading", state === "loading");
    submitBtn.classList.toggle("is-success", state === "success");
    submitBtn.disabled = state !== "idle";
    if (state === "success") {
      const checkPath = submitCheckSvg.querySelector(".ob-icon-check-path") as SVGElement | null;
      drawCheck(checkPath);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const email = emailField.getValue().trim().toLowerCase();
    const password = passwordField.getValue();

    if (!email) {
      emailField.setError(OB_TEXT.errors.required);
      return;
    }
    if (!isValidEmail(email)) {
      emailField.setError(OB_TEXT.errors.invalidEmail);
      return;
    }
    if (!password) {
      passwordField.setError(OB_TEXT.errors.required);
      return;
    }
    if (currentMode === "register" && password.length < 10) {
      passwordField.setError(OB_TEXT.errors.weakPassword);
      return;
    }

    isSubmitting = true;
    setButtonState("loading");
    globalErrorEl.className = "ob-form-error";
    globalErrorEl.textContent = "";

    try {
      if (currentMode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        try {
          await sendEmailVerification(cred.user);
        } catch {}
        setButtonState("success");
        setTimeout(() => {
          opts.onAuthenticated(cred.user, true);
        }, 220);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        setButtonState("success");
        setTimeout(() => {
          opts.onAuthenticated(cred.user, false);
        }, 220);
      }
    } catch (err) {
      isSubmitting = false;
      setButtonState("idle");
      const msg = mapFirebaseError(err);
      globalErrorEl.className = "ob-form-error is-visible";
      globalErrorEl.textContent = msg;
      shake(cardEl);
    }
  };

  submitBtn.addEventListener("click", handleSubmit, { signal: opts.signal });

  const googleBtn = h(
    "button",
    {
      type: "button",
      class: "ob-btn-social",
    },
    icon("google", 20),
    h("span", null, OB_TEXT.auth.google)
  ) as HTMLButtonElement;

  googleBtn.addEventListener(
    "click",
    async () => {
      if (isSubmitting) return;
      isSubmitting = true;
      googleBtn.disabled = true;
      globalErrorEl.className = "ob-form-error";
      globalErrorEl.textContent = "";

      const provider = new GoogleAuthProvider();
      try {
        const cred = await signInWithPopup(auth, provider);
        opts.onAuthenticated(cred.user, false);
      } catch (err: any) {
        const code = String(err?.code || "").toLowerCase();
        if (
          code.includes("auth/popup-blocked") ||
          code.includes("auth/operation-not-supported-in-this-environment")
        ) {
          try {
            await signInWithRedirect(auth, provider);
            return;
          } catch (redirErr) {
            isSubmitting = false;
            googleBtn.disabled = false;
            globalErrorEl.className = "ob-form-error is-visible";
            globalErrorEl.textContent = mapFirebaseError(redirErr);
            return;
          }
        }
        isSubmitting = false;
        googleBtn.disabled = false;
        globalErrorEl.className = "ob-form-error is-visible";
        globalErrorEl.textContent = mapFirebaseError(err);
      }
    },
    { signal: opts.signal }
  );

  const socialGrid = h(
    "div",
    {
      class: `ob-social-grid ${FEATURES.appleAuth ? "has-two" : "has-one"}`,
    },
    googleBtn
  );

  if (FEATURES.appleAuth) {
    const appleBtn = h(
      "button",
      {
        type: "button",
        class: "ob-btn-social",
      },
      icon("apple", 20),
      h("span", null, OB_TEXT.auth.apple)
    );
    socialGrid.appendChild(appleBtn);
  }

  const divider = h(
    "div",
    { class: "ob-divider" },
    h("span", { class: "ob-divider-line" }),
    h("span", { class: "ob-divider-text" }, OB_TEXT.auth.or),
    h("span", { class: "ob-divider-line" })
  );

  const cardChildren: HTMLElement[] = [
    brandLogo,
    titleEl,
    segmented.root,
    emailField.root,
    passwordField.root,
    strengthCollapse,
    globalErrorEl,
    submitBtn,
    divider,
    socialGrid,
  ];

  cardChildren.forEach((child, idx) => {
    child.style.setProperty("--i", String(idx));
    child.classList.add("ob-stagger-child");
  });

  const cardEl = h("div", { class: "ob-glass-card ob-auth-card" }, ...cardChildren);

  const rightCol = h("div", { class: "ob-auth-right-col" }, cardEl);

  const root = h("section", { class: "ob-step-auth" }, wall.root, rightCol);

  return {
    root,
    titleEl,
    focusInitial() {
      emailField.focus();
    },
    destroy() {
      wall.destroy();
    },
  };
}
