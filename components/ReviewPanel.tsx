"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";

import baseStyles from "@/app/page.module.css";
import styles from "@/components/ReviewPanel.module.css";
import { useToast, useToastConfirm } from "@/components/ToastProvider";
import { useClickGuard } from "@/components/useClickGuard";

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

const PAGE_LIMIT = 12;

export default function ReviewPanel() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [jumpValue, setJumpValue] = useState("1");
  const toast = useToast();
  const confirm = useToastConfirm();
  const allowSubmit = useClickGuard();
  const allowRemove = useClickGuard();
  const allowClear = useClickGuard();

  const loadPage = useCallback(async (targetPage: number) => {
    let cancelled = false;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/review?page=${targetPage}&limit=${PAGE_LIMIT}`
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
  }, []);

  useEffect(() => {
    loadPage(page);
  }, [loadPage, page]);

  useEffect(() => {
    setJumpValue(String(page));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const disableJump = loading || totalPages <= 1;
  const hasItems = items.length > 0;
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
          tags: draft.tags.split(/\s+/).filter(Boolean),
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

  const clearAll = async () => {
    if (!allowClear()) return;
    const ok = await confirm("确认清空审核队列吗？", "此操作不可撤销。");
    if (!ok) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/review/clear", { method: "POST" });
      if (!res.ok) throw new Error("清空失败");
      const data = (await res.json()) as { count?: number };
      toast(`已清空审核队列（${data.count ?? 0}）`, "success");
      await loadPage(1);
      setPage(1);
    } catch (err) {
      toast("清空失败", "error");
      setError(err instanceof Error ? err.message : "清空失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className={styles.headerRow}>
        <div className={styles.headerBlock}>
          <h1 className={styles.title}>审核表情包</h1>
          <div className={styles.subtitle}>修改名称与标签后再审核发布</div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.headerDanger}
            onClick={clearAll}
            disabled={loading || total === 0}
          >
            清空审核队列
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
            return (
              <div key={item.id} className={styles.card}>
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
