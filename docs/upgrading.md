# 从旧版本升级

本指南将媒体仍位于 `public/memes/`、`public/uploads/` 和 `public/trash/` 的实例升级到当前版本。升级保留图片 URL、已有记录与页面操作，同时将媒体移入私有目录，并迁移会话、统计及并发写入所需的数据库结构。

示例使用 `/srv/molworld`、systemd 的 `molworld@3000.service` 和部署账号。全过程停止所有工作进程，最后统一启动新版本。准备 Node.js 24.x、pnpm 10.34.7 和 util-linux 的 `flock`。

## 1. 保存旧版本和数据

在更新代码前，确定旧实例实际使用的数据库文件。旧示例环境配置是 `DATABASE_URL="file:./prisma/dev.db"`，其文件为 `/srv/molworld/prisma/dev.db`。以运行中服务的工作目录、环境配置和已有数据库为准，将下面的 `database_file` 改为该文件的绝对路径。

```bash
cd /srv/molworld
sudo systemctl stop 'molworld@*.service'
database_file="/srv/molworld/prisma/dev.db"
backup_dir="$HOME/molworld-upgrades/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$backup_dir" "$backup_dir/environment" "$backup_dir/sqlite" "$backup_dir/public"
printf '%s\n' "$database_file" > "$backup_dir/database-path"
git rev-parse HEAD > "$backup_dir/revision"
node --version > "$backup_dir/node-version"
pnpm --version > "$backup_dir/pnpm-version"
for file in .env .env.local .env.production .env.production.local; do
    if [ -f "$file" ]; then cp -p "$file" "$backup_dir/environment/"; fi
done
for directory in memes uploads trash; do
    if [ -d "public/$directory" ]; then cp -a "public/$directory" "$backup_dir/public/"; fi
done
if [ -d data ]; then cp -a data "$backup_dir/data"; fi
cp -p "$database_file" "$backup_dir/sqlite/database"
for suffix in -wal -shm -journal; do
    if [ -f "$database_file$suffix" ]; then
        cp -p "$database_file$suffix" "$backup_dir/sqlite/database$suffix"
    fi
done
ls -la "$backup_dir" "$backup_dir/sqlite" "$backup_dir/public"
```

检查每条命令的结果，确认 `sqlite/database` 存在，媒体副本覆盖原图、缩略图和待审内容。已有 `data/` 也随备份保存。备份同时记录 Git 提交、Node.js 和 pnpm 版本；在 systemd 中设置的环境变量随服务配置保存。

## 2. 更新代码并迁移目录

切换到准备部署的 Git 提交或发布版本。下面的 `TARGET_REVISION` 是目标提交或标签，执行时替换为实际值：

```bash
git fetch origin
git switch --detach TARGET_REVISION
install -d "$HOME/.local/bin"
corepack enable pnpm --install-directory "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
corepack prepare pnpm@10.34.7 --activate
```

原有环境文件继续使用。当前版本所有相对数据库路径均以仓库根目录解析；将生产配置中的 `DATABASE_URL` 写为第 1 步确认的绝对路径，可直接对应已有文件。例如：

```dotenv
DATABASE_URL="file:/srv/molworld/prisma/dev.db"
```

没有设置 `DATABASE_URL` 时仍使用仓库下的 `prisma/dev.db`。生产模式按进程环境、`.env.production.local`、`.env.local`、`.env.production`、`.env` 的顺序取值。

将旧媒体从 `public/` 移入 `data/`：

```bash
mkdir -p data
for directory in memes uploads trash; do
    if [ -d "public/$directory" ]; then
        mv -T "public/$directory" "data/$directory"
    fi
done
```

这一步把整个旧目录移到对应的新位置，保留内部文件名；`mv -T` 明确目标路径，避免把来源目录嵌套到目标内部。新布局为 `data/memes/original/`、`data/memes/thumb/`、`data/uploads/` 和 `data/trash/`。

如果此前已迁移了部分目录，按目录逐一完成：目标已有非空目录时，先比较两侧同名文件，将旧侧尚未迁移的文件补到对应位置；同名文件以数据库引用对应的内容为准，另一份保留在本次备份中。确认完整后移走旧 `public/` 副本。应用通过数据库权限读取新位置，迁移与启动会检查旧目录已无媒体；`public/` 中的品牌图标、字体等代码资源继续保留。

## 3. 迁移数据库并构建

