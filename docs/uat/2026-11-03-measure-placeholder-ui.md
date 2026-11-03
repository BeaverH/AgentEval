# Measure UI 数据边界（v0.2.25）

V2 的 CU 页面复用既有 agent/policy/scan 示例。没有 Passed 示例时保留零计数；缺失的 Profile 信息使用占位符，不生成新记录。

Tech 页面全部使用 placeholder：性能和资源值为 —，趋势图为标记区域，模型、Runner 和反馈表格只显示占位结构。预览按钮用于检查详情和页面流程；反馈关闭预览不写数据库或 localStorage，不报告已关闭真实请求。

Tech 功能范围：吞吐量、P99/P75/P50、模型使用、Runner 状态、GPU/VRAM 和 CPU/RAM、按误报/漏报/普通反馈分类的请求详情与关闭说明（可选 JIRA）。趋势对比支持日环比与月环比；这些选项只切换占位视图，不产生数值。

入口：/v2/guardrails?role=tech#Profile/measure/。V3 和实际基础设施验收不属于此占位界面的数据能力。
