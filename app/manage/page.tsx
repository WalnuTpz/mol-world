"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import baseStyles from "../page.module.css";
import styles from "./page.module.css";

type ManageItem = {
  id: string;
  title: string | null;
  type: "STATIC" | "ANIMATED";
  mediaUrl: string;
  thumbUrl: string;
  status: "PUBLISHED" | "HIDDEN";
  tags: string[];
};

type DraftState = {
  title: string;
  tags: string;
  status: "PUBLISHED" | "HIDDEN";
  editing: boolean;
  saving: boolean;
};

const PAGE_LIMIT = 10;

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

export default function ManagePage() {
  const [items, setItems] = useState<ManageItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [jumpValue, setJumpValue] = useState("1");

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
    loadPage(page, query.trim());
  }, [loadPage, page, query]);

  useEffect(() => {
    setJumpValue(String(page));
  }, [page]);

  const hasItems = items.length > 0;
  const emptyText = useMemo(() => {
    if (loading) return "加载中...";
    if (error) return error;
    if (query.trim()) return "未找到匹配结果";
    return "暂无内容";
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
      if (!res.ok) throw new Error("保存失败");
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
      setError(err instanceof Error ? err.message : "保存失败");
    }
  };

  const remove = async (item: ManageItem) => {
    const draft = drafts[item.id];
    if (!draft || draft.saving) return;
    const ok = window.confirm("确认删除这条表情包吗？此操作不可撤销。");
    if (!ok) return;
    updateDraft(item.id, { saving: true });
    try {
      const res = await fetch(`/api/manage/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      if (!res.ok) throw new Error("删除失败");
      await loadPage(page, query.trim());
    } catch (err) {
      updateDraft(item.id, { saving: false });
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const handleJump = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = Number.parseInt(jumpValue, 10);
    if (!Number.isFinite(next)) return;
    const clamped = Math.min(Math.max(next, 1), totalPages);
    setPage(clamped);
  };

  return (
    <div className={`${baseStyles.page} ${baseStyles.pageWithPagination}`}>
      <header className={baseStyles.header}>
        <div className={baseStyles.headerInner}>
          <Link className={baseStyles.brand} href="/">
            <span className={baseStyles.brandText}>
              Mol<span className={baseStyles.brandAccent}>World</span>
            </span>
            <img
              className={baseStyles.brandIcon}
              src="/brand-icon.png"
              alt="MolWorld"
            />
          </Link>
          <form className={baseStyles.searchForm} action="/" method="get">
            <input
              name="q"
              className={baseStyles.searchInput}
              placeholder="搜索可爱的表情包"
            />
            <input type="hidden" name="view" value="search" />
            <input type="hidden" name="page" value="1" />
            <button
              type="submit"
              className={baseStyles.searchButton}
              aria-label="搜索"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
                focusable="false"
              >
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
            </button>
          </form>
          <div className={baseStyles.headerActions}>
            <nav className={baseStyles.nav}>
              <Link
                className={`${baseStyles.navItem} ${baseStyles.navItemInactive}`}
                href="/?view=hot"
              >
                热门
              </Link>
              <Link
                className={`${baseStyles.navItem} ${baseStyles.navItemInactive}`}
                href="/?view=all"
              >
                全部
              </Link>
            </nav>
            <Link className={baseStyles.uploadBtn} href="/upload">
              上传
            </Link>
          </div>
        </div>
      </header>

      <main className={baseStyles.content}>
        <div className={styles.headerRow}>
          <div className={styles.headerBlock}>
            <h1 className={styles.title}>管理表情包</h1>
            <div className={styles.subtitle}>
              查看与管理所有表情包的状态
            </div>
          </div>
          <div className={styles.searchBox}>
            <input
              className={styles.searchInput}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="搜索名称或标签"
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

        {!hasItems ? (
          <div className={styles.emptyState}>{emptyText}</div>
        ) : (
          <div className={styles.list}>
            {items.map((item) => {
              const draft = drafts[item.id];
              const editing = draft?.editing ?? false;
              return (
                <div key={item.id} className={styles.card}>
                  <div className={styles.preview}>
                    <img src={item.thumbUrl} alt={item.title ?? "meme"} />
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
                        disabled={!editing}
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
                        disabled={!editing}
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
                        >
                          <option value="PUBLISHED">已发布</option>
                          <option value="HIDDEN">已隐藏</option>
                        </select>
                      ) : (
                        <span
                          className={`${styles.statusBadge} ${styles[`status${item.status}`]}`}
                        >
                          {statusLabel(item.status)}
                        </span>
                      )}
                    </div>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.actionGhost}
                        onClick={() => toggleEdit(item)}
                        disabled={draft?.saving}
                      >
                        {editing ? "取消" : "修改"}
                      </button>
                      <button
                        type="button"
                        className={styles.actionPrimary}
                        onClick={() => save(item)}
                        disabled={!editing || draft?.saving}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className={styles.actionDanger}
                        onClick={() => remove(item)}
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
                />
                页
              </label>
              <button className={baseStyles.pageJumpButton} type="submit">
                跳转
              </button>
            </form>
          </div>
        </div>
      </main>

      <footer className={baseStyles.footer}>
        <div className={baseStyles.footerInner}>
          <div className={baseStyles.footerSection}>
            <div className={baseStyles.footerTitle}>关于 molworld</div>
            <div className={baseStyles.footerText}>
              十分神秘的表情包分享平台，致力于传播可爱的 mol 表情包。
            </div>
          </div>
        </div>
        <div className={baseStyles.footerDivider} />
        <div className={baseStyles.footerBottom}>
          © 3000 molworld. 并不保留所有权利。
        </div>
      </footer>
    </div>
  );
}
