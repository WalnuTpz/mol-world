import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import baseStyles from "../page.module.css";
import styles from "./page.module.css";
import ReviewPanel from "@/components/ReviewPanel";
import ManagePanel from "@/components/ManagePanel";
import LogPanel from "@/components/LogPanel";
import AdminOtherPanel from "@/components/AdminOtherPanel";
import AdminTagsPanel from "@/components/AdminTagsPanel";
import AdminParamsPanel from "@/components/AdminParamsPanel";
import AdminLoginTrigger from "@/components/AdminLoginTrigger";
import { getAdminSessionCookieName, isAdminSessionValid } from "@/lib/adminSession";
import { getAppConfig } from "@/lib/appConfig";

type SearchParams = {
  view?: string | string[];
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const viewLabels = {
  review: "待审核",
  manage: "内容管理",
  tags: "标签管理",
  params: "参数管理",
  logs: "操作日志",
  other: "其他内容",
} as const;

const viewDescriptions = {
  review: "查看并审核新上传的表情包内容。",
  manage: "管理已发布或隐藏的表情包。",
  tags: "管理表情包标签与关联关系。",
  params: "管理随机池、热门数量与缓存参数。",
  logs: "查看上传/审核/删除等操作记录。",
  other: "管理流量热度、脚本入口与资源维护等运营功能。",
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
    viewParam === "tags" ||
    viewParam === "params" ||
    viewParam === "logs" ||
    viewParam === "other" ||
    viewParam === "review"
      ? viewParam
      : "manage";
  const cookieStore = await cookies();
  const authed = await isAdminSessionValid(
    cookieStore.get(getAdminSessionCookieName())?.value
  );
  if (!authed) {
    redirect("/");
  }
  const config = await getAppConfig();

  return (
    <div className={`${baseStyles.page} ${baseStyles.pageWithPagination}`}>
      <header className={baseStyles.header}>
        <div className={styles.adminHeaderInner}>
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
            <span className={styles.adminBadge}>Admin</span>
          </div>
          <div className={styles.adminNav}>
            <nav className={baseStyles.nav}>
              <Link
                className={`${baseStyles.navItem} ${
                  view === "manage" ? baseStyles.navItemActive : baseStyles.navItemInactive
                }`}
                href="/admin?view=manage"
              >
                表情包
              </Link>
              <Link
                className={`${baseStyles.navItem} ${
                  view === "tags" ? baseStyles.navItemActive : baseStyles.navItemInactive
                }`}
                href="/admin?view=tags"
              >
                标签
              </Link>
              <Link
                className={`${baseStyles.navItem} ${
                  view === "params" ? baseStyles.navItemActive : baseStyles.navItemInactive
                }`}
                href="/admin?view=params"
              >
                参数
              </Link>
              <Link
                className={`${baseStyles.navItem} ${
                  view === "review" ? baseStyles.navItemActive : baseStyles.navItemInactive
                }`}
                href="/admin?view=review"
              >
                审核
              </Link>
              <Link
                className={`${baseStyles.navItem} ${
                  view === "logs" ? baseStyles.navItemActive : baseStyles.navItemInactive
                }`}
                href="/admin?view=logs"
              >
                日志
              </Link>
              <Link
                className={`${baseStyles.navItem} ${
                  view === "other" ? baseStyles.navItemActive : baseStyles.navItemInactive
                }`}
                href="/admin?view=other"
              >
                其他
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className={baseStyles.content}>
        {view === "review" ? (
          <ReviewPanel pageLimit={config.reviewPageLimit} />
        ) : view === "manage" ? (
          <ManagePanel pageLimit={config.managePageLimit} />
        ) : view === "tags" ? (
          <AdminTagsPanel pageLimit={config.tagPageLimit} />
        ) : view === "params" ? (
          <AdminParamsPanel />
        ) : view === "logs" ? (
          <LogPanel pageLimit={config.logPageLimit} />
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
