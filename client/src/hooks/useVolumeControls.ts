import { useCallback, useEffect, useRef, useState } from "react";
import { PlaybackInfo } from "../api/types";
import { ConnectionStatus } from "./useRemoteConnection";

interface VolumeControlsOptions {
  playback: PlaybackInfo | null;
  status: ConnectionStatus;
  onSetMusicVolume: (value: number) => boolean;
  onSetSystemVolume: (value: number) => boolean;
  onError: (value: string | null) => void;
}

interface VolumeControlsResult {
  musicVolume: number;
  systemVolume: number;
  systemVolumeAvailable: boolean;
  handleMusicVolumeChange: (value: number) => void;
  handleSystemVolumeChange: (value: number) => void;
}

const DEBOUNCE_MS = 220;

export function useVolumeControls({
  playback,
  status,
  onSetMusicVolume,
  onSetSystemVolume,
  onError
}: VolumeControlsOptions): VolumeControlsResult {
  const [musicVolume, setMusicVolume] = useState<number>(playback?.volume ?? 0);
  const [systemVolume, setSystemVolume] = useState<number | null>(
    typeof playback?.systemVolume === "number" ? playback.systemVolume : null
  );

  const musicTimeoutRef = useRef<number | null>(null);
  const systemTimeoutRef = useRef<number | null>(null);
  const adjustingMusicRef = useRef(false);
  const adjustingSystemRef = useRef(false);

  useEffect(() => {
    return () => {
      if (musicTimeoutRef.current) {
        window.clearTimeout(musicTimeoutRef.current);
      }
      if (systemTimeoutRef.current) {
        window.clearTimeout(systemTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!adjustingMusicRef.current && typeof playback?.volume === "number") {
      setMusicVolume(playback.volume);
    }
  }, [playback?.volume]);

  useEffect(() => {
    const remoteSystemVolume = typeof playback?.systemVolume === "number" ? playback.systemVolume : null;
    if (!adjustingSystemRef.current) {
      setSystemVolume(remoteSystemVolume);
    }
  }, [playback?.systemVolume]);

  useEffect(() => {
    if (status !== "connected") {
      adjustingMusicRef.current = false;
      adjustingSystemRef.current = false;
    }
  }, [status]);

  const handleMusicVolumeChange = useCallback(
    (value: number) => {
      setMusicVolume(value);
      adjustingMusicRef.current = true;
      if (musicTimeoutRef.current) {
        window.clearTimeout(musicTimeoutRef.current);
      }
      musicTimeoutRef.current = window.setTimeout(() => {
        const ok = onSetMusicVolume(value);
        if (!ok) {
          onError("Not connected");
        } else {
          onError(null);
        }
        adjustingMusicRef.current = false;
        if (musicTimeoutRef.current) {
          window.clearTimeout(musicTimeoutRef.current);
          musicTimeoutRef.current = null;
        }
      }, DEBOUNCE_MS);
    },
    [onError, onSetMusicVolume]
  );

  const handleSystemVolumeChange = useCallback(
    (value: number) => {
      setSystemVolume(value);
      adjustingSystemRef.current = true;
      if (systemTimeoutRef.current) {
        window.clearTimeout(systemTimeoutRef.current);
      }
      systemTimeoutRef.current = window.setTimeout(() => {
        const ok = onSetSystemVolume(value);
        if (!ok) {
          onError("Not connected");
        } else {
          onError(null);
        }
        adjustingSystemRef.current = false;
        if (systemTimeoutRef.current) {
          window.clearTimeout(systemTimeoutRef.current);
          systemTimeoutRef.current = null;
        }
      }, DEBOUNCE_MS);
    },
    [onError, onSetSystemVolume]
  );

  const systemVolumeAvailable = systemVolume !== null || typeof playback?.systemVolume === "number";

  return {
    musicVolume,
    systemVolume: systemVolume ?? 0,
    systemVolumeAvailable,
    handleMusicVolumeChange,
    handleSystemVolumeChange
  };
}
