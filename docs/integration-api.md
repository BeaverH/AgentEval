# NeMo / F5 集成后端 API

本项目提供正式 UI 可调用的集成后端，同时保留快速部署与联调 UI。正式 UI 与后端通过网关保持同域，将 `/api` 原样转发到本服务；请求路径、HTTP 方法、请求体和头部不得被改写成 UI 页面。无需新增 CORS 配置。

本文件描述 `0.2.24` 的接口。`0.2.23` 不包含 Swagger、单项测试和默认跳过 NeMo 证书校验，升级时需要部署 `0.2.24` 镜像。

## 入口与职责

| 入口 | 用途 |
|---|---|
| `/api/docs` | 可交互 Swagger UI，JS/CSS 随应用提供，不依赖 CDN/在线校验服务 |
| `/api/openapi.json` | OpenAPI 3.1，命令与配置请求模型由运行时 Zod 校验规则生成 |
| `/api/endpoints` | JSON 接口列表和命令示例 |
| `/v3/guardrails` | 保留的真实集成 UI、掩码连接配置、独立测试 |
| `/v2/guardrails` | 独立 Mock UI，后端连接失败不影响浏览器演示 |

正式 UI → 本服务 `/api/nmgr/*` → Marketplace 数据库及 NeMo Controller/F5 后端。浏览器不直接持有部署 Secret 中的 Token/DB URL；连接信息在服务端使用。配置页可提交手动备用值，服务端加密保存并供实例所有访问者共用，GET 仅返回是否配置。

当前默认 V3 沿用演示角色切换，不做独立的用户权限控制；`X-Marketplace-Role` 不是鉴权凭据。严格身份模式仍为可选配置；未增加新的必填账号映射、SSO 或管理密钥。

