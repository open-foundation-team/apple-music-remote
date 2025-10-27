import { SpeakerXMarkIcon, SpeakerWaveIcon } from '@heroicons/react/24/outline';

import styles from './VolumeControl.module.css';

interface VolumeControlProps {
  systemVolume: number;
  handleSystemVolumeChange: (volume: number) => void;
  disableControls: boolean;
}

export const VolumeControl = ({
  systemVolume,
  handleSystemVolumeChange,
  disableControls,
}: VolumeControlProps) => {
  const VolumeIcon = systemVolume === 0 ? <SpeakerXMarkIcon /> : <SpeakerWaveIcon />;

  return (
    <div className={styles.volumeContainer}>
      <div className={styles.volumeIcon}>{VolumeIcon}</div>
      <input
        className={styles.volumeSlider}
        type="range"
        min={0}
        max={100}
        step={5}
        value={systemVolume}
        onChange={event => handleSystemVolumeChange(Number(event.target.value))}
        disabled={disableControls}
      />
      <p className={styles.volumeLabel}>{systemVolume}</p>
    </div>
  );
};
