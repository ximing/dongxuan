# 家庭服务器生产部署

站点为 https://dx.aimo.plus，采用 GitHub Actions 构建的 `ghcr.io/ximing/dongxuan` 镜像。业务服务位于 app 机，独立 PostgreSQL 数据库位于 db 机，HTTPS 由现有容器 Nginx 入口终止。首次部署使用空的生产库，不导入本地账号、测试数据或设计稿示例。

## 配置与流水线

- [Dockerfile](../Dockerfile) 构建前端、DTO 和服务端，以非 root 用户运行生产依赖。`HOST=0.0.0.0` 仅在容器中设置，本地开发仍默认监听回环地址。
- [GitHub Actions](../.github/workflows/deploy.yml) 在 main 业务代码变更或手动触发时运行：隔离 PostgreSQL 18 的完整后端测试、前端回归、类型检查 → 构建 amd64 镜像并推送 GHCR → 使用不可变 digest 部署 → HTTPS 健康检查。
- [Compose](../deploy/compose.production.yml) 在 app 机 `/root/apps/dongxuan` 运行，宿主机 13014 映射容器 3040。数据库不随业务容器启动或重建。
- 应用密码和签名密钥只在服务器 `.env`，示例见 [环境变量](../deploy/.env.production.example)。本次统一登录未配置，使用站内邮箱密码注册和登录。
- GitHub repository secrets：`DONGXUAN_DEPLOY_KEY`、`DONGXUAN_KNOWN_HOSTS`、`DONGXUAN_CI_PG_PASSWORD`（仅用于隔离 CI 库）。repository variables：`DONGXUAN_DEPLOY_HOST`、`DONGXUAN_DEPLOY_PORT`。镜像读写使用短期 `GITHUB_TOKEN`。
- GitHub Runner 直连家庭 SSH 在握手阶段被重置，因此发布经入口机中转。`DONGXUAN_DEPLOY_HOST/PORT` 指向入口机；[中转脚本](../deploy/relay-ssh.sh) 从该机私有 `.env` 读取 app SSH 地址，再使用独立的第二跳密钥连接 app。两跳都固定服务器 host key，并带 `restrict` 与 forced command，只能部署本仓库合法镜像摘要；不允许任意命令、PTY 或端口转发。GHCR 登录信息仅存在部署期间的临时目录。

## 服务器文件与备份

app 目录包含 `compose.production.yml`、`.env`、`image.env`、`deploy.sh`、`deploy-ssh.sh` 和 `backups/`。`image.env` 记录本次镜像摘要，`image.env.previous` 保留上次值。

每次部署先拉取镜像，然后停止本应用写入，以 PostgreSQL 18 客户端备份目标生产库并验证归档目录。备份成功后才启动新镜像并运行事务化迁移及幂等回填。容器等待健康状态通过才算成功。备份失败时不迁移；新版本失败时停止应用，保留数据库备份，避免带着未知迁移状态自动启动旧版。

服务器到 GHCR 曾出现瞬时 EOF；登录与拉取各最多重试五次，全部失败时保留当前应用运行，不进入停机或迁移阶段。SSH 启用连接尝试和保活；不会对失败迁移做盲目重试。

入口配置见 [dx.aimo.plus.conf](../deploy/dx.aimo.plus.conf)。源站地址只放入口机 `/root/apps/nginx/sites/aimo.plus/dx-origin.upstream`，不提交。变更先通过 `docker exec openresty nginx -t`，再 reload。入口允许 6 MiB 请求，以覆盖富文本预览预算。

运行配置文件更新时，先同步 `deploy/` 中的 Compose 和脚本到 app 目录；普通业务发布由 Actions 自动完成，不需要在服务器安装 Node 或构建代码。

## 发布与恢复

正常更新推送 main，或手动执行 `gh workflow run deploy.yml`，在 Actions 页面跟踪检查、镜像和部署三个阶段。不要把本地 `.env` 加入仓库或 Docker 构建上下文。

查看状态使用 `docker ps --filter name=dongxuan`、`docker logs --tail 100 dongxuan` 和 `curl -fsS https://dx.aimo.plus/health`。

恢复前先停止应用并检查迁移兼容性：只改业务逻辑且数据库兼容时可以重新部署之前摘要；涉及数据库结构时，应保留最新数据备份并在维护窗口按已验证的完整备份恢复。不要直接启动不理解现有结构的旧镜像。备份目录属于生产数据，不能提交仓库或删除来节省空间。

## 本次部署结果

2026-11-24 已完成首次部署及新流水线复验：

- [最终完整流水线](https://github.com/ximing/dongxuan/actions/runs/45367311498) 的 check、image、deploy 全部成功；源码为 `a2027d4b8850636eddcc13f5fa866a116fd25b9f`。完整后端 50 项和前端 31 项通过，保留全部业务断言；全年计算用例按实际 CPU 消耗设置独立超时预算。
- 实际运行镜像为 `ghcr.io/ximing/dongxuan@sha256:8ee437c926b2dbf83df0ce8f3c0d1e0715eb1d767a83fc1906c155e8708b7370`，容器 running / healthy，用户 node、根文件系统只读。
- 生产数据库使用预建的独立空库与非超级用户，未导入本地数据。迁移版本为 1–5，模板正文列为 JSONB，回填结果 total / ready / failed 均为 0。
- app 机发布前备份为 `backups/before-20261124T091008Z.dump`（首次空库）和 `backups/before-20261124T094226Z.dump`（已建结构）；均通过 pg_restore 归档目录校验。临时账号及其命盘、快照、模板已按身份限定清理。
- 入口机 nginx -t 通过后 reload；HTTP 301 跳转 HTTPS，域名健康接口返回 `{"ok":true}`。16 项线上检查覆盖注册、登录、Secure / HttpOnly cookie、鉴权、排盘持久化、四份 JSON 种子、模板保存和纯文本生成，全部通过。见[脱敏检查记录](validation/deployment-smoke.json)。
- 真实浏览器验证登录和编辑器懒加载，中文「阳历月份范围」、工具栏「插入资料」及初始已保存状态正常；已查看[登录页](validation/screenshots/deployment-login.png)和[提示词编辑页](validation/screenshots/deployment-prompts.png)截图。图片使用临时验收账号，相关数据已清理。

当前可以直接在登录页用邮箱密码注册。统一账号仍关闭，没有为用户创建或预设生产密码。
