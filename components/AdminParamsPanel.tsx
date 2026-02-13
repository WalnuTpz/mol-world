"use client";

import styles from "@/components/AdminParamsPanel.module.css";

const sections = [
  {
    title: "首页 / 随机池",
    items: [
      { label: "每日随机池组数", value: "20", hint: "DAILY_POOL_GROUPS" },
      { label: "单组随机池数量", value: "24", hint: "DAILY_POOL_SIZE" },
      { label: "热门展示数量", value: "24", hint: "hotLimit" },
      { label: "列表默认每页", value: "24", hint: "limit" },
    ],
  },
  {
    title: "API 缓存",
    items: [
      { label: "列表接口缓存", value: "30s", hint: "revalidate" },
      { label: "热门接口缓存", value: "30s", hint: "revalidate" },
      { label: "搜索接口缓存", value: "30s", hint: "revalidate" },
    ],
  },
  {
    title: "上传与审核",
    items: [
      { label: "上传大小上限", value: "10MB", hint: "MAX_SIZE" },
      { label: "单 IP 上传间隔", value: "60s", hint: "UPLOAD_COOLDOWN_MS" },
      { label: "全局上传间隔", value: "10s", hint: "GLOBAL_UPLOAD_COOLDOWN_MS" },
      { label: "审核队列上限", value: "100", hint: "REVIEW_QUEUE_LIMIT" },
    ],
  },
  {
    title: "分页与列表",
    items: [
      { label: "管理页每页", value: "12", hint: "Manage PAGE_LIMIT" },
      { label: "审核页每页", value: "12", hint: "Review PAGE_LIMIT" },
      { label: "日志页每页", value: "20", hint: "Log PAGE_LIMIT" },
      { label: "标签页每页", value: "20", hint: "Tag limit" },
    ],
  },
  {
    title: "标签规范",
    items: [
      { label: "单图最多标签", value: "8", hint: "MAX_TAGS" },
      { label: "中文标签长度", value: "10 字", hint: "MAX_CN" },
      { label: "英文标签长度", value: "20 字符", hint: "MAX_EN" },
    ],
  },
  {
    title: "交互节流",
    items: [
      { label: "复制冷却", value: "5s", hint: "COPY_COOLDOWN_MS" },
      { label: "随机冷却", value: "5s", hint: "RandomLink COOLDOWN_MS" },
    ],
  },
  {
    title: "管理员安全",
    items: [
      { label: "登录失败冷却", value: "24h", hint: "LOGIN_COOLDOWN_MS" },
      { label: "会话有效期", value: "7 天", hint: "Max-Age" },
    ],
  },
];

export default function AdminParamsPanel() {
  return (
    <div className={styles.content}>
      <div className={styles.headerRow}>
        <div className={styles.headerBlock}>
          <h1 className={styles.title}>参数管理</h1>
          <div className={styles.subtitle}>集中查看当前配置项</div>
        </div>
      </div>
      <div className={styles.grid}>
        {sections.map((section) => (
          <section key={section.title} className={styles.card}>
            <div className={styles.cardTitle}>{section.title}</div>
            <div className={styles.cardList}>
              {section.items.map((item) => (
                <div key={item.label} className={styles.itemRow}>
                  <div className={styles.itemLabel}>{item.label}</div>
                  <div className={styles.itemValue}>{item.value}</div>
                  <div className={styles.itemHint}>{item.hint}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
