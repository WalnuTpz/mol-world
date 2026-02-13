"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";

import baseStyles from "@/app/page.module.css";
import styles from "@/components/ReviewPanel.module.css";
import { useToast, useToastConfirm } from "@/components/ToastProvider";
import { useClickGuard } from "@/components/useClickGuard";
import { splitTagInput } from "@/lib/tags";

type ReviewItem = {
  id: string;
  title: string | null;
  type: "STATIC" | "ANIMATED";
  mediaUrl: string;
  thumbUrl: string;
  status: "PENDING" | "PUBLISHED" | "HIDDEN";
  tags: string[];
};

type DraftState = {
  title: string;
  tags: string;
  saving: boolean;
};

type ReviewPanelProps = {
  pageLimit?: number;
};

const MAX_BATCH = 50;

export default function ReviewPanel({ pageLimit = 12 }: ReviewPanelProps) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [jumpValue, setJumpValue] = useState("1");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batching, setBatching] = useState(false);
  const toast = useToast();
  const confirm = useToastConfirm();
  const allowSubmit = useClickGuard();
  const allowRemove = useClickGuard();

  const limit = Math.max(1, Math.round(pageLimit));
  const loadPage = useCallback(async (targetPage: number) => {
    let cancelled = false;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/review?page=${targetPage}&limit=${limit}`
      );
      if (!res.ok) throw new Error("加载失败");
      const data = (await res.json()) as {
        items: ReviewItem[];
        page: number;
        limit: number;
        total: number;
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
  }, [limit]);

  useEffect(() => {
    loadPage(page);
  }, [loadPage, page]);

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

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const disableJump = loading || totalPages <= 1;
  const hasItems = items.length > 0;
  const selectedCount = selected.size;
  const allSelected = hasItems && items.every((item) => selected.has(item.id));
  const emptyText = useMemo(() => {
    if (loading) return "加载中...";
    if (error) return error;
    return "暂无待审核内容，可先去上传页提交表情包。";
  }, [loading, error]);

  const updateDraft = (id: string, patch: Partial<DraftState>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const submit = async (id: string, status?: "PUBLISHED" | "HIDDEN") => {
    if (!allowSubmit()) return;
    const draft = drafts[id];
    if (!draft || draft.saving) return;
    updateDraft(id, { saving: true });
    try {
      const res = await fetch(`/api/review/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          tags: splitTagInput(draft.tags),
          status,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(data?.error || data?.message || "保存失败，请重试");
      }
      await res.json();
      await loadPage(page);
    } catch (err) {
      updateDraft(id, { saving: false });
      const message = err instanceof Error ? err.message : "保存失败，请重试";
      toast(message, "error");
      setError(message);
    }
  };

  const remove = async (id: string) => {
    if (!allowRemove()) return;
    const draft = drafts[id];
    if (!draft || draft.saving) return;
    const ok = await confirm("确认删除这条表情包吗？", "此操作不可撤销。");
    if (!ok) return;
    updateDraft(id, { saving: true });
    try {
      const res = await fetch(`/api/review/${id}`, {
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
      await loadPage(page);
    } catch (err) {
      updateDraft(id, { saving: false });
      const message = err instanceof Error ? err.message : "删除失败，请重试";
      toast(message, "error");
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

  const batchAction = async (action: "save" | "publish" | "delete") => {
    if (batching || selectedCount === 0) return;
    if (selectedCount > MAX_BATCH) {
      toast(`批量数量过多（最多${MAX_BATCH}条）`, "error");
      return;
    }
    const label =
      action === "save"
        ? "批量保存"
        : action === "publish"
          ? "批量通过"
          : "批量删除";
    const ok = await confirm(
      `确认${label}选中的 ${selectedCount} 条吗？`,
      action === "delete" ? "此操作不可撤销。" : undefined
    );
    if (!ok) return;
    setBatching(true);
    const itemMap = new Map(items.map((item) => [item.id, item]));
    let success = 0;
    let failed = 0;
    for (const id of selected) {
      const draft = drafts[id];
      const item = itemMap.get(id);
      try {
        const body =
          action === "delete"
            ? { action: "delete" }
            : {
                title: draft?.title ?? item?.title ?? "",
                tags: splitTagInput(draft?.tags ?? item?.tags?.join(" ") ?? ""),
                ...(action === "publish" ? { status: "PUBLISHED" } : {}),
              };
        const res = await fetch(`/api/review/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("操作失败");
        success += 1;
      } catch {
        failed += 1;
      }
    }
    toast(`成功 ${success} / 失败 ${failed}`, failed > 0 ? "error" : "success");
    setSelected(new Set());
    await loadPage(page);
    setBatching(false);
  };


  return (
    <>
      <div className={styles.headerRow}>
        <div className={styles.headerBlock}>
          <h1 className={styles.title}>审核表情包</h1>
          <div className={styles.subtitle}>修改名称与标签后再审核发布</div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarInfo}>已选 {selectedCount} 条</div>
        <div className={styles.toolbarActions}>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => setSelected(new Set())}
            disabled={selectedCount === 0 || batching}
          >
            取消选择
          </button>
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
            onClick={() => batchAction("save")}
            disabled={selectedCount === 0 || batching}
          >
            批量保存
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => batchAction("publish")}
            disabled={selectedCount === 0 || batching}
          >
            批量通过
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
            const isSelected = selected.has(item.id);
            return (
              <div
                key={item.id}
                className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
              >
                <label className={styles.cardSelect}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(item.id)}
                    aria-label="选择表情包"
                  />
                </label>
                <div className={styles.preview}>
                  <Image
                    src={item.thumbUrl}
                    alt={item.title ?? "meme"}
                    fill
                    sizes="(max-width: 720px) 100vw, 180px"
                    unoptimized={item.thumbUrl.toLowerCase().endsWith(".gif")}
                  />
                </div>
                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span className={styles.label}>名称</span>
                    <input
                      className={styles.input}
                      value={draft?.title ?? ""}
                      onChange={(e) =>
                        updateDraft(item.id, { title: e.target.value })
                      }
                      placeholder="输入名称"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>标签</span>
                    <input
                      className={styles.input}
                      value={draft?.tags ?? ""}
                      onChange={(e) =>
                        updateDraft(item.id, { tags: e.target.value })
                      }
                      placeholder="多个标签用空格分隔"
                    />
                  </label>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.actionGhost}
                      onClick={() => submit(item.id)}
                      disabled={draft?.saving}
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      className={styles.actionPrimary}
                      onClick={() => submit(item.id, "PUBLISHED")}
                      disabled={draft?.saving}
                    >
                      通过
                    </button>
                    <button
                      type="button"
                      className={styles.actionDanger}
                      onClick={() => remove(item.id)}
                      disabled={draft?.saving}
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
