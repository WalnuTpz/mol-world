"use client";

import { useRef, useState } from "react";
import Link from "next/link";

import HomeNav from "@/components/HomeNav";
import baseStyles from "../page.module.css";
import styles from "./page.module.css";

export default function UploadPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string>("");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setStatus("idle");
    setMessage("");
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      setStatus("error");
      setMessage("请先选择图片");
      return;
    }

    setStatus("uploading");
    setMessage("");

    window.setTimeout(() => {
      setStatus("success");
      setMessage("已提交，等待审核");
      setSelectedFile(null);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }, 800);
  };
  return (
    <div className={baseStyles.page}>
      <header className={baseStyles.header}>
        <div className={baseStyles.headerInner}>
          <Link className={baseStyles.brand} href="/">
            Mol<span className={baseStyles.brandAccent}>World</span>
          </Link>
          <form className={baseStyles.searchForm} action="/" method="get">
            <input
              name="q"
              className={baseStyles.searchInput}
              placeholder="搜索可爱的表情包"
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
          <h1 className={styles.title}>添加 mol 表情包</h1>
          <div className={styles.subtitle}>点击或拖拽上传 mol 图片</div>
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
                <div className={styles.dropTitle}>拖拽图片到这里或点击上传</div>
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
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>标签</span>
              <input
                className={styles.input}
                type="text"
                placeholder="给你的 mol 想一些标签"
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
              {message ? (
                <div
                  className={`${styles.formMessage} ${status === "error"
                    ? styles.formMessageError
                    : status === "success"
                      ? styles.formMessageSuccess
                      : ""
                    }`}
                >
                  {message}
                </div>
              ) : null}
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
