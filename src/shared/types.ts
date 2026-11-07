export type Visibility = "public" | "followers_only" | "private";
export type PresenceState = "playing" | "paused" | "idle";
export type ActivityType = "track_play" | "like" | "playlist_create" | "follow";

export type Timestamp = { seconds: number; nanoseconds: number } | string;

export interface TrackRef {
  trackKey: string;
  title: string;
  artist: string;
  albumTitle?: string;
  coverUrl?: string;
  durationSec: number;
}

export interface UserPrivacy {
  presence: Visibility;
  activity: Visibility;
}

export interface UserDoc {
  uid: string;
  email: string;
  name: string;
  handle: string;
  bio?: string;
  catId: string;
  avatarUrl?: string;
  bannerUrl?: string;
  favoriteArtists?: string[];
  favoriteGenres?: string[];
  followedArtists?: string[];
  privacy: UserPrivacy;
  onboardingCompleted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LikedTrackDoc extends TrackRef {
  likedAt: Timestamp;
}

export interface HistoryEventDoc extends TrackRef {
  playedAt: Timestamp;
  completed?: boolean;
}

export interface HandleDoc {
  uid: string;
  createdAt: Timestamp;
}

export interface ProfileDoc {
  uid: string;
  name: string;
  handle: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  favoriteArtists?: string[];
  updatedAt: Timestamp;
}

export interface FollowDoc {
  followerId: string;
  followeeId: string;
  createdAt: Timestamp;
}

export interface PresenceTrack {
  trackKey: string;
  title: string;
  artist: string;
  coverUrl?: string;
  durationSec: number;
}

export interface PresenceDoc {
  uid: string;
  visibility: Visibility;
  state: PresenceState;
  track?: PresenceTrack;
  updatedAt: Timestamp;
}

export interface ActivityDoc {
  actorId: string;
  type: ActivityType;
  visibility: Visibility;
  track?: PresenceTrack;
  playlistId?: string;
  targetUid?: string;
  createdAt: Timestamp;
}

export interface PlaylistDoc {
  ownerId: string;
  collaboratorIds: string[];
  visibility: Visibility;
  name: string;
  description?: string;
  coverUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PlaylistTrackDoc extends TrackRef {
  addedBy: string;
  addedAt: Timestamp;
}
