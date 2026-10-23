# 开发指南

本指南从本地启动开始，介绍修改代码、验证行为、创建数据库迁移和维护依赖的流程。所有命令从仓库根目录执行。

## 启动开发环境

准备 Linux 或 WSL2、Node.js 24.x，以及 util-linux 提供的 `flock`。项目通过 `flock` 协调 SQLite 和媒体写入，开发环境与生产环境使用同一套锁。WSL2 中把仓库放在 Linux 主目录，例如 `~/projects/mol-world`。

```bash
mkdir -p ~/projects
cd ~/projects
git clone https://github.com/WalnuTpz/mol-world.git
cd mol-world
node --version
flock --version
install -d "$HOME/.local/bin"
corepack enable pnpm --install-directory "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
corepack prepare pnpm@10.34.7 --activate
cp .env.example .env
```

将上面的 PATH 设置加入 shell 启动配置，使新终端能找到 `~/.local/bin` 中的 pnpm。编辑 `.env`，保留本地数据库位置，并填写开发用的管理员账号和密码：

```dotenv
DATABASE_URL="file:./data/molworld.db"
REVIEW_USER="admin"
REVIEW_PASS="your-development-password"
```

相对数据库路径以仓库根目录为基准。初次登录读取环境凭据；通过后台修改密码后，登录改用数据库中保存的凭据。开发服务器和维护脚本共同加载 `.env*`，进程环境变量的优先级最高，其次为 `.env.development.local`、`.env.local`、`.env.development`、`.env`。

安装依赖、初始化数据库并启动开发服务器：

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

安装过程自动生成 Prisma 客户端。`db:migrate` 创建数据目录和 SQLite 文件，应用已有 SQL 迁移，并建立名称排序所需的序号。打开 `http://localhost:3000`，从上传页提交一张图片，再点击站名旁的「管理控制台」图标，使用设置的账号登录。在后台「审核」面板发布图片，返回首页可看到发布结果。

开发数据保存在 `data/`，环境文件、数据库、`node_modules/`、`.next/` 和生成的 `next-env.d.ts` 已由 Git 忽略。字体文件随仓库提供，生产构建直接使用本地字体。

## 修改代码

先确定用户操作涉及的页面、接口与持久化结果。页面和 HTTP 路由位于 `src/app/`，交互组件按后台、图库和通用界面分布在 `src/components/`，共用业务规则在 `src/lib/`。维护脚本位于 `scripts/`，与 HTTP 路由调用相同的数据库和媒体操作模块。`@/` 对应 `src/`；组件样式与组件放在同一目录。

沿现有调用链完成修改：界面负责展示和交互，服务端负责认证、输入校验和数据提交，数据库与文件变更通过共享的写入入口完成。数据库写入使用 `withDatabaseWrite`；涉及文件创建、引用切换和回收的业务使用 `withMediaWrite` 与 `withMediaMutation`。这使网页操作、维护命令和多个进程遵循同一提交顺序。文件事务、锁顺序及恢复阶段的设计见[架构文档](architecture.md)。

内部数据约定通过 TypeScript 类型表达；HTTP 输入、Cookie 和文件路径在进入业务逻辑时校验。异常处理围绕实际能够完成的恢复动作编写，恢复结果及失败原因保持可见。抽取共用模块时，以已有调用者共享的规则为边界。

修改后台参数时同步调整 `src/lib/appConfigDefaults.ts` 中的类型、默认值和范围，以及对应界面说明。修改持久化字段时同时检查数据库迁移、查询和返回给客户端的数据结构。服务器模块由服务端入口引用，浏览器组件通过接口获取所需数据。

## 验证修改

回归测试使用 Node.js 测试运行器和 tsx。涉及业务数据的测试通过 `tests/helpers/fixture.mts` 创建临时 SQLite 数据库、应用全部迁移，并生成图片和管理员会话。测试进程在导入业务模块前切换到临时目录和数据库；结束后清理该目录。

按修改涉及的行为选择回归：

| 修改范围 | 需要验证的结果 |
| --- | --- |
| 登录、改密或管理接口 | 会话签发与撤销、过期、跨站请求、凭据变化，以及等待锁期间权限变化后的结果 |
| 上传、发布、删除或维护脚本 | 数据库引用与文件同时保持正确，共享文件仍能读取，提交失败和进程终止后能够恢复 |
| 复制、下载或访问统计 | 凭据只能消费一次，访客之间相互隔离，完整下载与取消下载分别产生预期计数 |
| 排序、分页或统计查询 | 中文和数字排序、可见状态、分页结果、聚合值以及实际使用的索引 |
| 多进程共享状态 | 进程竞争时的写入顺序，重启后的限流记录，进程退出后的锁释放 |
| 数据布局或数据库结构 | 已有数据升级后的内容、文件位置和后续写入，以及再次执行迁移的结果 |

例如，复查会话相关行为可以运行：

```bash
pnpm exec tsx --test --test-concurrency=1 \
  --test-name-pattern="password|session" \
  tests/auth.test.mts tests/consistency.test.mts
```

新增缺陷回归时，用触发问题的输入调用实际业务入口，再同时检查响应、数据库和文件结果。并发及恢复问题使用真实子进程；媒体处理使用生成的图片。故障注入测试会主动制造数据库或文件错误，其断言验证的是操作结果和恢复后的状态。

完成修改后执行源码检查和全部回归：

```bash
pnpm typecheck
pnpm lint
pnpm test
git diff --check
```

