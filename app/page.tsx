import { getRandomMemes, getMemeRows } from "@/lib/memeQueries";
import { recordVisit } from "@/lib/visitors";
import { publicMediaUrl } from "@/lib/mediaUrl";
import { pagination } from "@/lib/pagination";
import {
  memeSelect as select,
  getPopularMemes,
  getSortedMemePage,
  type MemeRow,
} from "@/lib/memeQueries";
import Link from "next/link";
import { cookies, headers } from "next/headers";

import HomeNav from "@/components/HomeNav";
import MemeGrid from "@/components/MemeGrid";
import WelcomeModal from "@/components/WelcomeModal";
import RandomLink from "@/components/RandomLink";
import AdminLoginTrigger from "@/components/AdminLoginTrigger";
import { prisma } from "@/lib/db";
import { ensureDailyPools, pickRandomSubset } from "@/lib/dailyPool";
import {
  getAdminSessionCookieName,
  isAdminSessionValid,
} from "@/lib/adminSession";
import { normalizeSearchTokens, sortTags } from "@/lib/tags";
import { getAppConfig } from "@/lib/appConfig";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type SearchParams = {
  view?: string | string[];
  q?: string | string[];
  page?: string | string[];
  limit?: string | string[];
  sort?: string | string[];
  hotSort?: string | string[];
  type?: string | string[];
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const getDayKey = () => new Date().toISOString().slice(0, 10);

type MemeCardItem = Omit<MemeRow, "tags"> & { tags: string[] };

const normalizeItems = (list: MemeRow[]): MemeCardItem[] =>
  list.map((item) => ({
    ...item,
    mediaUrl: publicMediaUrl(item.mediaUrl),
    thumbUrl: publicMediaUrl(item.thumbUrl),
    tags: sortTags(item.tags.map((t) => t.tag.name)),
  }));

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const cookieStore = await cookies();
  const authed = await isAdminSessionValid(
    cookieStore.get(getAdminSessionCookieName())?.value,
  );
  const requestHeaders = await headers();
  const config = await getAppConfig();
  const resolvedParams = await searchParams;
  const viewParam = getParam(resolvedParams?.view);
  const q = (getParam(resolvedParams?.q) ?? "").trim();
  const { page, limit, skip } = pagination(
    getParam(resolvedParams.page),
    getParam(resolvedParams.limit),
    config.listLimit,
  );
  const hotLimit = config.hotLimit;
  const hotSortParam = getParam(resolvedParams?.hotSort);
  const hotSort =
    hotSortParam === "random" || hotSortParam === "hot"
      ? hotSortParam
      : "random";

  let view: "hot" | "all" | "search" = "hot";
  if (viewParam === "all" || viewParam === "search" || viewParam === "hot") {
    view = viewParam;
  }
  if (q) view = "search";

  const typeParam = getParam(resolvedParams?.type);
  const allType =
    view === "all" && (typeParam === "animated" || typeParam === "static")
      ? typeParam
      : "all";

  const sortParam = getParam(resolvedParams?.sort);
  const sort =
    view === "search"
      ? sortParam === "name" ||
        sortParam === "heat" ||
        sortParam === "earliest" ||
        sortParam === "latest"
        ? sortParam
        : "latest"
      : sortParam === "name" ||
          sortParam === "earliest" ||
          sortParam === "latest"
        ? sortParam
        : "latest";

  let items: MemeCardItem[] = [];
  let total = 0;
  let totalPages = 1;

  if (view === "hot") {
    if (hotSort === "random") {
      const pools = await ensureDailyPools(
        getDayKey(),
        null,
        config.dailyPoolGroups,
        config.dailyPoolSize,
      );
      const group = pickRandomSubset(pools, 1)[0];
      const groupIds = group?.items.map((item) => item.memeId) ?? [];
      const rows = await getMemeRows(groupIds.slice(0, hotLimit));
      const missing = Math.max(0, hotLimit - rows.length);
      const extra = missing ? await getRandomMemes(missing, groupIds) : [];
      items = normalizeItems([...rows, ...extra]);
    } else {
      items = normalizeItems(await getPopularMemes(hotLimit));
    }
  }

  if (view === "all") {
    const where = {
      status: "PUBLISHED" as const,
      ...(allType === "animated"
        ? { type: "ANIMATED" as const }
        : allType === "static"
          ? { type: "STATIC" as const }
          : {}),
    };

    if (sort === "name") {
      const result = await getSortedMemePage(where, "name", skip, limit);
      total = result.total;
      totalPages = Math.max(1, Math.ceil(total / limit));
      items = normalizeItems(result.items);
    } else {
      const orderBy =
        sort === "earliest"
          ? [{ createdAt: "asc" as const }, { id: "asc" as const }]
          : [{ createdAt: "desc" as const }, { id: "desc" as const }];

      const [list, count] = await Promise.all([
        prisma.meme.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          select,
        }),
        prisma.meme.count({ where }),
      ]);
      items = normalizeItems(list);
      total = count;
      totalPages = Math.max(1, Math.ceil(total / limit));
    }
  }

  if (view === "search") {
    if (!q) {
      items = [];
      total = 0;
      totalPages = 1;
    } else {
      const tokens = normalizeSearchTokens(q);
      const where =
        tokens.length > 0
          ? {
              status: "PUBLISHED" as const,
              AND: tokens.map((token) => ({
                OR: [
                  { title: { contains: token } },
                  { tags: { some: { tag: { name: { contains: token } } } } },
                ],
              })),
            }
          : {
              status: "PUBLISHED" as const,
            };

      if (sort === "name" || sort === "heat") {
        const result = await getSortedMemePage(where, sort, skip, limit);
        total = result.total;
        totalPages = Math.max(1, Math.ceil(total / limit));
        items = normalizeItems(result.items);
      } else {
        const orderBy =
          sort === "earliest"
            ? [{ createdAt: "asc" as const }, { id: "asc" as const }]
            : [{ createdAt: "desc" as const }, { id: "desc" as const }];
        const [list, count] = await Promise.all([
          prisma.meme.findMany({
            where,
            orderBy,
            skip,
            take: limit,
            select,
          }),
          prisma.meme.count({
            where,
          }),
        ]);
        items = normalizeItems(list);
        total = count;
        totalPages = Math.max(1, Math.ceil(total / limit));
      }
    }
  }

  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const disableJump = totalPages <= 1;
  const encodedQ = encodeURIComponent(q);
  const copyCooldownMs = config.copyCooldownSeconds * 1000;
  const randomCooldownMs = config.randomCooldownSeconds * 1000;
  const downloadCooldownMs = config.downloadCooldownSeconds * 1000;
  const emptyStateText =
    view === "search"
      ? q
        ? "没有找到匹配的表情包，请尝试更换关键词或减少关键词数量。"
        : "请输入关键词开始搜索，可用空格分隔多个关键词。"
      : view === "all"
        ? "暂无公开表情包，请先在审核页通过内容。"
        : "暂无热门表情包，请先在审核页通过内容。";
  const visitor = requestHeaders.get("x-molworld-visitor");
  if (visitor) await recordVisit(visitor);
  return (
    <div
      className={`${styles.page} ${
        view === "all" || view === "search" ? styles.pageWithPagination : ""
      }`}
    >
      <WelcomeModal />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brandGroup}>
            <Link className={styles.brand} href="/">
              <span className={styles.brandText}>
                Mol<span className={styles.brandAccent}>World</span>
              </span>
            </Link>
            <AdminLoginTrigger
              authed={authed}
              className={styles.brandIconLink}
              iconClassName={styles.brandIcon}
            />
          </div>
          <form
            className={styles.searchForm}
            action="/"
            method="get"
            autoComplete="off"
          >
            <input
              name="q"
              className={`${styles.searchInput} focus-reset`}
              placeholder="搜索可爱的表情包"
              autoComplete="off"
              defaultValue={q}
            />
            <input type="hidden" name="view" value="search" />
            <input type="hidden" name="page" value="1" />
            <button
              type="submit"
              className={styles.searchButton}
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
          <div className={styles.headerActions}>
            <HomeNav />
            <Link className={styles.uploadBtn} href="/upload">
              上传
            </Link>
          </div>
        </div>
      </header>

      <main className={styles.content}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionInfo}>
            <div className={styles.sectionTitle}>
              {view === "hot" ? (
                "热门表情包"
              ) : view === "all" ? (
                <>
                  全部表情包
                  <span className={styles.sectionCount}>（{total}）</span>
                </>
              ) : (
                <>
                  搜索结果
                  <span className={styles.sectionCount}>（{total}）</span>
                </>
              )}
            </div>
            {view === "search" && (
              <div className={styles.sectionMeta}>
                {q ? `关键词（用空格分隔）：${q}` : "输入关键词开始"}
              </div>
            )}
          </div>

          {view === "hot" && (
            <div className={styles.filters}>
              <Link
                className={`${styles.filterBtn} ${
                  hotSort === "hot" ? styles.filterActive : ""
                }`}
                href="/?view=hot&hotSort=hot"
              >
                最热
              </Link>
              <RandomLink
                className={`${styles.filterBtn} ${
                  hotSort === "random" ? styles.filterActive : ""
                }`}
                disabledClassName={styles.filterDisabled}
                href="/?view=hot&hotSort=random"
                cooldownMs={randomCooldownMs}
              >
                随机
              </RandomLink>
            </div>
          )}
          {view === "search" && (
            <div className={styles.filters}>
              <Link
                className={`${styles.filterBtn} ${
                  sort === "name" ? styles.filterActive : ""
                }`}
                href={`/?view=search&q=${encodedQ}&sort=name&page=1&limit=${limit}`}
              >
                按名称
              </Link>
              <Link
                className={`${styles.filterBtn} ${
                  sort === "heat" ? styles.filterActive : ""
                }`}
                href={`/?view=search&q=${encodedQ}&sort=heat&page=1&limit=${limit}`}
              >
                最热
              </Link>
              <Link
                className={`${styles.filterBtn} ${
                  sort === "latest" ? styles.filterActive : ""
                }`}
                href={`/?view=search&q=${encodedQ}&sort=latest&page=1&limit=${limit}`}
              >
                最新
              </Link>
              <Link
                className={`${styles.filterBtn} ${
                  sort === "earliest" ? styles.filterActive : ""
                }`}
                href={`/?view=search&q=${encodedQ}&sort=earliest&page=1&limit=${limit}`}
              >
                最早
              </Link>
            </div>
          )}
          {view === "all" && (
            <div className={styles.filters}>
              <Link
                className={`${styles.filterBtn} ${styles.filterActive}`}
                href={`/?view=all&type=${
                  allType === "all"
                    ? "animated"
                    : allType === "animated"
                      ? "static"
                      : "all"
                }&sort=${sort}&page=1&limit=${limit}`}
              >
                {allType === "all"
                  ? "全部"
                  : allType === "animated"
                    ? "动图"
                    : "静态"}
              </Link>
              <Link
                className={`${styles.filterBtn} ${
                  sort === "name" ? styles.filterActive : ""
                }`}
                href={`/?view=all&type=${allType}&sort=name&page=1&limit=${limit}`}
              >
                按名称
              </Link>
              <Link
                className={`${styles.filterBtn} ${
                  sort === "latest" ? styles.filterActive : ""
                }`}
                href={`/?view=all&type=${allType}&sort=latest&page=1&limit=${limit}`}
              >
                最新
              </Link>
              <Link
                className={`${styles.filterBtn} ${
                  sort === "earliest" ? styles.filterActive : ""
                }`}
                href={`/?view=all&type=${allType}&sort=earliest&page=1&limit=${limit}`}
              >
                最早
              </Link>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className={styles.emptyState}>{emptyStateText}</div>
        ) : (
          <div className={styles.gridWrap}>
            <MemeGrid
              items={items}
              copyCooldownMs={copyCooldownMs}
              downloadCooldownMs={downloadCooldownMs}
            />
          </div>
        )}

        {view === "search" && (
          <div className={styles.pagination}>
            <div className={styles.pageInfo}>
              当前第 {page} 页 / 共 {totalPages} 页
            </div>
            <div className={styles.pageControls}>
              <div className={styles.pageNav}>
                {hasPrev ? (
                  <Link
                    className={styles.pageNavBtn}
                    href={`/?view=search&q=${encodedQ}&sort=${sort}&page=${page - 1}&limit=${limit}`}
                  >
                    上一页
                  </Link>
                ) : (
                  <span className={styles.pageNavBtnDisabled}>上一页</span>
                )}
                {hasNext ? (
                  <Link
                    className={styles.pageNavBtn}
                    href={`/?view=search&q=${encodedQ}&sort=${sort}&page=${page + 1}&limit=${limit}`}
                  >
                    下一页
                  </Link>
                ) : (
                  <span className={styles.pageNavBtnDisabled}>下一页</span>
                )}
              </div>
              <form className={styles.pageJump} action="/" method="get">
                <input type="hidden" name="view" value="search" />
                <input type="hidden" name="q" value={q} />
                <input type="hidden" name="sort" value={sort} />
                <input type="hidden" name="limit" value={limit} />
                <label className={styles.pageJumpLabel}>
                  跳转到
                  <input
                    className={styles.pageJumpInput}
                    type="number"
                    name="page"
                    min={1}
                    max={totalPages}
                    defaultValue={page}
                    disabled={disableJump}
                  />
                  页
                </label>
                <button
                  className={styles.pageJumpButton}
                  type="submit"
                  disabled={disableJump}
                >
                  跳转
                </button>
              </form>
            </div>
          </div>
        )}

        {view === "all" && (
          <div className={styles.pagination}>
            <div className={styles.pageInfo}>
              当前第 {page} 页 / 共 {totalPages} 页
            </div>
            <div className={styles.pageControls}>
              <div className={styles.pageNav}>
                {hasPrev ? (
                  <Link
                    className={styles.pageNavBtn}
                    href={`/?view=all&type=${allType}&sort=${sort}&page=${page - 1}&limit=${limit}`}
                  >
                    上一页
                  </Link>
                ) : (
                  <span className={styles.pageNavBtnDisabled}>上一页</span>
                )}
                {hasNext ? (
                  <Link
                    className={styles.pageNavBtn}
                    href={`/?view=all&type=${allType}&sort=${sort}&page=${page + 1}&limit=${limit}`}
                  >
                    下一页
                  </Link>
                ) : (
                  <span className={styles.pageNavBtnDisabled}>下一页</span>
                )}
              </div>
              <form className={styles.pageJump} action="/" method="get">
                <input type="hidden" name="view" value="all" />
                <input type="hidden" name="type" value={allType} />
                <input type="hidden" name="sort" value={sort} />
                <input type="hidden" name="limit" value={limit} />
                <label className={styles.pageJumpLabel}>
                  跳转到
                  <input
                    className={styles.pageJumpInput}
                    type="number"
                    name="page"
                    min={1}
                    max={totalPages}
                    defaultValue={page}
                    disabled={disableJump}
                  />
                  页
                </label>
                <button
                  className={styles.pageJumpButton}
                  type="submit"
                  disabled={disableJump}
                >
                  跳转
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerSection}>
            <div className={styles.footerTitle}>关于 molworld</div>
            <div className={styles.footerText}>
              十分神秘的表情包分享平台，致力于传播可爱的 mol 表情包。
            </div>
          </div>
        </div>
        <div className={styles.footerDivider} />
        <div className={styles.footerBottom}>
          © 3000 molworld. 并不保留所有权利。
        </div>
      </footer>
    </div>
  );
}
