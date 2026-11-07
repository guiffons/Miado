import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyFirebaseIdToken, setMockGoogleCertsForTest } from "../security";
import { resolveSafeLocalAudioPath } from "../streams/localAudio";

describe("security & localAudio", () => {
  it("verifies RS256 Firebase ID tokens against Google X.509 certificates and rejects tampered tokens", async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const certPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    setMockGoogleCertsForTest({ "test-kid-1": certPem });

    const nowSec = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-kid-1", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: "https://securetoken.google.com/test-project",
        aud: "test-project",
        sub: "usr_123",
        email: "test@miado.app",
        email_verified: true,
        iat: nowSec - 10,
        exp: nowSec + 3600,
        firebase: { sign_in_provider: "google.com" }
      })
    ).toString("base64url");

    const sign = crypto.createSign("RSA-SHA256");
    sign.update(`${header}.${payload}`);
    sign.end();
    const signature = sign.sign(privateKey).toString("base64url");
    const validToken = `${header}.${payload}.${signature}`;

    const verified = await verifyFirebaseIdToken(validToken, "test-project");
    expect(verified).not.toBeNull();
    expect(verified?.uid).toBe("usr_123");
    expect(verified?.email).toBe("test@miado.app");
    expect(verified?.emailVerified).toBe(true);

    // Tampered signature must fail
    const tampered = await verifyFirebaseIdToken(`${header}.${payload}.invalidSignatureBytes`, "test-project");
    expect(tampered).toBeNull();
  });

  it("rejects path traversal and arbitrary file paths in resolveSafeLocalAudioPath (MIADO-01)", () => {
    expect(resolveSafeLocalAudioPath("package.json")).toBeNull();
    expect(resolveSafeLocalAudioPath("../package.json")).toBeNull();
    expect(resolveSafeLocalAudioPath("local:../../package.json")).toBeNull();
    expect(resolveSafeLocalAudioPath("file:///etc/passwd")).toBeNull();
  });
});
