import styles from './TrackDetails.module.css';

export type TrackDetailsProps = {
  trackTitle: string;
  trackArtist: string;
  trackAlbum: string;
};

export const TrackDetails = ({
  trackTitle,
  trackArtist,
  trackAlbum,
}: TrackDetailsProps) => {
  return (
    <div className={styles.trackDetailsStyled}>
      <p className={styles.trackTitle}>{trackTitle}</p>
      <p className={styles.trackArtist}>{trackArtist}</p>
      <p className={styles.trackAlbum}>{trackAlbum}</p>
    </div>
  );
};
