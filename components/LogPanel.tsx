"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import baseStyles from "@/app/page.module.css";
import styles from "@/components/LogPanel.module.css";
import { useToast, useToastConfirm } from "@/components/ToastProvider";

type LogItem = {
  id: string;
  action: string;
  status: "success" | "error";
  targetType: string | null;
  targetId: string | null;
  message: string | null;
  createdAt: string;
};

const PAGE_LIMIT = 20;

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    hour12: false,
  });
};

export default function LogPanel() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [jumpValue, setJumpValue] = useState("1");
  const [clearing, setClearing] = useState(false);
  const [clearRange, setClearRange] = useState<"1d" | "7d" | "30d" | "all">(
    "7d"
  );
  const toast = useToast();
  const confirm = useToastConfirm();

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
        const res = await fetch(`/api/admin/logs?${params.toString()}`);
        if (!res.ok) throw new Error("加载失败");
        const data = (await res.json()) as {
          items: LogItem[];
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
    if (query.trim()) return "未找到匹配日志，请尝试更换关键词。";
    return "暂无操作日志。";
  }, [loading, error, query]);

  const handleJump = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = Number.parseInt(jumpValue, 10);
    if (!Number.isFinite(next)) return;
    const clamped = Math.min(Math.max(next, 1), totalPages);
    setPage(clamped);
  };

  const clearLogs = async (range: "1d" | "7d" | "30d" | "all", label: string) => {
    if (clearing) return;
    const ok = await confirm(`确认删除${label}日志吗？`, "此操作不可撤销。");
    if (!ok) return;
    setClearing(true);
    setError("");
    try {
      const res = await fetch("/api/admin/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        throw new Error(data?.error || data?.message || "删除失败");
      }
      const data = (await res.json().catch(() => null)) as
        | { count?: number }
        | null;
      toast(`已删除日志（${data?.count ?? 0}）`, "success");
      await loadPage(1, query);
      setPage(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      toast(message, "error");
      setError(message);
    } finally {
      setClearing(false);
    }
  };

  const rangeLabels: Record<typeof clearRange, string> = {
    "1d": "最近1天",
    "7d": "最近7天",
    "30d": "最近30天",
    all: "全部",
  };

  return (
    <>
      <div className={styles.headerRow}>
        <div className={styles.headerBlock}>
          <h1 className={styles.title}>操作日志</h1>
          <div className={styles.subtitle}>
            查看上传、审核、删除等关键操作记录
          </div>
        </div>
        <div className={styles.headerTools}>
          <div className={styles.toolbarInline}>
            <div className={styles.toolbarActions}>
              <select
                className={styles.toolbarSelect}
                value={clearRange}
                onChange={(event) =>
                  setClearRange(event.target.value as typeof clearRange)
                }
                disabled={clearing}
              >
                <option value="1d">最近1天</option>
                <option value="7d">最近7天</option>
                <option value="30d">最近30天</option>
                <option value="all">全部</option>
              </select>
              <button
                type="button"
                className={`${styles.toolbarButton} ${styles.toolbarButtonDanger}`}
                onClick={() => clearLogs(clearRange, rangeLabels[clearRange])}
                disabled={clearing}
              >
                清理日志
              </button>
            </div>
          </div>
          <div className={styles.searchBox}>
            <input
              className={styles.searchInput}
              value={queryInput}
              onChange={(event) => {
                setQueryInput(event.target.value);
                setPage(1);
              }}
              placeholder="搜索操作类型/消息/目标 ID"
              aria-label="搜索操作日志"
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
      </div>

      {!hasItems ? (
        <div className={baseStyles.emptyState}>{emptyText}</div>
      ) : (
        <div className={styles.list}>
          {loading ? <div className={baseStyles.emptyState}>加载中...</div> : null}
          {items.map((item) => {
            const target = item.targetType
              ? `${item.targetType}${item.targetId ? `：${item.targetId}` : ""}`
              : "—";
            return (
              <div key={item.id} className={styles.card}>
                <div className={styles.time}>{formatTime(item.createdAt)}</div>
                <div className={styles.action}>{item.action}</div>
                <div
                  className={`${styles.status} ${
                    item.status === "success"
                      ? styles.statusSuccess
                      : styles.statusError
                  }`}
                >
                  {item.status === "success" ? "成功" : "失败"}
                </div>
                <div className={styles.message}>
                  <div className={styles.messageText}>
                    {item.message ?? "—"}
                  </div>
                  <div className={styles.meta}>{target}</div>
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
