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
        <div className={styles.text}>点击表情包即可复制到剪贴板</div>
        <div className={styles.text}>也可以点击下载按钮保存原图</div>
        <div className={styles.text}>继续探索，发现更多可爱的 mol~</div>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={handleClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
