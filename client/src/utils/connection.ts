import { ConnectionStatus } from "../hooks/useRemoteConnection";
import { PlaybackInfo } from "../api/types";

export function buildStatusLabel(
  status: ConnectionStatus,
  token: string,
  baseUrl: string,
  serverName?: string | null,
  errorMessage?: string | null
): string {
  switch (status) {
    case "connected":
      return `Connected${serverName ? ` · ${serverName}` : ""}`;
    case "connecting":
      return "Connecting";
    case "error":
      return errorMessage ?? "Connection error";
    case "idle":
    default:
      if (!token) {
        return "Access token required";
      }
      if (!baseUrl) {
        return "Waiting for server";
      }
      return "Idle";
  }
}

export function derivePlaybackDetails(playback: PlaybackInfo | null) {
  return {
    artworkSrc:
      playback && playback.track?.artworkBase64
        ? `data:image/png;base64,${playback.track.artworkBase64}`
        : null,
    trackTitle: playback?.track?.title ?? "No track playing",
    trackArtist: playback?.track?.artist ?? "",
    trackAlbum: playback?.track?.album ?? "",
    playbackState: playback?.state ?? "stopped"
  };
}
