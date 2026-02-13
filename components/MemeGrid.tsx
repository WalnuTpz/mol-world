import MemeCard from "./MemeCard";
import styles from "./MemeGrid.module.css";

type Meme = {
  id: string;
  title?: string | null;
  type: "STATIC" | "ANIMATED";
  mediaUrl: string;
  thumbUrl: string;
  copies: number;
  tags?: string[];
};

type MemeGridProps = {
  items: Meme[];
  copyCooldownMs?: number;
};

export default function MemeGrid({ items, copyCooldownMs }: MemeGridProps) {
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
          copyCount={meme.copies}
          tags={meme.tags ?? []}
          copyCooldownMs={copyCooldownMs}
        />
      ))}
    </div>
  );
}
