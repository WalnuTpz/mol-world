import MemeCard from "./MemeCard";
import styles from "./MemeGrid.module.css";

type Meme = {
  id: string;
  title?: string | null;
  type: "STATIC" | "ANIMATED";
  mediaUrl: string;
  thumbUrl: string;
  downloads: number;
};

type MemeGridProps = {
  items: Meme[];
};

export default function MemeGrid({ items }: MemeGridProps) {
  return (
    <div className={styles.grid}>
      {items.map((meme) => (
        <MemeCard
          key={meme.id}
          id={meme.id}
          title={meme.title}
          type={meme.type}
          mediaUrl={meme.mediaUrl}
          thumbUrl={meme.thumbUrl}
          copyCount={meme.downloads}
        />
      ))}
    </div>
  );
}
