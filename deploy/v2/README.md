# Marketplace v0.2.25 内网离线包

复用已有 NeMo 与 PostgreSQL/MariaDB，可选 F5；本包只部署 Marketplace。默认 V3 是带角色切换的演示集成，不要求额外 SSO/账号映射；V2 Mock 独立运行。

## 内容与导入

`marketplace-v2.tar` 为 Linux amd64 镜像，名字沿用旧交付格式；`manifest.json` 记录实际镜像标签和 ID。`helm/`、`values.uat.yaml`、`UAT-token-config.md` 是配套部署内容，`three-input-configuration.md` 说明掩码共享备用配置。`accounts.json` 只供显式严格身份模式参考，默认不需要。

```sh
sha256sum -c SHA256SUMS
podman load -i marketplace-v2.tar
podman tag ghcr.io/idddd/tali-ui-demo:0.2.25 你的内网镜像仓库/tali-ui:0.2.25
podman push 你的内网镜像仓库/tali-ui:0.2.25
```

## 最小连接配置

在现有 values 合并：

```yaml
image:
  repository: 你的内网镜像仓库/tali-ui
  tag: "0.2.25"
marketplace:
  guardApiUrl: https://你的NeMo域名/api/v1
```

新 Chart 默认读取同 namespace 的 Secret `tali`：

- Token：`tali-guard-bootstrap-user-ini`，原始业务 API Token，无 Bearer 前缀。
- DB URL：`tali-guard-postgresql-init`，完整 PostgreSQL/MariaDB URL（含应用账号密码）。

名称/key 不同才覆盖 Secret 引用字段；已有正确值不需要新增。正常默认 V3 无需 dataMode、v2Live、crudOnly、publicOrigin、guardAuthOrigin、accountsConfigMap、固定 actor 或密码登录配置。保留原 workspaceId、NeMo URL、镜像仓库、Istio 和资源配置；改变 workspaceId/URL 会切换工作区。

```sh
helm upgrade --install <原release名> ./helm -n <原namespace> -f values.uat.yaml
```

自维护旧内网 Chart 须同步 Deployment env/可写连接目录/可选集成引用和 `/api/health` 探针，详见同目录 `UAT-token-config.md`。只有更新 image.tag 不会自动更新旧模板。继续使用已有 Istio 时，不额外启用 OpenShift Route。

## 备用配置与保存

访问 `/v3/guardrails`：三项缺失或错误时直接出现当前页掩码配置表单；已连接后从 Connection settings 返回。高级设置提供工作区、DB TLS、可信 CA 和可选 F5。保存前检查依赖，失败保留旧值；新地址必须重新输入对应 Token。所有访问者共用服务端加密配置，不回写 Secret/YAML。

默认 emptyDir 跨浏览器及同 Pod 容器重启保留。要跨 Pod 替换保留，在新 Chart 设置既有 PVC：

```yaml
marketplace:
  connectionStorage:
    existingClaim: marketplace-connection-settings
```

Chart 不创建 PVC；目录、加密文件和密钥需一同保留并允许 Pod UID 读写。默认单副本。Secret 轮换后按原流程重启；若保存过手动覆盖，用 Use deployment settings 清除覆盖才重新使用部署值。

## 验收

- `/v2/guardrails` / `/v2-mock/guardrails`：独立浏览器 Mock。
- `/v3/guardrails`：真实集成及同页连接配置。
- `/api/health`：共享 UI 健康；`/api/nmgr/ready`：真实配置和 DB 诊断，后者不能用于共享 UI readiness。
- `/api/docs`：内置 Swagger；`/api/openapi.json`：接口契约；`/api/endpoints`：API 列表。静态资源在 `/api/docs/*` 下，内网无需 CDN。
- NeMo URL、Token、DB 和可选 F5 有独立测试按钮，不保存配置；错误包含 HTTP 状态、脱敏原因链、排查提示及对应日志的 Reference。
- 默认 V3 对配置的 NeMo API 跳过证书校验，可设置 `marketplace.nemoTls: verify` 或在配置页恢复验证；F5 和数据库 TLS 策略不变。

本地已验证 NeMo Controller/Runner 提交 `9a1971b81b38e2848641289cf7ce51aab544be28`、PostgreSQL/MariaDB 驱动与真实 NeMo/MariaDB 连接。F5 有契约测试，未连接目标内网 F5 验收。目标 OCP、模型、Runner、业务 Token 权限及真实评测仍需在内网验收。

显式 `marketplace.demoRoles: false` 保留严格认证与账号映射模式，并忽略/禁用手动演示配置。旧密码/固定 actor 示例仅用于严格或旧版兼容，不是默认 V3 的前置条件。
