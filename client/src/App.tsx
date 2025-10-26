import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RemoteApi } from "./api/client";
import { PlaybackInfo, ServerStatus } from "./api/types";
import "./styles/App.css";

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

type ServerMessage = {
    type: "hello" | "auth" | "playback" | "ack" | "error" | "pong";
    message?: string;
    action?: string;
    payload?: PlaybackInfo;
    heartbeatInterval?: number;
    server?: ServerStatus;
    requestId?: string;
};

const STORAGE_KEYS = {
    baseUrl: "amr.baseUrl",
    token: "amr.token",
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
    const [baseUrl, setBaseUrl] = useState<string>(
        () => safeGet(STORAGE_KEYS.baseUrl) || inferDefaultBaseUrl()
    );
    const [token, setToken] = useState<string>(() =>
        safeGet(STORAGE_KEYS.token)
    );
    const [status, setStatus] = useState<ConnectionStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [playback, setPlayback] = useState<PlaybackInfo | null>(null);
    const [serverInfo, setServerInfo] = useState<ServerStatus | null>(null);
    const [autoDiscoveryAttempted, setAutoDiscoveryAttempted] = useState(false);
    const [localMusicVolume, setLocalMusicVolume] = useState<number | null>(
        null
    );
    const [localSystemVolume, setLocalSystemVolume] = useState<number | null>(
        null
    );

    const musicVolumeDebounceRef = useRef<number | null>(null);
    const systemVolumeDebounceRef = useRef<number | null>(null);
    const adjustingMusicVolumeRef = useRef(false);
    const adjustingSystemVolumeRef = useRef(false);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<number | null>(null);
    const heartbeatTimerRef = useRef<number | null>(null);

    const api = useMemo(() => {
        if (!baseUrl || !token) {
            return null;
        }
        return new RemoteApi(baseUrl, token);
    }, [baseUrl, token]);

    const buildWebSocketUrl = useCallback((): string | null => {
        if (!baseUrl || !serverInfo) {
            return null;
        }
        try {
            const url = new URL(baseUrl);
            url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
            const wsPort =
                serverInfo.webSocketPort ??
                (url.port ? Number(url.port) + 1 : serverInfo.port + 1);
            url.port = String(wsPort);
            url.pathname = "/";
            url.search = "client=web";
            url.hash = "";
            return url.toString();
        } catch {
            return null;
        }
    }, [baseUrl, serverInfo]);

    const sendWsMessage = useCallback((payload: unknown) => {
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return false;
        }
        try {
            socket.send(JSON.stringify(payload));
            return true;
        } catch {
            return false;
        }
    }, []);

    const connectWebSocket = useCallback(() => {
        if (!token || !serverInfo) {
            return;
        }
        if (
            wsRef.current &&
            (wsRef.current.readyState === WebSocket.OPEN ||
                wsRef.current.readyState === WebSocket.CONNECTING)
        ) {
            return;
        }

        const url = buildWebSocketUrl();
        if (!url) {
            setError("Invalid WebSocket URL");
            setStatus("error");
            return;
        }

        if (reconnectTimerRef.current) {
            window.clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }

        if (heartbeatTimerRef.current) {
            window.clearInterval(heartbeatTimerRef.current);
            heartbeatTimerRef.current = null;
        }

        const socket = new WebSocket(url);
        wsRef.current = socket;
        setStatus("connecting");

        socket.onopen = () => {
            socket.send(JSON.stringify({ type: "auth", token }));
            socket.send(JSON.stringify({ type: "requestState" }));
        };

        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data) as ServerMessage;
                switch (message.type) {
                    case "hello": {
                        if (typeof message.heartbeatInterval === "number") {
                            const intervalMs = Math.max(
                                5000,
                                message.heartbeatInterval * 1000
                            );
                            if (heartbeatTimerRef.current) {
                                window.clearInterval(heartbeatTimerRef.current);
                            }
                            heartbeatTimerRef.current = window.setInterval(
                                () => {
                                    const openSocket = wsRef.current;
                                    if (
                                        openSocket &&
                                        openSocket.readyState === WebSocket.OPEN
                                    ) {
                                        openSocket.send(
                                            JSON.stringify({ type: "ping" })
                                        );
                                    }
                                },
                                Math.max(5000, intervalMs - 5000)
                            );
                        }
                        if (message.server && !serverInfo) {
                            setServerInfo(message.server);
                        }
                        setStatus("connected");
                        setError(null);
                        break;
                    }
                    case "auth": {
                        if (message.message !== "ok") {
                            setError(
                                message.message ?? "Authentication failed"
                            );
                            setStatus("error");
                            socket.close(3000, "Authentication failed");
                        }
                        break;
                    }
                    case "playback": {
                        if (message.payload) {
                            setPlayback(message.payload);
                            if (!adjustingMusicVolumeRef.current) {
                                setLocalMusicVolume(message.payload.volume);
                            }
                            const remoteSystemVolume =
                                typeof message.payload.systemVolume === "number"
                                    ? message.payload.systemVolume
                                    : null;
                            if (!adjustingSystemVolumeRef.current) {
                                setLocalSystemVolume(remoteSystemVolume);
                            }
                            setError(null);
                            setStatus("connected");
                        }
                        break;
                    }
                    case "ack": {
                        setError(null);
                        break;
                    }
                    case "error": {
                        setError(message.message ?? "Server error");
                        setStatus("error");
                        break;
                    }
                    case "pong": {
                        // heartbeat acknowledgement, nothing else to do
                        break;
                    }
                }
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Invalid message from server"
                );
            }
        };

        socket.onerror = () => {
            setError("WebSocket error");
            setStatus("error");
        };

        socket.onclose = () => {
            if (wsRef.current === socket) {
                wsRef.current = null;
            }
            if (heartbeatTimerRef.current) {
                window.clearInterval(heartbeatTimerRef.current);
                heartbeatTimerRef.current = null;
            }
            if (!token || !serverInfo) {
                setStatus("idle");
                return;
            }
            setStatus("connecting");
            if (reconnectTimerRef.current) {
                return;
            }
            reconnectTimerRef.current = window.setTimeout(() => {
                reconnectTimerRef.current = null;
                connectWebSocket();
            }, 2000);
        };
    }, [token, serverInfo, buildWebSocketUrl]);

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
            if (heartbeatTimerRef.current) {
                window.clearInterval(heartbeatTimerRef.current);
            }
            if (reconnectTimerRef.current) {
                window.clearTimeout(reconnectTimerRef.current);
            }
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close(1000, "Component unmounted");
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
        if (
            typeof window !== "undefined" &&
            window.location.origin.startsWith("http")
        ) {
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
                    const response = await fetch(
                        `${candidate.replace(/\/$/, "")}/api/ping`,
                        {
                            method: "GET",
                            mode: "cors",
                        }
                    );
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
        if (!api || !token) {
            setServerInfo(null);
            return;
        }

        let cancelled = false;
        setStatus("connecting");
        setError(null);

        api.ping()
            .then((info) => {
                if (cancelled) {
                    return;
                }
                setServerInfo(info);
            })
            .catch((err: Error) => {
                if (cancelled) {
                    return;
                }
                setServerInfo(null);
                setPlayback(null);
                setError(err.message);
                setStatus("error");
            });

        return () => {
            cancelled = true;
        };
    }, [api, token]);

    useEffect(() => {
        if (!token || !serverInfo) {
            if (wsRef.current) {
                wsRef.current.close(1000, "Missing credentials");
                wsRef.current = null;
            }
            return;
        }
        connectWebSocket();
    }, [token, serverInfo, connectWebSocket]);

    const sendCommand = useCallback(
        (action: string) => {
            const socket = wsRef.current;
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                if (socket && socket.readyState === WebSocket.CONNECTING) {
                    setStatus("connecting");
                } else {
                    setError("Not connected");
                    setStatus("error");
                }
                return;
            }
            if (sendWsMessage({ type: "command", action })) {
                setError(null);
            }
        },
        [sendWsMessage]
    );

    const handleToggle = useCallback(
        () => sendCommand("toggle"),
        [sendCommand]
    );
    const handleNext = useCallback(() => sendCommand("next"), [sendCommand]);
    const handlePrevious = useCallback(
        () => sendCommand("previous"),
        [sendCommand]
    );

    const handleMusicVolumeChange = useCallback(
        (value: number) => {
            setLocalMusicVolume(value);
            adjustingMusicVolumeRef.current = true;
            if (musicVolumeDebounceRef.current) {
                window.clearTimeout(musicVolumeDebounceRef.current);
            }
            musicVolumeDebounceRef.current = window.setTimeout(async () => {
                try {
                    if (
                        !sendWsMessage({
                            type: "setVolume",
                            target: "music",
                            value,
                        })
                    ) {
                        throw new Error("Not connected");
                    }
                    setError(null);
                } catch (err) {
                    const message =
                        err instanceof Error ? err.message : String(err);
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
            adjustingSystemVolumeRef.current = true;
            if (systemVolumeDebounceRef.current) {
                window.clearTimeout(systemVolumeDebounceRef.current);
            }
            systemVolumeDebounceRef.current = window.setTimeout(async () => {
                try {
                    if (
                        !sendWsMessage({
                            type: "setVolume",
                            target: "system",
                            value,
                        })
                    ) {
                        throw new Error("Not connected");
                    }
                    setError(null);
                } catch (err) {
                    const message =
                        err instanceof Error ? err.message : String(err);
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
        [sendWsMessage]
    );

    const progressPercent = useMemo(() => {
        const progress = playback?.progress;
        if (!progress || !progress.duration) {
            return 0;
        }
        return Math.min(
            100,
            Math.max(0, (progress.elapsed / progress.duration) * 100)
        );
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
    const remoteSystemVolume =
        typeof playback?.systemVolume === "number"
            ? playback.systemVolume
            : null;
    const musicVolumeValue = localMusicVolume ?? playback?.volume ?? 0;
    const systemVolumeValue = localSystemVolume ?? remoteSystemVolume ?? 0;
    const systemVolumeAvailable =
        localSystemVolume !== null || remoteSystemVolume !== null;
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
                        <div className="server-meta">
                            v{serverInfo.version} · port {serverInfo.port}
                        </div>
                    )}

                    <h1 className="track-title">{trackTitle}</h1>
                    {trackArtist && <p className="track-meta">{trackArtist}</p>}
                    {trackAlbum && <p className="track-meta">{trackAlbum}</p>}
                    <p className="track-meta">State: {playbackState}</p>

                    <div>
                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <div className="progress-times">
                            <span>
                                {formatTime(playback?.progress?.elapsed)}
                            </span>
                            <span>
                                {formatTime(playback?.progress?.duration)}
                            </span>
                        </div>
                    </div>

                    <div className="controls">
                        <button
                            onClick={handlePrevious}
                            disabled={disableControls}
                        >
                            ⏮ Prev
                        </button>
                        <button onClick={handleNext} disabled={disableControls}>
                            Next ⏭
                        </button>
                        <button
                            onClick={handleToggle}
                            disabled={disableControls}
                        >
                            {playbackState === "playing"
                                ? "❚❚ Pause"
                                : "▶︎ Play"}
                        </button>
                    </div>

                    <div className="volume-grid">
                        <div className="volume">
                            <div className="section-title">
                                Music.app Volume
                            </div>
                            <input
                                className="volume-slider"
                                type="range"
                                min={0}
                                max={100}
                                value={musicVolumeValue}
                                onChange={(event) =>
                                    handleMusicVolumeChange(
                                        Number(event.target.value)
                                    )
                                }
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
                                onChange={(event) =>
                                    handleSystemVolumeChange(
                                        Number(event.target.value)
                                    )
                                }
                                disabled={
                                    disableControls || !systemVolumeAvailable
                                }
                            />
                            <div>
                                {systemVolumeAvailable
                                    ? systemVolumeValue
                                    : "Unavailable"}
                            </div>
                        </div>
                    </div>

                    {!systemVolumeAvailable && (
                        <div className="server-meta">
                            System volume control is disabled. Grant
                            accessibility permissions to Apple Music Remote if
                            prompted.
                        </div>
                    )}

                    {error && status === "error" && (
                        <div className="error-message">{error}</div>
                    )}
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
                        Token is required for control actions. Copy it from the
                        menu bar icon.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;
