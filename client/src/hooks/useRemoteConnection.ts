import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RemoteApi } from "../api/client";
import { PlaybackInfo, ServerStatus } from "../api/types";
import { normalizeBaseUrl } from "../utils/network";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

type ServerMessageType = "hello" | "auth" | "playback" | "ack" | "error" | "pong";

type ServerMessage = {
  type: ServerMessageType;
  message?: string;
  action?: string;
  payload?: PlaybackInfo;
  heartbeatInterval?: number;
  server?: ServerStatus;
  requestId?: string;
};

interface RemoteConnectionOptions {
  baseUrl: string;
  token: string;
}

interface RemoteConnectionResult {
  status: ConnectionStatus;
  error: string | null;
  setError: (value: string | null) => void;
  serverInfo: ServerStatus | null;
  playback: PlaybackInfo | null;
  sendCommand: (action: string) => boolean;
  sendMusicVolume: (value: number) => boolean;
  sendSystemVolume: (value: number) => boolean;
}

const RECONNECT_DELAY_MS = 2000;
const MIN_HEARTBEAT_INTERVAL_MS = 5000;
const PING_OFFSET_MS = 5000;

export function useRemoteConnection({ baseUrl, token }: RemoteConnectionOptions): RemoteConnectionResult {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerStatus | null>(null);
  const [playback, setPlayback] = useState<PlaybackInfo | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);

  const api = useMemo(() => {
    if (!baseUrl || !token) {
      return null;
    }
    return new RemoteApi(baseUrl, token);
  }, [baseUrl, token]);

  const clearReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const closeSocket = useCallback(
    (code: number = 1000, reason?: string) => {
      const socket = wsRef.current;
      if (socket) {
        socket.onclose = null;
        socket.close(code, reason);
        wsRef.current = null;
      }
      clearHeartbeat();
      clearReconnect();
    },
    [clearHeartbeat, clearReconnect]
  );

  useEffect(() => {
    return () => {
      closeSocket();
    };
  }, [closeSocket]);

  useEffect(() => {
    closeSocket();
    setPlayback(null);
    setServerInfo(null);
    if (!baseUrl || !token) {
      setStatus("idle");
      return;
    }
    setStatus("connecting");
  }, [baseUrl, token, closeSocket]);

  useEffect(() => {
    if (!api) {
      return;
    }
    let cancelled = false;
    setStatus("connecting");
    setError(null);

    api
      .ping()
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
        setStatus("error");
        setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  const buildWebSocketUrl = useCallback((): string | null => {
    if (!serverInfo) {
      return null;
    }
    try {
      let candidate = normalizeBaseUrl(baseUrl);
      if (!candidate) {
        return null;
      }
      const url = new URL(candidate);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const wsPort = serverInfo.webSocketPort ?? (url.port ? Number(url.port) + 1 : serverInfo.port + 1);
      if (wsPort) {
        url.port = String(wsPort);
      }
      url.pathname = "/";
      url.search = "client=web";
      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
  }, [baseUrl, normalizeBaseUrl, serverInfo]);

  const sendWsMessage = useCallback((payload: unknown): boolean => {
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

    const existing = wsRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = buildWebSocketUrl();
    if (!url) {
      setError("Invalid WebSocket URL");
      setStatus("error");
      return;
    }

    clearReconnect();
    clearHeartbeat();

    const socket = new WebSocket(url);
    wsRef.current = socket;
    setStatus("connecting");

    socket.onopen = () => {
      setError(null);
      socket.send(JSON.stringify({ type: "auth", token }));
      socket.send(JSON.stringify({ type: "requestState" }));
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        switch (message.type) {
          case "hello": {
            if (typeof message.heartbeatInterval === "number") {
              const intervalMs = Math.max(MIN_HEARTBEAT_INTERVAL_MS, message.heartbeatInterval * 1000);
              clearHeartbeat();
              heartbeatTimerRef.current = window.setInterval(() => {
                const current = wsRef.current;
                if (current && current.readyState === WebSocket.OPEN) {
                  current.send(JSON.stringify({ type: "ping" }));
                }
              }, Math.max(MIN_HEARTBEAT_INTERVAL_MS, intervalMs - PING_OFFSET_MS));
            }
            if (message.server) {
              setServerInfo(message.server);
            }
            setStatus("connected");
            setError(null);
            break;
          }
          case "auth": {
            if (message.message !== "ok") {
              setError(message.message ?? "Authentication failed");
              setStatus("error");
              closeSocket(3000, "Authentication failed");
            }
            break;
          }
          case "playback": {
            if (message.payload) {
              setPlayback(message.payload);
              setStatus("connected");
              setError(null);
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
            // Heartbeat acknowledgement
            break;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid message from server");
        setStatus("error");
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
      clearHeartbeat();
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
      }, RECONNECT_DELAY_MS);
    };
  }, [buildWebSocketUrl, clearHeartbeat, clearReconnect, closeSocket, serverInfo, setError, setStatus, setServerInfo, setPlayback, token]);

  useEffect(() => {
    if (!token || !serverInfo) {
      return;
    }
    connectWebSocket();
  }, [connectWebSocket, serverInfo, token]);

  const sendCommand = useCallback(
    (action: string) => {
      const success = sendWsMessage({ type: "command", action });
      if (!success) {
        setError("Not connected");
        setStatus("error");
      }
      return success;
    },
    [sendWsMessage, setError, setStatus]
  );

  const sendMusicVolume = useCallback(
    (value: number) => {
      const success = sendWsMessage({ type: "setVolume", target: "music", value });
      if (!success) {
        setError("Not connected");
        setStatus("error");
      }
      return success;
    },
    [sendWsMessage, setError, setStatus]
  );

  const sendSystemVolume = useCallback(
    (value: number) => {
      const success = sendWsMessage({ type: "setVolume", target: "system", value });
      if (!success) {
        setError("Not connected");
        setStatus("error");
      }
      return success;
    },
    [sendWsMessage, setError, setStatus]
  );

  return {
    status,
    error,
    setError,
    serverInfo,
    playback,
    sendCommand,
    sendMusicVolume,
    sendSystemVolume
  };
}
