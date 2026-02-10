# MolWorld

一个基于 Next.js + Prisma + SQLite 的表情包网站项目。
首页整合热门/全部/搜索三种视图，支持复制图片或动图、下载、分页与排序。

## 功能概览
- 首页三合一视图：热门、全部、搜索
- 热门页面支持：最新 / 最热 / 随机（固定 24 张，随机每次刷新不同）
- 全部页面支持：按名称 / 最新 / 最早
- 搜索页面支持：标题关键字
- 复制统计：复制成功才计数（展示在卡片右下角）
- 下载：仅下载，不计数

## 技术栈
- Next.js App Router
- Prisma + SQLite
- CSS Modules
- 静态资源：`public/memes`

## 目录结构（简化）
```
app/
  page.tsx             # 首页三合一
  api/                 # API 路由
components/            # MemeGrid / MemeCard
lib/                   # Prisma client 单例
prisma/                # schema + seed
public/memes/          # 资源文件
docs/                  # 项目文档
```

## 本地运行
环境配置：
- Node.js（建议 LTS 版本）与 pnpm
- 确保 `.env` 中存在 `DATABASE_URL="file:./prisma/dev.db"`

```bash
pnpm install
pnpm dev
```
访问：`http://localhost:3000`

## 初始化数据库
```bash
pnpm prisma migrate dev --name init
pnpm prisma db seed
```

## 资源文件规则
- 原图/动图：`public/memes/original/`
- 缩略图：`public/memes/thumb/`
- 动图缩略图使用同名 `.jpg` 静态封面

## 复制与计数
- 点击卡片执行复制：
  - 静态图：复制图片内容
  - 动图：优先复制 GIF，失败复制封面图

## 致谢
感谢 pighub 网站为项目提供的灵感来源和某神秘拜谢 QQ 群为项目提供的素材支持。
