import { useState } from 'react';

import { Artwork } from '../components/Artwork';
import { BackgroundArtwork } from '../components/BackgroundArtwork';
import { ConnectionIndicator } from '../components/ConnectionIndicator';
import { SettingsButton } from '../components/SettingsButton';
import { SettingsModal } from '../components/SettingsModal';
import { TrackControls } from '../components/TrackControls';
import { TrackDetails } from '../components/TrackDetails';
import { TrackScrubber } from '../components/TrackScrubber';
import { VolumeControl } from '../components/VolumeControl';

import { useRemoteConnection } from '../hooks/useRemoteConnection';
import { usePersistentState } from '../hooks/usePersistentState';
import { useVolumeControls } from '../hooks/useVolumeControls';
import { useAutoDiscovery } from '../hooks/useAutoDiscovery';

import { buildStatusLabel, derivePlaybackDetails } from '../utils/connection';
import { calculateProgressPercent } from '../utils/playback';
import { inferDefaultBaseUrl } from '../utils/network';

import styles from '../styles/Setup.module.css';

const Home = () => {
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  const [baseUrl, setBaseUrl] = usePersistentState<string>(
    'amr.baseUrl',
    inferDefaultBaseUrl
  );
  const [token] = usePersistentState<string>('amr.token', '');

  useAutoDiscovery(baseUrl, setBaseUrl);

  const {
    status,
    error,
    setError,
    serverInfo,
    playback,
    sendCommand,
    sendMusicVolume,
    sendSystemVolume,
  } = useRemoteConnection({ baseUrl, token });

  const { systemVolume, handleSystemVolumeChange } = useVolumeControls({
    playback,
    status,
    onSetMusicVolume: sendMusicVolume,
    onSetSystemVolume: sendSystemVolume,
    onError: setError,
  });

  const handleToggle = () => {
    sendCommand('toggle');
  };

  const handleNext = () => {
    sendCommand('next');
  };

  const handlePrevious = () => {
    sendCommand('previous');
  };

  const { artworkSrc, trackTitle, trackArtist, trackAlbum, playbackState } =
    derivePlaybackDetails(playback);
  const disableControls = status !== 'connected';
  const progressPercent = calculateProgressPercent(playback);

  const statusLabel = buildStatusLabel(
    status,
    token,
    baseUrl,
    serverInfo?.name ?? null,
    error
  );

  return (
    <div className={styles.appContainer}>
      <ConnectionIndicator status={status} statusLabel={statusLabel} />
      <SettingsButton onClick={() => setShowSettingsModal(true)} />
      {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
      <BackgroundArtwork src={artworkSrc} alt={trackTitle} />
      <div className={styles.appMain}>
        <div className={styles.appTop}>
          <Artwork src={artworkSrc} alt={trackTitle} />
          <div className={styles.playbackContainer}>
            <TrackDetails
              trackTitle={trackTitle}
              trackArtist={trackArtist}
              trackAlbum={trackAlbum}
            />
            <TrackControls
              handlePrevious={handlePrevious}
              handleToggle={handleToggle}
              handleNext={handleNext}
              disableControls={disableControls}
              playbackState={playbackState}
            />
          </div>
        </div>
        <div className={styles.appBottom}>
          <TrackScrubber progressPercent={progressPercent} playback={playback} />
          <VolumeControl
            systemVolume={systemVolume}
            handleSystemVolumeChange={handleSystemVolumeChange}
            disableControls={disableControls}
          />
        </div>
      </div>
    </div>
  );
};

export default Home;
