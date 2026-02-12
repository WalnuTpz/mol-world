import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import baseStyles from "../page.module.css";
import styles from "./page.module.css";
import ReviewPanel from "@/components/ReviewPanel";
import ManagePanel from "@/components/ManagePanel";
import LogPanel from "@/components/LogPanel";
import AdminOtherPanel from "@/components/AdminOtherPanel";
import AdminLoginTrigger from "@/components/AdminLoginTrigger";
import { getAdminSessionCookieName, isAdminSessionValid } from "@/lib/adminSession";

type SearchParams = {
  view?: string | string[];
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const viewLabels = {
  review: "待审核",
  manage: "内容管理",
  logs: "操作日志",
  other: "其他内容",
} as const;

const viewDescriptions = {
  review: "查看并审核新上传的表情包内容。",
  manage: "管理已发布或隐藏的表情包。",
  logs: "查看上传/审核/删除等操作记录。",
  other: "管理公告、标签池或全局配置等扩展内容。",
} as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolvedParams = (await Promise.resolve(searchParams)) ?? {};
  const viewParam = getParam(resolvedParams.view);
  const view =
    viewParam === "manage" ||
    viewParam === "logs" ||
    viewParam === "other" ||
    viewParam === "review"
      ? viewParam
      : "manage";
  const cookieStore = await cookies();
  const authed = isAdminSessionValid(
    cookieStore.get(getAdminSessionCookieName())?.value
  );
  if (!authed) {
    redirect("/");
  }

  return (
    <div className={`${baseStyles.page} ${baseStyles.pageWithPagination}`}>
      <header className={baseStyles.header}>
        <div className={baseStyles.headerInner}>
          <div className={baseStyles.brandGroup}>
            <Link className={baseStyles.brand} href="/">
              <span className={baseStyles.brandText}>
                Mol<span className={baseStyles.brandAccent}>World</span>
              </span>
            </Link>
            <AdminLoginTrigger
              authed={authed}
              className={baseStyles.brandIconLink}
              iconClassName={baseStyles.brandIcon}
            />
          </div>
          <form
            className={baseStyles.searchForm}
            action="/"
            method="get"
            autoComplete="off"
          >
            <input
              name="q"
              className={baseStyles.searchInput}
              placeholder="搜索可爱的表情包"
              autoComplete="off"
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
          <div>
            <h1 className={styles.title}>管理控制台</h1>
            <div className={styles.subtitle}>
              集成审核、管理、日志与其他内容入口
            </div>
          </div>
        </div>

        <div className={styles.tabs}>
          <Link
            className={`${styles.tab} ${view === "manage" ? styles.tabActive : ""}`}
            href="/admin?view=manage"
          >
            管理
          </Link>
          <Link
            className={`${styles.tab} ${view === "review" ? styles.tabActive : ""}`}
            href="/admin?view=review"
          >
            审核
          </Link>
          <Link
            className={`${styles.tab} ${view === "logs" ? styles.tabActive : ""}`}
            href="/admin?view=logs"
          >
            日志
          </Link>
          <Link
            className={`${styles.tab} ${view === "other" ? styles.tabActive : ""}`}
            href="/admin?view=other"
          >
            其他
          </Link>
        </div>

        {view === "review" ? (
          <ReviewPanel />
        ) : view === "manage" ? (
          <ManagePanel />
        ) : view === "logs" ? (
          <LogPanel />
        ) : (
          <AdminOtherPanel />
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
