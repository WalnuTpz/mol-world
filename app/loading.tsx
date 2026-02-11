import styles from "./page.module.css";

export default function Loading() {
  return (
    <div className={styles.page}>
      <main className={styles.content}>
        <div className={styles.emptyState}>加载中...</div>
      </main>
    </div>
  );
}
