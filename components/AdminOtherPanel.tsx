"use client";

import styles from "@/app/admin/page.module.css";
import { useToastConfirm } from "@/components/ToastProvider";

export default function AdminOtherPanel() {
  const confirm = useToastConfirm();

  const handleLogout = () => {
    confirm("确认退出管理员登录吗？").then((ok) => {
      if (!ok) return;
      fetch("/api/admin/logout", { method: "POST" })
        .catch(() => null)
        .finally(() => {
          window.location.href = "/";
        });
    });
  };

  return (
    <section className={styles.panel}>
      <div className={styles.panelTitle}>其他内容</div>
      <div className={styles.panelText}>
        管理公告、标签池或全局配置等扩展内容。
      </div>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>标签管理</div>
            <div className={styles.sectionHint}>列表 / 重命名 / 合并 / 删除</div>
          </div>
          <div className={styles.tagToolbar}>
            <input
              className={styles.tagSearch}
              type="text"
              placeholder="搜索标签"
            />
          </div>
        </div>
        <div className={styles.tagList}>
          <div className={`${styles.tagRow} ${styles.tagRowHeader}`}>
            <div className={styles.tagCell}>标签</div>
            <div className={styles.tagCell}>关联数量</div>
            <div className={styles.tagCell}>操作</div>
          </div>
          <div className={styles.tagEmpty}>暂无标签数据</div>
        </div>
        <div className={styles.tagPagination}>分页区域（待接入）</div>
      </div>
      <div className={styles.panelActions}>
        <button type="button" className={styles.logoutButton} onClick={handleLogout}>
          退出登录
        </button>
      </div>
    </section>
  );
}
