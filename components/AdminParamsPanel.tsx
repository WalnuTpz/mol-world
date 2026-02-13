"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "@/components/AdminParamsPanel.module.css";
import { useToast, useToastConfirm } from "@/components/ToastProvider";
import { APP_CONFIG_DEFAULTS } from "@/lib/appConfigDefaults";

type ParamKey =
  | "dailyPoolGroups"
  | "dailyPoolSize"
  | "hotLimit"
  | "listLimit"
  | "cacheListSeconds"
  | "cacheHotSeconds"
  | "cacheSearchSeconds"
  | "uploadMaxSizeMb"
  | "uploadCooldownSeconds"
  | "uploadGlobalCooldownSeconds"
  | "reviewQueueLimit"
  | "managePageLimit"
  | "reviewPageLimit"
  | "logPageLimit"
  | "tagPageLimit"
  | "maxTags"
  | "maxCnTagLength"
  | "maxEnTagLength"
  | "copyCooldownSeconds"
  | "randomCooldownSeconds"
  | "downloadCooldownSeconds"
  | "loginCooldownHours"
  | "adminSessionDays";

type ParamItem = {
  key: ParamKey;
  label: string;
  hint: string;
  unit?: string;
  min: number;
  max: number;
};

const sections: { title: string; items: ParamItem[] }[] = [
  {
    title: "首页 / 随机池",
    items: [
      {
        key: "dailyPoolGroups",
        label: "每日随机池组数",
        hint: "dailyPoolGroups",
        unit: "组",
        min: 1,
        max: 60,
      },
      {
        key: "dailyPoolSize",
        label: "单组随机池数量",
        hint: "dailyPoolSize",
        unit: "张",
        min: 1,
        max: 60,
      },
      {
        key: "hotLimit",
        label: "热门展示数量",
        hint: "hotLimit",
        unit: "张",
        min: 1,
        max: 60,
      },
      {
        key: "listLimit",
        label: "列表默认每页",
        hint: "listLimit",
        unit: "条",
        min: 6,
        max: 60,
      },
    ],
  },
  {
    title: "API 缓存",
    items: [
      {
        key: "cacheListSeconds",
        label: "列表接口缓存",
        hint: "cacheListSeconds",
        unit: "秒",
        min: 0,
        max: 3600,
      },
      {
        key: "cacheHotSeconds",
        label: "热门接口缓存",
        hint: "cacheHotSeconds",
        unit: "秒",
        min: 0,
        max: 3600,
      },
      {
        key: "cacheSearchSeconds",
        label: "搜索接口缓存",
        hint: "cacheSearchSeconds",
        unit: "秒",
        min: 0,
        max: 3600,
      },
    ],
  },
  {
    title: "上传与审核",
    items: [
      {
        key: "uploadMaxSizeMb",
        label: "上传大小上限",
        hint: "uploadMaxSizeMb",
        unit: "MB",
        min: 1,
        max: 50,
      },
      {
        key: "uploadCooldownSeconds",
        label: "单 IP 上传间隔",
        hint: "uploadCooldownSeconds",
        unit: "秒",
        min: 0,
        max: 600,
      },
      {
        key: "uploadGlobalCooldownSeconds",
        label: "全局上传间隔",
        hint: "uploadGlobalCooldownSeconds",
        unit: "秒",
        min: 0,
        max: 600,
      },
      {
        key: "reviewQueueLimit",
        label: "审核队列上限",
        hint: "reviewQueueLimit",
        unit: "张",
        min: 0,
        max: 1000,
      },
    ],
  },
  {
    title: "分页与列表",
    items: [
      {
        key: "managePageLimit",
        label: "管理页每页",
        hint: "managePageLimit",
        unit: "条",
        min: 4,
        max: 30,
      },
      {
        key: "reviewPageLimit",
        label: "审核页每页",
        hint: "reviewPageLimit",
        unit: "条",
        min: 4,
        max: 30,
      },
      {
        key: "logPageLimit",
        label: "日志页每页",
        hint: "logPageLimit",
        unit: "条",
        min: 5,
        max: 50,
      },
      {
        key: "tagPageLimit",
        label: "标签页每页",
        hint: "tagPageLimit",
        unit: "条",
        min: 5,
        max: 50,
      },
    ],
  },
  {
    title: "标签规范",
    items: [
      {
        key: "maxTags",
        label: "单图最多标签",
        hint: "maxTags",
        unit: "个",
        min: 1,
        max: 12,
      },
      {
        key: "maxCnTagLength",
        label: "中文标签长度",
        hint: "maxCnTagLength",
        unit: "字",
        min: 2,
        max: 20,
      },
      {
        key: "maxEnTagLength",
        label: "英文标签长度",
        hint: "maxEnTagLength",
        unit: "字符",
        min: 2,
        max: 30,
      },
    ],
  },
  {
    title: "交互节流",
    items: [
      {
        key: "copyCooldownSeconds",
        label: "复制冷却",
        hint: "copyCooldownSeconds",
        unit: "秒",
        min: 0,
        max: 60,
      },
      {
        key: "randomCooldownSeconds",
        label: "随机冷却",
        hint: "randomCooldownSeconds",
        unit: "秒",
        min: 0,
        max: 60,
      },
      {
        key: "downloadCooldownSeconds",
        label: "下载冷却",
        hint: "downloadCooldownSeconds",
        unit: "秒",
        min: 0,
        max: 60,
      },
    ],
  },
  {
    title: "管理员安全",
    items: [
      {
        key: "loginCooldownHours",
        label: "登录失败冷却",
        hint: "loginCooldownHours",
        unit: "小时",
        min: 1,
        max: 168,
      },
      {
        key: "adminSessionDays",
        label: "会话有效期",
        hint: "adminSessionDays",
        unit: "天",
        min: 1,
        max: 30,
      },
    ],
  },
];

