# D0-R 证据：数据保护与本地恢复收尾

日期：2026-10-17。执行者：CodeBuddy。范围：根 PLAN 的 D0-R（依据 [D0 独立复核](../D0/复核-20261017.md) R1–R4）与两项 A0 展示小修。未进入 D1，未提交/推送/发布。**状态：已交付，待 Codex 复核与用户验收。**

**后续独立复核：尚未通过，继续本阶段局部补修。** 见 [Codex 复核 F1–F4](复核-20261017.md)：失败后的重复补算、恢复互斥/首次提交屏障、空字符串与结构损坏分流。下文保留首轮交付时的结论和原始证据；已成立的事务原子性、四态加载和 A0 更正保留。当前状态以根 PLAN 为准，不据下文原结论进入 D1。

## 结论

R1–R4 全部按复核方向修复，并在浏览器中实际复现验证：坏档/拒绝档不再被覆盖；快照与 `savedAt` 同事务原子提交（故障注入下两者均不部分更新）；小于 1 分钟也补算；后台保持打开再恢复也补算且刷新不重复。A0 两项小修完成。**工程与数据保护条件已满足提交复核的要求**；数据保护结论只覆盖本轮实测范围，不含未测项（见文末）。

## 执行前后 Git 基线

- 执行前：分支 `codex/p1-first-tier`，HEAD `98c2699af4bccbae4098cd300df92a8e6920c83e`；工作区含前轮未提交修改（`.prettierignore`、`AGENTS.md`、`PLAN.md`、`README.md`、`docs/**`、`eslint.config.mjs`）与未跟踪资料/`next/`——全部保留，未 reset/clean/覆盖。
- 执行后：分支/HEAD 不变；新增的已跟踪文件改动仅 `.prettierignore`、`eslint.config.mjs`（D0-R 要求的根隔离）与 `PLAN.md`（按证据回填）；其余改动都在 `next/civ-idle/**`、`docs/证据/发展沙盘/**`（未跟踪）。未修改 `src/**`、`src-tauri/**`、`next/profectus/**`、旧素材原件与玩家库。
- 旧素材完整性：主图 `3eb3d0c27124d2ec…`、primitive `b522e1ed79392bc5…` 复算一致（A0 台账值）。

## 问题与修复路径（R1–R4）

### R1 坏档/读取失败被当成新玩家覆盖

- 原状：`Global.tsx` 的 `loadGame()` catch 后返回 `null`，启动路径把它当作"无存档"，随后自动保存覆盖原字符串。
- 修复：`loadGameWithStatus()` 返回四态 `none | loaded | corrupted | read-failed`。只有 `none` 初始化新档；`corrupted` 保留原始字符串并在错误页可导出；`read-failed` 单独成态（不读取成功也不等于无档）。`Bootstrap.tsx` 对两态直接路由到 `SaveCorruptedPage` 并 `return`——不初始化游戏状态、不启动 ticker、不开保存屏障。
- 迁移说明：存档键与「字符串快照 + 独立 savedAt」两键布局**未变**，无需迁移数据；`loadGameWithStatus` 显式识别旧压缩档路径，解析失败按 `corrupted` 处理而不静默清空。

### R2 保存入口缺少生命周期屏障

- 原状：`ClientUpdate.tsx` 的 `visibilitychange` 隐藏监听无条件 `saveGame()`；错误页/拒绝档期间内存为空状态，切后台即把原档写成 0 地块默认状态。
- 修复：`Global.tsx` 增加模块级保存屏障。`saveGame()` 在 `markSaveReady()` 之前不写盘：记录待保存信号并挂起调用方；屏障就绪后补偿执行一次并按结果 resolve/reject。周期保存、隐藏保存、手动保存（菜单/待办/账号页等）全部经过同一入口。`Bootstrap` 只在加载、校验与离线补算全部完成后调用 `markSaveReady()`。
- 错误页恢复入口：重写 `SaveCorruptedPage` 为纯本地操作（导出原始数据、重试加载、带确认的新档），删除 `recoverFromServer`（先 `resetToCity` 清内存、再请求已停用服务）；版本不兼容页复用同一组操作（`SaveRecoveryActions`）；设置页的「服务器备份 / 从服务器恢复」入口移除。

### R3 快照与 savedAt 分开提交

