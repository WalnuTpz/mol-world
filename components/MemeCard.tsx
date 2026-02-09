"use client";

import type { MouseEvent } from "react";

import styles from "./MemeCard.module.css";

type MemeType = "STATIC" | "ANIMATED";

export type MemeCardProps = {
  id: string;
  title?: string | null;
  type: MemeType;
  mediaUrl: string;
  thumbUrl: string;
  onDownloaded?: (id: string) => void;
};

export default function MemeCard({
  id,
  title,
  type,
  mediaUrl,
  thumbUrl,
  onDownloaded,
}: MemeCardProps) {
  const handleCopy = async () => {
    try {
      if (type !== "STATIC") {
        alert("动图复制下一步再做");
        return;
      }

      const res = await fetch(mediaUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      alert("已复制图片");
    } catch {
      alert("复制失败");
    }
  };

  const handleDownload = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      await fetch(`/api/memes/${id}/download`, { method: "POST" });
      onDownloaded?.(id);
    } catch {
      // ignore
    }
  };

  return (
    <div className={styles.card} onClick={handleCopy}>
      <div className={styles.media}>
        <img
          className={styles.thumb}
          src={thumbUrl}
          alt={title ?? "meme"}
          loading="lazy"
        />
        <span className={styles.badge}>
          {type === "STATIC" ? "静态" : "动图"}
        </span>
        <a href={mediaUrl} download>
          <button
            className={styles.downloadBtn}
            onClick={handleDownload}
          >
            下载
          </button>
        </a>
      </div>
      <div className={styles.title}>{title ?? "未命名"}</div>
    </div>
  );
}
