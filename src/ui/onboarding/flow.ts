import type { Visibility } from "../../shared/types";

export type OnboardingStep = "auth" | "profile" | "artists" | "done";
export type AuthMode = "login" | "register";
export type HandleCheckStatus = "idle" | "invalid" | "checking" | "available" | "taken";

export const FEATURES = {
  guest: false,
  appleAuth: false,
} as const;

export const OB_TEXT = {
  brand: "Miado",
  auth: {
    login: "Entrar",
    register: "Criar conta",
    email: "E-mail",
    password: "Senha",
    showPassword: "Mostrar senha",
    hidePassword: "Ocultar senha",
    or: "ou",
    google: "Continuar com o Google",
    apple: "Continuar com a Apple",
    unverified: "E-mail nao verificado",
    resend: "Reenviar",
  },
  profile: {
    title: "Perfil",
    stepLabel: "Etapa 1 de 2",
    addPhoto: "Adicionar foto",
    changePhoto: "Trocar",
    displayName: "Nome de exibicao",
    username: "Nome de usuario",
    bio: "Biografia (opcional)",
    privacyLabel: "Quem ve o que voce ouve",
    privacyAll: "Todos",
    privacyFollowers: "Seguidores",
    privacyNobody: "Ninguem",
    next: "Avancar",
    back: "Voltar",
    available: "Disponivel",
    taken: "Em uso",
    checking: "Verificando",
    cancel: "Cancelar",
    usePhoto: "Usar foto",
    imageTooLarge: "Imagem muito grande",
  },
  artists: {
    title: "Artistas",
    stepLabel: "Etapa 2 de 2",
    searchPlaceholder: "Pesquisar artistas e bandas",
    genres: [
      "Todos",
      "Rock",
      "Pop",
      "Rap",
      "MPB",
      "Indie",
      "Eletronica",
      "Funk",
      "Sertanejo",
      "R&B",
      "Metal",
    ] as const,
    yourArtists: "Seus artistas",
    similarArtists: "Artistas parecidos",
    remove: "Remover",
    chooseThreePrefix: "Escolha 3 artistas",
    allReadyPrefix: "Tudo pronto",
  },
  errors: {
    invalidCredentials: "E-mail ou senha incorretos",
    emailInUse: "E-mail ja cadastrado",
    weakPassword: "Minimo de 6 caracteres, 1 maiuscula e 1 caractere especial",
    tooManyRequests: "Muitas tentativas. Tente mais tarde",
    networkError: "Sem conexao",
    generic: "Nao foi possivel concluir",
    required: "Campo obrigatorio",
    invalidEmail: "E-mail invalido",
    nameTooLong: "Nome muito longo",
    invalidUsername: "Usuario invalido",
  },
} as const;

export const HANDLE_REGEX = /^[a-z0-9_.]{2,28}$/;

export function normalizeHandle(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, 28);
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_REGEX.test(handle);
}

export function validateDisplayName(name: string): { valid: boolean; error: string } {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    return { valid: false, error: OB_TEXT.errors.required };
  }
  if (trimmed.length > 80) {
    return { valid: false, error: OB_TEXT.errors.nameTooLong };
  }
  return { valid: true, error: "" };
}

