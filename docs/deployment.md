# 部署

本指南在一台 Linux 主机上完成首次安装，使用 systemd 管理应用、Nginx 提供 HTTPS。示例目录为 `/srv/molworld`，数据库为 `data/molworld.db`。已有 `public/memes/` 或 `public/uploads/` 媒体的实例，按[旧版本升级流程](upgrading.md)迁移。

## 准备主机

准备 Node.js 24.x、Corepack、Git、util-linux、systemd 和 Nginx。运行账号拥有仓库与数据目录的读写权限；SQLite 与媒体使用主机上的持久化本地磁盘。域名指向这台主机，并准备该域名的 TLS 证书和私钥。

以下命令以日后运行应用的普通账号执行：

```bash
node --version
flock --version
install -d "$HOME/.local/bin"
corepack enable pnpm --install-directory "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
corepack prepare pnpm@10.34.7 --activate
pnpm --version
sudo install -d -o "$(id -un)" -g "$(id -gn)" /srv/molworld
git clone https://github.com/WalnuTpz/mol-world.git /srv/molworld
cd /srv/molworld
```

Node.js 版本应为 24.x，pnpm 版本为 10.34.7。pnpm 的入口位于 `~/.local/bin`，将上面的 PATH 设置加入部署账号的 shell 启动配置。依赖中的 SQLite 驱动含原生模块；在需要本地编译的平台上安装 Python、make 和 C/C++ 编译器。

## 配置与构建

在仓库根目录创建 `.env.production`，填写管理员账号和密码：

```dotenv
DATABASE_URL="file:./data/molworld.db"
REVIEW_USER="admin"
REVIEW_PASS="your-production-password"
```

数据库相对路径以仓库根目录为基准。原图、预览图、待审图片与回收文件分别存放在 `data/memes/original/`、`data/memes/thumb/`、`data/uploads/` 和 `data/trash/`。初次登录使用环境凭据；在后台修改密码后，后续登录使用数据库中保存的凭据。

生产模式依次读取进程环境变量、`.env.production.local`、`.env.local`、`.env.production`、`.env`，前面的值优先。以下维护命令显式设置 `NODE_ENV=production`，与生产应用读取同一套配置：

```bash
chmod 600 .env.production
pnpm install --frozen-lockfile
NODE_ENV=production pnpm db:migrate
pnpm build
```

安装包含构建和迁移所需的开发依赖，并生成 Prisma 客户端。迁移入口创建目录和数据库、执行 SQL 迁移并建立名称排序序号。构建使用仓库内的字体文件。

## 交给 systemd 运行

创建模板服务，将当前账号和 Node.js 的绝对路径写入配置：

```bash
deploy_user="$(id -un)"
node_binary="$(command -v node)"
sudo tee /etc/systemd/system/molworld@.service >/dev/null <<EOF
[Unit]
Description=MolWorld on port %i
After=network.target

[Service]
Type=simple
User=$deploy_user
WorkingDirectory=/srv/molworld
Environment=NODE_ENV=production
ExecStart=$node_binary /srv/molworld/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port %i
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now molworld@3000.service
sudo systemctl status molworld@3000.service
curl --fail http://127.0.0.1:3000/api/memes
```

服务以仓库根目录为工作目录，读取同一位置的 `.env.production` 和 `data/`。`UMask=0077` 让运行时新建文件只对部署账号开放；Nginx 通过 HTTP 读取媒体。查看应用日志：

```bash
sudo journalctl -u molworld@3000.service -n 100 --no-pager
```

## 配置 HTTPS

将下面配置保存到 Nginx 加载的站点配置目录，例如 `/etc/nginx/conf.d/molworld.conf`。把 `mol.example.com` 及证书路径换为已准备的域名和文件：

```nginx
upstream molworld {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name mol.example.com;
    return 301 https://mol.example.com$request_uri;
}

server {
    listen 443 ssl;
    server_name mol.example.com;
    ssl_certificate /etc/letsencrypt/live/mol.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mol.example.com/privkey.pem;
    client_max_body_size 51m;

    location / {
        proxy_pass http://molworld;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

生产会话 Cookie 使用 `Secure`，浏览器通过 HTTPS 登录。应用仅监听回环地址，Nginx 用实际连接地址覆盖转发头；应用据此进行 IP 限流。接入 CDN 时，在 Nginx 配置 CDN 官方公布网段的真实 IP 解析，使 `$remote_addr` 表示已验证的访客地址。

请求体上限 51 MiB 可容纳应用允许的最大 50 MiB 图片及表单封装；图片本身仍按后台参数校验。`Host $http_host` 保留公开域名及端口，供同源检查使用。

`/memes/` 和 `/uploads/` 都由应用检查当前数据库状态和会话后返回文件，Nginx 的所有请求统一转发到应用。公开图片使用重新验证缓存，私有图片使用 `private, no-store`。首页需要设置访客 Cookie 并记录访问，复制凭据、下载流、会话及管理请求也按应用返回的缓存策略处理。上面的配置将缓存控制交给应用；列表和搜索的共享缓存时间由后台参数决定，默认 30 秒。

## 使用多个工作进程

增加第二个实例：

```bash
sudo systemctl enable --now molworld@3001.service
```

在 Nginx 的 `upstream molworld` 中增加 `server 127.0.0.1:3001;`，运行 `sudo nginx -t` 和 `sudo systemctl reload nginx`。两个实例使用相同代码、构建产物、工作目录、环境配置、SQLite 数据库和本地媒体。

会话、限流和交互凭据保存在 SQLite，请求可以落到任一实例。数据库写入和媒体变更由文件锁协调。锁文件 `data/.media.lock` 及数据库旁的 `.write.lock` 长期保留，内核在进程退出时释放其锁状态。

发布新版本时，先停止所有实例并[备份数据库、媒体和环境配置](operations.md#备份)，再执行一次安装、迁移和构建，最后启动各实例。这样每个工作进程使用相同的代码与数据库结构。

## 验证部署

通过公开 HTTPS 域名完成以下操作：

1. 打开首页和 `/api/memes`，确认页面与列表正常返回。
2. 上传一张测试图片，登录后台，在「审核」中打开待审预览。在未登录的浏览器中访问相同图片 URL，结果应为 404。
3. 点击「通过」，在首页找到图片并完成复制、下载；匿名访问原图应成功。
4. 在后台「表情包」页将该图片改为隐藏，匿名重新请求原图应为 404。
5. 退出后台，再访问管理页面应返回首页，管理 API 应返回 401。多进程部署分别运行 `curl --fail http://127.0.0.1:3000/api/memes` 和对应的 3001 端口请求，确认每个实例都能查询图库。

图片问题先检查后台状态、原图 URL 和 `data/` 中的精确文件名。数据库问题先检查服务工作目录、环境配置和迁移输出；这些共同决定实际连接的数据库。登录成功却无法保持会话时，检查浏览器使用的 HTTPS 地址和响应 Cookie。
