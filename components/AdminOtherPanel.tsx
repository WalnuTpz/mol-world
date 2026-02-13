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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeTo, setMergeTo] = useState("");
  const [merging, setMerging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const startEdit = (item: TagItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async (item: TagItem) => {
    if (savingId) return;
    const next = editingName.trim();
    if (!next) {
      toast("标签不能为空", "error");
      return;
    }
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/admin/tags/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(data?.error || data?.message || "保存失败");
      }
      const data = (await res.json()) as { item?: TagItem };
      if (data.item) {
        setItems((prev) =>
          prev.map((tag) => (tag.id === item.id ? data.item! : tag))
        );
      }
      cancelEdit();
      toast("已更新", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      toast(message, "error");
    } finally {
      setSavingId(null);
    }
  };

  const handleMerge = async () => {
    if (merging) return;
    const from = mergeFrom.trim();
    const to = mergeTo.trim();
    if (!from || !to) {
      toast("请输入需要合并的标签", "error");
      return;
    }
    const ok = await confirm("确认合并标签吗？", "该操作会合并关联关系并删除原标签。");
    if (!ok) return;
    setMerging(true);
    try {
      const res = await fetch("/api/admin/tags/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(data?.error || data?.message || "合并失败");
      }
      const data = (await res.json()) as { message?: string };
      toast(data.message || "已合并", "success");
      setMergeFrom("");
      setMergeTo("");
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (query.trim()) params.set("q", query.trim());
      const listRes = await fetch(`/api/admin/tags?${params.toString()}`);
      if (listRes.ok) {
        const listData = (await listRes.json()) as {
          items: TagItem[];
          total: number;
        };
        setItems(listData.items);
        setTotal(listData.total);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "合并失败";
      toast(message, "error");
    } finally {
      setMerging(false);
    }
  };

  const handleDelete = async (item: TagItem, mode: "unlink" | "force") => {
    if (deletingId) return;
    const label = mode === "force" ? "删除标签与关联" : "解除关联";
    const ok = await confirm(
      `确认${label}吗？`,
      mode === "force"
        ? "该标签将被删除，关联关系也会清除。"
        : "仅移除关联关系，标签本体保留。"
    );
    if (!ok) return;
    setDeletingId(item.id);
    try {
      const res = await fetch(
        `/api/admin/tags/${item.id}/delete?mode=${mode}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(data?.error || data?.message || "删除失败");
      }
      const data = (await res.json()) as { message?: string };
      toast(data.message || "已删除", "success");
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (query.trim()) params.set("q", query.trim());
      const listRes = await fetch(`/api/admin/tags?${params.toString()}`);
      if (listRes.ok) {
        const listData = (await listRes.json()) as {
          items: TagItem[];
          total: number;
        };
        setItems(listData.items);
        setTotal(listData.total);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      toast(message, "error");
    } finally {
      setDeletingId(null);
    }
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
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className={styles.tagMergeRow}>
          <input
            className={styles.tagMergeInput}
            type="text"
            placeholder="合并来源（标签名或ID）"
            value={mergeFrom}
            onChange={(event) => setMergeFrom(event.target.value)}
          />
          <span className={styles.tagMergeArrow}>→</span>
          <input
            className={styles.tagMergeInput}
            type="text"
            placeholder="合并目标（标签名或ID）"
            value={mergeTo}
            onChange={(event) => setMergeTo(event.target.value)}
          />
          <button
            type="button"
            className={styles.tagActionPrimary}
            onClick={handleMerge}
            disabled={merging}
          >
            合并
          </button>
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
                <div className={styles.tagCell}>
                  {editingId === item.id ? (
                    <input
                      className={styles.tagInput}
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                    />
                  ) : (
                    item.name
                  )}
                </div>
                <div className={styles.tagCell}>{item.count}</div>
                <div className={styles.tagCell}>
                  {editingId === item.id ? (
                    <div className={styles.tagActions}>
                      <button
                        type="button"
                        className={styles.tagActionPrimary}
                        onClick={() => saveEdit(item)}
                        disabled={savingId === item.id}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className={styles.tagActionGhost}
                        onClick={cancelEdit}
                        disabled={savingId === item.id}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className={styles.tagActions}>
                      <button
                        type="button"
                        className={styles.tagActionGhost}
                        onClick={() => startEdit(item)}
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        className={styles.tagActionGhost}
                        onClick={() => handleDelete(item, "unlink")}
                        disabled={deletingId === item.id}
                      >
                        解除
                      </button>
                      <button
                        type="button"
                        className={styles.tagActionDanger}
                        onClick={() => handleDelete(item, "force")}
                        disabled={deletingId === item.id}
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
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