- 原状：`doSaveGame` 先 `idbSet` 快照、再 `idbSet` `Date.now()`，两次独立事务；注入时间戳失败时快照前进而时间戳停留旧值。
- 修复：`BrowserStorage.ts` 新增 `idbSetMany()`，在同一 readwrite 事务中写入两个键；`savedAt` 在序列化**之前**取值（宁少不多，避免按已推进状态重复补算旧区间）。同时修复同步异常路径：`put` 若同步抛错，显式 `transaction.abort()`——否则已入队的快照 put 仍会提交，造成部分写入（本轮故障注入实际复现了这一点，见验证 S5 第一轮失败与修复记录）。
- 失败反馈：保存失败发出 `OnSaveGameFailed` 事件，`ClientUpdate` 订阅后显示 `SaveFailedToast`；内存进度保留，后续周期/隐藏保存自动重试。

### R4 短离线漏算与后台恢复

- 原状：`Bootstrap` 只在 `actualOfflineTime >= 60` 时进入补算，<60 秒被整体跳过；`shouldTick()` 在隐藏时停止推进，但返回可见时没有补算。
- 修复：补算与摘要门槛分开——`actualOfflineTime > 0` 即调用 `runOfflineCatchUp()`（上限仍为 4h，超出转 Time Warp），`>= 60` 才弹摘要。`runOfflineCatchUp()` 由启动与后台恢复共用。`visibilitychange` 可见分支按 `lastActivityAt` 计算隐藏间隔，补算 → `saveGame()` 原子提交 → 推进边界，避免与关闭重开重复计入。补算完成后先 `markSaveReady()` + `await saveGame()` 提交已消费时间，再启动 ticker。
- 本轮保持 4h 上限与上游 Time Warp 规则；8h、首版摘要与取消 Time Warp 留 D1（未改动）。

## 来源改动

全部改动记录在 `next/civ-idle/UPSTREAM.md`「D0-R」小节，逐条列出 10 项。涉及文件：

| 文件                                      | 改动                                                       |
| ----------------------------------------- | ---------------------------------------------------------- |
| `src/scripts/Global.tsx`                  | 四态加载、保存屏障、单事务原子保存、原始字节导出、失败事件 |
| `src/scripts/utilities/BrowserStorage.ts` | `idbSetMany`（单事务多键 + 同步异常 abort）                |
| `src/scripts/Bootstrap.tsx`               | 四态分流、<60s 补算、补算后原子提交再启动 ticker           |
| `src/scripts/logic/ClientUpdate.tsx`      | `runOfflineCatchUp`、后台恢复补算、保存失败 toast          |
| `src/scripts/ui/SaveCorruptedPage.tsx`    | 重写为本地恢复页                                           |
| `src/scripts/ui/SaveRecoveryActions.tsx`  | 新增共享恢复操作                                           |
| `src/scripts/ui/GameplayOptionPage.tsx`   | 移除服务器备份/恢复入口                                    |
| `shared/languages/en.ts`                  | 新增 `SaveFailedToast`                                     |
| `.prettierignore`、`eslint.config.mjs`    | 根工具隔离 `next/civ-idle/**`                              |
| `src/scripts/art/ArtPreviewApp.tsx`       | A0 小修：删矿石行、修正署名汇总                            |

## 准确命令与环境

