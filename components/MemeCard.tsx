"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";

import styles from "./MemeCard.module.css";
import { useToast } from "./ToastProvider";
import { formatCount } from "@/lib/format";

type MemeType = "STATIC" | "ANIMATED";

const DEFAULT_COPY_COOLDOWN_MS = 5000;
const DEFAULT_DOWNLOAD_COOLDOWN_MS = 10_000;
const interactionTimes = new Map<string, number>();
// Shared by cards, consumed only by event handlers.
function consumeCooldown(kind: "copy" | "download", milliseconds: number) {
  const now = Date.now();
  if (now - (interactionTimes.get(kind) ?? 0) < milliseconds) return false;
  interactionTimes.set(kind, now);
  return true;
}
const COPY_FAIL_MESSAGE = "尝试右键/长按保存图片或更新浏览器";

export type MemeCardProps = {
  id: string;
  title?: string | null;
  type: MemeType;
  mediaUrl: string;
  thumbUrl: string;
  copyCount: number;
  tags?: string[];
  copyCooldownMs?: number;
  downloadCooldownMs?: number;
};

export default function MemeCard({
  id,
  title,
  type,
  mediaUrl,
  thumbUrl,
  copyCount,
  tags = [],
  copyCooldownMs,
  downloadCooldownMs,
}: MemeCardProps) {
  const [count, setCount] = useState(copyCount);
  const [selected, setSelected] = useState(false);
  const highlightTimerRef = useRef<number | null>(null);
  const toast = useToast();
  const router = useRouter();
  const visibleTags = tags.slice(0, 4);
  const isGifThumb = thumbUrl.toLowerCase().endsWith(".gif");
  const triggerHighlight = () => {
    setSelected(true);
    if (highlightTimerRef.current)
      window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setSelected(false);
      highlightTimerRef.current = null;
    }, 800);
  };
  useEffect(
    () => () => {
      if (highlightTimerRef.current)
        window.clearTimeout(highlightTimerRef.current);
    },
    [],
  );

  type CopyGrant = {
    token: string;
    item: { mediaUrl: string; thumbUrl: string; type: MemeType };
  };
  const prepareCopy = async (): Promise<CopyGrant> => {
    const response = await fetch(`/api/memes/${id}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prepare" }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "无法复制图片");
    return data;
  };
  const copyBlob = async (
    grant: CopyGrant,
    mime: "image/png" | "image/gif",
  ) => {
    const url =
      mime === "image/gif" || grant.item.type === "STATIC"
        ? grant.item.mediaUrl
        : grant.item.thumbUrl;
    const response = await fetch(url);
    if (!response.ok) throw new Error("图片加载失败");
    const blob = await response.blob();
    if (mime === "image/gif" || blob.type === "image/png") return blob;
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器不支持图片转换");
      context.drawImage(bitmap, 0, 0);
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("图片转换失败")),
          "image/png",
        ),
      );
    } finally {
      bitmap.close();
    }
  };

  const handleCopy = async () => {
    triggerHighlight();
    if (!consumeCooldown("copy", copyCooldownMs ?? DEFAULT_COPY_COOLDOWN_MS)) {
      toast("操作过于频繁", "error", undefined, "请稍后再试");
      return;
    }
    const canWriteImage =
      !!navigator.clipboard?.write && typeof ClipboardItem !== "undefined";
    if (!canWriteImage && !navigator.clipboard?.writeText) {
      toast(COPY_FAIL_MESSAGE, "error");
      return;
    }
    const mime =
      canWriteImage &&
      type === "ANIMATED" &&
      ClipboardItem.supports?.("image/gif")
        ? "image/gif"
        : "image/png";
    const grant = prepareCopy();
    const blob = grant.then((value) => copyBlob(value, mime));
    // Pass a promise immediately while the click's user activation is alive.
    // Safari can reject a clipboard write started only after network awaits.
    let textCopy = false;
    const writeAsText = async () => {
      const value = await blob;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(value);
      });
      await navigator.clipboard.writeText(dataUrl);
      textCopy = true;
    };
    try {
      if (canWriteImage) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ [mime]: blob }),
          ]);
        } catch (error) {
          if (!navigator.clipboard.writeText) throw error;
          await writeAsText();
        }
      } else await writeAsText();
    } catch (error) {
      void blob.catch(() => {});
      toast(
        error instanceof Error ? error.message : COPY_FAIL_MESSAGE,
        "error",
      );
      return;
    }
    const prepared = await grant;
    try {
      const response = await fetch(`/api/memes/${id}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: prepared.token }),
      });
      if (response.ok) {
        const data = (await response.json()) as {
          item: { copies: number; downloads: number };
        };
        setCount(data.item.copies + data.item.downloads);
      }
    } catch (error) {
      console.error("Copy succeeded; recording the interaction failed", error);
    }
    toast(
      textCopy
        ? "已复制图片（文本形式）"
        : type === "ANIMATED" && mime === "image/png"
          ? "已复制封面图"
          : "已复制图片",
      "success",
    );
  };

  const handleDownload = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (
      !consumeCooldown(
        "download",
        downloadCooldownMs ?? DEFAULT_DOWNLOAD_COOLDOWN_MS,
      )
    ) {
      toast("操作过于频繁", "error", undefined, "请稍后再试");
      return;
    }
    try {
      const prepared = await fetch(`/api/memes/${id}/download`, {
        method: "POST",
      });
      const grant = await prepared.json();
      if (!prepared.ok) throw new Error(grant.error ?? "下载失败");
      const response = await fetch(grant.url);
      if (!response.ok) throw new Error("下载失败");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = decodeURIComponent(
        new URL(mediaUrl, window.location.origin).pathname.split("/").pop()!,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCount((previous) => previous + 1);
    } catch (error) {
      toast(error instanceof Error ? error.message : "下载失败", "error");
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void handleCopy();
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
          sizes="(max-width: 680px) 50vw, (max-width: 960px) 33vw, 25vw"
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
          <div className={styles.copyCount} aria-label={`热度 ${count}`}>
            <span className={styles.copyIcon} aria-hidden="true">
              🔥
            </span>
            <span>{formatCount(count)}</span>
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
                router.push(`/?view=search&q=${encodeURIComponent(tag)}`);
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
