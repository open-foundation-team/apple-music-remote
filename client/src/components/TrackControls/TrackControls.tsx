import { PlayerState } from '../../api/types';
import styles from './TrackControls.module.css';

interface TrackControlsProps {
  handlePrevious: () => void;
  handleToggle: () => void;
  handleNext: () => void;
  disableControls: boolean;
  playbackState: PlayerState;
}

export const TrackControls = ({
  handlePrevious,
  handleToggle,
  handleNext,
  disableControls,
  playbackState,
}: TrackControlsProps) => {
  return (
    <div className={styles.buttonGroup}>
      <button onClick={handlePrevious} disabled={disableControls}>
        ⏮
      </button>
      <button
        className={styles.primary}
        onClick={handleToggle}
        disabled={disableControls}
      >
        {playbackState === 'playing' ? '❚❚' : '▶︎'}
      </button>
      <button onClick={handleNext} disabled={disableControls}>
        ⏭
      </button>
    </div>
  );
};