`typecheck` 先生成 Next.js 路由类型，再执行严格 TypeScript 检查。`pnpm test` 串行运行顶层回归文件。构建后的路由有单独的测试入口，用于验证生产模块中的发布与资源清理共享同一把锁。

在开发服务器终端按 `Ctrl+C` 停止服务，再从仓库根目录打开一个单独终端，用本地开发数据完成生产构建和界面验收。SQLite 与 `data/` 中的媒体共同构成这一开发副本的数据：

```bash
export DATABASE_URL="file:./data/molworld.db"
export NODE_ENV=production
pnpm db:migrate
pnpm build
pnpm test:production
pnpm start --hostname 127.0.0.1 --port 3001
```

这组命令使用 `.env.production*` 对应的配置规则，并由显式设置的 `DATABASE_URL` 选择当前开发数据库。`build` 重新生成 Prisma 客户端并构建应用；`test:production` 读取刚生成的生产路由，测试数据仍由临时夹具提供。CI 执行类型检查、lint、普通回归、数据库初始化、生产构建和生产路由回归。

浏览器对 localhost 的 Secure Cookie 提供本地例外，因此本次验收可以使用 HTTP；正式域名使用 HTTPS。打开 `http://localhost:3001`，用合成图片完成上传预览、审核发布、编辑标题和标签、隐藏与删除。继续检查搜索与排序、复制、键盘触发下载、后台统计、修改密码和退出；多行编辑时确认保存一行后其他行的草稿仍在。浏览器验收补充剪贴板权限、文件保存和页面交互这些需要实际浏览器执行的行为。完成后按 `Ctrl+C` 停止服务并关闭该终端。

## 创建数据库迁移

数据库结构由 `prisma/schema.prisma` 和按时间排序的 SQL 迁移共同定义。已应用的迁移构成数据库历史，后续结构变化通过新增迁移表达。

先为这次变更选择一个专用开发数据库，并应用当前版本的迁移：

```bash
DATABASE_URL="file:./data/migration-dev.db" pnpm db:migrate
```

修改 schema 后，生成待审阅的迁移 SQL：

```bash
DATABASE_URL="file:./data/migration-dev.db" \
  pnpm exec prisma migrate dev --create-only --name describe_change
```

将 `describe_change` 换成描述变更的名称。检查新目录中的 `migration.sql`，确认旧记录如何转换、索引如何建立，以及表重建后保留哪些外键和触发器。

当前 `Meme.heat` 由 SQLite 的插入与计数更新触发器维护，值为复制次数与下载次数之和；这些触发器定义在 SQL 迁移中。涉及 `Meme` 表重建的迁移需包含相应触发器的重新创建。`nameOrder` 则由业务代码维护，迁移入口会按中文和数字排序规则重建序号。

完成 SQL 后生成客户端，再通过项目入口应用迁移：

```bash
pnpm db:generate
DATABASE_URL="file:./data/migration-dev.db" pnpm db:migrate
DATABASE_URL="file:./data/migration-dev.db" pnpm db:migrate
pnpm test
```

连续执行两次迁移用于确认已升级数据库的再次启动路径。全量回归从空数据库执行迁移；涉及已有字段、历史记录或媒体路径的变化，还需在升级回归中加入具有旧数据的场景，检查升级后的读取、写入和记录保留。

提交 schema、新迁移目录与对应代码、测试。发布时使用 `NODE_ENV=production pnpm db:migrate`：该入口除了执行 `prisma migrate deploy`，还负责目录准备、写入锁和名称建序。

## 维护依赖与补丁

依赖声明、锁文件和工作区配置共同决定安装结果。修改依赖后更新 `pnpm-lock.yaml`，并通过以下命令验证锁定安装、依赖审计及工具兼容性：

```bash
pnpm install --frozen-lockfile
pnpm audit --prod
pnpm audit
pnpm exec tsx --test tests/tooling.test.mts
pnpm lint
pnpm typecheck
pnpm test
DATABASE_URL="file:./data/molworld.db" NODE_ENV=production pnpm db:migrate
DATABASE_URL="file:./data/molworld.db" pnpm build
pnpm test:production
```

这组构建命令沿用本指南创建的开发数据库和媒体目录；先停止开发服务器，再运行构建。依赖更新还需完成前述浏览器验收。

`pnpm-workspace.yaml` 仅将 Next.js ESLint 插件使用的 `fast-glob` 替换为 `tinyglobby`，用于移除原依赖链中的 `braces`。两者的目录匹配行为存在差异，因此 `patches/@next__eslint-plugin-next@16.4.2.patch` 同时保留目录展开、绝对路径与尾斜杠处理的原有语义。工具回归覆盖目录匹配、花括号展开和深层嵌套输入。

维护现有补丁时，先提取可编辑的包：

```bash
pnpm patch @next/eslint-plugin-next@16.4.2
```

pnpm 会打印编辑目录和对应的 `patch-commit` 命令。修改该目录内的 `dist/utils/get-root-dirs.js` 后，执行打印出的命令生成补丁，再运行上述验证。补丁文件、`patchedDependencies`、定向 override 和锁文件一起记录兼容关系。

升级 Next.js 时同步检查 `next`、`@next/env` 和 `eslint-config-next` 的版本，核对新 ESLint 插件的实际调用与依赖。上游实现已具备相同行为时，可一并移除补丁及定向 override；仍需适配时，为新版本生成对应补丁，并保留工具回归。
