# 发展营地（网页版）

**当前产品（用户 2026-10-20 纠正；2026-10-23 接续归并）：** 以《梅尔沃放置》式技能/作业自动成长为主体，玩家选择作业后持续获得资源与经验；场景应随**真实技能成长**自动显现和完善，不再以手动选地、摆建筑、点击施工为新主线。同一营地长期发展，不做短局/副本。当前仅推进桌面浏览器中的 ChatGPT Site；手机、短屏、原生与公开发布不在当前批次。**唯一产品方向、实施顺序和验收状态见 [PLAN](PLAN.md)**；早期 V1/V2 建设路线、[ui-v3](docs/设计/ui-v3/README.md)及[长期组合规格](docs/设计/长期发展与休闲组合规格.md)仍保留来源，但不再充当执行指令。

**现行状态：** 本机 Codex 于 2026-10-23 只读核验确认，[放置主循环](docs/证据/发展沙盘/放置主循环-20261020/样板交付.md)、[UI 打磨](docs/证据/发展沙盘/UI打磨-20261020/交付.md)和[UI 完善 2](docs/证据/发展沙盘/UI完善-2-20261020/交付.md)的主要代码仍存在：默认进入技能页、四技能/10作业、成长建议、技能轨/主面板、资源反馈、14 个独立 SVG 和键盘操作。八建筑/六资源、研究、工坊、人口与既有保存链保留。schema5/content `d1-c-1`，4h 离线补算上限仍沿原实现。**技能 XP/等级驱动场景自动变化尚未接线**；现有建筑等级/星级驱动的视觉附件不能当作等价实现。当前验收证据与未测范围以 PLAN 为准，历史构建/浏览器截图不代表 10-23 复验，用户尚未认可最终审美和试玩节奏。

## 当前源码与恢复入口（2026-10-23 本机只读结果）

