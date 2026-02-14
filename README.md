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

### 安装依赖

```bash
pnpm install
```

### 初始化数据库

```bash
pnpm prisma migrate dev
pnpm prisma db seed
```

### 启动开发

```bash
pnpm dev
```

浏览器打开：`http://localhost:3000`

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

## 配置说明

- `.env`：`DATABASE_URL` 与管理员相关配置
- 控制台参数页：可在线调整随机池/缓存/节流等运营参数

## 注意事项

- `pnpm prisma db seed` 会重建数据并重置计数
- Windows 下若脚本报 `.ts` 扩展名错误，改用 `pnpm tsx`
- better-sqlite3 构建失败时先确认 Node 版本

## 致谢

感谢 [PigHub](https://pighub.top/) 网站为项目提供的灵感来源和某神秘拜谢 QQ 群为项目提供的素材支持。

## 许可证

本项目根据 GNU General Public License v3.0 许可证授权。请参阅 [LICENSE](LICENSE) 文件了解详情。
