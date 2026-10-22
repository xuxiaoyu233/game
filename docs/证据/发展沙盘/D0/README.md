# D0 证据：CivIdle 本地底座落地与可行性

日期：2026-10-17。执行者：CodeBuddy。范围：仅 PLAN 的 D0；未进入 D1/D2，未提交/推送 Git，未发布。

> 2026-10-17 独立复核补记：下文保留执行方原始报告，不等于当前验收结论。Codex 已复现无法解析坏档被覆盖、拒绝页后台保存覆盖、快照/时间戳部分提交与短离线漏算；**D0 尚未通过复核，先执行 PLAN 的 D0-R**。详见[独立复核](复核-20261017.md)。六角地图运行只能支持逻辑复用判断，不能把“目标斜俯视美术可直接换皮”视为已验证事实。

## 结论（先读）

**建议继续采用 CivIdle 作为发展沙盘底座。** 依据：

1. **核心链路本机跑通**：加载→建造→自动生产→保存→重载→离线恢复全部真实通过（见下），且复用上游生产/工人/运输/科技/存档内核，未重写同类系统。
2. **关闭外部能力成本低且彻底**：联机面集中在 `RPCClient`（WebSocket）、IAP、LiveUpdate、Sentry/GA 几个点；改造后实测 1277 次请求全部本地、外部请求 0 次，路由层完全切断外网后核心循环仍正常。
3. **离线可本地化且行为一致**：离线时长来源从「服务器欢迎消息」改为「本地保存时间戳」，复用上游同一套离线 tick 循环与摘要弹窗；真实离开 80 秒与模拟 30 分钟均正确结算。
4. **地图与渲染兼容目标玩法**：pointy-top 六角网格 + Pixi 场景完整保留，等距斜俯视沙盘可直接换皮（D2）。
5. **数据隔离落实**：独立包/锁/端口 1426/IndexedDB `development-sandbox-v1`，不触碰原版与旧原型存档。

主要风险与 D1 前置（均有明确落点，不构成换底座理由）：小麦农场需 `Farming` 研究解锁、开局资源为 0、仓库成本含 `Brick/Horse`、伟人/转生等上层系统需在 D1 决定保留或剥离范围。详见「遗留问题」。

## 基线与工作区状态

- 执行前（2026-10-17 记录）：分支 `codex/p1-first-tier`，HEAD `98c2699af4bccbae4098cd300df92a8e6920c83e`（2026-10-17 15:01:12，作者身份已脱敏）。工作区有前轮未提交修改（`.prettierignore`、`AGENTS.md`、`PLAN.md`、`README.md`、`docs/**` 若干、`eslint.config.mjs`）与未跟踪文件（`docs/交接/CodeBuddy-发展沙盘执行说明.md`、`docs/规划/发展型沙盘玩法与底座对照.md`、`docs/规划/发展沙盘首版规格.md`、`docs/证据/历史/`、`docs/证据/底座改版/`、`next/`）。
- 执行中：未执行 reset/clean/覆盖式恢复；上述改动全部保留。
- 执行后：分支与 HEAD 不变；根仓库被跟踪文件未改动（仅 `PLAN.md` 按证据更新 D0 状态）；新增未跟踪内容为 `next/civ-idle/**`、`docs/证据/发展沙盘/D0/**` 与 `.cache/**`（已被忽略）。
- 上游固定 commit 核对：`git ls-remote https://github.com/fishpondstudio/CivIdle.git HEAD` = `e15fe039ed5c0794df05e52258bc9663761a140a`（即默认分支 HEAD 与指定 commit 一致）。参考副本：`.cache/civ-idle-upstream/`（tarball 解压，附来源记录 `UPSTREAM-REFERENCE.md`）。

## 上游数据路径追踪（实际阅读）

入口链：`index.html` → `src/scripts/main.tsx`（Pixi Application、纹理图集、字体、React UI 根）→ `Bootstrap.tsx`（`loadGame` → `isGameDataCompatible`/`migrateSavedGame` → `initializeGameState` → 离线结算 → `GameTicker.start()` → 场景加载）→ `scenes/WorldScene.tsx`（地图交互、`TileVisual` 渲染）。

