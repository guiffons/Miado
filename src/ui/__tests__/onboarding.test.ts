import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeHandle,
  isValidHandle,
  validateDisplayName,
  isValidEmail,
  evaluatePasswordStrength,
  mapFirebaseError,
  formatArtistsButtonLabel,
  resolveInitialStep,
  canTransition,
  OB_TEXT,
  loadOnboardingDraft,
  saveOnboardingDraft,
  clearOnboardingDraft,
} from "../onboarding/flow";
import { encodeCanvasToBoundedJpeg } from "../components/avatarEditor";
import { h } from "../dom";

class FakeNode {
  nodeType = 1;
  textContent = "";
  children: FakeNode[] = [];
  attrs = new Map<string, string>();
  dataset: Record<string, string> = {};
  className = "";

  constructor(public tagName: string, text = "") {
    this.textContent = text;
  }

  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }

  appendChild(child: FakeNode) {
    this.children.push(child);
    this.textContent += child.textContent;
    return child;
  }

  querySelector(tag: string): FakeNode | null {
    const upper = tag.toUpperCase();
    for (const c of this.children) {
      if (c.tagName === upper) return c;
      const nested = c.querySelector(tag);
      if (nested) return nested;
    }
    return null;
  }
}

function installMinimalDomAndStorageShim() {
  const store = new Map<string, string>();
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };

  (globalThis as any).Node = FakeNode;
  (globalThis as any).document = {
    createElement: (tag: string) => new FakeNode(tag.toUpperCase()),
    createTextNode: (text: string) => new FakeNode("#TEXT", String(text)),
  };
}

installMinimalDomAndStorageShim();

