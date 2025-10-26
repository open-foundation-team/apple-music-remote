import { PlaybackInfo } from "../api/types";

export function calculateProgressPercent(playback: PlaybackInfo | null): number {
  const progress = playback?.progress;
  if (!progress || !progress.duration) {
    return 0;
  }
  return Math.min(100, Math.max(0, (progress.elapsed / progress.duration) * 100));
}
