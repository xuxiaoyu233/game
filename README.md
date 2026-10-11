# 《诸界救援局》

本项目是一款本地优先、适合在电脑角落运行的放置经营冒险。玩家经营跨世界救援局的长期驻地，安排人员生产和制作，再进入世界副本处理救援、风险与故事选择；副本带回的稀缺材料和证据推动驻地成长与后续返场。

## 当前进度

- 当前应用包元数据为 `0.8.0`；活动机械内容为 `14.0.0`，存档 schema 为 `9`。
- 已完成驻地自动经营的首个纵向切片：人员岗位生产、目标库存停点、首座生产设施、制作操作人员与材料预留、取消退款、专业经验和配方门槛、累计账目及回访摘要。
- 下一阶段目标为产品 `0.9.0`：闭合稳定防守与扩产运输两条成长路线，随后实现驻地自动防守和副本回收闭环。阶段状态及验收证据以[唯一主计划](PLAN.md)为准。
- 现存 `artifacts/windows/ZhuJieRescueBureau-v0.8.0.exe` 是 content `13.0.0` / schema `8` 的旧快照，不能代表当前源码；当前阶段尚未产出新版 Windows exe。

## 技术与本地运行

Windows 桌面外壳使用 Tauri 2，浏览器和桌面共用 React 界面与 TypeScript 规则。规则放在 `src/domain`，机械内容放在 `src/content`，主题与展示文案放在 `src/themes`；所有状态变更通过 `GameRuntime.dispatch`。

推荐 VS Code、Node 24、Rust MSVC、Microsoft C++ Build Tools、Windows SDK 和 WebView2。项目脚本会优先使用 `.tools` 内隔离的 Node/Rust 工具链，不修改全局 PATH。

```powershell
cd D:\小游戏
./scripts/project.ps1 deps          # 按锁文件安装依赖
./scripts/project.ps1 dev           # 浏览器开发模式
./scripts/project.ps1 desktop       # Windows 桌面调试
./scripts/project.ps1 check         # 格式、类型、Lint、架构、内容文档和单元测试
./scripts/project.ps1 e2e           # 浏览器端到端验收
./scripts/project.ps1 native-check  # Rust 格式、Clippy 和测试
./scripts/project.ps1 native-build  # Windows 桌面构建
```

新机器可先安装 `.node-version` 和 `src-tauri/rust-toolchain.toml` 指定的版本，再执行 `npm ci`。完整环境准备、依赖边界和工程约定见[工程规范](docs/工程规范.md)。

## 版本与数据边界

新版使用独立应用标识与 `ZhuJieRescueBureau-data` 存档目录。旧版 v0.7.1《失落航标》及其 `IdleForge-data`、程序和历史内容继续隔离保留。存档或内容格式不兼容时必须显式迁移，不得静默重置、覆盖坏档或用新规则补算旧进度。

项目仅本地运行和保存，尚未发布 Sites、启用账号云同步或提供手机接续。Windows 原生窗口、托盘、置顶/收起、保存后真实重启及无引导试玩的状态见 [PLAN.md](PLAN.md)；浏览器自动化不代表这些原生验收已完成。

## 故事与资料库入口

- [故事资料库总索引与编辑规范](docs/故事资料库.md)
- [当前正史：《诸界救援局》](docs/故事线设定集.md)
- [当前游戏故事内容索引](docs/诸界救援局/内容索引.md)
- [历史资料库：《失落航标》v12](docs/历史资料/失落航标-v12/README.md)

## 工程入口

- [当前主计划与阶段验收](PLAN.md)
- [工程规范](docs/工程规范.md)
- [架构说明](docs/架构说明.md)
- [驻地经济与副本循环合同](docs/规划/驻地经济与副本循环合同.md)
