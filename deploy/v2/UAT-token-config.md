# UAT 升级到 v0.2.25

镜像 `ghcr.io/idddd/tali-ui-demo:0.2.25`，Chart `oci://ghcr.io/idddd/charts/tali-ui-demo`，版本 `0.2.25`。默认 V3 演示只需 NeMo URL、业务 Token、完整 DB URL，保留三角色切换，无需 SSO 或账号映射。Mock 继续独立运行。

## 现有 values.yaml 最小改动

在配置仓库 `charts/overlays/uat/tali-ui/values.yaml` 中合并，其他镜像仓库、Istio、资源等现值保留：

```yaml
image:
  tag: "0.2.25"
marketplace:
  guardApiUrl: https://你的NeMo域名/api/v1
```

使用本版 Chart 时，另外两项默认读取同 namespace 既有 Secret `tali`：

| 信息 | 默认 Secret key | 值 |
| --- | --- | --- |
| NeMo Token | `tali-guard-bootstrap-user-ini` | 原始业务 API Token，无 Bearer 前缀；精确以 ini 结尾 |
| 数据库 URL | `tali-guard-postgresql-init` | 完整 PostgreSQL/MariaDB URL，含正确账号密码，不是初始化 SQL、JSON 或裸密码 |

如果已有值正确，Secret 不需要新增或重建。名称不同时才覆盖 `nemoTokenSecret` / `nemoTokenKey`、`databaseSecret` / `databaseUrlKey`。Token、DB URL 不写入 values 或镜像。完整 DB URL 中的密码优先于旧独立密码配置。

默认值已包含 `demoRoles: true`、`workspaceId: uat`；默认 V3 自行进入 live 模式，不要求额外配置 `dataMode`、`v2Live`、`crudOnly`、`publicOrigin`、`guardAuthOrigin`、`accountsConfigMap` 或本地固定身份。保留原 workspaceId 和 NeMo URL 可延续原工作区；两者改变会切换工作区。

0.2.25 默认 V3 仅对配置的 NeMo API 跳过证书校验，不影响 F5 和数据库。需要开启 NeMo 验证时配置 `marketplace.nemoTls: verify`，或在 V3 配置页选择 Verify certificate；默认跳过无需新增配置。CA、DB TLS、F5 可继续沿用已有部署值，也可以在同页修复。不要因升级而更改现有数据库 TLS 策略。

正式 UI 通过同域网关调用 `/api/nmgr/*`。保持 `/api` 路径及子路径原样转发；Swagger 为 `/api/docs`，其本地 JS/CSS 使用 `/api/docs/*`，契约为 `/api/openapi.json`，列表为 `/api/endpoints`。无需新增 CORS。已有完整 `/api` 转发规则无需改动。

从已正确配置的 0.2.23 升级，无新增必填连接项；镜像改为 0.2.25，Chart 同步到 0.2.25。使用自维护模板且需要通过 values 控制 NeMo TLS 时，增加以下可选映射：

```yaml
- name: MARKETPLACE_NEMO_TLS
  value: {{ .Values.marketplace.nemoTls | default "skip" | quote }}
```

未注入此 env 时默认 V3 仍使用 skip。已保存的同页备用设置优先于部署值，修改部署配置后需按需清除旧手动覆盖。

## 旧内网 Chart 必须同步模板

若使用本次发布的 Chart，模板已包含全部改动。若内网仍维护 `charts/manifest/tali-ui/<version>/templates/deployment.yaml`，**只改 image.tag 和 values 不够**。优先合并本版完整 `deploy/helm/tali-ui-demo/templates/deployment.yaml` 及默认 values，至少同步：

1. 注入三项连接信息（已有同名 env 替换，避免重复）：

