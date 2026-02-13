"use client";

import styles from "@/components/AdminTagsPanel.module.css";

export default function AdminParamsPanel() {
  return (
    <div className={styles.content}>
      <div className={styles.headerRow}>
        <div className={styles.headerBlock}>
          <h1 className={styles.title}>参数管理</h1>
          <div className={styles.subtitle}>配置随机池与运营参数</div>
        </div>
      </div>
    </div>
  );
}