- Node：`v24.14.0`（官方 `node-v24.14.0-win-x64.zip` 解压到忽略目录 `.cache/toolchain/`；PATH 默认 v20.19.4，未改全局环境）。
- 类型检查：`node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → **0 错误**。
- 构建：`node ./node_modules/vite/bin/vite.js build` → **成功**（游戏 + art-preview 双入口；chunk >500kB 警告为既有）。
- Lint：`node ./node_modules/@biomejs/biome/bin/biome check ./src/scripts/ ./shared/ --diagnostic-level=error --config-path=./` → **error 0**（277 warnings 为上游既有状态，本轮不整仓改格式）。
- 根隔离验证：`npx prettier --file-info next/civ-idle/src/scripts/Global.tsx` → `{"ignored":true}`；根 ESLint `ignores` 已含 `next/civ-idle/**`。
- 开发服务：`node ./node_modules/vite/bin/vite.js`（端口 1426）。
- 生产预览：`node ./node_modules/vite/bin/vite.js preview --port 4175 --host 127.0.0.1`。

## 实际结果（一次集中走查，全部为浏览器真实运行）

脚本 `.cache/d0r-verify.mjs`（Node 24 + Edge headless，每个场景独立 context/IndexedDB）。日志 `docs/证据/发展沙盘/D0-R/verify-log.txt`（原始 `.cache/d0r-verify-run4.log`）。

| 场景                                   | 结果                                                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 正常新档/建造/重载                  | 建造 Hut → 完成 → 隐藏保存 → 重载：Hut 保持，tick 25→29（真实间隔补算），无异常                                                                                                     |
| S2 坏 JSON                             | 写入不可解析字符串 → 拒绝页显示；**合成 hidden 后原字符串未被覆盖**；关闭页面重开仍为拒绝页且原值不变（截图 `s2-corrupted-page.png`）                                               |
| S3 缺 HQ                               | 可解析但删 HQ → 拒绝页显示；隐藏后原值保留                                                                                                                                          |
| S4 未来版本                            | version=999 → 拒绝页 + 导出/重试/新档操作齐全；隐藏后原值保留                                                                                                                       |
| S5 原子提交（故障注入）                | 包装 `IDBObjectStore.put` 对 savedAt 同步抛 `QuotaExceededError`：**快照与 savedAt 均不更新**（原子），tick 内存前进 6（进度保留），toast 可见；恢复原始 put 后再保存，两者同时更新 |
| S6 短离线（30s 模拟）                  | savedAt 改为 30 秒前：tick 6→40（补算 34，含真实间隔），**无摘要弹窗**；保存后重载 tick 40→44（不重复领取）                                                                         |
| S7 后台恢复（合成事件 + 真实等待 20s） | 隐藏期间 tick 冻结（6→6）；恢复可见后 tick 6→33（补算 27，含真实间隔与恢复耗时）；保存后重载 33→38（不重复）                                                                        |
| S8 A0 小修                             | 资源 4 行（粮食/木材/石材/板材，无矿石）；署名汇总 Lorc 7 / Delapouite 1 / John Redman 1 / Faithtoken 1 且 ore 不再计入 Lorc（截图 `s8-art-preview-credits.png`）                   |
| S9 外部请求                            | 全场景 **0 外部请求**                                                                                                                                                               |
| 生产 preview 冒烟                      | `dist/index.html` 可加载（canvas + UI 文本），外部请求 0（截图 `r0-preview-game.png`）                                                                                              |

### 方法标注（不混写）

- **S2/S3/S4/S7 的 visibilitychange 是合成事件**（`Object.defineProperty(document,"hidden")` + `dispatchEvent`），不是真实 Windows 窗口切换/最小化。
- **S5 是故障注入**（包装 `IDBObjectStore.put` 同步抛错），不是本机磁盘真实配额不足。
- **S6 是修改 savedAt 时间戳模拟离线**，不是真实离开 30 秒；S7 有真实 20 秒等待，但隐藏状态为合成。
- 生产 preview 冒烟只检查 canvas/UI 可加载，未在生产产物上重跑 S1–S8（`window.savedGame` 调试函数仅 DEV 注册）。

### 过程中发现并修复的真实缺陷

第一轮 S5 注入暴露：`idbSetMany` 中 `put` 同步抛错被 Promise executor 捕获但未中止事务，导致快照已提交而 savedAt 未提交（部分写入）。已在 `idbSetMany` 显式 `transaction.abort()` 修复并复测通过。该缺陷由故障注入发现，非上游既有代码。

另有一处测试脚本缺陷（`delete IDBObjectStore.prototype.put` 删除原生方法而非恢复包装），仅影响测试，已改为保存/恢复原始引用。

## 失败与未测项

1. **`read-failed` 态未实测**：代码路径已实现（读取异常 → 单独错误页，raw=null），但未注入 IndexedDB 读取异常；现有验证覆盖 corrupted/none/loaded。
2. **真实后台操作未测**：未最小化真实浏览器窗口或切换系统窗口；用合成 `document.hidden` + 真实 20 秒等待验证监听器与补算逻辑。
3. **真实磁盘配额未测**：故障注入模拟，非真实 QuotaExceededError 触发路径（真实异步 onerror 也会 abort 事务，本轮未单独复现）。
4. **4h 截断与 Time Warp 未在浏览器实测**：沿用上游 `MAX_OFFLINE_PRODUCTION_SEC` 与 `addPetraOfflineTime`，本轮只验证 30 秒与 20 秒补算。
5. **多标签页并发未测**：未验证两个标签同时打开同一 origin 的保存竞争（上游无锁设计，未新增）。
6. **浏览器兼容**：仅 Edge headless；未测 Firefox/Safari。
7. **biome 277 warnings**：上游遗留（如 `noExplicitAny`），`--diagnostic-level=error` 下 0 error；未整仓改上游格式。

## 边界声明

- 本轮**不进入 D1**：五类建筑、两时代、8h 离线、正式摘要、动态美术、PvE、桌面迁移均未做。
- A0 两项小修为展示更正，不改变美术接入结论；A0 原件、历史截图与日志未改写。
- D0 原始复核与 D0/A0 证据保留原样，本报告不回填其结论。
