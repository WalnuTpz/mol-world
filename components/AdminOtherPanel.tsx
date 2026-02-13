"use client";

import styles from "@/app/admin/page.module.css";
import { useState } from "react";

import { useToast, useToastConfirm } from "@/components/ToastProvider";

export default function AdminOtherPanel() {
  const toast = useToast();
  const confirm = useToastConfirm();
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceStats, setResourceStats] = useState<{
    missing: { original: number; thumb: number };
    orphans: { original: number; thumb: number };
  } | null>(null);

  const scripts = [
    {
      title: "数据库初始化",
      desc: "重新写入种子数据（谨慎使用）。",
      command: "pnpm prisma db seed",
      danger: true,
    },
    {
      title: "回填 numId",
      desc: "为表情包/标签补齐 numId 编号。",
      command: "pnpm tsx prisma/backfill-numid.ts",
    },
    {
      title: "回填缩略图",
      desc: "为已有素材批量生成缩略图。",
      command: "pnpm tsx prisma/backfill-thumbs.ts",
    },
    {
      title: "标题标签回填",
      desc: "根据标题关键词自动补齐标签。",
      command: "pnpm tsx prisma/backfill-title-tags.ts",
    },
    {
      title: "按标题重命名文件",
      desc: "将素材文件名改为对应标题。",
      command: "pnpm tsx prisma/rename-media-by-title.ts",
      danger: true,
    },
    {
      title: "修正创建时间",
      desc: "按顺序调整 createdAt 时间。",
      command: "pnpm tsx prisma/adjust-created-at.ts",
      danger: true,
    },
  ];

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      toast("已复制命令", "success");
    } catch {
      toast("复制失败，请手动复制", "error");
    }
  };

  const loadResources = async () => {
    if (resourceLoading) return;
    setResourceLoading(true);
    try {
      const res = await fetch("/api/admin/resources", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | {
            stats?: {
              missing: { original: number; thumb: number };
              orphans: { original: number; thumb: number };
            };
            error?: string;
            message?: string;
          }
        | null;
      if (!res.ok || !data?.stats) {
        throw new Error(data?.error || data?.message || "检查失败");
      }
      setResourceStats(data.stats);
      toast("资源检查完成", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "检查失败";
      toast(message, "error");
    } finally {
      setResourceLoading(false);
    }
  };

  const cleanupOrphans = async () => {
    if (resourceLoading) return;
    const ok = await confirm("确认清理孤儿文件吗？", "仅清理 original/thumb 目录中的孤儿文件。");
    if (!ok) return;
    setResourceLoading(true);
    try {
      const res = await fetch("/api/admin/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cleanup" }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            removed?: { original: number; thumb: number };
            stats?: {
              missing: { original: number; thumb: number };
              orphans: { original: number; thumb: number };
            };
            error?: string;
            message?: string;
          }
        | null;
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "清理失败");
      }
      if (data?.stats) {
        setResourceStats(data.stats);
      }
      if (data?.removed) {
        toast(
          `已清理孤儿文件（原图 ${data.removed.original} / 缩略图 ${data.removed.thumb}）`,
          "success"
        );
      } else {
        toast("已清理孤儿文件", "success");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "清理失败";
      toast(message, "error");
    } finally {
      setResourceLoading(false);
    }
  };

  const handleLogout = () => {
    confirm("确认退出管理员登录吗？").then((ok) => {
      if (!ok) return;
      fetch("/api/admin/logout", { method: "POST" })
        .catch(() => null)
        .finally(() => {
          window.location.href = "/";
        });
    });
  };

  return (
    <section className={styles.panel}>
      <div className={styles.panelTitle}>其他内容</div>
      <div className={styles.panelText}>
        管理公告、标签池或全局配置等扩展内容。
      </div>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>脚本入口</div>
        <div className={styles.sectionHintRow}>
          <span>在项目根目录执行命令</span>
          <span className={styles.sectionWarnInline}>
            部分脚本会改动数据库或文件，请确认备份后再执行。
          </span>
        </div>
        <div className={styles.scriptList}>
          {scripts.map((script) => (
            <div key={script.title} className={styles.scriptCard}>
              <div
                className={`${styles.scriptTitle} ${
                  script.danger ? styles.scriptTitleDanger : ""
                }`}
              >
                {script.title}
              </div>
              <div className={styles.scriptText}>{script.desc}</div>
              <div className={styles.scriptCmdRow}>
                <code className={styles.scriptCmd}>{script.command}</code>
                <button
                  type="button"
                  className={styles.scriptCopy}
                  onClick={() => copyCommand(script.command)}
                >
                  复制
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>资源检查</div>
        <div className={styles.sectionHint}>
          检查缺图与孤儿文件情况，可手动清理孤儿文件。
        </div>
        <div className={styles.resourceActions}>
          <button
            type="button"
            className={styles.resourceButton}
            onClick={loadResources}
            disabled={resourceLoading}
          >
            缺图检查
          </button>
          <button
            type="button"
            className={`${styles.resourceButton} ${styles.resourceButtonDanger}`}
            onClick={cleanupOrphans}
            disabled={resourceLoading}
          >
            清理孤儿文件
          </button>
        </div>
        <div className={styles.resourceList}>
          <div className={styles.resourceRow}>
            <span className={styles.resourceLabel}>缺图（原图/缩略图）</span>
            <span className={styles.resourceValue}>
              {resourceStats
                ? `${resourceStats.missing.original} / ${resourceStats.missing.thumb}`
                : "-"}
            </span>
          </div>
          <div className={styles.resourceRow}>
            <span className={styles.resourceLabel}>孤儿文件（原图/缩略图）</span>
            <span className={styles.resourceValue}>
              {resourceStats
                ? `${resourceStats.orphans.original} / ${resourceStats.orphans.thumb}`
                : "-"}
            </span>
          </div>
        </div>
      </div>
      <div className={styles.panelActions}>
        <button type="button" className={styles.logoutButton} onClick={handleLogout}>
          退出登录
        </button>
      </div>
    </section>
  );
}
