# MolWorld 2.0

一个轻量但可完整跑通流程的表情包分享网站项目：上传 → 审核 → 管理 → 展示。基于 Next.js 全栈 + Prisma + SQLite，适合个人/小团队维护。

## 版本变化（相对第一版）

- 增加完整内容流：上传 → 审核（PENDING）→ 管理（发布/隐藏/删除）
- 完善前台体验：分页/排序、卡片放大/高亮、Toast 提示、标签与搜索联动
- 增加后台控制台：表情包 / 审核 / 日志 / 标签 / 参数 / 其他
- 增加运营与统计：热度计算（复制+下载）、Top 榜单、趋势曲线
- 优化网页稳定性：限流/冷却、统一错误结构、文件回滚、审计日志

## 功能概览

### 前台

- 首页三视图：热门 / 全部 / 搜索
- 热门：最热 / 随机（每日随机池）
- 全部与搜索：分页 + 排序（名称/最热/最新/最早）
- MemeCard：复制/下载、热度展示、标签展示与跳转
- 首次进入欢迎提示

### 后台控制台（/admin）

- 表情包管理：编辑、删除、批量操作
- 标签管理：重命名/合并/删除/解除、排序、分页
- 参数管理：运营参数可视化配置
- 表情包审核：保存/通过/删除、批量处理
- 操作日志：搜索、分页、清理、导出 CSV
- 其他内容：流量与热度图表、脚本入口、资源维护、账号与退出

## 技术栈

- Next.js（App Router）
- Prisma + SQLite
- CSS Modules
- public 静态资源

## 快速开始

### 环境要求

- Node.js 22 LTS
- pnpm

### 开箱步骤（首次运行）

1. 复制环境变量模板

```bash
cp .env.example .env
```

1. 按需修改 `.env`（至少确认管理员账号密码）

- `REVIEW_USER`：管理员账号
- `REVIEW_PASS`：管理员密码
- `DATABASE_URL`：本地默认可直接使用 `file:./prisma/dev.db`

1. 安装依赖、初始化数据库并启动开发服务器

```bash
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
```

1. 打开浏览器访问 `http://localhost:3000`

## 配置说明

- 推荐先执行：`cp .env.example .env`
- `.env`：`DATABASE_URL` 与管理员相关配置（`REVIEW_USER` / `REVIEW_PASS`）
- 控制台参数页：可在线调整随机池/缓存/节流等运营参数

## 素材策略（开源仓库不含素材）

- 仓库默认不提交以下运行期/媒体目录（体积与版权原因）：
  - `public/memes/original/`
  - `public/memes/thumb/`
  - `public/uploads/`
- 因此 clone 后页面可能没有可展示内容，属于正常现象。
- 本地体验方式：
  - 准备少量示例图片后放入 `public/memes/original/`，再执行 `pnpm prisma db seed`
  - 或直接使用 `/upload` 上传图片，进入审核/发布流程生成数据
- 若用于公开部署，建议自行准备素材并确认使用权限。

## 目录结构

```bash
app/        # 页面与 API
components/ # UI 组件与面板
lib/        # 工具与业务逻辑
prisma/     # schema、迁移与脚本
public/     # 素材与上传文件
docs/       # 规格与流程文档
```

## 数据与脚本

常用脚本：

- `prisma/seed.ts`
- `prisma/backfill-thumbs.ts`
- `prisma/backfill-numid.ts`
- `prisma/backfill-title-tags.ts`
- `prisma/rebuild-daily-pool.ts`
- `prisma/rename-media-by-numid.ts`

## 部署注意事项

### 持久化目录

- 生产部署时请确保以下目录可写、可持久化（重启/发布后不丢失）：
  - `prisma/`（SQLite 数据库）
  - `public/uploads/`（待审核上传文件）
  - `public/memes/original/`（已发布原图）
  - `public/memes/thumb/`（缩略图）

### Cloudflare 缓存与图片更新

- 上传、审核发布、批量清理后，如果前台/管理台图片显示异常，先检查是否是缓存问题。
- 建议操作：
  - Cloudflare `Purge Cache`（必要时 `Purge Everything`）
  - 浏览器 DevTools 勾选 `Disable cache` 后强刷页面

### 图片链路排查

- 若页面显示不出图，先看 Network：
  - `/_next/image?...` 返回 `400` 时，不一定是上传失败，通常是上游图片 URL 不可访问
- 建议按顺序排查：
  1. 直接打开原图/缩略图 URL（如 `/uploads/...`、`/memes/thumb/...`）
  2. 再检查 `/_next/image?...` 的状态码
  3. 在服务器本机用 `curl -I http://127.0.0.1:3000/...` 对比域名 `curl -I https://your-domain/...`
- 常见原因：
  - Cloudflare 缓存旧的 404/错误响应
  - 反代/静态文件路由配置问题
  - 数据库中的文件名与磁盘文件名大小写不一致（Linux 区分大小写）

## 开发补充说明

- `pnpm prisma db seed` 会重建数据并重置计数
- Windows 下若脚本报 `.ts` 扩展名错误，改用 `pnpm tsx`
- better-sqlite3 构建失败时先确认 Node 版本

## 致谢

感谢 [PigHub](https://pighub.top/) 网站为项目提供的灵感来源和某神秘拜谢 QQ 群为项目提供的素材支持。

## 许可证

本项目根据 GNU General Public License v3.0 许可证授权。请参阅 [LICENSE](LICENSE) 文件了解详情。