- **营地唯一已核实的完整工作材料：** `D:\小游戏\next\civ-idle\`。该目录存在 `package.json`、`pnpm-lock.yaml`、`shared/`、`src/`、素材输入、原图与来源资料；本机报告核对 81 项 catalog 文件及 SHA256 均匹配。**这是一份本地工作区，不是可恢复的 Git 提交。**
- **根 Git：** `D:\小游戏\` 是 `xuxiaoyu233/game`，当时 `main@895bfb479437090b83e83d8663a1e304eaf2b981`；`.gitignore` 忽略整个 `next/`。营地无独立 `.git`、不是 submodule；在营地运行 `git rev-parse HEAD` 会得到**根仓库**的 SHA，不能当成营地版本。远程 [main](https://github.com/xuxiaoyu233/game) 只可重建根旧原型（12 技能，content `10.0.0`/schema `4`）及跟踪的文档。本页后续 Git 文档提交不等于营地源码已经纳管。
- **本机内容指纹（只读回执）：** 排除 `node_modules`、`.cache`、`dist`、`.git` 的 1336 个文件，摘要 `9837cc977830f3a6ea5e0a90485e52347be5f8838574168389d819368f5a7d96`，检查前后相同。它只标识该次本地材料，**没有配套可恢复源码副本时不能用于恢复**。
- **非现行恢复点：** 10-19 Sites 旧源码副本 `D:\小游戏\.cache\sites\development-camp\` 为独立仓库 `main@c417dafa0665fe32fb8ae639f55351cff3b5a435`，无 remote；其源码缺少后续 UI/素材改动。历史 checkpoint 仅有部分营地文件；旧 Sites `dist` 压缩包只有制品。已检查范围内**不存在与当前完整营地一致的恢复快照**；全盘备份及不可达 Git 对象未查。
- **下一位执行者的恢复起点：** 先验证本机上述目录与根仓库状态，保留全部用户数据；在实施新功能前，单独形成并验证包含现行源码、锁文件、原始素材和许可来源的完整恢复点，明确忽略 `node_modules`、缓存、构建产物、密钥和玩家存档。此步**尚未执行**，不得用根 worktree、旧 Sites 版本或目录指纹代替。

## 当前营地运行入口（本轮未启动）

按本机 Codex 核验的 `package.json`，从 `D:\小游戏\next\civ-idle\` 使用 `pnpm run dev`，预期监听 `127.0.0.1:1426`；`pnpm run check:quick`、`pnpm run compile` 和 `pnpm run build` 是营地自己的检查/构建入口，**都会先运行 `scripts/prepare-atlases.mjs` 并写入生成图集**。不要在只读审计中运行，也不要使用下方根 `npm`/`project.ps1` 命令验证营地。后续要做浏览器/离线测试时，先分配隔离 origin/存档并确认恢复方式，避免用默认端口触碰现有玩家档。

2026-10-23 只读核验**实际执行**的是无需图集写入的 Node 24 合同 42/42（含加载器）、`tsc --noEmit --incremental false`、Biome error 级与 81 项素材哈希检查；标准构建、浏览器、真实 IndexedDB、离线端到端均**未执行**。详细源码模块与存档职责见[架构说明](docs/架构说明.md)；最新交接见[工程交接](docs/交接/README.md)。

## 当前网页工程与旧原型维护

当前网页在next/civ-idle，使用React/Pixi/Vite和原shared规则/命令/保存路径，Node24与该工程锁文件即可；不需要为网页安装Rust/Windows SDK。新工程按自身脚本检查，UI大阶段末集中验证，不运行旧原型全套。

以下仅供明确维护根旧技能原型时使用：其Tauri2外壳、GameRuntime及src/domain/content/themes合同保持；Rust MSVC、Build Tools/Windows SDK/WebView2只与原生维护有关。脚本优先使用.tools隔离工具链，不修改全局PATH。

```powershell
cd D:\小游戏
./scripts/project.ps1 deps          # 按锁文件安装依赖
./scripts/project.ps1 dev           # 浏览器开发模式
./scripts/project.ps1 desktop       # Windows 桌面调试
npm run check:quick                 # 按需定位：格式、类型、Lint，不按每次改动固定跑
./scripts/project.ps1 check         # 大阶段末一次：八项静态门禁，不含单测
./scripts/project.ps1 e2e           # UI 大阶段末：一项浏览器启动冒烟
./scripts/project.ps1 native-check  # Rust 格式、Clippy 和测试（仅 Rust 改动）
./scripts/project.ps1 native-build  # Windows 桌面构建（仅 Rust/桌面改动）
```

新机器可先安装 `.node-version` 和 `src-tauri/rust-toolchain.toml` 指定的版本，再执行 `npm ci`。完整环境准备、依赖边界和工程约定见[工程规范](docs/工程规范.md)。

## 版本与数据边界

当前桌面应用标识为 org.zhujie.rescuebureau；默认保存根由 Tauri app_data_dir 解析，仅显式 --portable 时使用 exe 旁数据目录，两者均分 development/release。浏览器另用 IndexedDB 与 Web Lock。原型使用隔离 profile/namespace `skill-prototype-v1`，当前 content 为 `10.0.0`；早期原型存档各有显式迁移。当前与历史数据路径见[架构说明](docs/架构说明.md)，阶段状态见 [PLAN](PLAN.md)。

当前已私有发布[发展营地 · 工坊试玩](https://development-camp.l0ya1er.chatgpt.site)，实际版本/范围见[发布记录](docs/证据/发展沙盘/Sites-20261019/README.md)。进度仍只存在浏览器本地，不同网址/设备不自动接续；当前只支持导出备份、暂不支持导入，不启用账号云同步。旧C0静态包仅历史。Windows原生能力仍按对应实机验收记录，网页或构建不代表原生验收。

## 资料与工程入口

- [内容资料库：当前营地、文案、成长、建筑与素材](docs/内容资料库/README.md)（旧十二技能资料已独立归档）
- [当前主计划与阶段验收](PLAN.md)
- [工程规范](docs/工程规范.md)
- [架构说明](docs/架构说明.md)
- [轻量放置核心合同](docs/规划/轻量放置核心合同.md)
- [交接说明](docs/交接/README.md)
