# 家庭服务器生产部署

站点为 https://dx.aimo.plus，采用 GitHub Actions 构建的 `ghcr.io/ximing/dongxuan` 镜像。业务服务位于 app 机，独立 PostgreSQL 数据库位于 db 机，HTTPS 由现有容器 Nginx 入口终止。首次部署使用空的生产库，不导入本地账号、测试数据或设计稿示例。

## 配置与流水线

- [Dockerfile](../Dockerfile) 构建前端、DTO 和服务端，以非 root 用户运行生产依赖。`HOST=0.0.0.0` 仅在容器中设置，本地开发仍默认监听回环地址。
- [GitHub Actions](../.github/workflows/deploy.yml) 在 main 业务代码变更或手动触发时运行：隔离 PostgreSQL 18 的完整后端测试、前端回归、类型检查 → 构建 amd64 镜像并推送 GHCR → 使用不可变 digest 部署 → HTTPS 健康检查。
- [Compose](../deploy/compose.production.yml) 在 app 机 `/root/apps/dongxuan` 运行，宿主机 13014 映射容器 3040。数据库不随业务容器启动或重建。
- 应用密码和签名密钥只在服务器 `.env`，示例见 [环境变量](../deploy/.env.production.example)。本次统一登录未配置，使用站内邮箱密码注册和登录。
- GitHub repository secrets：`DONGXUAN_DEPLOY_KEY`、`DONGXUAN_KNOWN_HOSTS`。repository variables：`DONGXUAN_DEPLOY_HOST`、`DONGXUAN_DEPLOY_PORT`。镜像读写使用短期 `GITHUB_TOKEN`。
- GitHub Runner 直连家庭 SSH 在握手阶段被重置，因此发布经入口机中转。`DONGXUAN_DEPLOY_HOST/PORT` 指向入口机；[中转脚本](../deploy/relay-ssh.sh) 从该机私有 `.env` 读取 app SSH 地址，再使用独立的第二跳密钥连接 app。两跳都固定服务器 host key，并带 `restrict` 与 forced command，只能部署本仓库合法镜像摘要；不允许任意命令、PTY 或端口转发。GHCR 登录信息仅存在部署期间的临时目录。

## 服务器文件与备份

app 目录包含 `compose.production.yml`、`.env`、`image.env`、`deploy.sh`、`deploy-ssh.sh` 和 `backups/`。`image.env` 记录本次镜像摘要，`image.env.previous` 保留上次值。

每次部署先拉取镜像，然后停止本应用写入，以 PostgreSQL 18 客户端备份目标生产库并验证归档目录。备份成功后才启动新镜像并运行事务化迁移及幂等回填。容器等待健康状态通过才算成功。备份失败时不迁移；新版本失败时停止应用，保留数据库备份，避免带着未知迁移状态自动启动旧版。

入口配置见 [dx.aimo.plus.conf](../deploy/dx.aimo.plus.conf)。源站地址只放入口机 `/root/apps/nginx/sites/aimo.plus/dx-origin.upstream`，不提交。变更先通过 `docker exec openresty nginx -t`，再 reload。入口允许 6 MiB 请求，以覆盖富文本预览预算。

运行配置文件更新时，先同步 `deploy/` 中的 Compose 和脚本到 app 目录；普通业务发布由 Actions 自动完成，不需要在服务器安装 Node 或构建代码。

## 发布与恢复

正常更新推送 main，或手动执行 `gh workflow run deploy.yml`，在 Actions 页面跟踪检查、镜像和部署三个阶段。不要把本地 `.env` 加入仓库或 Docker 构建上下文。

查看状态使用 `docker ps --filter name=dongxuan`、`docker logs --tail 100 dongxuan` 和 `curl -fsS https://dx.aimo.plus/health`。

恢复前先停止应用并检查迁移兼容性：只改业务逻辑且数据库兼容时可以重新部署之前摘要；涉及数据库结构时，应保留最新数据备份并在维护窗口按已验证的完整备份恢复。不要直接启动不理解现有结构的旧镜像。备份目录属于生产数据，不能提交仓库或删除来节省空间。

## 本次部署结果

流水线、镜像摘要、数据库迁移及 HTTPS 验证结果将在实际发布完成后记录。
