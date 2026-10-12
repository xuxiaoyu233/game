# 本地放置游戏（新名称待定）

本项目目标是一款本地优先的 Melvor 式技能放置游戏：训练技能、采集加工、投入工具与后续生产、解锁新内容、离线回来继续，故事通过短任务逐步接入。名称、世界观、人物和主线从头设计，旧《诸界救援局》仅作 0.8 历史记录。当前工作分支主入口运行第一档技能原型，XP 到各技能最高已实现等级门槛后停止增长，活动产出继续；P1 已完成工程验收，下一步转 P2 第二档规划。

**S0、P1 工程验收均已完成；P0 两档蓝图已作为 P1/P2 输入。** XP 封顶行为已确定：采掘 16 XP、金工 10 XP；封顶后不再增加经验，但活动与物料产出继续。唯一顺序与状态见 [PLAN](PLAN.md)，目录、责任和当前/目标保存位置只见[架构说明](docs/架构说明.md)。故事资料在独立 `story-library/`，机械数值与游戏内名称分别由 content 和 themes 负责。

GitHub：[xuxiaoyu233/game](https://github.com/xuxiaoyu233/game)（私有仓库）。工程与故事分别交给网页版 GPT 和 WorkBuddy 的任务、提示词及资料边界见[交接说明](docs/交接/README.md)。

## 当前进度

- 当前应用包元数据为 `0.8.0`；活动机械内容为 `14.0.0`，存档 schema 为 `9`。
- 已完成驻地自动经营的首个纵向切片：人员岗位生产、目标库存停点、首座生产设施、制作操作人员与材料预留、取消退款、专业经验和配方门槛、累计账目及回访摘要。
- 实施顺序为 S0 工程整理→P0 两档共同蓝图→P1 第一档→P2 第二档发展→P3 回访/桌面→P4 批准故事与正式档策略。技能、生产与发展图一起设计；独立研究/战斗等后续系统分别评审。新版本号与正式存档策略在对应合同确定后登记。
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

当前桌面应用标识为 org.zhujie.rescuebureau；默认保存根由 Tauri app_data_dir 解析，仅显式 --portable 时使用 exe 旁的 ZhuJieRescueBureau-data，两者均分 development/release。浏览器另用 IndexedDB 与 Web Lock。新原型 skill-prototype-v1 profile 尚未实现，完整当前/提议路径见架构说明。旧《失落航标》及其 IdleForge-data、程序和历史内容保留；不以更名、换目录或瘦身静默重置或覆盖存档。

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