```yaml
- name: GUARD_API_URL
  value: {{ .Values.marketplace.guardApiUrl | quote }}
- name: GUARD_API_TOKEN
  valueFrom:
    secretKeyRef:
      name: {{ .Values.marketplace.nemoTokenSecret | default "tali" | quote }}
      key: {{ .Values.marketplace.nemoTokenKey | default "tali-guard-bootstrap-user-ini" | quote }}
      optional: true
- name: MARKETPLACE_DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.marketplace.databaseSecret | default "tali" | quote }}
      key: {{ .Values.marketplace.databaseUrlKey | default "tali-guard-postgresql-init" | quote }}
      optional: true
```

2. 添加共享备用配置目录 env 和可写挂载。以下为无 PVC 的最小例子，分别合并到容器的 `env`、`volumeMounts` 和 Pod 的 `volumes`：

```yaml
# containers[].env
- name: MARKETPLACE_V3_DEMO
  value: "true"
- name: MARKETPLACE_CONNECTION_DIR
  value: /var/lib/marketplace/connection
- name: MARKETPLACE_CONNECTION_PERSISTENT
  value: "false"
# containers[].volumeMounts
- name: connection-settings
  mountPath: /var/lib/marketplace/connection
# spec.template.spec.volumes
- name: connection-settings
  emptyDir: {}
```

这几个 env 由新 Chart 自动生成，不是额外必填的用户连接参数；目录保存加密配置与密钥，不存浏览器 Cookie。保留原 `/tmp` 可写挂载、只读根文件系统及 OCP restricted SCC 的动态 UID 策略。

3. startup/readiness/liveness 探针全部使用 `/api/health`。`/api/nmgr/ready` 仅作为真实配置/DB 诊断，不用于共享 UI Service 的 readiness。
4. NeMo/F5/数据库 Secret 引用，以及可选 accounts/CA ConfigMap 引用使用 `optional: true`。删除旧模板中强制要求真实连接值或账号映射的 Helm `fail` 条件，使缺失配置能进入 V3 配置页且不阻止 Mock 启动。

无需新增 Kubernetes RBAC，也无需让应用调用 Secret API。现有 Istio/域名规则不变，不额外启用 OpenShift Route。

## 保存配置跨 Pod 重建（可选）

默认 emptyDir 可跨浏览器会话及同 Pod 容器重启保留；Pod 替换会清空手动备用配置。需要升级、重建后保留时，在新 Chart 中指定既有 PVC：

```yaml
marketplace:
  connectionStorage:
    existingClaim: marketplace-connection-settings
```

Chart 不自动创建 PVC。旧自维护模板则将上述 volume 替换为 persistentVolumeClaim，并将 `MARKETPLACE_CONNECTION_PERSISTENT` 设为 `true`。卷权限必须允许实际 Pod UID 读取、写入目录及加密文件；数据文件和密钥必须一起保留。单副本沿用默认 `replicaCount: 1`，不支持多个 Pod 并发修改此配置。

## 同页备用配置与验收

直接打开 `/v3/guardrails`。三项缺失/失效时自动显示当前页的掩码配置表单；连通后通过页头 Connection settings 返回。所有访问者共用服务端加密保存值，不需要其他隐藏配置页面。输入留空保留原值；保存前检查依赖，失败不覆盖旧配置；更改 NeMo/F5 URL 必须同时重新输入该服务 Token。高级项包含 Workspace ID、DB TLS、可信 CA 和可选 F5。Use deployment settings 删除手动覆盖，重新使用 Secret/YAML；后续轮换部署 Secret 时可用此入口取消已保存的旧覆盖。

默认演示模式允许所有访问者切换角色和修改连接，不做额外 Marketplace 用户权限。只有显式选择 `marketplace.demoRoles: false` 才进入严格身份模式，该模式要求独立用户认证/账号映射，并禁用及忽略手动演示配置。

按现有 GitOps 流程同步后执行：

```sh
oc -n <namespace> rollout status deployment/<实际Deployment名称>
```

检查 `/api/health`、V2 Mock、V3 连接和一次真实读取。V3 错误包含组件、错误码、配置项和 Reference；使用 Reference 查询容器结构化日志。UI 健康不代表模型、Runner 或真实评测已就绪。环境变量方式轮换 Secret 后按原流程重启 Pod；不要输出解码后的 Secret。
