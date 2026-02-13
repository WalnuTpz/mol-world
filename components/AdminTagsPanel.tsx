"use client";

import { useEffect, useMemo, useState } from "react";

import baseStyles from "@/app/page.module.css";
import styles from "@/components/AdminTagsPanel.module.css";
import { useToast, useToastConfirm } from "@/components/ToastProvider";

type TagItem = {
  id: string;
  numId: number;
  name: string;
  count: number;
};

export default function AdminTagsPanel() {
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
  const [jumpValue, setJumpValue] = useState("1");
  const limit = 20;

  const loadList = async (targetPage: number, targetQuery: string) => {
    const params = new URLSearchParams({
      page: String(targetPage),
      limit: String(limit),
    });
    if (targetQuery.trim()) params.set("q", targetQuery.trim());
    const res = await fetch(`/api/admin/tags?${params.toString()}`);
    if (!res.ok) throw new Error("加载失败");
    return (await res.json()) as {
      items: TagItem[];
      page: number;
      limit: number;
      total: number;
    };
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    loadList(page, query)
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

  useEffect(() => {
    setJumpValue(String(page));
  }, [page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const disableJump = loading || totalPages <= 1;
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
      const list = await loadList(page, query);
      setItems(list.items);
      setTotal(list.total);
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
      const list = await loadList(page, query);
      setItems(list.items);
      setTotal(list.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      toast(message, "error");
    } finally {
      setDeletingId(null);
    }
  };

  const handleJump = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = Number.parseInt(jumpValue, 10);
    if (!Number.isFinite(next)) return;
    const clamped = Math.min(Math.max(next, 1), totalPages);
    setPage(clamped);
  };

  return (
    <div className={styles.content}>
      <div className={styles.headerRow}>
        <div className={styles.headerBlock}>
          <h1 className={styles.title}>管理标签</h1>
          <div className={styles.subtitle}>管理标签</div>
        </div>
        <div className={styles.searchBox}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="搜索标签"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className={styles.searchIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16">
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
          </span>
        </div>
      </div>
      <div className={styles.mergeRow}>
        <input
          className={styles.mergeInput}
          type="text"
          placeholder="合并来源（标签名或编号）"
          value={mergeFrom}
          onChange={(event) => setMergeFrom(event.target.value)}
        />
        <span className={styles.mergeArrow}>→</span>
        <input
          className={styles.mergeInput}
          type="text"
          placeholder="合并目标（标签名或编号）"
          value={mergeTo}
          onChange={(event) => setMergeTo(event.target.value)}
        />
        <button
          type="button"
          className={styles.actionPrimary}
          onClick={handleMerge}
          disabled={merging}
        >
          合并
        </button>
      </div>
      <div className={styles.list}>
        <div className={`${styles.row} ${styles.rowHeader}`}>
          <div className={styles.cell}>标签</div>
          <div className={styles.cell}>编号</div>
          <div className={styles.cell}>关联数量</div>
          <div className={styles.cell}>操作</div>
        </div>
        {hasItems ? (
          items.map((item) => (
            <div className={styles.row} key={item.id}>
              <div className={styles.cell}>
                {editingId === item.id ? (
                  <input
                    className={styles.input}
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                  />
                ) : (
                  item.name
                )}
              </div>
              <div className={styles.cell}>{item.numId}</div>
              <div className={styles.cell}>{item.count}</div>
              <div className={styles.cell}>
                {editingId === item.id ? (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.actionPrimary}
                      onClick={() => saveEdit(item)}
                      disabled={savingId === item.id}
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      className={styles.actionGhost}
                      onClick={cancelEdit}
                      disabled={savingId === item.id}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.actionGhost}
                      onClick={() => startEdit(item)}
                    >
                      重命名
                    </button>
                    <button
                      type="button"
                      className={styles.actionGhost}
                      onClick={() => handleDelete(item, "unlink")}
                      disabled={deletingId === item.id}
                    >
                      解除
                    </button>
                    <button
                      type="button"
                      className={styles.actionDanger}
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
          <div className={styles.empty}>{emptyText}</div>
        )}
      </div>
      <div className={baseStyles.pagination}>
        <div className={baseStyles.pageInfo}>
          当前第 {page} 页 / 共 {totalPages} 页
        </div>
        <div className={baseStyles.pageControls}>
          <div className={baseStyles.pageNav}>
            <button
              type="button"
              className={hasPrev ? baseStyles.pageNavBtn : baseStyles.pageNavBtnDisabled}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={!hasPrev}
            >
              上一页
            </button>
            <button
              type="button"
              className={hasNext ? baseStyles.pageNavBtn : baseStyles.pageNavBtnDisabled}
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={!hasNext}
            >
              下一页
            </button>
          </div>
          <form className={baseStyles.pageJump} onSubmit={handleJump}>
            <label className={baseStyles.pageJumpLabel}>
              跳转到
              <input
                className={baseStyles.pageJumpInput}
                type="number"
                min={1}
                max={totalPages}
                value={jumpValue}
                onChange={(event) => setJumpValue(event.target.value)}
                disabled={disableJump}
              />
              页
            </label>
            <button
              className={baseStyles.pageJumpButton}
              type="submit"
              disabled={disableJump}
            >
              跳转
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