- 建造/生产：`shared/logic/Update.ts`（`transportAndConsumeResources`：建造运输、升级、完成）、`shared/logic/BuildingLogic.ts`（`getWorkersFor`/`getStorageFor`/`getBuildingCost`/`useWorkers`）、`shared/logic/TickLogic.ts`（tick 数据、停产原因）、`src/scripts/logic/ClientUpdate.tsx`（`tickEverySecond` 在线/离线、周期保存）。
- 存档：`shared/logic/GameStateLogic.ts`（`serializeSave`/`deserializeSave`，JSON+Map/Set 替换器+wyhash 校验和）、`src/scripts/Global.tsx`（IndexedDB 读写、保存队列）、`src/scripts/MigrateSavedGame.ts`（版本迁移）。
- 科技/时代：`shared/definitions/TechDefinitions.ts`（10 个时代、column 0 初始科技）、`shared/logic/TechLogic.ts`。
- 地图：`shared/utilities/Grid.ts`/`Hex.ts`（pointy 六角、`TILE_SIZE=64`）、`shared/definitions/CityDefinitions.ts`（Rome 45×45、矿藏概率）、`shared/logic/TerrainLogic.ts`（地形/迷雾）。

## 模块表（复用 / 适配 / 停用）

| 模块                                                                                                                                                                                                                             | 处置               | 说明                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| `shared/definitions/**`、`shared/logic/**`、`shared/utilities/**`、`shared/languages/**`                                                                                                                                         | **复用**           | 生产/工人/运输/科技/存档/地图内核原样保留                                  |
| `src/scripts/scenes/**`、`src/scripts/ui/**`（除聊天）、`src/scripts/visuals/**`、`src/css/**`                                                                                                                                   | **复用**           | 地图交互、科技树、建造/升级面板、统计面板保留                              |
| `package.json`/`vite.config.ts`/`tsconfig.json`/`.npmrc`/`index.html`                                                                                                                                                            | **适配**           | 独立包与锁、端口 1426、host 127.0.0.1、扁平 tsconfig、官方 registry、标题  |
| `src/scripts/rpc/RPCClient.tsx`                                                                                                                                                                                                  | **停用改桩**       | 零网络；`client.*` 一律拒绝；导出面保留                                    |
| `src/scripts/utilities/IAP.tsx`、`logic/Heartbeat.ts`、`visuals/Sound.ts`                                                                                                                                                        | **停用改桩**       | 空操作                                                                     |
| `src/scripts/LiveUpdate.ts`、`logic/ChatCommand.ts`、`ui/ChatPanel.tsx`、`css/ChatPanel.css`                                                                                                                                     | **删除**           | OTA/联机聊天                                                               |
| `src/scripts/main.tsx`、`Bootstrap.tsx`、`Global.tsx`、`utilities/BrowserStorage.ts`、`utilities/Platforms.ts`、`logic/ClientUpdate.tsx`、`logic/PendingClaim.ts`、`logic/OnProductionComplete.tsx`、`ui/SupporterPackModal.tsx` | **适配**           | 关闭遥测/联机/内购/心跳；存档命名空间与本地离线时间；visibilitychange 保存 |
| `server/src/Server.d.ts`、`electron/src/IPCService.d.ts`                                                                                                                                                                         | **新增（仅类型）** | 服务端/Electron 类型本地声明，无运行时代码                                 |
| `src/textures/**`、`src/images/**`                                                                                                                                                                                               | **替换**           | 约 725 个自生成占位纹理 + 图集；`src/fonts                                 | sounds | videos` 为空 |
| `src/scripts/ui/OfflineProductionModal.tsx`                                                                                                                                                                                      | **适配+修 bug**    | 显式传入离线上限；修正上游秒/毫秒混用导致恒显 "0m"                         |

完整逐项清单（含每个文件的改了什么）见 `next/civ-idle/UPSTREAM.md`。

## 依赖查明（劳动力/运输/仓库/地图投影/资源）

