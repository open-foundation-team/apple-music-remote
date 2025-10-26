import { ConnectionStatus, useRemoteConnection } from "./hooks/useRemoteConnection";
import { useAutoDiscovery } from "./hooks/useAutoDiscovery";
import { usePersistentState } from "./hooks/usePersistentState";
import { useVolumeControls } from "./hooks/useVolumeControls";
import { formatTime } from "./utils/time";
import { calculateProgressPercent } from "./utils/playback";
import { statusDotClass } from "./utils/status";
import { inferDefaultBaseUrl } from "./utils/network";
import { buildStatusLabel, derivePlaybackDetails } from "./utils/connection";
import "./styles/App.css";

const App = () => {
  const [baseUrl, setBaseUrl] = usePersistentState<string>("amr.baseUrl", inferDefaultBaseUrl);
  const [token, setToken] = usePersistentState<string>("amr.token", "");

  useAutoDiscovery(baseUrl, setBaseUrl);

  const {
    status,
    error,
    setError,
    serverInfo,
    playback,
    sendCommand,
    sendMusicVolume,
    sendSystemVolume
  } = useRemoteConnection({ baseUrl, token });

  const {
    musicVolume,
    systemVolume,
    systemVolumeAvailable,
    handleMusicVolumeChange,
    handleSystemVolumeChange
  } = useVolumeControls({
    playback,
    status,
    onSetMusicVolume: sendMusicVolume,
    onSetSystemVolume: sendSystemVolume,
    onError: setError
  });

  const handleToggle = () => {
    sendCommand("toggle");
  };

  const handleNext = () => {
    sendCommand("next");
  };

  const handlePrevious = () => {
    sendCommand("previous");
  };

  const { artworkSrc, trackTitle, trackArtist, trackAlbum, playbackState } = derivePlaybackDetails(playback);
  const disableControls = status !== "connected";
  const progressPercent = calculateProgressPercent(playback);

  const statusLabel = buildStatusLabel(status, token, baseUrl, serverInfo?.name ?? null, error);

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
            <span className={statusDotClass(status)} />
            <span>{statusLabel}</span>
          </div>
          {serverInfo && (
            <div className="server-meta">
              v{serverInfo.version} · port {serverInfo.port} · ws {serverInfo.webSocketPort}
            </div>
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
                value={musicVolume}
                onChange={(event) => handleMusicVolumeChange(Number(event.target.value))}
                disabled={disableControls}
              />
              <div>{musicVolume}</div>
            </div>
            <div className="volume">
              <div className="section-title">System Volume</div>
              <input
                className="volume-slider"
                type="range"
                min={0}
                max={100}
                value={systemVolume}
                onChange={(event) => handleSystemVolumeChange(Number(event.target.value))}
                disabled={disableControls || !systemVolumeAvailable}
              />
              <div>{systemVolumeAvailable ? systemVolume : "Unavailable"}</div>
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
