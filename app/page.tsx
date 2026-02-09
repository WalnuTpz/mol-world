import Link from "next/link";

import HomeNav from "@/components/HomeNav";
import MemeGrid from "@/components/MemeGrid";
import { prisma } from "@/lib/db";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type SearchParams = {
  view?: string | string[];
  q?: string | string[];
  page?: string | string[];
  limit?: string | string[];
  sort?: string | string[];
  hotSort?: string | string[];
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseIntParam(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const select = {
  id: true,
  title: true,
  type: true,
  mediaUrl: true,
  thumbUrl: true,
  downloads: true,
  isFeatured: true,
  createdAt: true,
};

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams | Promise<SearchParams>;
}) {
  const resolvedParams =
    (await Promise.resolve(searchParams)) ?? ({} as SearchParams);
  const viewParam = getParam(resolvedParams?.view);
  const q = (getParam(resolvedParams?.q) ?? "").trim();
  const limit = parseIntParam(getParam(resolvedParams?.limit), 24);
  const page = parseIntParam(getParam(resolvedParams?.page), 1);
  const sortParam = getParam(resolvedParams?.sort);
  const sort =
    sortParam === "name" || sortParam === "earliest" || sortParam === "latest"
      ? sortParam
      : "latest";
  const hotSortParam = getParam(resolvedParams?.hotSort);
  const hotSort =
    hotSortParam === "latest" || hotSortParam === "random" || hotSortParam === "hot"
      ? hotSortParam
      : "hot";

  let view: "hot" | "all" | "search" = "hot";
  if (viewParam === "all" || viewParam === "search" || viewParam === "hot") {
    view = viewParam;
  }
  if (q) view = "search";

  let items = [];
  let total = 0;
  let totalPages = 1;

  if (view === "hot") {
    const baseWhere = { status: "PUBLISHED", isFeatured: true };
    if (hotSort === "random") {
      const count = await prisma.meme.count({ where: baseWhere });
      const maxSkip = Math.max(0, count - limit);
      const skip = maxSkip === 0 ? 0 : Math.floor(Math.random() * (maxSkip + 1));
      items = await prisma.meme.findMany({
        where: baseWhere,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select,
      });
    } else {
      const orderBy =
        hotSort === "latest"
          ? { createdAt: "desc" as const }
          : { downloads: "desc" as const };
      items = await prisma.meme.findMany({
        where: baseWhere,
        orderBy,
        take: limit,
        select,
      });
    }
  }

  if (view === "all") {
    const skip = (page - 1) * limit;
    const orderBy =
      sort === "name"
        ? [{ title: "asc" as const }, { createdAt: "desc" as const }]
        : sort === "earliest"
          ? [{ createdAt: "asc" as const }]
          : [{ createdAt: "desc" as const }];

    const [list, count] = await Promise.all([
      prisma.meme.findMany({
        where: { status: "PUBLISHED" },
        orderBy,
        skip,
        take: limit,
        select,
      }),
      prisma.meme.count({ where: { status: "PUBLISHED" } }),
    ]);
    items = list;
    total = count;
    totalPages = Math.max(1, Math.ceil(total / limit));
  }

  if (view === "search") {
    if (!q) {
      items = [];
      total = 0;
      totalPages = 1;
    } else {
      const skip = (page - 1) * limit;
      const [list, count] = await Promise.all([
        prisma.meme.findMany({
          where: {
            status: "PUBLISHED",
            title: { contains: q },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          select,
        }),
        prisma.meme.count({
          where: {
            status: "PUBLISHED",
            title: { contains: q },
          },
        }),
      ]);
      items = list;
      total = count;
      totalPages = Math.max(1, Math.ceil(total / limit));
    }
  }

  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const encodedQ = encodeURIComponent(q);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/">
            Mol<span className={styles.brandAccent}>World</span>
          </Link>
          <form
            key={`${view}-${q}`}
            className={styles.searchForm}
            action="/"
            method="get"
          >
            <input
              name="q"
              className={styles.searchInput}
              placeholder="搜索可爱的表情包"
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
          <HomeNav />
        </div>
      </header>

      <main className={styles.content}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>
              {view === "hot" ? (
                "热门推荐"
              ) : view === "all" ? (
                <>
                  全部表情包
                  <span className={styles.sectionCount}>（{total}）</span>
                </>
              ) : (
                "搜索结果"
              )}
            </div>
            {view === "search" && (
              <div className={styles.sectionMeta}>
                {q ? `关键词：${q}` : "输入关键词开始"}
              </div>
            )}
          </div>

          {view === "hot" && (
            <div className={styles.filters}>
              <Link
                className={`${styles.filterBtn} ${hotSort === "latest" ? styles.filterActive : ""
                  }`}
                href={`/?view=hot&hotSort=latest&limit=${limit}`}
              >
                最新
              </Link>
              <Link
                className={`${styles.filterBtn} ${hotSort === "hot" ? styles.filterActive : ""
                  }`}
                href={`/?view=hot&hotSort=hot&limit=${limit}`}
              >
                最热
              </Link>
              <Link
                className={`${styles.filterBtn} ${hotSort === "random" ? styles.filterActive : ""
                  }`}
                href={`/?view=hot&hotSort=random&limit=${limit}`}
              >
                随机
              </Link>
            </div>
          )}
          {view === "all" && (
            <div className={styles.filters}>
              <Link
                className={`${styles.filterBtn} ${sort === "name" ? styles.filterActive : ""
                  }`}
                href={`/?view=all&sort=name&page=1&limit=${limit}`}
              >
                按名称
              </Link>
              <Link
                className={`${styles.filterBtn} ${sort === "latest" ? styles.filterActive : ""
                  }`}
                href={`/?view=all&sort=latest&page=1&limit=${limit}`}
              >
                最新
              </Link>
              <Link
                className={`${styles.filterBtn} ${sort === "earliest" ? styles.filterActive : ""
                  }`}
                href={`/?view=all&sort=earliest&page=1&limit=${limit}`}
              >
                最早
              </Link>
            </div>
          )}
        </div>

        {(view === "all" || view === "search") && totalPages > 1 && (
          <div className={styles.pager}>
            {hasPrev ? (
              <Link
                className={styles.pagerLink}
                href={`/?view=${view}${view === "search" ? `&q=${encodedQ}` : `&sort=${sort}`
                  }&page=${page - 1}&limit=${limit}`}
              >
                上一页
              </Link>
            ) : (
              <span className={styles.pagerDisabled}>上一页</span>
            )}
            {hasNext ? (
              <Link
                className={styles.pagerLink}
                href={`/?view=${view}${view === "search" ? `&q=${encodedQ}` : `&sort=${sort}`
                  }&page=${page + 1}&limit=${limit}`}
              >
                下一页
              </Link>
            ) : (
              <span className={styles.pagerDisabled}>下一页</span>
            )}
          </div>
        )}

        {view === "search" && !q ? (
          <div className={styles.emptyState}>请输入关键词开始搜索。</div>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>没有找到结果。</div>
        ) : (
          <div className={styles.gridWrap}>
            <MemeGrid items={items} />
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerSection}>
            <div className={styles.footerTitle}>关于 molworld</div>
            <div className={styles.footerText}>
              十分神秘的 mol 表情包分享平台，致力于传播可爱的 mol 表情包。
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