在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
NODE_ENV=production pnpm db:migrate
pnpm build
```

迁移入口创建必要目录、应用未执行的 SQL 迁移，并按中文及数字排序规则初始化名称序号。再次执行会复用已应用的迁移记录。它保留已有图片、标签和每日统计，增加以下数据结构：

- 服务端会话、媒体操作恢复日志及持久化限流记录。
- 访客身份和一次性复制、下载凭据。
- 图片热度字段、维护热度的触发器和查询索引，以及名称排序序号。

每日图片统计保留历史行，同时解除删除图片时对这些行的级联删除。原有访问次数继续保留；升级后开始记录独立访客，升级前相应字段为 0。升级使用数据库迁移，图库内容沿用现有记录。

若有外部维护任务，将入口更新为 `scripts/` 对应的 `pnpm db:*`、`pnpm data:*` 或 `pnpm media:*` 命令，并在生产任务中设置 `NODE_ENV=production`。

## 4. 调整代理并验证

原图与预览现在由应用路由提供。移除 Nginx 中直接读取媒体目录的 `alias` 或静态规则，让 `/memes/` 和 `/uploads/` 请求转发到应用；清除 CDN 中旧媒体路径及 `/_next/image*` 的缓存。当前图片预览直接使用应用生成的缩略图。

生产 Cookie 带有 `Secure`，公开地址使用 HTTPS。代理保留原始 `Host` 与端口，并以可信连接地址设置 `X-Forwarded-For`、`X-Real-IP`。应用端口绑定 `127.0.0.1`。完整 Nginx 示例见[HTTPS 代理配置](deployment.md#配置-https)。确认 systemd 使用 Node.js 24.x 的实际路径后，启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl start molworld@3000.service
sudo journalctl -u molworld@3000.service -n 100 --no-pager
```

多进程实例同时启动其他端口。旧管理员 Cookie 失效，使用已有管理员凭据重新登录，然后检查：

1. 图片总数、标签和历史统计与升级前一致；待审图片可以在后台预览。
2. 已发布图片可以匿名浏览和下载；待审、隐藏图片在匿名窗口中返回 404。
3. 新上传可以直接预览，审核通过后出现在前台。
4. 复制、下载完成后计数增加；退出后访问管理页面返回首页，管理 API 返回 401。
5. 今日访问及独立访客开始累计，删除图片后原有每日统计仍保留。

自定义 API 客户端需要更新交互协议：复制先申请一次性凭据，剪贴板写入成功后确认；下载先申请凭据，再完整读取对应 GET 响应。完整请求格式见 [HTTP API](api.md)。退出改为 POST 请求，客户端同时处理失效会话后的重新登录。

## 回退到备份版本

回退使用第 1 步保存的旧代码、数据库、环境和媒体目录。先停止全部进程，将当前状态保存在另一目录，再恢复旧布局。把 `backup_dir` 改为本次升级备份。先恢复文件与数据库：

```bash
backup_dir="$HOME/molworld-upgrades/20261023T120000Z"
cd /srv/molworld
sudo systemctl stop 'molworld@*.service'
database_file="$(cat "$backup_dir/database-path")"
export DATABASE_URL="file:$database_file"
before_dir="$HOME/molworld-before-rollback-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$before_dir" "$before_dir/environment" "$before_dir/sqlite" "$before_dir/public"
if [ -d data ]; then mv data "$before_dir/data"; fi
for directory in memes uploads trash; do
    if [ -d "public/$directory" ]; then mv "public/$directory" "$before_dir/public/"; fi
done
for file in .env .env.local .env.production .env.production.local; do
    if [ -f "$file" ]; then mv "$file" "$before_dir/environment/"; fi
done
for suffix in '' -wal -shm -journal; do
    if [ -f "$database_file$suffix" ]; then
        mv "$database_file$suffix" "$before_dir/sqlite/database$suffix"
    fi
done
git switch --detach "$(cat "$backup_dir/revision")"
cp -a "$backup_dir/environment/." .
cp -a "$backup_dir/public/." public/
if [ -d "$backup_dir/data" ]; then cp -a "$backup_dir/data" data; fi
mkdir -p "$(dirname "$database_file")"
cp -p "$backup_dir/sqlite/database" "$database_file"
for suffix in -wal -shm -journal; do
    if [ -f "$backup_dir/sqlite/database$suffix" ]; then
        cp -p "$backup_dir/sqlite/database$suffix" "$database_file$suffix"
    fi
done
```

切回 `node-version` 与 `pnpm-version` 记录的运行环境，恢复对应的服务配置。安装旧依赖后，使用旧 schema 重新生成 Prisma 客户端，再构建和启动：

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm build
sudo systemctl daemon-reload
sudo systemctl start molworld@3000.service
```

其他实例在构建完成后启动。数据库与生成的客户端均对应旧结构，旧代码沿用该备份状态启动。最后核对图片、审核队列、管理员登录和历史统计。
