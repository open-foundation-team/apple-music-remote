import { PlaybackInfo } from '../../api/types';
import { formatTime } from '../../utils/time';
import styles from './TrackScrubber.module.css';

interface TrackScrubberProps {
  progressPercent: number;
  playback?: PlaybackInfo | null;
}

export const TrackScrubber = ({ progressPercent, playback }: TrackScrubberProps) => {
  return (
    <div className={styles.trackScrubberStyled}>
      <p className={styles.scrubberLabel}>{formatTime(playback?.progress?.elapsed)}</p>
      <progress
        value={progressPercent}
        max="100"
        title={`${progressPercent.toFixed(2)}%`}
      />
      <p className={styles.scrubberLabel}>{formatTime(playback?.progress?.duration)}</p>
    </div>
  );
};
