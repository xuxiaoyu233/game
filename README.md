# 本地放置游戏（新名称待定）

本项目是一款本地优先、小窗口、低频回访的技能型放置游戏原型。玩家选择训练或生产活动，通过资源加工、技能成长和工具投资开放后续内容，离线回来后继续选择。新版名称和故事题材待定。

**先确认所处版本：** 默认 `main` 仍是旧驻地/远征实现；本轮治理基于尚未合入 `main` 的集成候选，该候选运行两档技能原型。分支、版本、验证边界及当前阶段只见 [PLAN](PLAN.md)。

从[文档地图](docs/README.md)按任务进入架构、行为合同、内容实例或证据，不必先读全部历史。仓库为 [xuxiaoyu233/game](https://github.com/xuxiaoyu233/game)（私有）。

## 技术与本地运行

Windows 桌面外壳使用 Tauri 2，浏览器和桌面共用 React 界面与 TypeScript 规则。规则放在 `src/domain`，机械内容放在 `src/content`，主题与展示文案放在 `src/themes`；所有状态变更通过 `GameRuntime.dispatch`。

推荐 VS Code、Node 24、Rust MSVC、Microsoft C++ Build Tools、Windows SDK 和 WebView2。项目脚本会优先使用 `.tools` 内隔离的 Node/Rust 工具链，不修改全局 PATH。

```powershell
./scripts/project.ps1 deps          # 按锁文件安装依赖（在项目根目录执行）
./scripts/project.ps1 dev           # 浏览器开发模式
./scripts/project.ps1 desktop       # Windows 桌面调试
./scripts/project.ps1 check         # 格式、类型、Lint、架构、内容文档和单元测试
./scripts/project.ps1 e2e           # 浏览器端到端验收
./scripts/project.ps1 native-check  # Rust 格式、Clippy 和测试
./scripts/project.ps1 native-build  # Windows 桌面构建
```

新机器可先安装 `.node-version` 和 `src-tauri/rust-toolchain.toml` 指定的版本，再执行 `npm ci`。完整环境准备、依赖边界和工程约定见[工程规范](docs/工程规范.md)。

## 工作与数据边界

按 [AGENTS](AGENTS.md) 的约束执行，按 [PLAN](PLAN.md) 的当前阶段安排工作。技术分层与保存位置见[架构说明](docs/架构说明.md)，编码、命名和检查命令见[工程规范](docs/工程规范.md)。

存档使用显式版本和隔离 profile，不能用更名、换目录或治理清理静默重置旧进度。项目仅本地运行和保存，尚未发布 Sites、启用账号云同步或手机接续。浏览器检查、原生构建、Windows 实机与真人试玩分别记录。
