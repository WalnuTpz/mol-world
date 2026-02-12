"use client";

import styles from "@/app/admin/page.module.css";

export default function AdminOtherPanel() {
  const handleLogout = () => {
    const ok = window.confirm("确认退出管理员登录吗？");
    if (!ok) return;
    fetch("/api/admin/logout", { method: "POST" })
      .catch(() => null)
      .finally(() => {
        window.location.href = "/";
      });
  };

  return (
    <section className={styles.panel}>
      <div className={styles.panelTitle}>其他内容</div>
      <div className={styles.panelText}>
        管理公告、标签池或全局配置等扩展内容。
      </div>
      <div className={styles.panelActions}>
        <button type="button" className={styles.logoutButton} onClick={handleLogout}>
          退出登录
        </button>
        <span className={styles.logoutHint}>退出后再次进入需要重新验证</span>
      </div>
    </section>
  );
}
