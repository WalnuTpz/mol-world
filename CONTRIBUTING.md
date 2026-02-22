# 贡献指南（Contributing）

感谢你对 `MolWorld` 的关注与贡献。

本文档用于说明如何在本地运行项目、提交改动以及发起 PR，尽量减少沟通成本与返工。

## 适用范围

- 功能开发（前台 / 控制台 / API）
- Bug 修复
- 文档更新（README、`docs/01-10` 等）
- 脚本与数据维护工具（`prisma/*.ts`）

## 开始之前

请先阅读：

- `README.md`
- `SECURITY.md`
- `docs/PROJECT_SPEC.md`
- `docs/ROADMAP.md`

如果是较大改动（新功能/结构调整），建议先开 Issue 或先说明方案再动手。

## 本地开发环境

推荐环境：

- Node.js 22 LTS
- pnpm

初始化步骤：

```bash
cp .env.example .env
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
```

本地地址：

- `http://localhost:3000`

## 常用命令

```bash
pnpm dev
pnpm build
pnpm lint
pnpm prisma migrate dev
pnpm prisma db seed
```

若在 Windows 下执行 TS 脚本遇到扩展名问题，可使用：

```bash
pnpm tsx prisma/<script>.ts
```

## 提交前检查（建议）

请尽量在提交前完成以下检查：

- 功能在本地可用（至少手动冒烟）
- `pnpm build` 可通过
- `pnpm lint` 可通过（如本次改动涉及前端/TS 文件）
- 文档与行为保持一致（尤其是 API、管理台、部署说明）

## 提交规范（Commit）

建议使用「类型 + 范围」格式：

```text
feat(scope): 中文说明
fix(scope): 中文说明
docs(scope): 中文说明
chore(scope): 中文说明
refactor(scope): 中文说明
```

示例：

- `feat(admin): 增加标签排序切换`
- `fix(upload): 修复上传后图片路径大小写问题`
- `docs(readme): 补充开箱步骤与部署排查说明`

## Pull Request 建议

PR 描述建议包含：

- 改动目的（为什么改）
- 改动内容（改了哪些模块）
- 影响范围（前台 / 控制台 / API / 文档 / 数据）
- 验证方式（本地步骤、截图、状态码、命令输出）
- 是否涉及迁移/脚本/清缓存操作

如果改动较大，请拆成多次提交，保持每次提交都能独立理解和回滚。

## 代码与文档约定

- 不提交真实 `.env` / `.env.production`
- 不提交本地数据库文件（如 `*.db`）
- 不提交运行期素材目录内容（`public/uploads/`、`public/memes/`）
- 修改功能时，同步更新相关文档（README / `docs/*.md`）
- 优先保持现有代码风格与命名习惯，避免无关格式化

## 安全相关改动

如果改动涉及以下内容，请在 PR 中明确标注：

- 管理员认证 / 会话 / Cookie
- 管理 API 权限校验
- 文件上传、移动、删除
- 限流、批量操作、审计日志

若发现安全漏洞，请不要直接公开提交可利用细节，先参阅 `SECURITY.md`。

## License

提交代码即表示你同意该贡献在项目当前许可证（GPLv3）下发布。
