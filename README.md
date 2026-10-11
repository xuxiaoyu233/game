# 本地放置游戏（新名称待定）

本项目是一款本地优先、适合在电脑角落运行的放置游戏。已选下一阶段方向为单主活动轻量原型：选择采集或制作，获得物品和经验，在工具升级与当前目标之间取舍，离线回来继续；故事通过短任务逐步接入。名称、世界观、人物和主线将从头设计，旧《诸界救援局》仅作旧版记录与参考。当前源码仍运行 0.8.0 的驻地与救援副本，新活动模型及新故事尚未实现。

GitHub：[xuxiaoyu233/game](https://github.com/xuxiaoyu233/game)（私有仓库）。工程与故事分别交给网页版 GPT 和 WorkBuddy 的任务、提示词及资料边界见[交接说明](docs/交接/README.md)。

## 当前进度

- 当前应用包元数据为 `0.8.0`；活动机械内容为 `14.0.0`，存档 schema 为 `9`。
- 已完成驻地自动经营的首个纵向切片：人员岗位生产、目标库存停点、首座生产设施、制作操作人员与材料预留、取消退款、专业经验和配方门槛、累计账目及回访摘要。
- 下一阶段按[唯一主计划](PLAN.md)完成核心活动、真实选择、回访与小窗、故事短任务四个纵向切片；防守、运输、多人岗位和科技树不进入首版原型。新版本号与正式存档策略在对应合同确定后登记。
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

- [内容资料库：类目、命名、资源、生产链与成长](docs/内容资料库/README.md)
- [故事资料库总索引与编辑规范](docs/故事资料库.md)
- [0.8 版冻结设定：《诸界救援局》](docs/故事线设定集.md)
- [0.8 版运行故事内容索引](docs/诸界救援局/内容索引.md)
- [历史资料库：《失落航标》v12](docs/历史资料/失落航标-v12/README.md)

## 工程入口

- [当前主计划与阶段验收](PLAN.md)
- [工程规范](docs/工程规范.md)
- [架构说明](docs/架构说明.md)
- [轻量放置核心合同：待实现的活动与任务行为](docs/规划/轻量放置核心合同.md)
- [v0.8.0 及早期实施与验收历史记录](docs/历史资料/工程记录/2026-10-11-v0.8.0实施与验收记录.md)
