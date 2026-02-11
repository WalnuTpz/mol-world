"use client";

import { useEffect, useState } from "react";

import styles from "./WelcomeModal.module.css";

const STORAGE_KEY = "molworld_welcome_seen";

export default function WelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, []);

  const handleClose = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.card}>
        <div className={styles.title}>欢迎来到 MolWorld！</div>
        <div className={styles.text}>
          这里收录着许多可爱的 mol 表情包。点击表情包卡片即可复制到剪贴板，使用下载按钮可保存原图。
        </div>
        <div className={styles.text}>还有更多功能等待你的探索～</div>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={handleClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
