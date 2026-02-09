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
          alert("已复制图片");
          return;
        }
        if (result === "text") {
          alert("已复制图片（文本形式）");
          return;
        }
        alert("复制失败");
        return;
      }

      const gifResult = await copyGifFromUrl(mediaUrl);
      if (gifResult === "clipboard") {
        alert("已复制动图");
        return;
      }

      const thumbResult = await copyPngFromUrl(thumbUrl);
      if (thumbResult === "clipboard") {
        alert("已复制封面图");
        return;
      }
      if (thumbResult === "text") {
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
