"use client";

import styles from "@/app/admin/page.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Chart from "chart.js/auto";

import { useToast, useToastConfirm } from "@/components/ToastProvider";
import toastStyles from "@/components/Toast.module.css";
import { formatCount } from "@/lib/format";

export default function AdminOtherPanel() {
  const toast = useToast();
  const confirm = useToastConfirm();
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceStats, setResourceStats] = useState<{
    missing: { original: number; thumb: number };
    orphans: { original: number; thumb: number };
  } | null>(null);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficRange, setTrafficRange] = useState<"3d" | "7d" | "30d" | "all">(
    "7d"
  );
  const [trafficView, setTrafficView] = useState<
    "visits" | "top" | "cumulative" | "daily"
  >("top");
  const [trafficData, setTrafficData] = useState<{
    top: { id: string; title: string | null; type: string; thumbUrl: string; heat: number }[];
    daily: { day: string; heat: number; cumulative: number; visits: number }[];
  } | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    next: "",
    confirm: "",
  });
  const [mounted, setMounted] = useState(false);

  const scripts = [
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
      title: "重建随机池（危险）",
      desc: "按当前已发布表情包重建今日随机池。",
      command: "pnpm tsx prisma/rebuild-daily-pool.ts",
      danger: true,
    },
    {
      title: "按编号重命名文件（危险）",
      desc: "将素材文件名改为对应 numId 编号。",
      command: "pnpm tsx prisma/rename-media-by-numid.ts",
      danger: true,
    },
    {
      title: "清理 trash 目录（危险）",
      desc: "删除 public/trash 内所有文件。",
      command: "pnpm tsx prisma/cleanup-trash.ts",
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

  const loadTraffic = async (range: typeof trafficRange = trafficRange) => {
    if (trafficLoading) return;
    setTrafficLoading(true);
    try {
      const res = await fetch(`/api/admin/traffic?range=${range}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as
        | {
          top?: {
            id: string;
            title: string | null;
            type: string;
            thumbUrl: string;
            heat: number;
          }[];
          daily?: { day: string; heat: number; cumulative: number; visits: number }[];
          error?: string;
          message?: string;
        }
        | null;
      if (!res.ok || !data?.daily || !data?.top) {
        throw new Error(data?.error || data?.message || "加载失败");
      }
      setTrafficData({ top: data.top, daily: data.daily });
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载失败";
      toast(message, "error");
    } finally {
      setTrafficLoading(false);
    }
  };

  useEffect(() => {
    void loadTraffic(trafficRange);
  }, [trafficRange]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dailyHeat = useMemo(
    () => trafficData?.daily.map((item) => item.heat) ?? [],
    [trafficData]
  );
  const visitSeries = useMemo(
    () => trafficData?.daily.map((item) => item.visits) ?? [],
    [trafficData]
  );
  const cumulativeHeat = useMemo(
    () => trafficData?.daily.map((item) => item.cumulative) ?? [],
    [trafficData]
  );

  const rangeLabelMap: Record<typeof trafficRange, string> = {
    "3d": "最近3天",
    "7d": "最近7天",
    "30d": "最近30天",
    all: "全部",
  };
  const rangeLabel = rangeLabelMap[trafficRange];
  const dayLabels = useMemo(
    () => trafficData?.daily.map((item) => item.day) ?? [],
    [trafficData]
  );

  const formatDayLabel = (value: string) => {
    if (!value) return "";
    return value.length >= 5 ? value.slice(5) : value;
  };

  const TrafficLineChart = ({
    labels,
    data,
    ariaLabel,
  }: {
    labels: string[];
    data: number[];
    ariaLabel: string;
  }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const safeLabels = labels.map(formatDayLabel);
    const safeData =
      safeLabels.length === data.length
        ? data
        : data.slice(0, safeLabels.length);
    useEffect(() => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;
      const chart = new Chart(ctx, {
        type: "line",
        data: {
          labels: safeLabels,
          datasets: [
            {
              data: safeData,
              borderColor: "rgba(255, 255, 255, 0.9)",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              borderWidth: 2,
              pointRadius: 2,
              pointHoverRadius: 4,
              tension: 0.35,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              backgroundColor: "rgba(20, 20, 20, 0.9)",
              borderColor: "rgba(255, 255, 255, 0.12)",
              borderWidth: 1,
              titleColor: "#fff",
              bodyColor: "#fff",
              displayColors: false,
            },
          },
          interaction: {
            mode: "index",
            intersect: false,
          },
          scales: {
            x: {
              ticks: {
                color: "rgba(255, 255, 255, 0.6)",
                maxTicksLimit: 6,
              },
              grid: {
                color: "rgba(255, 255, 255, 0.08)",
              },
            },
            y: {
              ticks: {
                color: "rgba(255, 255, 255, 0.6)",
                callback: (value) =>
                  formatCount(Number(value)),
              },
              grid: {
                color: "rgba(255, 255, 255, 0.08)",
              },
            },
          },
        },
      });
      return () => chart.destroy();
    }, [safeLabels.join("|"), safeData.join("|")]);

    return (
      <div className={styles.trafficChartBox}>
        <canvas
          ref={canvasRef}
          className={styles.trafficChartCanvas}
          aria-label={ariaLabel}
          role="img"
        />
      </div>
    );
  };

  const resetHeat = async () => {
    if (resourceLoading) return;
    const ok = await confirm(
      "确认清零全站热度吗？",
      "该操作会将所有表情包热度重置为 0。"
    );
    if (!ok) return;
    setResourceLoading(true);
    try {
      const res = await fetch("/api/admin/heat/reset", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { count?: number; stats?: number; error?: string; message?: string }
        | null;
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "清零失败");
      }
      const memeCount = data?.count ?? 0;
      const statCount = data?.stats ?? 0;
      toast(`已清零热度（表情包 ${memeCount} / 统计 ${statCount}）`, "success");
      void loadTraffic(trafficRange);
    } catch (err) {
      const message = err instanceof Error ? err.message : "清零失败";
      toast(message, "error");
    } finally {
      setResourceLoading(false);
    }
  };

  const handleChangePassword = () => {
    if (passwordLoading) return;
    setPasswordForm({ next: "", confirm: "" });
    setPasswordError("");
    setPasswordOpen(true);
  };


  const closePasswordDialog = () => {
    if (passwordLoading) return;
    setPasswordOpen(false);
    setPasswordError("");
  };

  const submitPasswordChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordLoading) return;
    const next = passwordForm.next.trim();
    const confirmPass = passwordForm.confirm.trim();
    if (!next || !confirmPass) {
      setPasswordError("请填写完整信息");
      return;
    }
    if (next !== confirmPass) {
      setPasswordError("两次输入的新密码不一致");
      return;
    }
    setPasswordLoading(true);
    setPasswordError("");
    try {
      const res = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPass: next,
          confirmPass,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        setPasswordError(data?.error || data?.message || "修改失败");
        return;
      }
      toast("密码已更新", "success");
      setPasswordOpen(false);
    } finally {
      setPasswordLoading(false);
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
        管理流量热度、脚本入口与资源维护等运营功能。
      </div>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>流量与热度</div>
          <div className={styles.trafficControls}>
            <div className={styles.trafficToggleGroup}>
              <button
                type="button"
                className={`${styles.trafficToggle} ${trafficView === "top" ? styles.trafficToggleActive : ""
                  }`}
                onClick={() => setTrafficView("top")}
              >
                热门 Top 30
              </button>
              <button
                type="button"
                className={`${styles.trafficToggle} ${trafficView === "visits" ? styles.trafficToggleActive : ""
                  }`}
                onClick={() => setTrafficView("visits")}
              >
                访问趋势
              </button>
              <button
                type="button"
                className={`${styles.trafficToggle} ${trafficView === "cumulative" ? styles.trafficToggleActive : ""
                  }`}
                onClick={() => setTrafficView("cumulative")}
              >
                热度总和
              </button>
              <button
                type="button"
                className={`${styles.trafficToggle} ${trafficView === "daily" ? styles.trafficToggleActive : ""
                  }`}
                onClick={() => setTrafficView("daily")}
              >
                每日新增
              </button>
            </div>
            <select
              className={styles.trafficSelect}
              value={trafficRange}
              onChange={(event) =>
                setTrafficRange(event.target.value as typeof trafficRange)
              }
              disabled={trafficLoading}
            >
              <option value="3d">最近3天</option>
              <option value="7d">最近7天</option>
              <option value="30d">最近30天</option>
              <option value="all">全部</option>
            </select>
            <button
              type="button"
              className={styles.resourceButton}
              onClick={() => loadTraffic(trafficRange)}
              disabled={trafficLoading}
            >
              刷新数据
            </button>
          </div>
        </div>
        <div className={styles.sectionHint}>
          展示热门 Top 30 、访问与热度趋势（{rangeLabel}）。
        </div>
        <div className={styles.trafficPanel}>
          <div className={styles.trafficPanelBody}>
            {trafficView === "visits" ? (
              visitSeries.length ? (
                <TrafficLineChart
                  labels={dayLabels}
                  data={visitSeries}
                  ariaLabel="访问趋势"
                />
              ) : (
                <div className={styles.trafficEmpty}>暂无数据</div>
              )
            ) : trafficView === "top" ? (
              trafficData?.top?.length ? (
                <ol className={styles.trafficList}>
                  {trafficData.top.map((item, index) => (
                    <li key={item.id} className={styles.trafficItem}>
                      <span className={styles.trafficRank}>{index + 1}</span>
                      <span className={styles.trafficName}>
                        {item.title ?? "未命名"}
                      </span>
                      <span className={styles.trafficValue}>
                        {formatCount(item.heat)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className={styles.trafficEmpty}>暂无数据</div>
              )
            ) : trafficView === "cumulative" ? (
              cumulativeHeat.length ? (
                <TrafficLineChart
                  labels={dayLabels}
                  data={cumulativeHeat}
                  ariaLabel="热度总和曲线"
                />
              ) : (
                <div className={styles.trafficEmpty}>暂无数据</div>
              )
            ) : dailyHeat.length ? (
              <TrafficLineChart
                labels={dayLabels}
                data={dailyHeat}
                ariaLabel="每日新增热度"
              />
            ) : (
              <div className={styles.trafficEmpty}>暂无数据</div>
            )}
          </div>
        </div>
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
                className={`${styles.scriptTitle} ${script.danger ? styles.scriptTitleDanger : ""
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
        <div className={styles.sectionTitle}>资源维护</div>
        <div className={styles.resourceGrid}>
          <div className={styles.resourceCard}>
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
          </div>
          <div className={styles.resourceCard}>
            <div className={styles.sectionTitle}>热度清零</div>
            <div className={styles.sectionHint}>
              全部表情包热度统一归零，请谨慎操作。
            </div>
            <div className={styles.resourceActions}>
              <button
                type="button"
                className={`${styles.resourceButton} ${styles.resourceButtonDanger}`}
                onClick={resetHeat}
                disabled={resourceLoading}
              >
                全站热度清零
              </button>
            </div>
          </div>
          <div className={styles.resourceCard}>
            <div className={styles.sectionTitle}>账号与退出</div>
            <div className={styles.sectionHint}>
              修改管理员密码或退出当前登录。
            </div>
            <div className={styles.resourceActions}>
              <button
                type="button"
                className={styles.resourceButton}
                onClick={handleChangePassword}
              >
                修改密码
              </button>
              <button
                type="button"
                className={`${styles.resourceButton} ${styles.resourceButtonDanger}`}
                onClick={handleLogout}
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      </div>
      {passwordOpen && mounted
        ? createPortal(
            <div className={styles.passwordOverlay} role="dialog" aria-modal="true">
              <div className={`${toastStyles.toast} ${styles.passwordModal}`}>
                <div className={toastStyles.toastMessage}>修改密码</div>
                <form className={styles.passwordForm} onSubmit={submitPasswordChange}>
                  <label className={styles.passwordField}>
                    <span className={styles.passwordLabel}>新密码</span>
                    <input
                      className={styles.passwordInput}
                      type="password"
                      value={passwordForm.next}
                      onChange={(event) =>
                        setPasswordForm((prev) => ({
                          ...prev,
                          next: event.target.value,
                        }))
                      }
                      autoComplete="new-password"
                      placeholder="输入新密码"
                      disabled={passwordLoading}
                    />
                  </label>
                  <label className={styles.passwordField}>
                    <span className={styles.passwordLabel}>确认新密码</span>
                    <input
                      className={styles.passwordInput}
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(event) =>
                        setPasswordForm((prev) => ({
                          ...prev,
                          confirm: event.target.value,
                        }))
                      }
                      autoComplete="new-password"
                      placeholder="再次输入新密码"
                      disabled={passwordLoading}
                    />
                  </label>
                  {passwordError ? (
                    <div className={styles.passwordError}>{passwordError}</div>
                  ) : null}
                  <div className={toastStyles.toastActions}>
                    <button
                      type="button"
                      className={`${toastStyles.toastAction} ${toastStyles.toastActionGhost}`}
                      onClick={closePasswordDialog}
                      disabled={passwordLoading}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className={`${toastStyles.toastAction} ${toastStyles.toastActionPrimary}`}
                      disabled={passwordLoading}
                    >
                      {passwordLoading ? "提交中..." : "确认"}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
