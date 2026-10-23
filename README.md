# MolWorld

MolWorld 是一个用于搭建表情包分享网站的开源项目。访客可以浏览、搜索、复制和下载图片，也可以上传图片交由管理员审核；管理员负责发布、标签整理和站点维护。

项目使用 Next.js App Router、React、Prisma 和 SQLite。数据库与图片保存在本地磁盘，支持一台 Linux 主机上的一个或多个 Node.js 进程共同提供服务。

## 项目缘起

“拜谢”是 QQ [2021 年新春表情](https://developer.cloud.tencent.com/article/1786854)中的一款小黄脸，以俯身鞠躬的动作表达感谢。在音游、游戏和技术爱好者社区中，它也用于表达膜拜、赞叹和调侃。社区围绕这一形象创作了旋转、像素化等变体，也将动漫角色、游戏人物和动物改编为同类表情包。

MolWorld 最初用于分享项目作者收藏和制作的拜谢表情包，这批素材一度超过 200 张。原站因个人原因下线后，作者将网站代码以开源形式公开，供开发者搭建同类站点，或参考其中的设计与实现。

## 核心功能

- **浏览与搜索**：热门排行、随机展示和分页图库；按名称、标签查找，筛选动图或静态图。图库支持名称与时间排序、组合关键词搜索，也可点击标签查找。
- **复制与下载**：点击卡片复制图片，下载按钮保存原文件，也支持键盘操作。界面会反馈复制结果，下载保留原始格式和动图内容。
- **上传与审核**：支持 PNG、JPEG、GIF 和 WebP，通过选择文件、拖拽或粘贴提交，并填写名称与标签。管理员可编辑待审信息，单独或批量通过、删除，审核通过后公开展示。
- **内容整理**：编辑名称和标签，发布、隐藏或删除图片，支持批量操作。隐藏的图片保留在后台，可重新发布；标签可重命名、合并和解除关联。
- **流量与热度**：查看访问次数和按浏览器去重的每日访客数。复制与下载分别计数，两者之和作为热度；可按时间范围查看每日变化和热门 Top 30。
- **站点维护**：在后台调整上传、分页、审核队列容量、标签数量与长度和操作间隔等参数。按时间和关键词筛选操作日志并导出 CSV，检查缺失的原图、缩略图，清理无记录关联的孤儿文件。

<p align="center">
  <img src="docs/images/gallery-preview.jpg" alt="MolWorld 图库：搜索、类型筛选、图片标签与下载入口" width="480" />
</p>

## 快速开始

准备 Linux 或 WSL2、Node.js 24.x、pnpm 10.34.7，以及 util-linux 提供的 `flock`。WSL2 中将项目放在 `/home/...` 等 Linux 文件系统目录。

```bash
git clone https://github.com/WalnuTpz/mol-world.git
cd mol-world
install -d "$HOME/.local/bin"
corepack enable pnpm --install-directory "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
corepack prepare pnpm@10.34.7 --activate
cp .env.example .env
```

pnpm 的命令入口安装在 `~/.local/bin`。将 `export PATH="$HOME/.local/bin:$PATH"` 加入 shell 的启动配置，使新终端也能找到 pnpm。编辑 `.env`，设置管理员账号和密码：

```dotenv
DATABASE_URL="file:./data/molworld.db"
REVIEW_USER="admin"
REVIEW_PASS="your-password"
```

然后安装依赖、初始化数据库并启动：

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

打开 `http://localhost:3000`。新安装的图库为空：在「上传」页提交一张图片，再点击站名旁的「管理控制台」图标登录，在后台「审核」页点击「通过」。返回首页即可浏览、复制和下载已发布的图片。

`db:migrate` 创建数据目录和数据库，应用版本化 SQL 迁移。运行数据位于 `data/`，上传后立即由应用读取。字体随仓库提供，构建及页面加载使用本地字体。

## 文档

按当前要完成的任务选择文档：

- [使用与管理](docs/usage.md)：浏览、上传、审核、标签、统计和日常管理。
- [部署](docs/deployment.md)：首次生产安装、进程管理、HTTPS 和单机多进程。
- [运维](docs/operations.md)：备份恢复、批量导入、媒体整理和故障恢复。
- [从旧版本升级](docs/upgrading.md)：迁移旧媒体目录和数据库，验证升级及回退。
- [开发](docs/development.md)：开发环境、测试、数据库迁移和依赖维护。
- [架构](docs/architecture.md)：文件与数据库一致性、权限、并发和统计的设计。
- [配置参考](docs/configuration.md)：环境变量、后台参数、默认值及生效方式。
- [HTTP API](docs/api.md)：请求、响应、认证和复制、下载协议。

## 致谢与许可

感谢 [PigHub](https://pighub.top/) 提供的灵感，以及某神秘拜谢 QQ 群提供的素材支持。仓库提供网站代码，表情包素材由使用者添加。

代码采用 [GNU GPL v3.0](LICENSE)。
