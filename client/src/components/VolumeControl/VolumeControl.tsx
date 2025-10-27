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
  return (
    <div className={styles.volumeContainer}>
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
      <div>{systemVolume}</div>
    </div>
  );
};
