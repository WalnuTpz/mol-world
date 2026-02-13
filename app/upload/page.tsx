"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import HomeNav from "@/components/HomeNav";
import { useToast } from "@/components/ToastProvider";
import { useClickGuard } from "@/components/useClickGuard";
import AdminLoginTrigger from "@/components/AdminLoginTrigger";
import baseStyles from "../page.module.css";
import styles from "./page.module.css";

export default function UploadPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">(
    "idle"
  );
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const toast = useToast();
  const allowSubmit = useClickGuard();

  const isValidFile = (file: File) => {
    const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) return false;
    if (file.size > 10 * 1024 * 1024) return false;
    return true;
  };

  const normalizeTagInput = (value: string) =>
    value.replace(/[，,、;；]+/g, " ");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file && !isValidFile(file)) {
      setSelectedFile(null);
      setStatus("error");
      toast("文件格式不支持或超过 10MB", "error");
      if (fileRef.current) {
        fileRef.current.value = "";
      }
      return;
    }
    setSelectedFile(file);
    setStatus("idle");
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items || items.length === 0) return;
      const fileItem = Array.from(items).find(
        (item) => item.kind === "file" && item.type.startsWith("image/")
      );
      if (!fileItem) return;
      const file = fileItem.getAsFile();
      if (!file) return;
      if (!isValidFile(file)) {
        setSelectedFile(null);
        setStatus("error");
        toast("文件格式不支持或超过 10MB", "error");
        return;
      }
      setSelectedFile(file);
      setStatus("idle");
      if (fileRef.current) {
        fileRef.current.value = "";
      }
      event.preventDefault();
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!allowSubmit()) return;
    if (!selectedFile) {
      setStatus("error");
      toast("请先选择图片", "error");
      return;
    }

    setStatus("uploading");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", title);
      formData.append("tags", tags);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          code?: string;
          message?: string;
        } | null;
        const code = data?.code;
        let errorMessage = data?.error || data?.message || "上传失败，请重试";
        if (code === "DUPLICATE_MEME") {
          errorMessage = "已存在该表情包，请修改名称后重试";
        } else if (code === "QUEUE_FULL") {
          errorMessage = "审核队列已过载，请稍后重试";
        } else if (code === "UPLOAD_RATE_LIMIT" || code === "RATE_LIMIT") {
          errorMessage = "操作过于频繁，请稍后重试";
        }
        setStatus("error");
        toast(errorMessage, "error");
        return;
      }
      setStatus("success");
      toast("已提交，等待审核", "success");
      setSelectedFile(null);
      setTitle("");
      setTags("");
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    } catch (err) {
      setStatus("error");
      toast(err instanceof Error ? err.message : "上传失败，请重试", "error");
    }
  };
  return (
    <div className={baseStyles.page}>
      <header className={baseStyles.header}>
        <div className={baseStyles.headerInner}>
          <div className={baseStyles.brandGroup}>
            <Link className={baseStyles.brand} href="/">
              <span className={baseStyles.brandText}>
                Mol<span className={baseStyles.brandAccent}>World</span>
              </span>
            </Link>
            <AdminLoginTrigger
              className={baseStyles.brandIconLink}
              iconClassName={baseStyles.brandIcon}
            />
          </div>
          <form
            className={baseStyles.searchForm}
            action="/"
            method="get"
            autoComplete="off"
          >
            <input
              name="q"
              className={baseStyles.searchInput}
              placeholder="搜索可爱的表情包"
              autoComplete="off"
            />
            <input type="hidden" name="view" value="search" />
            <input type="hidden" name="page" value="1" />
            <button
              type="submit"
              className={baseStyles.searchButton}
              aria-label="搜索"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
                focusable="false"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="6.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
                <line
                  x1="16.2"
                  y1="16.2"
                  x2="20.5"
                  y2="20.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </form>
          <div className={baseStyles.headerActions}>
            <nav className={baseStyles.nav}>
              <Link
                className={`${baseStyles.navItem} ${baseStyles.navItemInactive}`}
                href="/?view=hot"
              >
                热门
              </Link>
              <Link
                className={`${baseStyles.navItem} ${baseStyles.navItemInactive}`}
                href="/?view=all"
              >
                全部
              </Link>
            </nav>
            <Link
              className={`${baseStyles.uploadBtn} ${baseStyles.uploadBtnActive}`}
              href="/upload"
            >
              上传
            </Link>
          </div>
        </div>
      </header>

      <main className={`${baseStyles.content} ${styles.content}`}>
        <div className={styles.headerBlock}>
          <h1 className={styles.title}>添加表情包</h1>
        </div>
        <form className={styles.uploadCard} onSubmit={handleSubmit}>
          <div className={styles.dropZone}>
            <div className={styles.dropIcon}>
              <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                <path
                  d="M12 4v9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M8.5 7.5L12 4l3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect
                  x="5"
                  y="12"
                  width="14"
                  height="7"
                  rx="2.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
                <path
                  d="M8 16h8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.6"
                />
              </svg>
            </div>
            {selectedFile || status === "success" ? (
              <>
                <div className={styles.dropTitle}>已上传图片</div>
                <div className={styles.dropHint}>可以继续更换图片</div>
              </>
            ) : (
              <>
                <div className={styles.dropTitle}>
                  拖拽图片到这里、点击上传或直接 Ctrl+V 粘贴
                </div>
                <div className={styles.dropHint}>
                  支持 JPG、PNG、GIF 格式，最大 10MB
                </div>
              </>
            )}
            <input
              ref={fileRef}
              className={styles.fileInput}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>
          <div className={styles.formFields}>
            <label className={styles.field}>
              <span className={styles.label}>图片名称</span>
              <input
                className={styles.input}
                type="text"
                placeholder="给你的 mol 取一个可爱的名字"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>标签</span>
              <input
                className={styles.input}
                type="text"
                placeholder="给你的 mol 添加一些标签（用空格隔开）"
                value={tags}
                onChange={(event) => setTags(normalizeTagInput(event.target.value))}
              />
            </label>
            <div className={styles.submitRow}>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={status === "uploading" || !selectedFile}
                data-state={status}
              >
                {status === "uploading" ? "上传中..." : "提交"}
              </button>
            </div>
          </div>
        </form>
      </main>

      <footer className={baseStyles.footer}>
        <div className={baseStyles.footerInner}>
          <div className={baseStyles.footerSection}>
            <div className={baseStyles.footerTitle}>关于 molworld</div>
            <div className={baseStyles.footerText}>
              十分神秘的表情包分享平台，致力于传播可爱的 mol 表情包。
            </div>
          </div>
        </div>
        <div className={baseStyles.footerDivider} />
        <div className={baseStyles.footerBottom}>
          © 3000 molworld. 并不保留所有权利。
        </div>
      </footer>
    </div>
  );
}
