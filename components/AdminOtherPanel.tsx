"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "@/app/admin/page.module.css";
import { useToast, useToastConfirm } from "@/components/ToastProvider";

type TagItem = {
  id: string;
  name: string;
  count: number;
};

export default function AdminOtherPanel() {
  const confirm = useToastConfirm();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (query.trim()) params.set("q", query.trim());
    fetch(`/api/admin/tags?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("加载失败");
        return (await res.json()) as {
          items: TagItem[];
          page: number;
          limit: number;
          total: number;
        };
      })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "加载失败";
        setError(message);
        toast(message, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, query, toast]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);
  const hasItems = items.length > 0;
  const emptyText = useMemo(() => {
    if (loading) return "加载中...";
    if (error) return error;
    return "暂无标签数据";
  }, [loading, error]);

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
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className={styles.tagList}>
          <div className={`${styles.tagRow} ${styles.tagRowHeader}`}>
            <div className={styles.tagCell}>标签</div>
            <div className={styles.tagCell}>关联数量</div>
            <div className={styles.tagCell}>操作</div>
          </div>
          {hasItems ? (
            items.map((item) => (
              <div className={styles.tagRow} key={item.id}>
                <div className={styles.tagCell}>{item.name}</div>
                <div className={styles.tagCell}>{item.count}</div>
                <div className={styles.tagCell}>—</div>
              </div>
            ))
          ) : (
            <div className={styles.tagEmpty}>{emptyText}</div>
          )}
        </div>
        <div className={styles.tagPagination}>
          当前第 {page} 页 / 共 {totalPages} 页
        </div>
      </div>
      <div className={styles.panelActions}>
        <button type="button" className={styles.logoutButton} onClick={handleLogout}>
          退出登录
        </button>
      </div>
    </section>
  );
}