- **劳动力（Worker）**：HQ 产 10 工人；`Hut`（木 10）产 1 工人、`House` 消耗 Wheat+Water 产 6 工人；每座生产/加工建筑按其 input+output 量消耗工人（`getWorkersFor`），每次资源运输也消耗 1 工人；幸福度按比例折减可用工人。结论：**保留为「设施容量」抽象展示**，不扩展居民系统；不是可隐藏的字段，而是生产/运输的实际计量。
- **运输**：`Transports`/`TransportSourcePlanner`：资源按 hex 距离逐 tick 运输，每趟耗 1 工人，容量受 builder/transport capacity 影响。**保留**——木工坊「缺料暂停、来料恢复」正是由它实现，是首版生产链的实际组成部分。
- **仓库**：`Warehouse` 上游成本 `Lumber+Brick+Horse`（Brick/Horse 为首版外资源）；容量 = 进口容量 × 倍率 × 3600 × 10。结论：D1 在自有内容中把成本改为木/石/板材（规格已明确），容量规则沿用。
- **地图投影**：pointy-top 六角（`Layout.pointy`，瓦片 64px），Rome 45×45，迷雾随建筑揭示；`Grid.ts`/`Hex.ts`/`TileVisual.ts` 完整可复用。与目标斜俯视沙盘兼容；D2 只换资产不改算法。
- **资源依赖**：四种主资源中 木材（LoggingCamp，需 Wood 矿藏）/石材（StoneQuarry，需 Stone 矿藏）/水（Aqueduct）开局即有；`Wood→Lumber` 链（LumberMill：2 木 → 1 板）确认可直接复用；**粮食（WheatFarm）需先研究 `Farming`（7500 科学，前置 Shelter+Logging）**——首版要让农田早出场，需在 D1 调整研究成本或解锁位置（规格的「新档即可建农田」与此冲突，已在遗留问题记录）。
- **科技/时代**：10 个时代（StoneAge→InformationAge），column 0 科技（Fire/StoneTools/Logging/Shelter）初始解锁；首版两个时代可映射 StoneAge/BronzeAge 或自定义（D1）。

## 真实操作结果（全部实测）

环境：Windows + Edge（Playwright channel msedge，headless）；dev server `vite` 端口 1426；Node v20.19.4、pnpm 10.18.3。

### 构建

- `tsc --noEmit -p tsconfig.json`：**0 错误**（严格模式，未关检查、未用 any 绕过；`server/src/Server.d.ts` 为关闭的联机服务重建的类型声明）。
- `pnpm run build`（compile + vite build）：**成功**，产物 `dist/`（约 4.2MB JS，含 >500kB chunk 警告，未做分割）。
- `pnpm install --frozen-lockfile`：**成功**（锁文件与 package.json 一致，可复现）。
- `vite preview`（dist）：加载成功，画布与 UI 正常，外部请求 0。

### 浏览器走查（dev server，Playwright 驱动真实点击）

1. 新档加载：Rome、2025 地块、HQ+伐木场+采石场+渡槽预置、初始科技解锁（截图 `w1-initial.png`）。
2. 建造：空地打开建造面板 → 点 Hut 的 Build → `Hut:Lv0:building` → 约 15–20 秒后 `Hut:Lv1:completed`（建造运输与完工走真实链路）（截图 `w3-after-build.png`、`w4-hut-complete.png`）。
3. 生产：LoggingCamp 木材 1/s、StoneQuarry 石材 1/s、Aqueduct 水、HQ 科学 3/s（工人驱动），持续 60 秒定时快照确认。
4. 保存/重载：IndexedDB `development-sandbox-v1`（约 120KB）+ `development-sandbox-v1.savedAt`；重载后 Hut、资源、tick 全部保持并继续增长（截图 `w5-after-reload.png`）。
5. 网络审计：整会话 1277 次请求全部指向 `127.0.0.1:1426`，**外部请求 0 次、失败请求 0 次**。

### 离线恢复（真实等待 + 模拟）

