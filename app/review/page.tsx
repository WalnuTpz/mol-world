"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import baseStyles from "../page.module.css";
import styles from "./page.module.css";

type ReviewItem = {
  id: string;
  title: string | null;
  type: "STATIC" | "ANIMATED";
  mediaUrl: string;
  thumbUrl: string;
  status: "PUBLISHED" | "HIDDEN" | "DELETED";
  tags: string[];
};

type DraftState = {
  title: string;
  tags: string;
  saving: boolean;
};

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/review");
        if (!res.ok) throw new Error("加载失败");
        const data = (await res.json()) as { items: ReviewItem[] };
        if (cancelled) return;
        setItems(data.items);
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
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasItems = items.length > 0;
  const emptyText = useMemo(() => {
    if (loading) return "加载中...";
    if (error) return error;
    return "暂无待审核内容";
  }, [loading, error]);

  const updateDraft = (id: string, patch: Partial<DraftState>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const submit = async (id: string, status?: "PUBLISHED" | "HIDDEN") => {
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
      if (!res.ok) throw new Error("保存失败");
      const data = (await res.json()) as { item: ReviewItem };
      setItems((prev) => {
        const next = prev.map((item) =>
          item.id === id ? data.item : item
        );
        return status ? next.filter((item) => item.id !== id) : next;
      });
      updateDraft(id, {
        title: data.item.title ?? "",
        tags: data.item.tags.join(" "),
        saving: false,
      });
    } catch (err) {
      updateDraft(id, { saving: false });
      setError(err instanceof Error ? err.message : "保存失败");
    }
  };

  return (
    <div className={baseStyles.page}>
      <header className={baseStyles.header}>
        <div className={baseStyles.headerInner}>
          <Link className={baseStyles.brand} href="/">
            Mol<span className={baseStyles.brandAccent}>World</span>
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
        <div className={styles.headerBlock}>
          <h1 className={styles.title}>审核表情包</h1>
          <div className={styles.subtitle}>修改名称与标签后再审核发布</div>
        </div>

        {!hasItems ? (
          <div className={styles.emptyState}>{emptyText}</div>
        ) : (
          <div className={styles.list}>
            {items.map((item) => {
              const draft = drafts[item.id];
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
                        className={styles.actionBtn}
                        onClick={() => submit(item.id, "HIDDEN")}
                        disabled={draft?.saving}
                      >
                        隐藏
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
                        className={styles.actionGhost}
                        onClick={() => submit(item.id)}
                        disabled={draft?.saving}
                      >
                        仅保存
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
