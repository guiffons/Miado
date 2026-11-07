import { Router, Request, Response } from "express";
import { createRateLimiter, requireAuth, requireVerifiedUser } from "../security.ts";
import { PlaylistTrackInputSchema } from "../schemas.ts";
import { buildTrackKey } from "../../shared/keys.ts";
import { isCanonicalStudioTrack } from "../catalog.ts";
import {
  getFirestoreDocument,
  commitPlaylistTrackWrite,
  deleteFirestoreDocument
} from "../firestoreRest.ts";

export function createPlaylistsRouter(customFetch: typeof fetch = fetch): Router {
  const router = Router();
  const limiter = createRateLimiter(30, 60_000, (req) => req.authUser?.uid || req.ip || "anon");

  router.post(
    "/:playlistId/tracks",
    limiter,
    requireAuth,
    requireVerifiedUser,
    async (req: Request, res: Response) => {
      const playlistId = String(req.params.playlistId || "").trim();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(playlistId)) {
        res.status(400).json({ error: "invalid_playlist_id", requestId: req.requestId });
        return;
      }

      const parsed = PlaylistTrackInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_payload", requestId: req.requestId });
        return;
      }

      const uid = req.authUser!.uid;
      const authHeader = String(req.headers.authorization || "");
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

      const playlistRes = await getFirestoreDocument(`playlists/${playlistId}`, idToken, customFetch);
      if (playlistRes.status === 403 || playlistRes.status === 404 || !playlistRes.data) {
        res.status(404).json({ error: "playlist_not_found", requestId: req.requestId });
        return;
      }

      const playlist = playlistRes.data;
      const isOwner = playlist.ownerId === uid;
      const isCollaborator =
        Array.isArray(playlist.collaboratorIds) && playlist.collaboratorIds.includes(uid);

      if (!isOwner && !isCollaborator) {
        res.status(403).json({ error: "forbidden", requestId: req.requestId });
        return;
      }

      const { title, artist, albumTitle, coverUrl, durationSec } = parsed.data;
      if (!isCanonicalStudioTrack(title, artist, albumTitle || "", durationSec)) {
        res.status(400).json({ error: "non_studio_track", requestId: req.requestId });
        return;
      }

      const trackKey = buildTrackKey(title, artist);
      const commitRes = await commitPlaylistTrackWrite(
        playlistId,
        trackKey,
        {
          trackKey,
          title,
          artist,
          ...(albumTitle ? { albumTitle } : {}),
          ...(coverUrl ? { coverUrl } : {}),
          durationSec,
          addedBy: uid
        },
        idToken,
        customFetch
      );

      if (commitRes.status >= 400) {
        res.status(403).json({ error: "write_rejected", requestId: req.requestId });
        return;
      }

      res.status(201).json({ trackKey });
    }
  );

  router.delete(
    "/:playlistId/tracks/:trackKey",
    limiter,
    requireAuth,
    requireVerifiedUser,
    async (req: Request, res: Response) => {
      const playlistId = String(req.params.playlistId || "").trim();
      const trackKey = String(req.params.trackKey || "").trim();
      if (
        !/^[A-Za-z0-9_-]{1,64}$/.test(playlistId) ||
        !/^[a-z0-9_.:-]{1,120}$/.test(trackKey)
      ) {
        res.status(400).json({ error: "invalid_parameters", requestId: req.requestId });
        return;
      }

      const uid = req.authUser!.uid;
      const authHeader = String(req.headers.authorization || "");
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

      const playlistRes = await getFirestoreDocument(`playlists/${playlistId}`, idToken, customFetch);
      if (playlistRes.status === 403 || playlistRes.status === 404 || !playlistRes.data) {
        res.status(404).json({ error: "playlist_not_found", requestId: req.requestId });
        return;
      }

      const playlist = playlistRes.data;
      const isOwner = playlist.ownerId === uid;
      const isCollaborator =
        Array.isArray(playlist.collaboratorIds) && playlist.collaboratorIds.includes(uid);

      if (!isOwner && !isCollaborator) {
        res.status(403).json({ error: "forbidden", requestId: req.requestId });
        return;
      }

      if (!isOwner) {
        const trackRes = await getFirestoreDocument(
          `playlists/${playlistId}/tracks/${trackKey}`,
          idToken,
          customFetch
        );
        if (!trackRes.data) {
          res.status(404).json({ error: "track_not_found", requestId: req.requestId });
          return;
        }
        if (trackRes.data.addedBy !== uid) {
          res.status(403).json({ error: "cannot_delete_others_track", requestId: req.requestId });
          return;
        }
      }

      const delRes = await deleteFirestoreDocument(
        `playlists/${playlistId}/tracks/${trackKey}`,
        idToken,
        customFetch
      );
      if (delRes.status >= 400) {
        res.status(403).json({ error: "delete_rejected", requestId: req.requestId });
        return;
      }

      res.status(204).end();
    }
  );

  return router;
}
