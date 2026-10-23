# 运维

本指南使用 `/srv/molworld` 和 `molworld@3000.service`，对应 systemd 部署方式。所有维护命令在仓库根目录执行，并设置 `NODE_ENV=production`。多进程实例在备份、恢复、导入和升级期间一起停止，完成后一起启动。

## 备份

一份可恢复的备份包含同一停写时点的 SQLite 数据库、原图、缩略图、待审图片、回收文件和生产环境配置。数据库保存标题、标签、审核状态、凭据、统计与文件引用；媒体目录保存这些引用对应的文件。

以下步骤适用于已完成初始化的实例，以部署账号执行，备份目录权限为 700。维护终端与服务使用相同的数据库配置：通过 `.env.production*` 配置的实例可直接执行；通过 systemd 的 `Environment` 或 `EnvironmentFile` 设置 `DATABASE_URL` 的实例，先在终端用 `export DATABASE_URL="file:/实际数据库绝对路径"` 设置同一值，并将服务配置及其环境文件一同保存到备份目录。

```bash
cd /srv/molworld
sudo systemctl stop 'molworld@*.service'
backup_dir="$HOME/molworld-backups/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$backup_dir" "$backup_dir/environment" "$backup_dir/sqlite"
database_file="$(NODE_ENV=production pnpm exec tsx -e 'import "./scripts/env"; import { resolveDatabaseUrl } from "./src/lib/databaseUrl"; process.stdout.write(resolveDatabaseUrl().slice(5));')"
printf '%s\n' "$database_file" > "$backup_dir/database-path"
git rev-parse HEAD > "$backup_dir/revision"
cp -a data "$backup_dir/data"
for file in .env .env.local .env.production .env.production.local; do
    if [ -f "$file" ]; then cp -p "$file" "$backup_dir/environment/"; fi
done
cp -p "$database_file" "$backup_dir/sqlite/database"
for suffix in -wal -shm -journal; do
    if [ -f "$database_file$suffix" ]; then
        cp -p "$database_file$suffix" "$backup_dir/sqlite/database$suffix"
    fi
done
ls -la "$backup_dir" "$backup_dir/sqlite"
sudo systemctl start molworld@3000.service
```

核对每条命令成功后再执行下一步；SQLite 副本应出现在 `sqlite/database`。多进程实例同时启动所配置的其他端口，例如 `sudo systemctl start molworld@3001.service`。

解析数据库路径的命令与应用使用同一套环境加载逻辑，覆盖示例位置 `data/molworld.db`、旧默认 `prisma/dev.db` 和自定义绝对路径。数据库及存在的 WAL、SHM、回滚日志文件一起保存。环境文件按生产加载顺序保存。备份目录含登录凭据、会话和私有图片，按同样的访问权限复制到备份磁盘。

## 恢复备份

下面在原主机、原仓库路径恢复一份备份。将第一行改为所选备份目录。记录的 Git 提交保留在本地仓库中；运行账号能写入记录的数据库目录。维护终端先使用当前服务的数据库配置；systemd 环境覆盖值按备份步骤同步到终端。下面先保存当前数据，再选用备份中的数据库。

```bash
backup_dir="$HOME/molworld-backups/20261023T120000Z"
cd /srv/molworld
sudo systemctl stop 'molworld@*.service'
current_database_file="$(NODE_ENV=production pnpm exec tsx -e 'import "./scripts/env"; import { resolveDatabaseUrl } from "./src/lib/databaseUrl"; process.stdout.write(resolveDatabaseUrl().slice(5));')"
database_file="$(cat "$backup_dir/database-path")"
before_dir="$HOME/molworld-before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$before_dir" "$before_dir/environment" "$before_dir/sqlite/current" "$before_dir/sqlite/target"
printf '%s\n' "$current_database_file" > "$before_dir/current-database-path"
mv data "$before_dir/data"
for file in .env .env.local .env.production .env.production.local; do
    if [ -f "$file" ]; then mv "$file" "$before_dir/environment/"; fi
done
for suffix in '' -wal -shm -journal; do
    if [ -f "$current_database_file$suffix" ]; then
        mv "$current_database_file$suffix" "$before_dir/sqlite/current/database$suffix"
    fi
    if [ -f "$database_file$suffix" ]; then
        mv "$database_file$suffix" "$before_dir/sqlite/target/database$suffix"
    fi
done
git switch --detach "$(cat "$backup_dir/revision")"
cp -a "$backup_dir/data" data
cp -a "$backup_dir/environment/." .
mkdir -p "$(dirname "$database_file")"
cp -p "$backup_dir/sqlite/database" "$database_file"
for suffix in -wal -shm -journal; do
    if [ -f "$backup_dir/sqlite/database$suffix" ]; then
        cp -p "$backup_dir/sqlite/database$suffix" "$database_file$suffix"
    fi
done
export DATABASE_URL="file:$database_file"
```

使用 systemd 环境覆盖的实例，此时恢复备份对应的服务配置和环境文件。然后安装该提交的依赖，迁移、构建并启动：

```bash
pnpm install --frozen-lockfile
NODE_ENV=production pnpm db:migrate
pnpm build
sudo systemctl daemon-reload
sudo systemctl start molworld@3000.service
```