const allKeys = sections.flatMap((section) =>
  section.items.map((item) => item.key)
);

export default function AdminParamsPanel() {
  const toast = useToast();
  const confirm = useToastConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<ParamKey, string>>(
    {} as Record<ParamKey, string>
  );
  const [initialValues, setInitialValues] = useState<Record<ParamKey, string>>(
    {} as Record<ParamKey, string>
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch("/api/admin/params", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as
          | { config?: Record<string, number>; error?: string }
          | null;
        if (!res.ok) {
          throw new Error(data?.error || "加载失败");
        }
        if (!data?.config) throw new Error("加载失败");
        const nextValues = allKeys.reduce((acc, key) => {
          const raw = data.config?.[key];
          acc[key] = String(raw ?? "");
          return acc;
        }, {} as Record<ParamKey, string>);
        if (cancelled) return;
        setValues(nextValues);
        setInitialValues(nextValues);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "加载失败";
        setError(message);
        toast(message, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const dirty = useMemo(
    () => allKeys.some((key) => values[key] !== initialValues[key]),
    [values, initialValues]
  );

  const handleChange = (key: ParamKey, next: string) => {
    setValues((prev) => ({ ...prev, [key]: next }));
  };

  const handleSave = async () => {
    if (!dirty || saving) return;
    const updates: Record<string, number> = {};
    for (const section of sections) {
      for (const item of section.items) {
        const current = values[item.key];
        const initial = initialValues[item.key];
        if (current === initial) continue;
        const num = Number(current);
        if (!Number.isFinite(num)) {
          toast(`${item.label} 请输入数字`, "error");
          return;
        }
        if (num < item.min || num > item.max) {
          toast(
            `${item.label} 需在 ${item.min} - ${item.max} 范围内`,
            "error"
          );
          return;
        }
        updates[item.key] = Math.round(num);
      }
    }
    if (Object.keys(updates).length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/params", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = (await res.json().catch(() => null)) as
        | { config?: Record<string, number>; error?: string; message?: string }
        | null;
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "保存失败");
      }
      if (data?.config) {
        const nextValues = allKeys.reduce((acc, key) => {
          const raw = data.config?.[key];
          acc[key] = String(raw ?? "");
          return acc;
        }, {} as Record<ParamKey, string>);
        setValues(nextValues);
        setInitialValues(nextValues);
      }
      toast("已保存", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      toast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (saving || loading) return;
    const ok = await confirm(
      "确认恢复默认参数吗？",
      "此操作会覆盖当前配置并立即生效。"
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/params", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: APP_CONFIG_DEFAULTS }),
      });
      const data = (await res.json().catch(() => null)) as
        | { config?: Record<string, number>; error?: string; message?: string }
        | null;
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "恢复默认失败");
      }
      const nextValues = allKeys.reduce((acc, key) => {
        const raw = data?.config?.[key] ?? APP_CONFIG_DEFAULTS[key];
        acc[key] = String(raw);
        return acc;
      }, {} as Record<ParamKey, string>);
      setValues(nextValues);
      setInitialValues(nextValues);
      toast("已恢复默认参数", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "恢复默认失败";
      toast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.content}>
      <div className={styles.headerRow}>
        <div className={styles.headerBlock}>
          <h1 className={styles.title}>管理参数</h1>
          <div className={styles.subtitle}>
            集中查看并调整当前配置参数
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.resetButton} ${loading || saving ? styles.resetButtonDisabled : ""
              }`}
            onClick={handleReset}
            disabled={loading || saving}
          >
            恢复默认
          </button>
          <button
            type="button"
            className={`${styles.cancelButton} ${!dirty || loading || saving ? styles.cancelButtonDisabled : ""
              }`}
            onClick={() => {
              if (!dirty) return;
              setValues(initialValues);
            }}
            disabled={!dirty || loading || saving}
          >
            取消修改
          </button>
          <button
            type="button"
            className={`${styles.saveButton} ${!dirty || loading || saving ? styles.saveButtonDisabled : ""
              }`}
            onClick={handleSave}
            disabled={!dirty || loading || saving}
          >
            保存修改
          </button>
        </div>
      </div>
      {error && !loading ? (
        <div className={styles.errorText}>{error}</div>
      ) : null}
      <div className={styles.grid}>
        {sections.map((section) => (
          <section key={section.title} className={styles.card}>
            <div className={styles.cardTitle}>{section.title}</div>
            <div className={styles.cardList}>
              {section.items.map((item) => (
                <div key={item.key} className={styles.itemRow}>
                  <div className={styles.itemLabel}>{item.label}</div>
                  <div className={styles.itemControl}>
                    <input
                      className={styles.itemInput}
                      type="number"
                      inputMode="numeric"
                      min={item.min}
                      max={item.max}
                      step="1"
                      value={values[item.key] ?? ""}
                      onChange={(event) =>
                        handleChange(item.key, event.target.value)
                      }
                      disabled={loading || saving}
                    />
                    {item.unit ? (
                      <span className={styles.itemUnit}>{item.unit}</span>
                    ) : null}
                  </div>
                  <div className={styles.itemHintKey}>{item.hint}</div>
                  <div className={styles.itemHintDefault}>
                    默认: {APP_CONFIG_DEFAULTS[item.key]}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