## API 列表

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/health` | 进程健康；不依赖 NeMo、F5 或数据库 |
| GET | `/api/marketplace-config?workspace=v3` | V3 运行配置、模式、连接版本；不返回凭据 |
| GET | `/api/nmgr/connection` | 掩码配置状态、TLS 选项、是否共享持久化、`connectionRevision` |
| POST | `/api/nmgr/connection` | 验证并保存备用配置；失败保留旧值 |
| DELETE | `/api/nmgr/connection` | 清除备用覆盖，恢复 Secret/YAML；不删除业务资源 |
| POST | `/api/nmgr/connection/test` | 单独测试 URL、Token 或数据库，不保存配置 |
| GET | `/api/nmgr/ready` | 配置与应用数据库检查；可能初始化表，不探测 NeMo/F5 |
| GET | `/api/nmgr/workspace` | 当前工作区的持久化快照、业务对象、任务、后端绑定 |
| GET | `/api/nmgr/workspace?resource=<id>` | 查询已绑定对象在 NeMo/F5 的真实状态 |
| POST | `/api/nmgr/commands` | 创建、编辑、评测、审批、发布、推进及恢复任务 |

`/api/guard/*` 是旧版受限代理，`/api/f5/*` 是旧版模拟接口，`/api/marketplace/*` 是旧版 CRUD 流程；正式 UI 应使用上述 `/api/nmgr/*` 契约，真实 F5 由业务服务的 F5 adapter 调用。

## 连接与独立测试

NeMo 最小配置仍是 Controller API URL、业务用户 PAT、Marketplace DB URL。NeMo URL 例如 `https://nemo.example/api/v1`，PAT 通过 Secret 注入。Bootstrap 登录密码不是 PAT。可选 F5 使用 `/backend/v1` URL 和 Token。

```json
{
  "target": "nemoUrl",
  "settings": {
    "nemoUrl": "https://nemo.example/api/v1",
    "nemoTls": "skip"
  }
}
```

`target` 支持 `nemoUrl`、`nemoToken`、`databaseUrl`、`f5Url`、`f5Token`。`settings` 省略/留空时使用服务端有效值。测试未保存的配置不会影响其他客户端。更换 URL 后测试 Token 必须同时输入该目标的 Token，避免把旧 Secret 发往新目标。

- URL 测试不发送 Token。JSON 401 表示地址可达，仍需 Token 测试确认身份/权限。
- NeMo Token 测试读取 `/account/identity`，要求 `effectivePermissions.policies`、`guardrails` 为 `write`。
- 数据库测试只执行 `SELECT 1` 并关闭连接，不迁移表。保存/进入工作区时另外检查应用 schema 权限。
- F5 Token 测试读取 `/scanners`，不会创建 Scanner、Project 或触发扫描。
- 默认 V3 演示仅对指定的 NeMo API 跳过证书校验，TLS 连接仍加密。可在配置页设 `nemoTls: verify`，或 Helm 设 `marketplace.nemoTls: verify`（环境变量 `MARKETPLACE_NEMO_TLS=verify`）。不会全局修改 Node TLS，也不会跳过 F5/数据库证书校验。数据库 TLS/自定义 CA 保留原配置入口。

成功响应包括 `ok`、`target`、`message`、`durationMs`，HTTP 探测另含 `httpStatus`。

## 正式 UI 调用流程

1. GET `/api/nmgr/connection`，保存非敏感的 `connectionRevision`。
2. GET `/api/nmgr/workspace`，头部发送角色；从结果读取 `revision`。
3. POST `/api/nmgr/commands`，每个新命令生成 UUID `requestId`，`expectedRevision` 使用最近快照的 revision。也发送 `X-Marketplace-Connection`，防止后台共享连接更改后命令误发到另一实例。
4. 使用响应更新本地快照。HTTP 200 仍需检查 `jobs[id].status`。`pending` 的任务由调用方发送 `advance` 逐步推进；查询快照不会推进任务，本服务没有自动执行所有步骤的后台 worker。
5. `failed`/`uncertain` 时展示 `job.message`，使用 `reconcile` 核实远端结果。不要重新创建资源或盲目重发一次新的发布。

请求头：

```text
Content-Type: application/json
X-Marketplace-Role: User | User Admin | IT Admin
X-Marketplace-Connection: <connectionRevision>
```

角色分别对应需求作者、审批人、技术实施人。演示默认 User；角色切换是工作流入口，原有状态机/作者/审批人检查仍存在。不要在 User 的 create/edit draft 中设置 provider；由 IT Admin 的 implement 指定。

同一逻辑请求重试时保留相同 `requestId` 和完全相同请求体；不同命令使用新 UUID。遇到 409 先刷新状态，再决定继续或恢复。**不能把所有网络失败都当成可以安全重试的写操作。** Swagger 中示例 UUID/revision 是占位示例，每次新操作要按上述规则填写。

| `type` / `action` | 角色 | 行为 |
|---|---|---|
| `create` / `edit` / `revise` | User | 新建需求、编辑自己的需求、发起新业务版本 |
| `action: implement` | IT Admin | 选择 NeMo/F5，保存实施配置并按需同步远端草稿 |
| `evaluate` | IT Admin | 提交数据集与案例，排队真实评测 |
| `action: request` / `withdraw` | 作者 User | 提交审批/撤回 |
| `action: approve` / `reject` | User Admin | 独立审批/驳回 |
| `action: deploy` | IT Admin | 发布已测试且已签署的版本 |
| `advance` | 发起任务的 Tech，草稿同步也允许原作者 | 推进当前任务一步；使用新 UUID 和最新 revision |
| `reconcile` | 同上 | 恢复失败或结果不确定的操作；必要时提供 `remoteId` |

请求字段与全部示例以 Swagger 为准。业务对象映射：

| 本服务对象 | NeMo | F5 |
|---|---|---|
| Guardrail | Policy definition/version | Scanner/version |
| Profile | Guardrail/version | Project/scanner bindings |

工作区列出由本服务管理的需求和绑定，不自动导入上游所有历史资源。发布成功表示相应后端对象就绪；应用流量接入仍由网关/Endpoint 配置负责。本契约不提供任意上游路径代理、推理转发或不存在的实时指标 API。

## 错误诊断

非 2xx 返回 `{ "error": { "code", "component", "message", "settings", "requestId", "details" } }`，`X-Request-ID` 与日志一致。V3 演示的 `details` 包含操作、NeMo 证书模式、上游 HTTP 状态、结构化上游错误码/信息、底层 cause 链及排查提示。

可识别 DNS、连接拒绝、超时、连接重置、证书、认证、数据库权限等原因。页面与日志保留相同诊断；已知凭据、URL 中的认证/路径参数、Token、密码和证书内容会脱敏。不返回任意上游响应体、HTML 登录页、SQL 或完整异常对象。错误正文有大小和读取时限。

任务执行失败可能以 HTTP 200 的快照返回 `jobs[id].status=failed/uncertain` 与 `message`；资源探测也可能返回 `status=unavailable`。正式 UI 必须显示这些业务错误，不能只判断 `response.ok`。

## 部署

沿用当前 Node/Nitro 服务、容器和 Helm，不需要第二个后端或新增必填配置。配置页共享保存需要跨 Pod 替换保留时，继续挂载 `marketplace.connectionStorage.existingClaim`，单副本运行。外部 UI 只需网关转发 `/api`；如要保留便捷联调入口，同时将 `/v3`、`/v2` 及应用静态资源路由到本服务，或用其独立运维域名访问。
