import Link from "next/link";

import HomeNav from "@/components/HomeNav";
import MemeGrid from "@/components/MemeGrid";
import { prisma } from "@/lib/db";
import { normalizeSearchTokens, sortTags } from "@/lib/tags";
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

function shuffle<T>(items: T[]) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const DAILY_POOL_GROUPS = 20;
const DAILY_POOL_SIZE = 24;

const getDayKey = () => new Date().toISOString().slice(0, 10);

const pickRandomSubset = <T,>(items: T[], count: number) => {
  if (items.length <= count) return items.slice();
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
};

const ensureDailyPools = async (day: string, memeIds: string[]) => {
  if (memeIds.length === 0) return [];

  const existing = await prisma.dailyPool.findMany({
    where: { day },
    include: { _count: { select: { items: true } } },
  });

  const shouldRebuild =
    existing.length !== DAILY_POOL_GROUPS ||
    existing.some((group) => group._count.items < DAILY_POOL_SIZE);

  if (shouldRebuild) {
    await prisma.dailyPoolItem.deleteMany({ where: { pool: { day } } });
    await prisma.dailyPool.deleteMany({ where: { day } });

    for (let i = 0; i < DAILY_POOL_GROUPS; i += 1) {
      const ids = pickRandomSubset(memeIds, DAILY_POOL_SIZE);
      await prisma.dailyPool.create({
        data: {
          day,
          groupIndex: i,
          items: {
            create: ids.map((id) => ({
              meme: { connect: { id } },
            })),
          },
        },
      });
    }
  }

  return prisma.dailyPool.findMany({
    where: { day },
    select: {
      groupIndex: true,
      items: { select: { memeId: true } },
    },
  });
};

const select = {
  id: true,
  title: true,
  type: true,
  mediaUrl: true,
  thumbUrl: true,
  copies: true,
  isFeatured: true,
  createdAt: true,
  tags: {
    select: {
      tag: { select: { name: true } },
    },
  },
};

type MemeRow = {
  id: string;
  title: string | null;
  type: "STATIC" | "ANIMATED";
  mediaUrl: string;
  thumbUrl: string;
  copies: number;
  isFeatured: boolean;
  createdAt: Date;
  tags: { tag: { name: string } }[];
};

type MemeCardItem = Omit<MemeRow, "tags"> & { tags: string[] };

