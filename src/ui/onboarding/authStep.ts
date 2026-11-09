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
import { icon, MIADO_CAT_LOGO_DATA_URI } from "../icons";
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
      forgotRowEl.style.display = currentMode === "login" ? "flex" : "none";
      if (currentMode === "register") {
        closeForgotPasswordPanel();
      }
      updateStrengthMeter(passwordField.getValue());
    },
  });

  const strengthBars = [
    h("span", { class: "ob-strength-seg" }),
    h("span", { class: "ob-strength-seg" }),
    h("span", { class: "ob-strength-seg" }),
    h("span", { class: "ob-strength-seg" }),
  ];

  const strengthReasonEl = h("div", {
    class: "ob-strength-reason",
    style:
      "margin-top:6px; font-size:0.76rem; line-height:1.4; font-weight:600; color:rgba(255,255,255,0.78);",
    "aria-live": "polite",
  });

  const strengthTrack = h("div", { class: "ob-strength-track", "aria-hidden": "true" }, ...strengthBars);
  const strengthInner = h("div", { class: "ob-strength-inner" }, strengthTrack, strengthReasonEl);
  const strengthCollapse = h("div", { class: "ob-strength-collapse" }, strengthInner);

  const updateStrengthMeter = (pwd: string) => {
    const res = evaluatePasswordStrength(pwd);
    strengthBars.forEach((seg, idx) => {
      seg.classList.toggle("is-filled", idx < res.score);
      seg.dataset.level = String(res.score);
    });
    strengthReasonEl.textContent = res.reason;
    strengthReasonEl.style.color = !pwd
      ? "rgba(255,255,255,0.68)"
      : res.valid
        ? "#4ade80"
        : "#fca5a5";
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
      if (isEmailValidated) {
        syncEmailValidationState(false);
        forgotStatusBanner.style.display = "none";
        forgotStatusBanner.textContent = "";
        forgotSendCodeBtn.textContent = "Enviar código para o meu e-mail";
      }
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
      if (currentMode === "register" || strengthCollapse.classList.contains("is-expanded")) {
        updateStrengthMeter(val);
      }
    },
    onEnter: () => {
      handleSubmit();
    },
  });

  // --- Fluxo Funcional de "Esqueci minha senha" com Estado de Verificação (isEmailValidated) ---
  let isEmailValidated = false;
  let currentEmailPreviewUrl = "";

  const forgotToggleBtn = h(
    "button",
    {
      type: "button",
      style:
        "background:transparent; border:none; color:#d8b4fe; font-size:0.78rem; font-weight:700; cursor:pointer; padding:2px 0; text-decoration:underline; text-underline-offset:3px;",
    },
    "Esqueci minha senha"
  ) as HTMLButtonElement;

  const forgotRowEl = h(
    "div",
    {
      style: "display:flex; justify-content:flex-end; margin-top:-4px; margin-bottom:2px;",
    },
    forgotToggleBtn
  );

  const forgotStatusBanner = h("div", {
    style:
      "display:none; padding:10px 12px; border-radius:10px; font-size:0.78rem; font-weight:600; line-height:1.45; background:rgba(168,85,247,0.16); border:1px solid rgba(192,132,252,0.4); color:#e9d5ff;",
  });

  const forgotOpenEmailPreviewBtn = h(
    "button",
    {
      type: "button",
      style: "display:none !important;",
    }
  ) as HTMLButtonElement;

  const forgotCodeInput = h("input", {
    type: "text",
    inputmode: "numeric",
    maxlength: "6",
    placeholder: "000000",
    style:
      "width:100%; height:46px; text-align:center; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:1.35rem; font-weight:800; letter-spacing:0.35em; border-radius:10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.18); color:#ffffff; outline:none; transition:border-color 0.2s ease;",
  }) as HTMLInputElement;

  const forgotNewPassInput = h("input", {
    type: "password",
    placeholder: "Mínimo 6 caracteres",
    autocomplete: "new-password",
    style:
      "width:100%; height:42px; padding:0 12px; border-radius:10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.18); color:#ffffff; font-size:0.86rem; outline:none;",
  }) as HTMLInputElement;

  const forgotPassHintEl = h("div", {
    style: "font-size:0.72rem; font-weight:500; margin-top:4px; min-height:16px;",
  });

  forgotNewPassInput.addEventListener(
    "input",
    () => {
      const st = evaluatePasswordStrength(forgotNewPassInput.value);
      forgotPassHintEl.textContent = st.reason;
      forgotPassHintEl.style.color = st.valid ? "#4ade80" : "#fca5a5";
    },
    { signal: opts.signal }
  );

  const forgotSendCodeBtn = h(
    "button",
    {
      type: "button",
      style:
        "width:100%; height:42px; border-radius:12px; background:linear-gradient(135deg, #a855f7 0%, #ec4899 100%); border:none; color:#ffffff; font-size:0.86rem; font-weight:700; cursor:pointer; transition:transform 0.15s ease, opacity 0.15s ease;",
    },
    "Enviar código de recuperação"
  ) as HTMLButtonElement;

  const forgotConfirmBtn = h(
    "button",
    {
      type: "button",
      style:
        "width:100%; height:44px; border-radius:12px; background:linear-gradient(135deg, #a855f7 0%, #ec4899 100%); border:none; color:#ffffff; font-size:0.88rem; font-weight:800; cursor:pointer;",
    },
    "Redefinir senha e entrar"
  ) as HTMLButtonElement;

  const forgotResendBtn = h(
    "button",
    {
      type: "button",
      style:
        "background:transparent; border:none; color:#d8b4fe; font-size:0.76rem; font-weight:600; cursor:pointer; padding:4px 8px; text-decoration:underline; text-underline-offset:3px;",
    },
    "Não recebeu? Reenviar código"
  ) as HTMLButtonElement;

  forgotResendBtn.addEventListener(
    "click",
    () => {
      forgotSendCodeBtn.click();
    },
    { signal: opts.signal }
  );

  const forgotCancelBtn = h(
    "button",
    {
      type: "button",
      style:
        "background:transparent; border:none; color:rgba(255,255,255,0.65); font-size:0.78rem; font-weight:600; cursor:pointer; padding:6px 12px; display:inline-flex; align-items:center; gap:6px;",
    },
    "← Voltar ao login"
  ) as HTMLButtonElement;

  // Container de código de 6 dígitos com display: none por padrão (controlado estritamente por isEmailValidated)
  const forgotStep2Wrap = h(
    "div",
    {
      style: "display:none; flex-direction:column; gap:12px;",
      dataset: { emailValidated: "false" },
    },
    forgotOpenEmailPreviewBtn,
    h(
      "div",
      null,
      h(
        "label",
        {
          style:
            "display:block; font-size:0.74rem; font-weight:700; color:rgba(255,255,255,0.7); margin-bottom:5px; text-transform:uppercase; letter-spacing:0.06em;",
        },
        "Código de 6 dígitos"
      ),
      forgotCodeInput
    ),
    h(
      "div",
      null,
      h(
        "label",
        {
          style:
            "display:block; font-size:0.74rem; font-weight:700; color:rgba(255,255,255,0.7); margin-bottom:5px; text-transform:uppercase; letter-spacing:0.06em;",
        },
        "Nova senha"
      ),
      forgotNewPassInput,
      forgotPassHintEl
    ),
    forgotConfirmBtn,
    h("div", { style: "display:flex; justify-content:center; margin-top:2px;" }, forgotResendBtn)
  );

  const syncEmailValidationState = (validated: boolean, previewUrl = "") => {
    isEmailValidated = Boolean(validated);
    currentEmailPreviewUrl = isEmailValidated ? previewUrl : "";
    forgotStep2Wrap.dataset.emailValidated = isEmailValidated ? "true" : "false";
    forgotStep2Wrap.style.display = isEmailValidated ? "flex" : "none";
    forgotSendCodeBtn.style.display = isEmailValidated ? "none" : "block";
    forgotOpenEmailPreviewBtn.style.display = "none";
    if (!isEmailValidated) {
      forgotCodeInput.value = "";
      forgotNewPassInput.value = "";
      forgotPassHintEl.textContent = "";
    }
  };

  const forgotPanelEl = h(
    "div",
    {
      class: "auth-forgot-password-panel",
      style:
        "display:none; flex-direction:column; gap:12px; padding:16px 18px; border-radius:16px; background:rgba(22, 14, 38, 0.88); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); border:1px solid rgba(168, 85, 247, 0.28); box-shadow:0 12px 36px rgba(0,0,0,0.45);",
    },
    h(
      "div",
      { style: "display:flex; flex-direction:column; gap:4px;" },
      h(
        "div",
        { style: "display:flex; align-items:center; gap:8px;" },
        h("img", {
          src: MIADO_CAT_LOGO_DATA_URI,
          alt: "Miado Logo",
          style: "width:20px; height:20px; border-radius:6px; object-fit:cover;",
        }),
        h(
          "div",
          { style: "font-size:0.95rem; font-weight:800; color:#f3e8ff; letter-spacing:-0.01em;" },
          "Recuperar Senha"
        )
      ),
      h(
        "div",
        { style: "font-size:0.78rem; color:rgba(255,255,255,0.65); line-height:1.45;" },
        "Informe seu e-mail acima para receber o código e link de recuperação."
      )
    ),
    forgotStatusBanner,
    forgotSendCodeBtn,
    forgotStep2Wrap,
    h("div", { style: "display:flex; justify-content:center; margin-top:2px;" }, forgotCancelBtn)
  );

  const closeForgotPasswordPanel = () => {
    syncEmailValidationState(false);
    forgotStatusBanner.style.display = "none";
    forgotStatusBanner.textContent = "";
    forgotSendCodeBtn.disabled = false;
    forgotSendCodeBtn.style.display = "block";
    forgotSendCodeBtn.textContent = "Enviar código de recuperação";
    forgotPanelEl.style.display = "none";
    passwordField.root.style.display = "";
    submitBtn.style.display = "";
    forgotRowEl.style.display = currentMode === "login" ? "flex" : "none";
  };

  forgotToggleBtn.addEventListener(
    "click",
    () => {
      syncEmailValidationState(false);
      forgotStatusBanner.style.display = "none";
      forgotStatusBanner.textContent = "";
      globalErrorEl.className = "ob-form-error";
      globalErrorEl.textContent = "";
      forgotPanelEl.style.display = "flex";
      passwordField.root.style.display = "none";
      submitBtn.style.display = "none";
      forgotRowEl.style.display = "none";
      if (!emailField.getValue().trim()) {
        emailField.focus();
      }
    },
    { signal: opts.signal }
  );

  forgotCancelBtn.addEventListener("click", closeForgotPasswordPanel, { signal: opts.signal });

  forgotSendCodeBtn.addEventListener(
    "click",
    async () => {
      const email = emailField.getValue().trim().toLowerCase();
      syncEmailValidationState(false);
      forgotStatusBanner.style.display = "none";
      forgotStatusBanner.textContent = "";
      globalErrorEl.className = "ob-form-error";
      globalErrorEl.textContent = "";

      if (!email || !isValidEmail(email)) {
        emailField.setError("Digite seu e-mail cadastrado acima para receber o código.");
        emailField.focus();
        return;
      }

      forgotSendCodeBtn.disabled = true;
      forgotSendCodeBtn.textContent = "Verificando conta e enviando e-mail...";

      try {
        const w = window as any;
        let data: any = null;
        if (w.miadoFirestore && typeof w.miadoFirestore.sendPasswordReset === "function") {
          data = await w.miadoFirestore.sendPasswordReset(email);
        } else {
          const res = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          data = await res.json().catch(() => null);
          if (!res.ok || !data?.ok || !data?.isEmailValidated) {
            const err: any = new Error(
              data?.error || "Nenhuma conta cadastrada com este e-mail. Crie uma conta primeiro."
            );
            err.code = data?.errorCode || "auth/user-not-found";
            throw err;
          }
        }

        if (!data || !data.ok || !data.isEmailValidated) {
          throw new Error(
            data?.error || "Nenhuma conta cadastrada com este e-mail. Crie uma conta primeiro."
          );
        }

        // Somente APÓS a promessa do servidor + Firebase resolver positivamente, ativamos isEmailValidated = true
        syncEmailValidationState(true, String(data.emailPreviewUrl || ""));
        forgotStatusBanner.style.display = "block";
        forgotStatusBanner.textContent =
          data.message ||
          `Código de verificação enviado para ${email}. Verifique sua caixa de entrada e spam.`;
        forgotSendCodeBtn.disabled = false;
        forgotSendCodeBtn.textContent = "Enviar código de recuperação";
        forgotCodeInput.focus();
      } catch (err: any) {
        syncEmailValidationState(false);
        const errMsg = mapFirebaseError(err);
        globalErrorEl.className = "ob-form-error is-visible";
        globalErrorEl.textContent = errMsg;
        forgotSendCodeBtn.disabled = false;
        forgotSendCodeBtn.textContent = "Enviar código de recuperação";
        shake(cardEl);
      }
    },
    { signal: opts.signal }
  );

  forgotConfirmBtn.addEventListener(
    "click",
    async () => {
      if (!isEmailValidated) {
        globalErrorEl.className = "ob-form-error is-visible";
        globalErrorEl.textContent = "Valide seu e-mail e solicite o código antes de redefinir a senha.";
        return;
      }
      const email = emailField.getValue().trim().toLowerCase();
      const code = forgotCodeInput.value.trim();
      const newPassword = forgotNewPassInput.value;
      if (!email || !isValidEmail(email)) {
        emailField.setError(OB_TEXT.errors.invalidEmail);
        return;
      }
      if (!code || code.length !== 6) {
        globalErrorEl.className = "ob-form-error is-visible";
        globalErrorEl.textContent = "Digite o código de 6 dígitos recebido no seu e-mail.";
        return;
      }
      const st = evaluatePasswordStrength(newPassword);
      if (!st.valid) {
        forgotPassHintEl.textContent = st.reason;
        forgotPassHintEl.style.color = "#fca5a5";
        globalErrorEl.className = "ob-form-error is-visible";
        globalErrorEl.textContent = st.reason;
        return;
      }
      forgotConfirmBtn.disabled = true;
      forgotConfirmBtn.textContent = "Salvando nova senha...";
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code, newPassword }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          globalErrorEl.className = "ob-form-error is-visible";
          globalErrorEl.textContent = data?.error || "Código inválido ou expirado.";
          forgotConfirmBtn.disabled = false;
          forgotConfirmBtn.textContent = "Redefinir senha e entrar";
          return;
        }
        if (data.token) {
          localStorage.setItem("miado_auth_token", String(data.token));
        }
        const resolvedUid = String(data.account?.uid || data.user?.uid || `usr_${Date.now()}`);
        localStorage.setItem("miado_user_uid", resolvedUid);
        localStorage.setItem("miado_active_session_v1", "true");
        localStorage.setItem("miado_user_onboarded_v1", "true");
        const w = window as any;
        if (w.miadoState && typeof w.miadoState.applyAccountPayload === "function") {
          w.miadoState.applyAccountPayload(data);
        }
        const activeUser = {
          uid: resolvedUid,
          email,
          displayName: String(data.user?.name || email.split("@")[0]),
          emailVerified: true,
          photoURL: String(data.user?.avatarUrl || "/api/cat-avatar?id=cat_1"),
          providerData: [],
          getIdToken: async () => String(data.token || ""),
        } as unknown as User;
        closeForgotPasswordPanel();
        setButtonState("success");
        opts.onAuthenticated(activeUser, false);
      } catch {
        globalErrorEl.className = "ob-form-error is-visible";
        globalErrorEl.textContent = "Erro de conexão ao redefinir a senha.";
        forgotConfirmBtn.disabled = false;
        forgotConfirmBtn.textContent = "Redefinir senha e entrar";
      }
    },
    { signal: opts.signal }
  );

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

  const syncBackendAuthSession = async (
    mode: AuthMode,
    email: string,
    password: string,
    fbUser?: User | null
  ): Promise<any> => {
    try {
      const token = fbUser ? await fbUser.getIdToken().catch(() => "") : "";
      if (token) {
        localStorage.setItem("miado_auth_token", token);
      }
      if (fbUser?.uid) {
        localStorage.setItem("miado_user_uid", fbUser.uid);
      }
      localStorage.setItem("miado_active_session_v1", "true");
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email,
          password,
          name: fbUser?.displayName || email.split("@")[0] || "Ouvinte",
        }),
      });
      const data = await res.json().catch(() => null);
      if (data && data.ok) {
        if (data.token) {
          localStorage.setItem("miado_auth_token", String(data.token));
        }
        const resolvedUid = String(data.account?.uid || data.user?.uid || fbUser?.uid || "");
        if (resolvedUid) {
          localStorage.setItem("miado_user_uid", resolvedUid);
        }
        const w = window as any;
        if (w.miadoState && typeof w.miadoState.applyAccountPayload === "function") {
          w.miadoState.applyAccountPayload(data);
        }
        return data;
      }
    } catch {}
    return null;
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
    const strength = evaluatePasswordStrength(password);
    if (currentMode === "register" && !strength.valid) {
      strengthCollapse.classList.add("is-expanded");
      updateStrengthMeter(password);
      passwordField.setError(strength.reason);
      globalErrorEl.className = "ob-form-error is-visible";
      globalErrorEl.textContent = strength.reason;
      shake(cardEl);
      return;
    }

    isSubmitting = true;
    setButtonState("loading");
    globalErrorEl.className = "ob-form-error";
    globalErrorEl.textContent = "";

    const w = window as any;

    try {
      if (currentMode === "register") {
        if (w.miadoFirestore && typeof w.miadoFirestore.registerWithEmail === "function") {
          try {
            const fbRes = await w.miadoFirestore.registerWithEmail(
              email,
              password,
              email.split("@")[0] || "Ouvinte",
              `@${(email.split("@")[0] || "ouvinte").replace(/[^a-z0-9_.]/g, "")}`
            );
            if (fbRes && (fbRes.ok || fbRes.user || fbRes.token)) {
              const backendData = await syncBackendAuthSession("register", email, password, auth.currentUser);
              const isExisting = Boolean(
                fbRes.linkedToGoogleAccount ||
                  fbRes.isExistingAccount ||
                  backendData?.linkedToGoogleAccount ||
                  backendData?.isExistingAccount
              );
              const activeUser =
                auth.currentUser ||
                ({
                  uid: String(fbRes.uid || backendData?.account?.uid || `usr_${Date.now()}`),
                  email,
                  displayName: String(backendData?.user?.name || fbRes.user?.name || email.split("@")[0]),
                  emailVerified: true,
                  photoURL: String(backendData?.user?.avatarUrl || "/api/cat-avatar?id=cat_1"),
                  providerData: [],
                  getIdToken: async () => String(fbRes.token || backendData?.token || ""),
                } as unknown as User);
              setButtonState("success");
              opts.onAuthenticated(activeUser, !isExisting);
              return;
            }
          } catch (fbRegErr: any) {
            const c = String(fbRegErr?.code || "").toLowerCase();
            if (c.includes("email-already-in-use") || c.includes("weak-password")) {
              throw fbRegErr;
            }
          }
        }

        const backendReg = await syncBackendAuthSession("register", email, password, null);
        if (backendReg && backendReg.ok) {
          const fakeUser = {
            uid: String(backendReg.account?.uid || backendReg.user?.uid || `usr_${Date.now()}`),
            email,
            displayName: String(backendReg.user?.name || email.split("@")[0]),
            emailVerified: true,
            photoURL: String(backendReg.user?.avatarUrl || "/api/cat-avatar?id=cat_1"),
            providerData: [],
            getIdToken: async () => String(backendReg.token || ""),
          } as unknown as User;
          setButtonState("success");
          opts.onAuthenticated(fakeUser, !backendReg.linkedToGoogleAccount && !backendReg.isExistingAccount);
          return;
        }

        const loginFallback = await syncBackendAuthSession("login", email, password, null);
        if (loginFallback && loginFallback.ok) {
          localStorage.setItem("miado_user_onboarded_v1", "true");
          const fakeUser = {
            uid: String(loginFallback.account?.uid || loginFallback.user?.uid || `usr_${Date.now()}`),
            email,
            displayName: String(loginFallback.user?.name || email.split("@")[0]),
            emailVerified: true,
            photoURL: String(loginFallback.user?.avatarUrl || "/api/cat-avatar?id=cat_1"),
            providerData: [],
            getIdToken: async () => String(loginFallback.token || ""),
          } as unknown as User;
          setButtonState("success");
          opts.onAuthenticated(fakeUser, false);
          return;
        }

        const dupErr: any = new Error("Este e-mail já está cadastrado. Use a aba Entrar.");
        dupErr.code = "auth/email-already-in-use";
        throw dupErr;
      } else {
        // LOGIN MODE
        if (
          auth.currentUser &&
          auth.currentUser.email &&
          auth.currentUser.email.toLowerCase() === email &&
          !strength.valid
        ) {
          strengthCollapse.classList.add("is-expanded");
          updateStrengthMeter(password);
          passwordField.setError(strength.reason);
          globalErrorEl.className = "ob-form-error is-visible";
          globalErrorEl.textContent = strength.reason;
          isSubmitting = false;
          setButtonState("idle");
          shake(cardEl);
          return;
        }

        if (w.miadoFirestore && typeof w.miadoFirestore.loginWithEmail === "function") {
          const fbRes = await w.miadoFirestore.loginWithEmail(email, password);
          if (fbRes && (fbRes.ok || fbRes.user || fbRes.token)) {
            const backendData = await syncBackendAuthSession("login", email, password, auth.currentUser);
            localStorage.setItem("miado_user_onboarded_v1", "true");
            const activeUser =
              auth.currentUser ||
              ({
                uid: String(fbRes.uid || backendData?.account?.uid || `usr_${Date.now()}`),
                email,
                displayName: String(backendData?.user?.name || fbRes.user?.name || email.split("@")[0]),
                emailVerified: true,
                photoURL: String(backendData?.user?.avatarUrl || "/api/cat-avatar?id=cat_1"),
                providerData: [],
                getIdToken: async () => String(fbRes.token || backendData?.token || ""),
              } as unknown as User);
            setButtonState("success");
            opts.onAuthenticated(activeUser, false);
            return;
          }
        }

        const backendData = await syncBackendAuthSession("login", email, password, null);
        if (backendData && backendData.ok) {
          localStorage.setItem("miado_user_onboarded_v1", "true");
          const fakeUser = {
            uid: String(backendData.account?.uid || backendData.user?.uid || `usr_${Date.now()}`),
            email,
            displayName: String(backendData.user?.name || email.split("@")[0]),
            emailVerified: true,
            photoURL: String(backendData.user?.avatarUrl || "/api/cat-avatar?id=cat_1"),
            providerData: [],
            getIdToken: async () => String(backendData.token || ""),
          } as unknown as User;
          setButtonState("success");
          opts.onAuthenticated(fakeUser, false);
          return;
        }

        const loginErr: any = new Error("E-mail ou senha incorretos");
        loginErr.code = "auth/invalid-credential";
        throw loginErr;
      }
    } catch (err) {
      isSubmitting = false;
      setButtonState("idle");
      const msg = !strength.valid && String((err as any)?.code || "").includes("weak-password")
        ? strength.reason
        : mapFirebaseError(err);
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

      const w = window as any;
      if (w.miadoFirestore && typeof w.miadoFirestore.loginWithGoogle === "function") {
        try {
          const gRes = await w.miadoFirestore.loginWithGoogle();
          if (gRes && (gRes.ok || gRes.user || gRes.token)) {
            const activeUser =
              auth.currentUser ||
              ({
                uid: String(gRes.uid || gRes.user?.uid || `usr_${Date.now()}`),
                email: String(gRes.email || gRes.user?.email || ""),
                displayName: String(gRes.name || gRes.user?.displayName || "Ouvinte"),
                emailVerified: true,
                photoURL: String(gRes.photoURL || gRes.user?.photoURL || "/api/cat-avatar?id=cat_1"),
                providerData: [],
                getIdToken: async () => String(gRes.token || ""),
              } as unknown as User);
            opts.onAuthenticated(activeUser, false);
            return;
          }
        } catch {}
      }

      const provider = new GoogleAuthProvider();
      try {
        const cred = await signInWithPopup(auth, provider);
        try {
          const idToken = await cred.user.getIdToken();
          localStorage.setItem("miado_auth_token", idToken);
          localStorage.setItem("miado_user_uid", cred.user.uid);
          localStorage.setItem("miado_active_session_v1", "true");
          await fetch("/api/auth/google", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              uid: cred.user.uid,
              email: cred.user.email || "",
              name: cred.user.displayName || "Ouvinte",
              avatarUrl: cred.user.photoURL || "/api/cat-avatar?id=cat_1",
            }),
          })
            .then((r) => r.json())
            .then((d) => {
              if (d && d.ok && w.miadoState && typeof w.miadoState.applyAccountPayload === "function") {
                w.miadoState.applyAccountPayload(d);
              }
            })
            .catch(() => {});
        } catch {}
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
    forgotRowEl,
    forgotPanelEl,
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

  try {
    const sp = new URLSearchParams(window.location.search || "");
    const rawPath = decodeURIComponent(window.location.pathname || "/").replace(/\/+$/, "") || "/";
    const isReset =
      sp.get("action") === "reset-password" ||
      sp.get("mode") === "resetPassword" ||
      rawPath.startsWith("/redefinir-senha") ||
      Boolean(sp.get("resetCode")) ||
      Boolean(sp.get("code") && (sp.get("email") || sp.get("resetEmail")));

    if (isReset) {
      const targetEmail = (sp.get("email") || sp.get("resetEmail") || "").trim().toLowerCase();
      const targetCode = (sp.get("code") || sp.get("resetCode") || "").trim();
      if (targetEmail) {
        emailField.setValue(targetEmail);
      }
      forgotPanelEl.style.display = "flex";
      passwordField.root.style.display = "none";
      submitBtn.style.display = "none";
      forgotRowEl.style.display = "none";
      if (targetCode && targetCode.length >= 6) {
        forgotCodeInput.value = targetCode;
        syncEmailValidationState(true);
        forgotStatusBanner.style.display = "block";
        forgotStatusBanner.textContent =
          "Código de recuperação de 24h validado pelo link! Digite sua nova senha abaixo.";
        setTimeout(() => forgotNewPassInput.focus(), 160);
      }
    }
  } catch {}

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
