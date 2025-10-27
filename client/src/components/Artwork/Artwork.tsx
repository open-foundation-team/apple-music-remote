import styles from './Artwork.module.css';

interface ArtworkProps {
  src: string | null;
  alt: string;
}

export const Artwork = ({ src, alt }: ArtworkProps) => {
  return (
    <div className={styles.artworkStyled}>
      {src ? (
        <img className={styles.artwork} src={src} alt={alt} />
      ) : (
        <div className={styles.placeholder}>{alt}</div>
      )}
    </div>
  );
};
