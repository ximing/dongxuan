# 东玄

个人排盘工具：紫微本命与运限、随手笔记、提示词模板。一张命盘就是一个人。紫微与梅花共用顶部导航；梅花目前保存原始占问和数字，起卦算法待规则确认。

当前代码已按 [方案](docs/README.md) 与 [HTML 设计稿](docs/design/README.md) 实施。生产站点：[dx.aimo.plus](https://dx.aimo.plus)。

排盘用 [iztro](https://github.com/SylarLong/iztro)。账号沿用 Inwit 那套：本地邮箱密码，可选的共用 Keycloak 统一账号。

## 起盘要填的

- 称呼
- 阳历或农历日期
- 时辰（早子到晚子，晚子归次日；仅写“子时”时需确认早子或晚子）
- 性别
- 农历闰月时勾选闰月

## 本地跑

需要 Node 22+、pnpm 10 和 Docker。本地脚本强制使用隔离 PostgreSQL 容器，不使用原有远程开发库。

```bash
pnpm install
pnpm --filter @dongxuan/dto build
pnpm dev:local:db
pnpm dev:local:server
```

在另一终端启动前端：

```bash
DONGXUAN_API_TARGET=http://127.0.0.1:3041 pnpm --filter @dongxuan/web dev
```

打开 Vite 输出的地址（默认 http://localhost:5192）。接口在 http://127.0.0.1:3041 ，`/api` 经 Vite 转发。本地统一登录关闭，可在登录页正常注册测试账号。运行、后台预览、停止方式和测试命令见 [本地运行说明](docs/implementation-local.md)。

## 生产

生产使用 GitHub Actions 构建的 GHCR 镜像，推送 main 后自动检查、构建、备份数据库并部署；详见 [部署说明](docs/deployment.md)。首次部署使用独立空生产库，不导入本地数据，登录页可使用邮箱密码注册。

升级既有数据库必须先备份并安排维护窗口：版本化迁移添加旧写入屏障，冻结旧实现回填基础快照，核对成功/失败数量后才恢复访问；详细步骤及恢复方案见 [迁移说明](docs/implementation-local.md)。回填失败时 CLI 非零退出，服务拒绝开放 HTTP。

完成迁移演练并配置独立生产环境变量后：

```bash
pnpm build
NODE_ENV=production SERVE_WEB=1 node apps/server/dist/index.js
```

`WEB_ORIGIN` 要和浏览器地址一致。统一登录打开时，回调固定是 `{WEB_ORIGIN}/api/auth/oidc/callback`。

## 统一账号

五个变量都空着，登录页只有邮箱密码。五个都有效才出现「使用统一账号登录」。

| 项 | 值 |
| --- | --- |
| clientId | `dongxuan` |
| audience | `dongxuan-api` |
| 用户属性 | `dongxuan_user_id` |
| 回调 | `{WEB_ORIGIN}/api/auth/oidc/callback` |

生产 realm 用 `aimo-plus-prod`，测试 realm 用 `aimo-plus-test`。不要改 `super-agent-native` 和 Inwit 的 client。Keycloak 里的 client secret 只放在部署机器的环境文件里，不进仓库。
