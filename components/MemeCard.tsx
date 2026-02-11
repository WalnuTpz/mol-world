"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import NextImage from "next/image";

import styles from "./MemeCard.module.css";
import { useToast } from "./ToastProvider";

type MemeType = "STATIC" | "ANIMATED";

const COPY_COOLDOWN_MS = 5000;
let lastCopyAt = 0;

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
  const [selected, setSelected] = useState(false);
  const highlightTimerRef = useRef<number | null>(null);
  const toast = useToast();
  const visibleTags = tags.slice(0, 4);
  const isGifThumb = thumbUrl.toLowerCase().endsWith(".gif");
  const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  const resolveOriginalUrl = (url: string) => {
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.pathname === "/_next/image") {
        const original = parsed.searchParams.get("url");
        if (original) {
          return original.startsWith("/")
            ? original
            : new URL(original, window.location.origin).toString();
        }
      }
      return parsed.toString();
    } catch {
      return url;
    }
  };

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
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image load failed"));
      img.src = resolveOriginalUrl(url);
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
    const res = await fetch(resolveOriginalUrl(url));
    const blob = await res.blob();
    if (blob.type !== "image/gif") return "fail" as const;
    try {
      return await copyBlobToClipboard(blob);
    } catch {
      return "fail" as const;
    }
  };

  const triggerHighlight = () => {
    setSelected(true);
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setSelected(false);
      highlightTimerRef.current = null;
    }, 800);
  };

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    triggerHighlight();
    const now = Date.now();
    if (now - lastCopyAt < COPY_COOLDOWN_MS) {
      toast("操作过于频繁", "error", undefined, "请稍后再试");
      return;
    }
    lastCopyAt = now;
    try {
      if (type === "STATIC") {
        const result = await copyPngFromUrl(mediaUrl);
        if (result === "clipboard") {
          await incrementCopy();
          toast("已复制图片", "success");
          return;
        }
        if (result === "text") {
          await incrementCopy();
          toast("已复制图片（文本形式）", "success");
          return;
        }
        toast("复制失败", "error");
        return;
      }

      const gifResult = await copyGifFromUrl(mediaUrl);
      if (gifResult === "clipboard") {
        await incrementCopy();
        toast("已复制动图", "success", undefined, "（可通过下载获取完整动图）");
        return;
      }

      const thumbResult = await copyPngFromUrl(thumbUrl);
      if (thumbResult === "clipboard") {
        await incrementCopy();
        toast("已复制封面图", "success", undefined, "（可通过下载获取完整动图）");
        return;
      }
      if (thumbResult === "text") {
        await incrementCopy();
        toast(
          "已复制封面图（文本形式）",
          "success",
          undefined,
          "（可通过下载获取完整动图）"
        );
        return;
      }
      toast("复制失败", "error");
    } catch (error) {
      console.error(error);
      toast("复制失败", "error");
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
    } catch (error) {
      console.error(error);
      toast("下载失败", "error");
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void handleCopy();
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
    <div
      className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
      onClick={handleCopy}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className={styles.media}>
        <NextImage
          className={styles.thumb}
          src={thumbUrl}
          alt={title ?? "meme"}
          fill
          sizes="(max-width: 680px) 100vw, (max-width: 960px) 50vw, 25vw"
          unoptimized={isGifThumb}
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
        <div className={styles.tags}>
          {visibleTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={styles.tag}
              onClick={(event) => {
                event.stopPropagation();
                window.location.href = `/?view=search&q=${encodeURIComponent(tag)}`;
              }}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
