"use client";

import { useState, type MouseEvent } from "react";

import styles from "./MemeCard.module.css";

type MemeType = "STATIC" | "ANIMATED";

export type MemeCardProps = {
  id: string;
  title?: string | null;
  type: MemeType;
  mediaUrl: string;
  thumbUrl: string;
  copyCount: number;
  tags?: string[];
};

export default function MemeCard({
  id,
  title,
  type,
  mediaUrl,
  thumbUrl,
  copyCount,
  tags = [],
}: MemeCardProps) {
  const [count, setCount] = useState(copyCount);
  const visibleTags = tags.slice(0, 4);
  const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  const copyText = async (text: string) => {
    if (!navigator.clipboard?.writeText) return "fail" as const;
    await navigator.clipboard.writeText(text);
    return "text" as const;
  };

  const copyBlobToClipboard = async (blob: Blob) => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      return "fail" as const;
    }
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob }),
    ]);
    return "clipboard" as const;
  };

  const loadImage = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image load failed"));
      img.src = url;
    });

  const copyPngFromUrl = async (url: string) => {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "fail" as const;
    ctx.drawImage(img, 0, 0);
    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!pngBlob) return "fail" as const;

    try {
      return await copyBlobToClipboard(pngBlob);
    } catch {
      const dataUrl = await blobToDataUrl(pngBlob);
      return await copyText(dataUrl);
    }
  };

  const copyGifFromUrl = async (url: string) => {
    const res = await fetch(url);
    const blob = await res.blob();
    if (blob.type !== "image/gif") return "fail" as const;
    try {
      return await copyBlobToClipboard(blob);
    } catch {
      return "fail" as const;
    }
  };

  const handleCopy = async () => {
    try {
      if (type === "STATIC") {
        const result = await copyPngFromUrl(mediaUrl);
        if (result === "clipboard") {
          await incrementCopy();
          alert("已复制图片");
          return;
        }
        if (result === "text") {
          await incrementCopy();
          alert("已复制图片（文本形式）");
          return;
        }
        alert("复制失败");
        return;
      }

      const gifResult = await copyGifFromUrl(mediaUrl);
      if (gifResult === "clipboard") {
        await incrementCopy();
        alert("已复制动图");
        return;
      }

      const thumbResult = await copyPngFromUrl(thumbUrl);
      if (thumbResult === "clipboard") {
        await incrementCopy();
        alert("已复制封面图");
        return;
      }
      if (thumbResult === "text") {
        await incrementCopy();
        alert("已复制封面图（文本形式）");
        return;
      }
      alert("复制失败");
    } catch (error) {
      console.error(error);
      alert("复制失败");
    }
  };

  const handleDownload = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      const link = document.createElement("a");
      link.href = mediaUrl;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // ignore
    }
  };

  const incrementCopy = async () => {
    try {
      const res = await fetch(`/api/memes/${id}/download`, { method: "POST" });
      if (!res.ok) return;
      const data = (await res.json()) as { item?: { copies?: number } };
      if (typeof data.item?.copies === "number") {
        setCount(data.item.copies);
      } else {
        setCount((prev) => prev + 1);
      }
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
        <button
          type="button"
          className={styles.downloadBtn}
          onClick={handleDownload}
        >
          下载
        </button>
      </div>
      <div className={styles.footer}>
        <div className={styles.titleRow}>
          <div className={styles.title}>{title ?? "未命名"}</div>
          <div className={styles.copyCount} aria-label={`点击量 ${count}`}>
            <svg
              className={styles.copyIcon}
              viewBox="0 0 24 24"
              width="14"
              height="14"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path
                d="M3 12c2.6-4.5 6.9-7 9-7s6.4 2.5 9 7c-2.6 4.5-6.9 7-9 7s-6.4-2.5-9-7z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            <span>{count}</span>
          </div>
        </div>
        <div
          className={styles.tags}
          onClick={(event) => event.stopPropagation()}
        >
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className={styles.tag}
              onClick={(event) => event.stopPropagation()}
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
