# 发展营地（网页版）

**2026-10-20 最新方向**：以《梅尔沃放置》式技能/作业自动成长为主体，主页面随真实进度自动生成、逐步完善；不再要求玩家选地、摆建筑或点击施工。当前V2方向未通过用户反馈，停止推广。唯一活动顺序见 [PLAN](PLAN.md)；下方旧V2规划/操作说明保留为既有实现记录，不代表继续采用。此次仅更新计划及入口，未实现新方向或更新线上站点。

最新范围：先专注**桌面ChatGPT Site**。Codex先完善[桌面UI设计稿](docs/设计/ui-v3/README.md)，CodeBuddy再按稿接入真实游戏；手机、原生与其他平台暂不投入。本地视觉原型已备，正式游戏/存档和线上站点未改。

2026-10-20本轮：用户要求**同一小镇长期发展，不做短局或副本**，先完整规划场景/成长，再逐项建设升级；休闲肉鸽爽感取发展选择与设施组合。当前审美/体验仍有差距，原V1本地检查不代表用户认可。最新[长期组合规格](docs/设计/长期发展与休闲组合规格.md)与[CodeBuddy交接](docs/交接/CodeBuddy-V2长期小镇与组合成长.md)已备，本轮只改规划；唯一活动顺序见[PLAN](PLAN.md)。下方是现有工程能力，原大时代/生存/PvE扩展暂缓。

当前方向：**基于CivIdle的网页版固定场景舒适放置经营；购置、升级与升星逐步完善同一处小镇。** 优先完成电脑浏览器与手机网页，原生Windows移出主线。已实现四技能/10作业、八建筑六资源、六研究、五Tab、食水/住房/抽象人口，以及工坊时代、五基础建筑本地2星与Lv20和只读回访摘要。当前schema5/content `d1-c-1`，自动生产、4h离线上限；D1-C见[报告](docs/证据/发展沙盘/D1/C/交付.md)，真人平衡待试玩。正向路线/场景氛围为下一步；死亡/瘟疫/重大事件风险移到后期自愿挑战，进度只见[PLAN](PLAN.md)。

根 `src/` 仍是保留的 **12技能**原型（content `10.0.0`/schema `4`）。`next/profectus/`保留前轮样机与素材；`next/civ-idle/`为当前营地。旧原型、本地数据和桌面入口保持独立。无profile的D0样机档不自动映射成新营地，会保留原数据并提供导出/明确新档入口。

Codex已直接完成V1固定场景、手绘设施、点击反馈与网页适配补修，本地验证和原型限制见[本批交付](docs/证据/发展沙盘/V1/Codex交付.md)，待审美与真实节奏试玩。下一批C2先完善舒适成长、设施完成感与正向路线，不强加生存风险。原V1[复核](docs/证据/发展沙盘/V1/复核-20261019/复核.md)保留历史缺陷；[调研](docs/规划/网页画质与点击体验调研-20261019.md)记录复用/取舍，唯一排期见[PLAN](PLAN.md)。已有私有Sites仍是先前发布版本，尚未部署本批。

本地开发启动后默认入口为[发展营地](http://127.0.0.1:1426/)，端口占用以实际输出为准；本批临时开发端口1436、生产预览1437（仅本机，端口不是迁移）。点“技能”专注作业，建设基础链与民生，研究和逐级升级后主动进入工坊，再逐座晋升2星到Lv20。农田Lv1自动0.20原粮/秒、灌溉加0.25输出modifier；协助共享10模拟秒。仓库1/2星每已建等级分别贡献200/300集中仓容；新档20人/20床与有限食水缓冲。旧档先按旧规则结清，再显式迁移schema5，不需换库清档。启动：

```powershell
cd D:\小游戏\next\civ-idle
& 'D:\小游戏\.tools\node-v24.21.0-win-x64\node.exe' scripts/prepare-atlases.mjs
& 'D:\小游戏\.tools\node-v24.21.0-win-x64\node.exe' node_modules/vite/bin/vite.js --host 127.0.0.1 --port 1426 --strictPort
```

A0只读入口仍为同端口的`art-preview.html`。端口不同会形成不同浏览器origin与本地数据空间，勿将换端口误认为存档迁移。

**现有桌面版本 1.0.0。** Tauri identifier 固定为 `org.zhujie.rescuebureau`（决定默认存档根目录，冻结以保护玩家进度）；交付产物命名 `SkillIdle-v<version>.exe`。0.8 旧玩法代码、旧文档与旧测试已按用户决定移除（git 历史保留），旧 0.8 存档不再迁移。目录与保存边界见[架构说明](docs/架构说明.md)；新沙盘先在隔离工程实现，不因规划更新更改生产版本。

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
