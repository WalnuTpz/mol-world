"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import styles from "@/app/page.module.css";

export default function HomeNav() {
  const params = useSearchParams();
  const view = params.get("view");
  const q = (params.get("q") ?? "").trim();
  const isSearch = view === "search" || q.length > 0;
  const isAll = view === "all";
  const isHot = !isSearch && (view === null || view === "hot");

  return (
    <nav className={styles.nav}>
      <Link
        className={`${styles.navItem} ${
          isHot ? styles.navItemActive : styles.navItemInactive
        }`}
        href="/?view=hot"
      >
        热门
      </Link>
      <Link
        className={`${styles.navItem} ${
          isAll ? styles.navItemActive : styles.navItemInactive
        }`}
        href="/?view=all"
      >
        全部
      </Link>
    </nav>
  );
}