恢复前的媒体、环境和外部数据库放在 `before_dir` 中；`sqlite/current/` 保存当前外部库，`sqlite/target/` 保存恢复目标位置原有的文件，位于 `data/` 内的数据库随整个目录保存，恢复的代码、数据库与媒体来自同一备份时点。其他工作进程在构建成功后启动。

登录后台，对比图片数量、标签、待审队列和统计；打开已发布原图，并用匿名窗口验证隐藏图片返回 404。恢复会带回备份时尚未过期的会话；在后台修改密码会撤销这些会话。恢复演练使用独立仓库、数据库和媒体副本，并将备份中的绝对数据库路径改为演练位置。

## 导入已有图片

批量导入用于用一个原图目录重建图库。它会替换全部表情包、标签及其关联，重新生成标题、数字 ID 和创建时间，当前图片的复制与下载次数从零开始。历史每日统计、站点访问统计、管理员凭据、会话、参数和日志保留。日常追加图片使用网页上传与审核。

先完成本页的备份步骤，再执行导入：

```bash
cd /srv/molworld
sudo systemctl stop 'molworld@*.service'
NODE_ENV=production pnpm db:migrate
```

将要导入的 PNG、JPEG、GIF 或 WebP 放在 `data/memes/original/` 的第一层，文件名唯一。这个目录中的全部可识别图片都会成为本次图库内容。确认目录内容后运行：

```bash
NODE_ENV=production pnpm db:import
NODE_ENV=production pnpm media:thumbnails
sudo systemctl start molworld@3000.service
```

导入先读取并解码全部源文件，再在数据库事务中替换记录。空目录和损坏图片会使导入在替换前结束并报告原因。标题取自文件名，图片直接进入已发布状态；创建时间按打乱后的顺序分布。被替换记录使用的文件在失去全部引用后进入回收目录。

导入可读取已有缩略图；其余图片暂用原图作预览，再由 `media:thumbnails` 补齐。缩略图文件名保留原始扩展名，例如 `cat.png.jpg` 和 `cat.jpg.jpg`。启动其他工作进程后，在前台确认图片、动画与标签，并在后台核对总数。

## 整理数据与媒体

维护脚本与 Web 请求使用相同的写入锁。执行批量整理前暂停后台编辑，便于核对一次操作的结果。后台「其他」中的脚本卡片用于复制终端命令，实际执行发生在服务器终端。

| 任务 | 生产命令 | 结果 |
| --- | --- | --- |
| 补齐数字 ID | `NODE_ENV=production pnpm data:ids` | 在事务中为缺少数字 ID 的图片和标签编号 |
| 补缩略图 | `NODE_ENV=production pnpm media:thumbnails` | 为已登记的原图生成预览，更新共享引用和动画类型，保留旧缩略图 |
| 从标题补标签 | `NODE_ENV=production pnpm data:title-tags` | 匹配脚本内的预设关键词，按标签上限补充关联 |
| 重建今日随机分组 | `NODE_ENV=production pnpm data:daily-pool` | 以当前 UTC 日期重新建立分组 |
| 按数字 ID 整理文件名 | `NODE_ENV=production pnpm media:rename` | 复制文件、切换全部引用，提交后回收旧文件 |
| 清空回收文件 | `NODE_ENV=production pnpm media:clean-trash` | 永久删除 `data/trash/` 和 `data/uploads/trash/` 中的文件，保留子目录 |

标题补标签使用当前脚本中的关键词，如「对称」「旋转」「像素」。文件名整理和补缩略图都围绕数据库已有引用工作；共享文件对应的记录一起更新。

在后台「其他」执行资源检查，可看到正式原图和缩略图目录中的缺失引用、未引用文件。缺失按记录中的原图与缩略图引用分别计数，因此一个文件可能影响多项引用。根据备份恢复缺失文件后，再次检查。

「清理孤儿文件」直接删除正式目录中没有数据库引用的文件；它与回收目录清理是两个操作。原图、缩略图的引用检查和删除在同一媒体锁内完成，其他建立或切换媒体引用的操作等待本轮清理结束。待审目录由上传与审核流程管理。

## 处理异常退出后的恢复

媒体变更经过准备、数据库提交、旧文件回收三个阶段。新文件写入并同步到磁盘后，业务记录和提交标记在同一数据库事务中保存。进程中断时，SQLite 中的媒体操作日志记录已完成的阶段：未提交的操作清理新文件，已提交的操作继续回收旧文件。

应用启动和下一次媒体写入都会处理这些日志。操作系统在进程退出时释放文件锁，磁盘上的锁文件继续复用。一般的进程异常退出只需重启服务。各阶段如何与数据库提交衔接，见[媒体事务与恢复设计](architecture.md#将文件变更与数据库提交连接起来)。

如果日志报告目录权限或磁盘写入错误，恢复该目录的读写条件后重启服务，应用会继续处理原有日志。业务已提交而回收失败时，图片状态以数据库为准，旧文件等待后续回收。磁盘文件丢失时，用同一备份恢复数据库与媒体；回收目录只保存退出使用的文件，完整的业务状态保存在配套数据库备份中。
