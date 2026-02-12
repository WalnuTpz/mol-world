"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";

import baseStyles from "@/app/page.module.css";
import styles from "@/components/ManagePanel.module.css";
import { useToast, useToastConfirm } from "@/components/ToastProvider";
import { useClickGuard } from "@/components/useClickGuard";

type ManageItem = {
  id: string;
  title: string | null;
  type: "STATIC" | "ANIMATED";
  mediaUrl: string;
  thumbUrl: string;
  status: "PUBLISHED" | "HIDDEN";
  createdAt: string;
  updatedAt: string;
  tags: string[];
};

type DraftState = {
  title: string;
  tags: string;
  status: "PUBLISHED" | "HIDDEN";
  editing: boolean;
  saving: boolean;
};

const PAGE_LIMIT = 12;

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
};

const statusLabel = (status: ManageItem["status"]) => {
  switch (status) {
    case "PUBLISHED":
      return "已发布";
    case "HIDDEN":
      return "已隐藏";
    default:
      return status;
  }
};

export default function ManagePanel() {
  const [items, setItems] = useState<ManageItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [jumpValue, setJumpValue] = useState("1");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batching, setBatching] = useState(false);
  const toast = useToast();
  const confirm = useToastConfirm();
  const allowSave = useClickGuard();
  const allowRemove = useClickGuard();

  const loadPage = useCallback(
    async (targetPage: number, keyword: string) => {
      let cancelled = false;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          limit: String(PAGE_LIMIT),
          q: keyword,
        });
        const res = await fetch(`/api/manage?${params.toString()}`);
        if (!res.ok) throw new Error("加载失败");
        const data = (await res.json()) as {
          items: ManageItem[];
          page: number;
          limit: number;
          total: number;
          q?: string;
        };
        if (cancelled) return;
        const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
        if (targetPage > totalPages) {
          setPage(totalPages);
          return;
        }
        setItems(data.items);
        setTotal(data.total);
        setDrafts(
          Object.fromEntries(
            data.items.map((item) => [
              item.id,
              {
                title: item.title ?? "",
                tags: item.tags.join(" "),
                status: item.status,
                editing: false,
                saving: false,
              },
            ])
          )
        );
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
      return () => {
        cancelled = true;
      };
    },
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(queryInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    loadPage(page, query);
  }, [loadPage, page, query]);

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(items.map((item) => item.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visible.has(id)) next.add(id);
      });
      return next;
    });
  }, [items]);

  useEffect(() => {
    setJumpValue(String(page));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const disableJump = loading || totalPages <= 1;

  const hasItems = items.length > 0;
  const selectedCount = selected.size;
  const allSelected = hasItems && items.every((item) => selected.has(item.id));
  const emptyText = useMemo(() => {
    if (loading) return "加载中...";
    if (error) return error;
    if (query.trim()) return "未找到匹配结果，请尝试更换关键词。";
    return "暂无可管理内容，可先在审核页通过表情包。";
  }, [loading, error, query]);

  const updateDraft = (id: string, patch: Partial<DraftState>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const resetDraft = (item: ManageItem) => {
    updateDraft(item.id, {
      title: item.title ?? "",
      tags: item.tags.join(" "),
      status: item.status,
      editing: false,
      saving: false,
    });
  };

  const toggleEdit = (item: ManageItem) => {
    const draft = drafts[item.id];
    if (!draft) return;
    if (draft.editing) {
      resetDraft(item);
      return;
    }
    updateDraft(item.id, { editing: true });
  };

  const save = async (item: ManageItem) => {
    if (!allowSave()) return;
    const draft = drafts[item.id];
    if (!draft || draft.saving || !draft.editing) return;
    updateDraft(item.id, { saving: true });
    try {
      const res = await fetch(`/api/manage/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          tags: draft.tags.split(/\s+/).filter(Boolean),
          status: draft.status,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(data?.error || data?.message || "保存失败，请重试");
      }
      const data = (await res.json()) as { item: ManageItem };
      setItems((prev) =>
        prev.map((meme) => (meme.id === item.id ? data.item : meme))
      );
      updateDraft(item.id, {
        title: data.item.title ?? "",
        tags: data.item.tags.join(" "),
        status: data.item.status,
        editing: false,
        saving: false,
      });
    } catch (err) {
      updateDraft(item.id, { saving: false });
      const message = err instanceof Error ? err.message : "保存失败，请重试";
      setError(message);
    }
  };

  const remove = async (item: ManageItem) => {
    if (!allowRemove()) return;
    const draft = drafts[item.id];
    if (!draft || draft.saving) return;
    const ok = await confirm("确认删除这条表情包吗？", "此操作不可撤销。");
    if (!ok) return;
    updateDraft(item.id, { saving: true });
    try {
      const res = await fetch(`/api/manage/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(data?.error || data?.message || "删除失败，请重试");
      }
      await loadPage(page, query.trim());
    } catch (err) {
      updateDraft(item.id, { saving: false });
      const message = err instanceof Error ? err.message : "删除失败，请重试";
      setError(message);
    }
  };

  const handleJump = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = Number.parseInt(jumpValue, 10);
    if (!Number.isFinite(next)) return;
    const clamped = Math.min(Math.max(next, 1), totalPages);
    setPage(clamped);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(() => {
      if (allSelected) return new Set();
      return new Set(items.map((item) => item.id));
    });
  };

  const batchAction = async (action: "publish" | "hide" | "delete" | "reset") => {
    if (batching || selectedCount === 0) return;
    const label =
      action === "publish"
        ? "批量发布"
        : action === "hide"
          ? "批量隐藏"
          : action === "reset"
            ? "批量清零"
            : "批量删除";
    const ok = await confirm(
      `确认${label}选中的 ${selectedCount} 条吗？`,
      action === "delete" ? "此操作不可撤销。" : undefined
    );
    if (!ok) return;
    setBatching(true);
    try {
      const res = await fetch("/api/manage/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ids: Array.from(selected),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(data?.error || data?.message || "批量操作失败");
      }
      const data = (await res.json().catch(() => null)) as
        | { count?: number; failed?: string[] }
        | null;
      toast(`${label}完成（${data?.count ?? 0}）`, "success");
      if (data?.failed && data.failed.length > 0) {
        toast(`部分失败（${data.failed.length}）`, "error");
      }
      setSelected(new Set());
      await loadPage(page, query);
    } catch (err) {
      const message = err instanceof Error ? err.message : "批量操作失败";
      toast(message, "error");
    } finally {
      setBatching(false);
    }
  };

  return (
    <>
      <div className={styles.headerRow}>
        <div className={styles.headerBlock}>
          <h1 className={styles.title}>管理表情包</h1>
          <div className={styles.subtitle}>查看与管理所有表情包的状态</div>
        </div>
        <div className={styles.searchBox}>
          <input
            className={styles.searchInput}
            value={queryInput}
            onChange={(event) => {
              setQueryInput(event.target.value);
              setPage(1);
            }}
            placeholder="搜索名称/标签/状态/类型"
            aria-label="搜索表情包"
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

      <div className={styles.toolbar}>
        <div className={styles.toolbarInfo}>已选 {selectedCount} 条</div>
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={toggleSelectAll}
            disabled={!hasItems}
          >
            {allSelected ? "取消全选" : "全选本页"}
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => batchAction("publish")}
            disabled={selectedCount === 0 || batching}
          >
            批量发布
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => batchAction("hide")}
            disabled={selectedCount === 0 || batching}
          >
            批量隐藏
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => batchAction("reset")}
            disabled={selectedCount === 0 || batching}
          >
            批量清零
          </button>
          <button
            type="button"
            className={`${styles.toolbarButton} ${styles.toolbarButtonDanger}`}
            onClick={() => batchAction("delete")}
            disabled={selectedCount === 0 || batching}
          >
            批量删除
          </button>
        </div>
      </div>

      {!hasItems ? (
        <div className={baseStyles.emptyState}>{emptyText}</div>
      ) : (
        <div className={styles.list}>
          {loading ? <div className={baseStyles.emptyState}>加载中...</div> : null}
          {items.map((item) => {
            const draft = drafts[item.id];
            const editing = draft?.editing ?? false;
            const isSelected = selected.has(item.id);
            return (
              <div
                key={item.id}
                className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
                onClick={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest('[data-no-toggle="true"]')) return;
                  toggleSelect(item.id);
                }}
              >
                <label className={styles.cardSelect} data-no-toggle="true">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(item.id)}
                    aria-label="选择表情包"
                  />
                </label>
                <div className={styles.previewWrap} data-no-toggle="true">
                  <div className={styles.preview}>
                    <Image
                      src={item.thumbUrl}
                      alt={item.title ?? "meme"}
                      fill
                      sizes="(max-width: 720px) 100vw, 180px"
                      unoptimized={item.thumbUrl.toLowerCase().endsWith(".gif")}
                    />
                  </div>
                  <div className={styles.metaRow}>
                    <div className={styles.metaLine}>
                      创建时间：{formatTime(item.createdAt)}
                    </div>
                    <div className={styles.metaLine}>
                      修改时间：{formatTime(item.updatedAt)}
                    </div>
                  </div>
                </div>
                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span className={styles.label}>名称</span>
                    <input
                      className={styles.input}
                      value={draft?.title ?? ""}
                      onChange={(e) => updateDraft(item.id, { title: e.target.value })}
                      placeholder="输入名称"
                      disabled={!editing}
                      data-no-toggle="true"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>标签</span>
                    <input
                      className={styles.input}
                      value={draft?.tags ?? ""}
                      onChange={(e) => updateDraft(item.id, { tags: e.target.value })}
                      placeholder="多个标签用空格分隔"
                      disabled={!editing}
                      data-no-toggle="true"
                    />
                  </label>
                  <div className={styles.statusRow}>
                    <span className={styles.label}>状态</span>
                    {editing ? (
                      <select
                        className={styles.select}
                        value={draft?.status ?? item.status}
                        onChange={(e) =>
                          updateDraft(item.id, {
                            status: e.target.value as DraftState["status"],
                          })
                        }
                        data-no-toggle="true"
                      >
                        <option value="PUBLISHED">已发布</option>
                        <option value="HIDDEN">已隐藏</option>
                      </select>
                    ) : (
                      <span className={`${styles.statusBadge} ${styles[`status${item.status}`]}`}>
                        {statusLabel(item.status)}
                      </span>
                    )}
                    <button
                      type="button"
                      className={styles.statusType}
                      disabled
                      aria-disabled="true"
                      data-no-toggle="true"
                    >
                      {item.type === "ANIMATED" ? "动图" : "静态"}
                    </button>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.actionGhost}
                      onClick={() => toggleEdit(item)}
                      disabled={draft?.saving}
                      data-no-toggle="true"
                    >
                      {editing ? "取消" : "修改"}
                    </button>
                    <button
                      type="button"
                      className={styles.actionPrimary}
                      onClick={() => save(item)}
                      disabled={!editing || draft?.saving}
                      data-no-toggle="true"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      className={styles.actionDanger}
                      onClick={() => remove(item)}
                      disabled={draft?.saving}
                      data-no-toggle="true"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
    </>
  );
}