export function isValidEmail(email: string): boolean {
  const s = String(email ?? "").trim();
  if (!s || s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  valid: boolean;
  missing: string[];
  reason: string;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const pwd = String(password ?? "");
  if (!pwd) {
    return {
      score: 0,
      valid: false,
      missing: [
        "mínimo de 6 caracteres",
        "1 letra maiúscula (A-Z)",
        "1 caractere especial (ex: !@#$%&*)",
      ],
      reason: "Digite uma senha com mínimo de 6 caracteres, 1 letra maiúscula (A-Z) e 1 caractere especial (ex: !@#$%&*).",
    };
  }

  const hasLower = /[a-z]/.test(pwd);
  const hasUpper = /[A-Z]/.test(pwd);
  const hasDigit = /[0-9]/.test(pwd);
  const hasSpecial = /[^a-zA-Z0-9]/.test(pwd);

  const missing: string[] = [];
  if (pwd.length < 6) {
    missing.push(`mínimo de 6 caracteres (atual: ${pwd.length}/6)`);
  }
  if (!hasUpper) {
    missing.push("1 letra maiúscula (A-Z)");
  }
  if (!hasSpecial) {
    missing.push("1 caractere especial (ex: !@#$%&*)");
  }

  let classes = 0;
  if (hasLower) classes++;
  if (hasUpper) classes++;
  if (hasDigit) classes++;
  if (hasSpecial) classes++;

  const valid = pwd.length >= 6 && hasUpper && hasSpecial;
  const reason = valid
    ? "Senha forte: todos os requisitos de segurança foram atendidos."
    : `Senha fraca — falta: ${missing.join(", ")}.`;

  if (pwd.length < 6) {
    return { score: 1, valid: false, missing, reason };
  }
  if (!valid) {
    return { score: 2, valid: false, missing, reason };
  }
  if (pwd.length >= 10 && classes >= 3) {
    return { score: 4, valid: true, missing: [], reason };
  }
  return { score: 3, valid: true, missing: [], reason };
}

export function mapFirebaseError(err: unknown): string {
  let rawCode = "";
  if (typeof err === "string") {
    rawCode = err;
  } else if (err && typeof err === "object") {
    const anyErr = err as { code?: string; message?: string };
    rawCode = `${anyErr.code || ""} ${anyErr.message || ""}`;
  }
  const lower = rawCode.toLowerCase();

  if (
    lower.includes("auth/invalid-credential") ||
    lower.includes("auth/user-not-found") ||
    lower.includes("auth/wrong-password") ||
    lower.includes("invalid-login-credentials")
  ) {
    return OB_TEXT.errors.invalidCredentials;
  }
  if (lower.includes("auth/email-already-in-use") || lower.includes("email-already-in-use")) {
    return OB_TEXT.errors.emailInUse;
  }
  if (lower.includes("auth/weak-password") || lower.includes("weak-password")) {
    return OB_TEXT.errors.weakPassword;
  }
  if (lower.includes("auth/too-many-requests") || lower.includes("too-many-requests")) {
    return OB_TEXT.errors.tooManyRequests;
  }
  if (lower.includes("auth/network-request-failed") || lower.includes("network-request-failed")) {
    return OB_TEXT.errors.networkError;
  }
  if (lower.includes("auth/invalid-email")) {
    return OB_TEXT.errors.invalidEmail;
  }
  return OB_TEXT.errors.generic;
}

export function formatArtistsButtonLabel(count: number): string {
  const safeCount = Math.max(0, Math.min(60, Math.floor(Number(count) || 0)));
  if (safeCount < 3) {
    return `${OB_TEXT.artists.chooseThreePrefix} (${safeCount}/3)`;
  }
  return `${OB_TEXT.artists.allReadyPrefix} (${safeCount})`;
}

export interface ResumeStateInput {
  isAuthenticated: boolean;
  hasProfile: boolean;
  handle?: string;
  onboardingCompleted?: boolean;
}

export function resolveInitialStep(input: ResumeStateInput): OnboardingStep {
  if (!input.isAuthenticated) {
    return "auth";
  }
  const normalized = normalizeHandle(input.handle || "");
  if (!input.hasProfile || !isValidHandle(normalized)) {
    return "profile";
  }
  if (input.onboardingCompleted !== true) {
    return "artists";
  }
  return "done";
}

export function canTransition(
  from: OnboardingStep,
  to: OnboardingStep,
  isAuthenticated: boolean
): boolean {
  if (from === to) return true;
  if (to === "auth") {
    return !isAuthenticated;
  }
  if (!isAuthenticated) {
    return false;
  }
  if (from === "auth" && (to === "profile" || to === "artists" || to === "done")) {
    return true;
  }
  if (from === "profile" && to === "artists") {
    return true;
  }
  if (from === "artists" && (to === "profile" || to === "done")) {
    return true;
  }
  return false;
}

export interface OnboardingArtistItem {
  name: string;
  genre?: string;
  coverUrl?: string;
}

export interface OnboardingDraft {
  step: OnboardingStep;
  name: string;
  handle: string;
  bio: string;
  catId: string;
  avatarUrl: string;
  privacy: Visibility;
  artists: OnboardingArtistItem[];
}

const DRAFT_STORAGE_KEY = "miado_onboarding_draft_v1";

export function defaultOnboardingDraft(): OnboardingDraft {
  return {
    step: "auth",
    name: "",
    handle: "",
    bio: "",
    catId: "cat_1",
    avatarUrl: "/api/cat-avatar?id=cat_1",
    privacy: "followers_only",
    artists: [],
  };
}

export function loadOnboardingDraft(): OnboardingDraft {
  const base = defaultOnboardingDraft();
  try {
    if (typeof sessionStorage === "undefined") return base;
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    if (!parsed || typeof parsed !== "object") return base;

    const validSteps: OnboardingStep[] = ["auth", "profile", "artists", "done"];
    const step = validSteps.includes(parsed.step as OnboardingStep)
      ? (parsed.step as OnboardingStep)
      : "auth";
    const privacy: Visibility =
      parsed.privacy === "public" ||
      parsed.privacy === "followers_only" ||
      parsed.privacy === "private"
        ? parsed.privacy
        : "followers_only";

    const artists = Array.isArray(parsed.artists)
      ? parsed.artists
          .filter((a) => a && typeof a.name === "string" && a.name.trim().length > 0)
          .slice(0, 60)
          .map((a) => ({
            name: String(a.name).trim().slice(0, 80),
            genre: typeof a.genre === "string" ? a.genre.slice(0, 40) : undefined,
            coverUrl: typeof a.coverUrl === "string" ? a.coverUrl.slice(0, 2000) : undefined,
          }))
      : [];

    return {
      step,
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 80) : "",
      handle: typeof parsed.handle === "string" ? normalizeHandle(parsed.handle) : "",
      bio: typeof parsed.bio === "string" ? parsed.bio.slice(0, 300) : "",
      catId:
        typeof parsed.catId === "string" && /^cat_[1-8]$/.test(parsed.catId)
          ? parsed.catId
          : "cat_1",
      avatarUrl:
        typeof parsed.avatarUrl === "string" && parsed.avatarUrl.length <= 100000
          ? parsed.avatarUrl
          : "/api/cat-avatar?id=cat_1",
      privacy,
      artists,
    };
  } catch {
    return base;
  }
}

export function saveOnboardingDraft(partial: Partial<OnboardingDraft>): OnboardingDraft {
  const current = loadOnboardingDraft();
  const merged: OnboardingDraft = {
    ...current,
    ...partial,
    name: typeof partial.name === "string" ? partial.name.slice(0, 80) : current.name,
    handle:
      typeof partial.handle === "string" ? normalizeHandle(partial.handle) : current.handle,
    bio: typeof partial.bio === "string" ? partial.bio.slice(0, 300) : current.bio,
    artists: Array.isArray(partial.artists) ? partial.artists.slice(0, 60) : current.artists,
  };
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(merged));
    }
  } catch {}
  return merged;
}

export function clearOnboardingDraft(): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  } catch {}
}