describe("Miado Onboarding — Flow & Validation", () => {
  beforeEach(() => {
    clearOnboardingDraft();
  });

  it("normalizes and validates handles strictly within 2..28 chars and [a-z0-9_.]", () => {
    expect(normalizeHandle("@Joao_Silva.99")).toBe("joao_silva.99");
    expect(normalizeHandle("  @@Músico Épico!! ")).toBe("musicoepico");
    expect(normalizeHandle("a".repeat(40)).length).toBe(28);

    expect(isValidHandle("a")).toBe(false);
    expect(isValidHandle("ab")).toBe(true);
    expect(isValidHandle("a".repeat(28))).toBe(true);
    expect(isValidHandle("a".repeat(29))).toBe(false);
    expect(isValidHandle("user_name.01")).toBe(true);
    expect(isValidHandle("User_Name")).toBe(false);
    expect(isValidHandle("user-name")).toBe(false);
  });

  it("validates displayName and email", () => {
    expect(validateDisplayName("")).toEqual({
      valid: false,
      error: OB_TEXT.errors.required,
    });
    expect(validateDisplayName("a".repeat(81))).toEqual({
      valid: false,
      error: OB_TEXT.errors.nameTooLong,
    });
    expect(validateDisplayName("Maria Clara")).toEqual({
      valid: true,
      error: "",
    });

    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("invalid-email")).toBe(false);
  });

  it("resolves initial step and validates state machine transitions", () => {
    expect(
      resolveInitialStep({
        isAuthenticated: false,
        hasProfile: false,
      })
    ).toBe("auth");

    expect(
      resolveInitialStep({
        isAuthenticated: true,
        hasProfile: false,
      })
    ).toBe("profile");

    expect(
      resolveInitialStep({
        isAuthenticated: true,
        hasProfile: true,
        handle: "valid_user",
        onboardingCompleted: false,
      })
    ).toBe("artists");

    expect(
      resolveInitialStep({
        isAuthenticated: true,
        hasProfile: true,
        handle: "valid_user",
        onboardingCompleted: true,
      })
    ).toBe("done");

    expect(canTransition("auth", "profile", false)).toBe(false);
    expect(canTransition("auth", "profile", true)).toBe(true);
    expect(canTransition("profile", "artists", true)).toBe(true);
    expect(canTransition("artists", "profile", true)).toBe(true);
    expect(canTransition("artists", "done", true)).toBe(true);
  });

  it("evaluates password strength from 0 to 4 bars and enforces 6-char + uppercase + special minimum", () => {
    expect(evaluatePasswordStrength("")).toEqual({ score: 0, valid: false });
    expect(evaluatePasswordStrength("abc")).toEqual({ score: 1, valid: false });
    expect(evaluatePasswordStrength("Abcdef12")).toEqual({ score: 2, valid: false });
    expect(evaluatePasswordStrength("abcdef!@")).toEqual({ score: 2, valid: false });
    expect(evaluatePasswordStrength("Abcde!")).toEqual({ score: 3, valid: true });
    expect(evaluatePasswordStrength("Abcdefgh12!@#X")).toEqual({ score: 4, valid: true });
  });

  it("maps Firebase Auth error codes to exact PT-BR strings from Section 3.1", () => {
    expect(mapFirebaseError({ code: "auth/invalid-credential" })).toBe(
      "E-mail ou senha incorretos"
    );
    expect(mapFirebaseError({ code: "auth/user-not-found" })).toBe(
      "E-mail ou senha incorretos"
    );
    expect(mapFirebaseError({ code: "auth/wrong-password" })).toBe(
      "E-mail ou senha incorretos"
    );
    expect(mapFirebaseError({ code: "auth/email-already-in-use" })).toBe(
      "E-mail ja cadastrado"
    );
    expect(mapFirebaseError({ code: "auth/weak-password" })).toBe(
      "Minimo de 6 caracteres, 1 maiuscula e 1 caractere especial"
    );
    expect(mapFirebaseError({ code: "auth/too-many-requests" })).toBe(
      "Muitas tentativas. Tente mais tarde"
    );
    expect(mapFirebaseError({ code: "auth/network-request-failed" })).toBe(
      "Sem conexao"
    );
    expect(mapFirebaseError({ code: "auth/unknown-error" })).toBe(
      "Nao foi possivel concluir"
    );
  });

  it("formats dynamic artist selection button label and enforces 3..60 bounds in draft", () => {
    expect(formatArtistsButtonLabel(0)).toBe("Escolha 3 artistas (0/3)");
    expect(formatArtistsButtonLabel(2)).toBe("Escolha 3 artistas (2/3)");
    expect(formatArtistsButtonLabel(3)).toBe("Tudo pronto (3)");
    expect(formatArtistsButtonLabel(12)).toBe("Tudo pronto (12)");
    expect(formatArtistsButtonLabel(75)).toBe("Tudo pronto (60)");

    const eightyArtists = Array.from({ length: 80 }, (_, i) => ({
      name: `Artist ${i + 1}`,
    }));
    const saved = saveOnboardingDraft({ artists: eightyArtists });
    expect(saved.artists.length).toBe(60);
    expect(loadOnboardingDraft().artists.length).toBe(60);
  });

  it("generates bounded JPEG data URL <= 100000 chars using quality step-down", () => {
    const qualitiesTried: number[] = [];
    const fakeCanvas = {
      toDataURL: (_type: string, quality: number) => {
        qualitiesTried.push(quality);
        if (quality > 0.7) {
          return "data:image/jpeg;base64," + "A".repeat(110000);
        }
        return "data:image/jpeg;base64," + "A".repeat(40000);
      },
    } as unknown as HTMLCanvasElement;

    const result = encodeCanvasToBoundedJpeg(fakeCanvas, 100000);
    expect(result.length).toBeLessThanOrEqual(100000);
    expect(qualitiesTried).toEqual([0.8, 0.75, 0.7]);

    const hugeCanvas = {
      toDataURL: () => "data:image/jpeg;base64," + "A".repeat(120000),
    } as unknown as HTMLCanvasElement;
    expect(() => encodeCanvasToBoundedJpeg(hugeCanvas, 100000)).toThrow(
      OB_TEXT.profile.imageTooLarge
    );
  });

  it("neutralizes XSS payloads in displayName, bio, and artist name when building DOM via h()", () => {
    const xssPayload = `<img src=x onerror="window.__xss=1">`;
    const nameNode = h("div", { class: "ob-preview-name" }, xssPayload);
    const bioNode = h("div", { class: "ob-preview-bio" }, xssPayload);
    const artistNode = h("span", { class: "ob-artist-card-name" }, xssPayload);

    expect(nameNode.querySelector("img")).toBeNull();
    expect(bioNode.querySelector("img")).toBeNull();
    expect(artistNode.querySelector("img")).toBeNull();
    expect(nameNode.textContent).toBe(xssPayload);
    expect(bioNode.textContent).toBe(xssPayload);
    expect(artistNode.textContent).toBe(xssPayload);
  });

  it("enforces static security & design invariants (R-01, R-03, R-04) across all onboarding files", () => {
    const rootDir = path.resolve(process.cwd(), "src");
    const targetFiles = [
      "styles/onboarding.css",
      "ui/icons.ts",
      "ui/motion.ts",
      "ui/onboarding/index.ts",
      "ui/onboarding/flow.ts",
      "ui/onboarding/authStep.ts",
      "ui/onboarding/profileStep.ts",
      "ui/onboarding/artistsStep.ts",
      "ui/components/field.ts",
      "ui/components/segmented.ts",
      "ui/components/stepper.ts",
      "ui/components/avatarEditor.ts",
      "ui/components/artistCard.ts",
      "ui/components/genreChips.ts",
      "ui/components/showcaseWall.ts",
      "ui/components/profilePreview.ts",
      "ui/components/selectedTray.ts",
    ];

    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const forbiddenDomRegex = /\b(innerHTML|outerHTML|insertAdjacentHTML)\b/;

    for (const rel of targetFiles) {
      const fullPath = path.join(rootDir, rel);
      const content = fs.readFileSync(fullPath, "utf8");

      expect(emojiRegex.test(content), `Emoji found in ${rel}`).toBe(false);

      if (rel.endsWith(".ts")) {
        expect(
          forbiddenDomRegex.test(content),
          `Forbidden HTML injection API found in ${rel}`
        ).toBe(false);
      }

      if (rel === "styles/onboarding.css") {
        expect(content.includes("drop-shadow")).toBe(false);
        expect(content.includes("text-shadow")).toBe(false);
        const shadowMatches = content.match(/box-shadow\s*:\s*([^;]+);/g) || [];
        for (const match of shadowMatches) {
          expect(match).toContain("inset 0 1px 0 rgba(255, 255, 255, 0.06)");
        }
      }
    }
  });
});
