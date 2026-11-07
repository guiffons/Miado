import { describe, it, expect } from "vitest";
import express from "express";
import crypto from "crypto";
import { createPlaylistsRouter } from "../routes/playlists";
import { attachAuth, setMockGoogleCertsForTest } from "../security";

function createTestJwt(privateKey: crypto.KeyObject, uid: string, email: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "kid-playlist", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "https://securetoken.google.com/axiomatic-electron-sbcxw",
      aud: "axiomatic-electron-sbcxw",
      sub: uid,
      email,
      email_verified: true,
      iat: nowSec - 10,
      exp: nowSec + 3600,
      firebase: { sign_in_provider: "google.com" }
    })
  ).toString("base64url");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  sign.end();
  return `${header}.${payload}.${sign.sign(privateKey).toString("base64url")}`;
}

describe("playlistsRouter RBAC", () => {
  it("enforces owner and collaborator permissions on playlist track mutations", async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    setMockGoogleCertsForTest({
      "kid-playlist": publicKey.export({ type: "spki", format: "pem" }).toString()
    });

    const mockFetch: typeof fetch = async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("/documents/playlists/pl_test") && (!init || !init.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            name: "projects/p/databases/d/documents/playlists/pl_test",
            fields: {
              ownerId: { stringValue: "uid_owner" },
              collaboratorIds: {
                arrayValue: { values: [{ stringValue: "uid_collab" }] }
              },
              isCollaborative: { booleanValue: true }
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes(":commit")) {
        return new Response(JSON.stringify({ writeResults: [{}] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("{}", { status: 200 });
    };

    const app = express();
    app.use(express.json());
    app.use(attachAuth);
    app.use("/api/playlists", createPlaylistsRouter(mockFetch));

    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}/api/playlists`;

    const collabToken = createTestJwt(privateKey, "uid_collab", "collab@miado.app");
    const strangerToken = createTestJwt(privateKey, "uid_stranger", "stranger@miado.app");

    try {
      // Unauthenticated track add -> 401
      const unauthRes = await fetch(`${baseUrl}/pl_test/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "BIRDS OF A FEATHER", artist: "Billie Eilish", durationSec: 210 })
      });
      expect(unauthRes.status).toBe(401);

      // Stranger cannot add tracks -> 403
      const strangerPost = await fetch(`${baseUrl}/pl_test/tracks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${strangerToken}`
        },
        body: JSON.stringify({ title: "BIRDS OF A FEATHER", artist: "Billie Eilish", durationSec: 210 })
      });
      expect(strangerPost.status).toBe(403);

      // Collaborator can add studio track -> 201
      const collabPost = await fetch(`${baseUrl}/pl_test/tracks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${collabToken}`
        },
        body: JSON.stringify({ title: "BIRDS OF A FEATHER", artist: "Billie Eilish", durationSec: 210 })
      });
      expect(collabPost.status).toBe(201);
    } finally {
      server.close();
    }
  });
});
