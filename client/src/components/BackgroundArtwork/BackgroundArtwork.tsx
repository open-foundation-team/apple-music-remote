import styles from './BackgroundArtwork.module.css';

export type BackgroundArtworkProps = {
  src: string | null;
  alt?: string;
};

export const BackgroundArtwork = ({ src, alt }: BackgroundArtworkProps) => {
  return (
    <div className={styles.backgroundArtworkStyled}>
      <img src={src ?? ''} alt={alt ?? ''} />
    </div>
  );
};
