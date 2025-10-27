import { useEffect, useMemo, useRef, useState } from "react";
import { PlaybackInfo } from "../api/types";

export type ProgressMode = "static" | "animating";

interface UsePlaybackProgressOptions {
  playback: PlaybackInfo | null;
}

interface PlaybackProgressResult {
  displayElapsed: number;
  displayPercent: number;
  duration: number;
  mode: ProgressMode;
  resetAnimationKey: number;
}

const MAX_DRIFT_SECONDS = 1.5;

type AnimationData = {
  startElapsed: number;
  duration: number;
  startTime: number;
};

export function usePlaybackProgress({ playback }: UsePlaybackProgressOptions): PlaybackProgressResult {
  const [displayElapsed, setDisplayElapsed] = useState<number>(playback?.progress?.elapsed ?? 0);
  const [mode, setMode] = useState<ProgressMode>("static");
  const [resetAnimationKey, setResetAnimationKey] = useState(0);

  const animationRef = useRef<number | null>(null);
  const activeAnimation = useRef<AnimationData | null>(null);
  const currentElapsedRef = useRef<number>(displayElapsed);

  const duration = playback?.progress?.duration ?? 0;

  const cancelAnimation = () => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  const stopAnimation = (elapsed: number) => {
    cancelAnimation();
    activeAnimation.current = null;
    setMode("static");
    setDisplayElapsed(elapsed);
  };

  useEffect(() => {
    currentElapsedRef.current = displayElapsed;
  }, [displayElapsed]);

  useEffect(() => {
    if (!playback?.progress) {
      stopAnimation(0);
      return;
    }

    const { elapsed = 0, duration: trackDuration = 0 } = playback.progress;
    const state = playback.state;
    const serverTimestamp = playback.timestamp ? Date.parse(playback.timestamp) : Date.now();
    const nowMs = Date.now();
    const driftSeconds = Math.max(0, (nowMs - serverTimestamp) / 1000);

    const baseElapsed = Math.min(trackDuration || Number.POSITIVE_INFINITY, elapsed + driftSeconds);
    const previousElapsed = currentElapsedRef.current;

    if (Math.abs(previousElapsed - baseElapsed) > MAX_DRIFT_SECONDS) {
      setResetAnimationKey((key) => key + 1);
    }

    if (state !== "playing" || trackDuration === 0) {
      stopAnimation(baseElapsed);
      return;
    }

    setDisplayElapsed(baseElapsed);

    const animation: AnimationData = {
      startElapsed: baseElapsed,
      duration: trackDuration,
      startTime: performance.now()
    };
    activeAnimation.current = animation;
    setMode("animating");

    cancelAnimation();

    const step = () => {
      const current = activeAnimation.current;
      if (!current) {
        return;
      }
      const elapsedSinceStart = (performance.now() - current.startTime) / 1000;
      let nextElapsed = current.startElapsed + elapsedSinceStart;
      if (current.duration > 0) {
        nextElapsed = Math.min(current.duration, nextElapsed);
      }

      setDisplayElapsed(nextElapsed);

      if (current.duration > 0 && nextElapsed >= current.duration - 0.05) {
        // close enough to the end, stop animating until next payload arrives
        stopAnimation(nextElapsed);
        return;
      }

      animationRef.current = requestAnimationFrame(step);
    };

    animationRef.current = requestAnimationFrame(step);

    return () => {
      cancelAnimation();
    };
  }, [playback]);

  useEffect(() => () => cancelAnimation(), []);

  const displayPercent = useMemo(() => {
    if (!duration) {
      return 0;
    }
    return Math.min(100, Math.max(0, (displayElapsed / duration) * 100));
  }, [displayElapsed, duration]);

  return {
    displayElapsed,
    displayPercent,
    duration,
    mode,
    resetAnimationKey
  };
}
