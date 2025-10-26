import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RemoteApi } from "./api/client";
import { PlaybackInfo, ServerStatus } from "./api/types";
import "./styles/App.css";

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

const STORAGE_KEYS = {
  baseUrl: "amr.baseUrl",
  token: "amr.token"
};

const safeGet = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

const inferDefaultBaseUrl = (): string => {
  if (typeof window === "undefined") {
    return "";
  }
  const origin = window.location.origin;
  if (origin.startsWith("http")) {
    if (!origin.includes(":5173")) {
      return origin;
    }
  }
  return "";
};

const formatTime = (seconds?: number | null): string => {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) {
    return "--:--";
  }
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainder}`;
};

const artworkFromPlayback = (playback: PlaybackInfo | null): string | null => {
  const artwork = playback?.track?.artworkBase64;
  if (!artwork) {
    return null;
  }
  return `data:image/png;base64,${artwork}`;
};

const statusDot = (status: ConnectionStatus): string => {
  switch (status) {
    case "connected":
      return "status-dot connected";
    case "connecting":
      return "status-dot connecting";
    case "error":
      return "status-dot error";
    case "idle":
    default:
      return "status-dot idle";
  }
};

const App = () => {
  const [baseUrl, setBaseUrl] = useState<string>(() => safeGet(STORAGE_KEYS.baseUrl) || inferDefaultBaseUrl());
  const [token, setToken] = useState<string>(() => safeGet(STORAGE_KEYS.token));
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<PlaybackInfo | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerStatus | null>(null);
  const [autoDiscoveryAttempted, setAutoDiscoveryAttempted] = useState(false);
  const [localMusicVolume, setLocalMusicVolume] = useState<number | null>(null);
  const [localSystemVolume, setLocalSystemVolume] = useState<number | null>(null);

  const musicVolumeDebounceRef = useRef<number | null>(null);
  const systemVolumeDebounceRef = useRef<number | null>(null);
  const adjustingMusicVolumeRef = useRef(false);
  const adjustingSystemVolumeRef = useRef(false);

  const api = useMemo(() => {
    if (!baseUrl || !token) {
      return null;
    }
    return new RemoteApi(baseUrl, token);
  }, [baseUrl, token]);

  useEffect(() => {
    if (baseUrl) {
      try {
        localStorage.setItem(STORAGE_KEYS.baseUrl, baseUrl);
      } catch {
        // ignore storage issues
      }
    }
  }, [baseUrl]);

  useEffect(() => {
    if (token) {
      try {
        localStorage.setItem(STORAGE_KEYS.token, token);
      } catch {
        // ignore storage issues
      }
    }
  }, [token]);

  useEffect(() => {
    if (!baseUrl || !token) {
      setStatus("idle");
    }
  }, [baseUrl, token]);

  useEffect(() => {
    return () => {
      if (musicVolumeDebounceRef.current) {
        window.clearTimeout(musicVolumeDebounceRef.current);
      }
      if (systemVolumeDebounceRef.current) {
        window.clearTimeout(systemVolumeDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (baseUrl || autoDiscoveryAttempted) {
      return;
    }
    setAutoDiscoveryAttempted(true);
    let cancelled = false;
    const candidates = new Set<string>();
    if (typeof window !== "undefined" && window.location.origin.startsWith("http")) {
      candidates.add(window.location.origin);
      const host = window.location.hostname;
      if (host && host !== "localhost") {
        candidates.add(`http://${host}:8777`);
      }
    }
    candidates.add("http://apple-music-remote.local:8777");

    (async () => {
      for (const candidate of candidates) {
        if (cancelled) {
          return;
        }
        try {
          const response = await fetch(`${candidate.replace(/\/$/, "")}/api/ping`, {
            method: "GET",
            mode: "cors"
          });
          if (!response.ok) {
            continue;
          }
          await response.json();
          if (!cancelled) {
            setBaseUrl(candidate);
          }
          return;
        } catch {
          // try next candidate
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseUrl, autoDiscoveryAttempted]);

  useEffect(() => {
    if (!api) {
      setServerInfo(null);
      setPlayback(null);
      return;
    }

    let active = true;
    let interval: number | undefined;
    let hasConnected = false;

    setStatus("connecting");
    setError(null);

    api
      .ping()
      .then((info) => {
        if (!active) {
          return;
        }
        setServerInfo(info);
      })
      .catch((err: Error) => {
        if (!active) {
          return;
        }
        setServerInfo(null);
        setError(err.message);
      });

    const poll = async () => {
      if (!active) {
        return;
      }
      try {
        const state = await api.getState();
        if (!active) {
          return;
        }
        setPlayback(state);
        if (!adjustingMusicVolumeRef.current) {
          setLocalMusicVolume(state.volume);
        }
        const remoteSystemVolume = typeof state.systemVolume === "number" ? state.systemVolume : null;
        if (!adjustingSystemVolumeRef.current) {
          setLocalSystemVolume(remoteSystemVolume);
        }
        setError(null);
        hasConnected = true;
        setStatus("connected");
      } catch (err) {
        if (!active) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setStatus(hasConnected ? "error" : "connecting");
      }
    };

    void poll();
    interval = window.setInterval(poll, 1500);

    return () => {
      active = false;
      if (interval) {
        window.clearInterval(interval);
      }
    };
  }, [api]);

  const handleCommand = useCallback(
    async (action: (client: RemoteApi) => Promise<void>) => {
      if (!api) {
        return;
      }
      try {
        await action(api);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setStatus("error");
      }
    },
    [api]
  );

  const handleToggle = useCallback(() => handleCommand((client) => client.toggle()), [handleCommand]);
  const handleNext = useCallback(() => handleCommand((client) => client.next()), [handleCommand]);
  const handlePrevious = useCallback(() => handleCommand((client) => client.previous()), [handleCommand]);

  const handleMusicVolumeChange = useCallback(
    (value: number) => {
      setLocalMusicVolume(value);
      if (!api) {
        return;
      }
      adjustingMusicVolumeRef.current = true;
      if (musicVolumeDebounceRef.current) {
        window.clearTimeout(musicVolumeDebounceRef.current);
      }
      musicVolumeDebounceRef.current = window.setTimeout(async () => {
        try {
          await api.setVolume(value);
          setError(null);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setStatus("error");
        } finally {
          adjustingMusicVolumeRef.current = false;
          if (musicVolumeDebounceRef.current) {
            window.clearTimeout(musicVolumeDebounceRef.current);
            musicVolumeDebounceRef.current = null;
          }
        }
      }, 220);
    },
    [api]
  );

  const handleSystemVolumeChange = useCallback(
    (value: number) => {
      setLocalSystemVolume(value);
      if (!api) {
        return;
      }
      adjustingSystemVolumeRef.current = true;
      if (systemVolumeDebounceRef.current) {
        window.clearTimeout(systemVolumeDebounceRef.current);
      }
      systemVolumeDebounceRef.current = window.setTimeout(async () => {
        try {
          await api.setSystemVolume(value);
          setError(null);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setStatus("error");
        } finally {
          adjustingSystemVolumeRef.current = false;
          if (systemVolumeDebounceRef.current) {
            window.clearTimeout(systemVolumeDebounceRef.current);
            systemVolumeDebounceRef.current = null;
          }
        }
      }, 220);
    },
    [api]
  );

  const progressPercent = useMemo(() => {
    const progress = playback?.progress;
    if (!progress || !progress.duration) {
      return 0;
    }
    return Math.min(100, Math.max(0, (progress.elapsed / progress.duration) * 100));
  }, [playback]);

  const statusLabel = useMemo(() => {
    switch (status) {
      case "connected":
        return `Connected${serverInfo ? ` · ${serverInfo.name}` : ""}`;
      case "connecting":
        return "Connecting";
      case "error":
        return error ?? "Connection error";
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
  }, [status, serverInfo, error, token, baseUrl]);

  const artworkSrc = useMemo(() => artworkFromPlayback(playback), [playback]);
  const trackTitle = playback?.track?.title ?? "No track playing";
  const trackArtist = playback?.track?.artist ?? "";
  const trackAlbum = playback?.track?.album ?? "";
  const playbackState = playback?.state ?? "stopped";
  const remoteSystemVolume = typeof playback?.systemVolume === "number" ? playback.systemVolume : null;
  const musicVolumeValue = localMusicVolume ?? playback?.volume ?? 0;
  const systemVolumeValue = localSystemVolume ?? (remoteSystemVolume ?? 0);
  const systemVolumeAvailable = localSystemVolume !== null || remoteSystemVolume !== null;
  const disableControls = status !== "connected";

  return (
    <div className="app-shell">
      <div className="card">
        <div className="artwork">
          {artworkSrc ? (
            <img src={artworkSrc} alt="Album artwork" />
          ) : (
            <div className="empty-state">
              <span role="img" aria-label="Music note">
                🎵
              </span>
              <p>No artwork available</p>
            </div>
          )}
        </div>

        <div>
          <div className="status-badge">
            <span className={statusDot(status)} />
            <span>{statusLabel}</span>
          </div>
          {serverInfo && (
            <div className="server-meta">v{serverInfo.version} · port {serverInfo.port}</div>
          )}

          <h1 className="track-title">{trackTitle}</h1>
          {trackArtist && <p className="track-meta">{trackArtist}</p>}
          {trackAlbum && <p className="track-meta">{trackAlbum}</p>}
          <p className="track-meta">State: {playbackState}</p>

          <div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="progress-times">
              <span>{formatTime(playback?.progress?.elapsed)}</span>
              <span>{formatTime(playback?.progress?.duration)}</span>
            </div>
          </div>

          <div className="controls">
            <button onClick={handlePrevious} disabled={disableControls}>
              ⏮ Prev
            </button>
            <button onClick={handleToggle} disabled={disableControls}>
              {playbackState === "playing" ? "❚❚ Pause" : "▶︎ Play"}
            </button>
            <button onClick={handleNext} disabled={disableControls}>
              Next ⏭
            </button>
          </div>

          <div className="volume-grid">
            <div className="volume">
              <div className="section-title">Music.app Volume</div>
              <input
                className="volume-slider"
                type="range"
                min={0}
                max={100}
                value={musicVolumeValue}
                onChange={(event) => handleMusicVolumeChange(Number(event.target.value))}
                disabled={disableControls}
              />
              <div>{musicVolumeValue}</div>
            </div>
            <div className="volume">
              <div className="section-title">System Volume</div>
              <input
                className="volume-slider"
                type="range"
                min={0}
                max={100}
                value={systemVolumeValue}
                onChange={(event) => handleSystemVolumeChange(Number(event.target.value))}
                disabled={disableControls || !systemVolumeAvailable}
              />
              <div>{systemVolumeAvailable ? systemVolumeValue : "Unavailable"}</div>
            </div>
          </div>

          {!systemVolumeAvailable && (
            <div className="server-meta">
              System volume control is disabled. Grant accessibility permissions to Apple Music Remote if prompted.
            </div>
          )}

          {error && status === "error" && <div className="error-message">{error}</div>}
        </div>

        <div className="connection">
          <div>
            <div className="section-title">Server URL</div>
            <input
              type="text"
              placeholder="http://apple-music-remote.local:8777"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </div>

          <div>
            <div className="section-title">Access Token</div>
            <input
              type="password"
              placeholder="Paste token from menu bar"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </div>

          <div className="server-meta">
            Token is required for control actions. Copy it from the menu bar icon.
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
