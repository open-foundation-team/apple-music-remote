export type PlayerState = "playing" | "paused" | "stopped";

export interface TrackInfo {
  title: string;
  artist: string;
  album: string;
  duration: number;
  artworkBase64?: string | null;
}

export interface ProgressInfo {
  elapsed: number;
  duration: number;
}

export interface PlaybackInfo {
  state: PlayerState;
  track?: TrackInfo | null;
  progress?: ProgressInfo | null;
  volume: number;
  systemVolume?: number | null;
  timestamp: string;
}

export interface ServerStatus {
  name: string;
  version: string;
  port: number;
  requiresToken: boolean;
}
