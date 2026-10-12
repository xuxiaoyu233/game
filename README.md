# 本地放置游戏（新名称待定）

本项目目标是一款本地优先的 Melvor 式技能放置游戏：训练技能、采集加工、投入工具与后续生产、解锁新内容、离线回来继续，故事通过短任务逐步接入。名称、世界观、人物和主线从头设计，旧《诸界救援局》仅作 0.8 历史记录。当前工作分支主入口运行两档技能原型：进阶矿/锭、复合工具坯和工具 III 已进入 content `2.0.0`；P3 离线回访回执已实现，技能封顶后继续生产。

**S0、P0、P1、P2、P3、R0/R1、P4-A、P4-C 已完成并签收（P4-C 含 Windows 实机用户现场验收）；P4-D 真人无引导试玩进行中（U1/U2 完成、U3 待执行）；工程重整阶段 S1 与试玩并行，只调整结构、命名与门禁，不改变游戏行为。** 当前 profile `skill-prototype-v1` 使用 content `2.0.0`/schema `2`；P1 与早期 P2 存档各有显式迁移，库存、经验、工具及当前活动事实得到保留。唯一顺序与状态见 [PLAN](PLAN.md)，目录、责任和保存位置只见[架构说明](docs/架构说明.md)。故事资料在独立 `story-library/`，机械数值与游戏内名称分别由 content 和 themes 负责。

GitHub：[xuxiaoyu233/game](https://github.com/xuxiaoyu233/game)（私有仓库）。2026-10-12 起写入者与整合者为 WorkBuddy，Codex 停用；任务、提示词及资料边界见[交接说明](docs/交接/README.md)。

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

## 版本与数据边界

当前应用包元数据仍为 `0.8.0`；桌面应用标识为 org.zhujie.rescuebureau；默认保存根由 Tauri app_data_dir 解析，仅显式 --portable 时使用 exe 旁的 ZhuJieRescueBureau-data，两者均分 development/release。浏览器另用 IndexedDB 与 Web Lock。新原型继续使用隔离 profile/namespace `skill-prototype-v1`，当前 content 为 `2.0.0`；P1 content `1.0.0` 只通过显式加法迁移升级。当前与历史数据路径见[架构说明](docs/架构说明.md)，阶段状态见 [PLAN](PLAN.md)。旧《失落航标》及其 IdleForge-data、程序和历史内容保留；不以更名、换目录或瘦身静默重置或覆盖存档。

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
- [规划目录入口与历史方案导航](docs/规划/README.md)
- [v0.8.0 及早期实施与验收历史记录](docs/历史资料/工程记录/2026-10-11-v0.8.0实施与验收记录.md)