- **真实离开 80 秒**（关闭页面→等待→重开）：弹「Offline Production」摘要，Total Offline Time 01:21，tick +85，木材/石材各 +83、科学 +240（截图 `o3-offline-modal-final.png` 为等效模拟场景）。
- **模拟 30 分钟**（将 savedAt 改写为 30 分钟前，属模拟而非真实等待）：Total 30:01，tick +1805，木材/石材/水各 +1801、科学 +5400；加载约 3.4 秒（分批 tick）；弹窗显示「Max Offline Production Time is 4h」。
- 行为说明：离线与在线共用 `tickEverySecond(gs, true/false)` 同一套语义；超过 4 小时部分按上游规则转 Time Warp；刷新不重复结算（savedAt 随保存更新）。

### 断外网

- Playwright 路由层中止一切非 `127.0.0.1:1426` 请求：游戏加载、生产、建造、保存、重载全部正常，**外部请求尝试 0 次**（截图 `n1-no-network.png`）。未物理拔网线（等效验证，见未验证项）。

### 坏档与版本（临时测试存档）

- 可读但缺 HQ 的存档：进入「Save File Corrupted」页，**原数据保留不被覆盖**（截图 `c1-corrupted.png`）。
- 未来版本号（version=999）：明确拒绝（截图 `c2-incompatible.png`）。
- 完全无法解析的 JSON：上游 `loadGame` 捕获异常返回 null → 开新档（旧值保留至首次自动保存被覆盖）。这是上游既有行为，D1 可评估是否加「坏档备份」。

### 外部能力关闭核查

源码级：Sentry/GA/LiveUpdate/WebSocket/Steam/内购/心跳/聊天入口已删或桩化。运行级：上述网络审计 + 断网测试 + 预览测试均 0 外部请求。UI 中仍存在指向 Steam/Discord 的静态链接（About/帮助页），不自动请求；在线页面（玩家地图/交易/名人堂/投票）显示为空或操作时提示已关闭。

## 未验证项

1. 未物理断开网线/禁用以太网卡——用路由层中止外部请求等效验证（0 次尝试）。
2. 未做小时级真实离线等待——用 80 秒真实 + 30 分钟模拟 savedAt 覆盖阈值与批量循环。
3. 未遍历全部 UI 页面（尤其在线页面与后期奇迹/伟人界面）；未验证多城市、转生、Time Warp 等后期系统。
4. 未在 Node 24（仓库根要求版本）下运行；未跑上游 biome check（`pnpm run check`）作为门禁。
5. 未做性能/长时间挂机测试；未验证浏览器兼容性（仅 Edge）。

## 遗留问题与 D1 落点

1. **农田解锁**：WheatFarm 需 `Farming` 研究（7500 科学）。D1 落点：调整研究成本/顺序，或在沙盘自有内容中把 WheatFarm 移到初始科技——需先定「新档首建设」流程（规格要求先建农田后仍可建木/石）。
2. **开局资源为 0**：上游 `initializeGameState` 不给初始资源。D1 按规格给木 30/石 20（粮/板 0），并验证可达性。
3. **仓库成本**：`Lumber+Brick+Horse` 含首版外资源。D1 在自有内容适配为木/石/板材，容量规则沿用。
4. **离线上限**：当前 4h（上游常量）；规格目标 8h，D1 调整并补「回访摘要」（离开时长/补算时长/净变化/停产原因/下一步）。
5. **上层系统范围**：伟人、转生、玩家交易、UnitedNations 投票等在线/后期系统目前是「不可用但保留代码」；D1 决定剥离或保留范围（不影响底座结论）。
6. **UI 细节**：Material Icons 等图标字体缺失（显示连字符名）、音效静音、教程视频退化为文字——D2 随美术一并解决。
7. **已知上游 bug 修正**：`OfflineProductionModal` 秒/毫秒混用（已本地修正）；`ChatCommand` 等 mod 命令随聊天删除。
8. **tsconfig 扁平化**：偏离上游 project references（理由见 UPSTREAM.md），如 D1 需要 server/electron 类型隔离可再评估。

## 复现方式

```bash
cd next/civ-idle
npx --yes pnpm@10.18.3 install --frozen-lockfile
npx --yes pnpm@10.18.3 dev    # http://127.0.0.1:1426
```

原始日志与脚本：`.cache/d0-*.log`、`.cache/d0-evidence/`（走查/离线/断网/坏档/预览脚本与全部截图）。关键截图已复制到本目录。
