import { formatTime } from '../../utils/time';
import type { ProgressMode } from '../../hooks/usePlaybackProgress';
import styles from './TrackScrubber.module.css';

interface TrackScrubberProps {
  elapsed: number;
  duration: number;
  percent: number;
  mode: ProgressMode;
  resetKey: number;
}

export const TrackScrubber = ({ elapsed, duration, percent, mode, resetKey }: TrackScrubberProps) => {
  const clampedPercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;

  return (
    <div className={styles.trackScrubberStyled}>
      <p className={styles.scrubberLabel}>{formatTime(elapsed)}</p>
      <progress
        key={resetKey}
        className={`${styles.scrubberProgress} ${mode === 'animating' ? styles.isAnimating : ''}`.trim()}
        value={clampedPercent}
        max={100}
        title={`${clampedPercent.toFixed(2)}%`}
      />
      <p className={styles.scrubberLabel}>{formatTime(duration)}</p>
    </div>
  );
};