const normalizeItems = (list: MemeRow[]): MemeCardItem[] =>
  list.map((item) => ({
    ...item,
    tags: sortTags(item.tags.map((t) => t.tag.name)),
  }));

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
  const hotLimit = 24;
  const page = parseIntParam(getParam(resolvedParams?.page), 1);
  const sortParam = getParam(resolvedParams?.sort);
  const sort =
    sortParam === "name" || sortParam === "earliest" || sortParam === "latest"
      ? sortParam
      : "latest";
  const hotSortParam = getParam(resolvedParams?.hotSort);
  const hotSort =
    hotSortParam === "random" || hotSortParam === "hot"
      ? hotSortParam
      : "hot";

  let view: "hot" | "all" | "search" = "hot";
  if (viewParam === "all" || viewParam === "search" || viewParam === "hot") {
    view = viewParam;
  }
  if (q) view = "search";

  let items: MemeCardItem[] = [];
  let total = 0;
  let totalPages = 1;

  if (view === "hot") {
    const baseWhere = { status: "PUBLISHED" as const };
    if (hotSort === "random") {
      const ids = await prisma.meme.findMany({
        where: baseWhere,
        select: { id: true },
      });
      const memeIds = ids.map((item) => item.id);
      const pools = await ensureDailyPools(getDayKey(), memeIds);
      if (pools.length > 0) {
        const group = pools[Math.floor(Math.random() * pools.length)];
        const groupIds = group.items.map((item) => item.memeId);
        if (groupIds.length > 0) {
          const list = await prisma.meme.findMany({
            where: {
              status: "PUBLISHED" as const,
              id: { in: groupIds },
            },
            select,
          });
          const map = new Map(list.map((item) => [item.id, item]));
          items = normalizeItems(
            groupIds
              .map((id) => map.get(id))
              .filter(Boolean) as MemeRow[]
          );
        } else {
          items = [];
        }
      } else {
        items = [];
      }
    } else {
      const orderBy = { copies: "desc" as const };
      const list = await prisma.meme.findMany({
        where: baseWhere,
        orderBy,
        take: hotLimit,
        select,
      });
      items = normalizeItems(list);
    }
  }

  if (view === "all") {
    const skip = (page - 1) * limit;
    const where = { status: "PUBLISHED" as const };

    if (sort === "name") {
      const list = await prisma.meme.findMany({ where, select });
      const collator = new Intl.Collator("zh-Hans-CN", {
        sensitivity: "base",
        numeric: true,
      });
      list.sort((a, b) => {
        if (!a.title && !b.title) return 0;
        if (!a.title) return 1;
        if (!b.title) return -1;
        const diff = collator.compare(a.title, b.title);
        if (diff !== 0) return diff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      const normalized = normalizeItems(list as MemeRow[]);
      total = normalized.length;
      totalPages = Math.max(1, Math.ceil(total / limit));
      items = normalized.slice(skip, skip + limit);
    } else {
      const orderBy =
        sort === "earliest"
          ? [{ createdAt: "asc" as const }]
          : [{ createdAt: "desc" as const }];

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
      const skip = (page - 1) * limit;
      const tokens = normalizeSearchTokens(q);
      const where =
        tokens.length > 0
          ? {
              status: "PUBLISHED",
              AND: tokens.map((token) => ({
                OR: [
                  { title: { contains: token } },
                  { tags: { some: { tag: { name: { contains: token } } } } },
                ],
              })),
            }
          : {
              status: "PUBLISHED",
            };
      const [list, count] = await Promise.all([
        prisma.meme.findMany({
          where,
          orderBy: { createdAt: "desc" },
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

  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const encodedQ = encodeURIComponent(q);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/">
            <span className={styles.brandText}>
              Mol<span className={styles.brandAccent}>World</span>
            </span>
            <img
              className={styles.brandIcon}
              src="/brand-icon.png"
              alt="MolWorld"
            />
          </Link>
          <form className={styles.searchForm} action="/" method="get">
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
          <div>
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
                {q ? `关键词：${q}` : "输入关键词开始"}
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
              <Link
                className={`${styles.filterBtn} ${
                  hotSort === "random" ? styles.filterActive : ""
                }`}
                href="/?view=hot&hotSort=random"
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

        {view === "search" && !q ? (
          <div className={styles.emptyState}>请输入关键词开始搜索。</div>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>没有找到结果。</div>
        ) : (
          <div className={styles.gridWrap}>
            <MemeGrid items={items} />
          </div>
        )}

        {view === "search" && totalPages > 1 && (
          <div className={styles.pagination}>
            <div className={styles.pageInfo}>
              当前第 {page} 页 / 共 {totalPages} 页
            </div>
            <div className={styles.pageControls}>
              <div className={styles.pageNav}>
                {hasPrev ? (
                  <Link
                    className={styles.pageNavBtn}
                    href={`/?view=search&q=${encodedQ}&page=${page - 1}&limit=${limit}`}
                  >
                    上一页
                  </Link>
                ) : (
                  <span className={styles.pageNavBtnDisabled}>上一页</span>
                )}
                {hasNext ? (
                  <Link
                    className={styles.pageNavBtn}
                    href={`/?view=search&q=${encodedQ}&page=${page + 1}&limit=${limit}`}
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
                  />
                  页
                </label>
                <button className={styles.pageJumpButton} type="submit">
                  跳转
                </button>
              </form>
            </div>
          </div>
        )}

        {view === "all" && totalPages > 1 && (
          <div className={styles.pagination}>
            <div className={styles.pageInfo}>
              当前第 {page} 页 / 共 {totalPages} 页
            </div>
            <div className={styles.pageControls}>
              <div className={styles.pageNav}>
                {hasPrev ? (
                  <Link
                    className={styles.pageNavBtn}
                    href={`/?view=all&sort=${sort}&page=${page - 1}&limit=${limit}`}
                  >
                    上一页
                  </Link>
                ) : (
                  <span className={styles.pageNavBtnDisabled}>上一页</span>
                )}
                {hasNext ? (
                  <Link
                    className={styles.pageNavBtn}
                    href={`/?view=all&sort=${sort}&page=${page + 1}&limit=${limit}`}
                  >
                    下一页
                  </Link>
                ) : (
                  <span className={styles.pageNavBtnDisabled}>下一页</span>
                )}
              </div>
              <form className={styles.pageJump} action="/" method="get">
                <input type="hidden" name="view" value="all" />
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
                  />
                  页
                </label>
                <button className={styles.pageJumpButton} type="submit">
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
