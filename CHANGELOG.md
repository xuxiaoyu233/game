# 更新记录

## 1.1.0（2026-10-17，排版地基、三态窗口与树视图）

把 Kimi 的设计规格落成实现（content 仍为 `10.0.0`/schema `4`，无内容变更）：

- **排版地基**：间距从 `2.4/4.16/6.4/9.6/13.6px` 改为 4px 网格 `2/4/6/8/12/16`；行高成为字阶令牌（`--line-title/-heading/-body/-caption`），11 处散落字面量清零；根节点统一 `tabular-nums` 与 `overflow-wrap`；图标基线由 `-0.2rem` 改为 `-0.15em`，活动标题改 flex 居中。
- **四屏重排**：技能行 56px 预算 + 浮雕等级徽章 + 凹槽进度条 + 键盘焦点环；记录页 56 格图鉴改为 6 列网格、精通补四档检查点；仓库的商店与卖出合成交易区（≥720px 并置）；成长页补五级等级点并修复升级行断词。
- **三态窗口**：`<main data-mode>` 驱动 active/960×720、idle/280×72、tree/720×640；面板用 `display:none` 裁剪不卸载，选中技能与滚动保持；迷你窗用上此前闲置的 9 张 mini 素材；`WindowPort.setSize` 为可选能力，Tauri 侧 `LogicalSize` 并补 `core:window:allow-set-size`。
- **树视图（渐进式披露）**：树卡片行 → 单棵树画布 → 节点详情，一次只画一棵；`projectTree` 纯派生四态与边，节点坐标属内容数据；拖拽平移、0.5–1.5 缩放、`F` 聚焦可解锁节点；筛选只降透明度不删节点。
- **修复**：树视图目录与详情被固定场景层盖住（详见 `docs/工程规范.md` 的层叠条款）；节点点击被画布 `setPointerCapture` 吞掉；`stat-list`/`milestone-list`/`codex-list` 共享选择器组导致统计区被套上网格。
- **证据**：`docs/证据/UI升级/` 新增四视口 + 树 + 仓库 + 迷你窗 7 张图，由 `scripts/visual-evidence/ui-evidence.spec.ts` 复跑生成。

## 1.0.0（2026-10-16，内容 10.0.0：节奏审计工具化、曲线尾部重定、时代扩 7 档、技能详情容量整改）

把 S10 落地的 9.0.0 内容再做一次节奏收口与派生层扩容。**schema 仍为 4**，只 bump `contentVersion`（9.0.0 → 10.0.0），走完整内容流程（`data-v9/` 快照 + `skill-prototype-v9.ts` + p9 槽位 + 9.0.0 迁移分支 + keyset 条目 + 同批主题/UI 文案 + 台账/PLAN/CHANGELOG 同步）。

- **节奏审计工具化**：一次性调参脚本固化为 `scripts/audit-pacing.mjs`，按当前内容推算各技能到 Lv30 的时长分布与曲线尾部占比，参数化 `--max-total-hours` / `--max-tail-share` 门禁；`docs/工程规范.md` 写入「改动影响节奏的内容须跑 audit-pacing」。
- **曲线尾部重定**：Lv13–Lv30 由蓝图 5.2 续写改为公比 1.04 的等比续写（Lv1–Lv12 原样保留），上限由 563,004 降到 **56,548**；数值未经真人试玩校准（见诚实边界）。
- **时代扩 7 档**：`src/domain/skill-loop/eras.ts` 由「等级阈值」改为「累计曲线占比」分带 `ERA_CUMULATIVE_PERCENT=[0,1,5,15,35,60,85]`（解耦等级阈值，`ERA_THRESHOLDS` 保留给记录页里程碑文案）；`getEraId` 纯派生、零存档状态。`src/themes/eras.ts` 新增 verdant（春绿）/ aurora（靛紫）两套调色板，`check-theme-contrast.mjs` 改按调色板键动态枚举（5→7 套自动纳入）；`src/themes/assets/eras/` 新增 `verdant.jpg` / `aurora.jpg`（AI 生成、水印用镜像修补去除）。
- **技能详情容量整改**：`ActivityList.tsx` 按层（T1–T5）分组为可折叠面板（默认展开最高已解锁档），保留全部活动级 `data-testid`；`skill-prototype.css` 列表加 `max-height:38rem; overflow-y:auto` 容量护栏（8 行以上滚动、不溢出视口）。
- **迁移与键集**：`9.0.0/schema4 → 10.0.0` 加法迁移（`extendSameSchema`，保留经验/工具/增益/回执/精通、新键零值）；`keyset-manifest.json` 新增 `10.0.0`（指纹与 9.0.0 相同，ID 集合未变）；`check-content-keyset.mjs` 的 `SNAPSHOT_DIRS` 加 `data-v9`。
- **验证**：`npm run check` 八项全绿；`npx vitest run` 4 文件 42 项（含 9.0.0→10.0.0 迁移用例）；`era-evidence.spec.ts` 1 passed，时代证据截图重生为 14 张（7 时代 × 420×600/360×480）存 `docs/证据/时代演进/`。

## 1.0.0（2026-10-16，T3–T5 内容批：按层扩到 Lv30，content 9.0.0）

按 `docs/内容蓝图-技能资源发展体系.md` 第 3 部分把内容从 T1/T2 双层切片扩到 T3–T5。**schema 仍为 4**，只 bump `contentVersion`（8.0.0 → 9.0.0），走完整内容流程（`data-v8/` 快照 + `skill-prototype-v8.ts` + p8 槽位 + 9.0.0 迁移分支 + keyset 条目 + 同批主题文案 + 台账/PLAN/CHANGELOG 同步）。

- **等级上限 Lv12 → Lv30**：十二技能共用曲线续写蓝图 5.2（`Δ(L→L+1) = round(180 × 1.26^(L-1))`），Lv13 门槛 10,394、Lv30 门槛 563,004（与蓝图「累计到 L30 ≈ 563,000」一致）。精通等级复用同一曲线，精通上限随之抬到 563,004。
- **T3/T4/T5 内容**：新增 29 件物品、57 个活动、36 条配方、11 条工具升级（ID 一律带 `-t3/-t4/-t5` 层后缀，既有 ID 一个未改）。每档采集/制作取蓝图 5.3 的周期与 XP：T3 13,000/43 与 15,000/58、T4 16,000/96 与 18,000/122、T5 20,000/213 与 24,000/268。新增 5 条需求链：矿→锭→机壳→（T5 核心组件）、木→石炭→熔炼、种→作物→鱼饵→钓鱼→烹饪、草→经验药剂、敏捷/偷窃印记与硬币产出；宝石在 T4/T5 工具升级上继续加深用途。
- **工具线拉到 5 级**：采掘/伐木 1000/800/650/600/550，钓具 1000/820/680/620/570，金工/制造 1000/860/740/660/600；每层都有一次永久提升可买。C7（工具材料不跨层，`tierOfLevel` 按 6 级一层算工具等级）把材料层锁在 T1，因此 Lv4/Lv5 升级沿用复合工具坯/加固木柄/宝石并提高份数——这是既有校验的直接结论，已在 `docs/内容资料库/资源与生产链.md` 注明。
- **迁移修正（顺带修掉的两处既有缺陷）**：`withMasteryDefaults` 原来整体覆盖精通记录，8.0.0 → 9.0.0 会把精通经验与池清零；现在改为只对新键零值初始化、旧值原样保留。带回执的存档跨内容 bump 时，`inventoryDelta`/`skillXpDelta` 缺新 ID 会被 codec 直接拒绝；现在按加法语义零值补齐后再校验，回执与增益/运行中活动一起保留（增益的倍率与周期时长按当前内容重读/重算，见下一条）。
- **验证**：`npm run check` 八项全绿；`npx vitest run` 4 文件 39 项通过（新增 8.0.0→9.0.0 迁移用例）；`npm run test:e2e` 1 passed；`check:content-keyset` 登记 9.0.0（items 指纹由 `e9cf487156a4f2e2` 变 `bc8e97d19db86c0c`，skills/tools 指纹不变）。

## 1.0.0（2026-10-16，T1 数值校准批：对齐蓝图 5.3）

纯数值批次，不改任何 ID、不 bump 版本、不加迁移（ID 集合指纹与 8.0.0 相同，已由 `check:content-keyset` 证明）。解决 PLAN 里挂着的「T1 pacing 待决策」。

- **T1 全部活动对齐蓝图 5.3**：T1（Lv1–Lv6）采集统一 7,000 ms / 7 XP、制作统一 9,000 ms / 11 XP；T2（Lv7–Lv12）保持 10,000/18 与 12,000/26 不变。层内原本逐项不同的数值被统一的层口径取代，与 T2 既有的「同层同数值」写法一致。
- **实测前后差异**（按 `xpPerCycle × 60,000 / durationMs` 逐条算）：T1 采集最快 45.0 → 60.0 XP/分钟，开局默认活动 `mine-common-ore` 15.0 → 60.0 XP/分钟；T1 制作 48.0–73.3 → 统一 73.3 XP/分钟；Lv1→7（需 2,079 XP）从最快 T1 采集的 46.2 分钟降到 34.6 分钟（蓝图预期 35 分钟）；T2/T1 速率比 1.80（蓝图 5.2 要求 ×1.75–1.8）。
- **副作用已知**：数值变化会让旧档里「运行中活动的周期时长」失效（旧 8,000 ms 在新内容下不可复现），本批不 bump 版本，因此该问题由随后 9.0.0 的迁移显式处理（重算），不在本批单独开迁移。

## 1.0.0（2026-10-16，速度口径统一批：周期倍率方向与 0.5 地板）

修掉 B4 记录但本批未动的既有方向缺陷。**纯数值 + 校验改动，不改任何 ID，不 bump 版本**（`check:content-keyset` 指纹与 8.0.0 相同）。

- **统一为「周期倍率」口径**：引擎把四个速度倍率全部乘在周期时长上，因此只有 <1000 才是变快。六个字段长期写成 >1000，实际让玩家变慢（敏捷 Lv2 后采掘周期 8,000 → 8,240 ms）。现在全部翻转（保留两位有效近似）：熟鱼 1150 → **870**、什锦大餐 1200 → **833**、净化药水 1150 → **870**、迅捷药水 1250 → **800**、敏捷 Lv2 1030 → **971**、敏捷 Lv3 1060 → **943**；经验类字段（`xpMultiplierPermille`/`globalXpBonusPermille`，明晰药水 1200、草药学 1030/1060/1100）方向本来就对，保持 1001–2000 不动。
- **校验范围收紧到方向**：`scripts/validate-content-json.mjs` 与 `src/domain/skill-loop/validation.ts` 把两个速度字段的范围从 1001–2000 改为 **500–1000**（下限与工具倍率一致，上限表示「不得比基准更慢」）。冻结的 schema ≤3 快照（`data-v5/6/7`）保留历史数值，codec 要按它们复现旧存档的周期时长，因此旧范围对它们仍然有效——范围按 schema 分支，注释已写明原因。
- **0.5 地板下调到 0.30**（采纳「方案 A」的思路，但数值不同，理由见下）：翻转后最坏组合是「工具 650 × 迅捷 800 × 敏捷 Lv3 943 × 精通 800 = **0.3923**」，已经低于 0.5，且用户给的方案 A 算式（0.416）漏算了敏捷翻转后的 943。T3–T5 再加工具等级后最坏到 **0.319**（工具 550 × 五级食物 770 × 943 × 800），对应最短基础周期 7,000 ms 的 2,237 ms，距 1 秒仍有余量。真正的崩溃守卫仍是 `scaled > 0` 与安全整数检查，地板只约束内容设计。
- **独立错误码**：`spend-mastery-pool` 的 `invalid-amount` 原被映射成 `NUMERIC_LIMIT`（数量非法不是数值上限溢出），现改为 `INVALID_MASTERY_AMOUNT` 并登记进 `SkillLoopErrorCode`。
- **文案与展示**：`formatCycleMultiplier` 取代 `formatPercent` 显示速度与工具倍率（「周期 ×0.87（快 13%）」）；`types.ts` 两个速度字段的注释改为周期倍率口径。
- **测试**：`rates.test.ts` 新增 6 项（熟鱼增益后周期严格变短、敏捷 Lv2/Lv3 按 1/1.03 与 1/1.06 缩短、精通档位生效后变短、最坏堆栈 ≥0.3 且 <0.5、最短周期不进入 1 秒区）；合计 4 文件 38 项通过。

## 1.0.0（2026-10-16，精通系统批：schema 4 与精通池，content 8.0.0）

玩法进化第三批，本仓**第一次 schema 升级**（3 → 4）：新增 `masteryXp`（每活动）与 `masteryPool`（每技能）两个记录键，旧档显式加法迁移（精通全零起步，禁止静默重置）；schema <4 的存档携带这两个字段直接拒绝。规则合同先行写入 `docs/规划/轻量放置核心合同.md`「精通系统」节。

- **精通 XP**：每完成周期 `max(1, round(活动基础 XP × 精通系数))`，系数随活动精通等级提升（表集中 `src/domain/skill-loop/mastery.ts`，简化自 Melvor 的逐级曲线）；精通等级复用技能经验曲线，到顶停止累计。
- **精通池**：每次精通入账的 25%（向下取整）注入所属技能池；池上限 = `MASTERY_POOL_BASE_PER_ACTIVITY(1200) × 该技能活动数`。
- **检查点纯派生**：池填充率达到 10/25/50/95% 时对应档位生效（速度档按工具约定 <1000 缩短周期、经验档 >1000），不存任何「已解锁」标志；池消耗跌回阈值即失效。`validateSkillLoopDefinition` 枚举工具×消耗品×全局×精通全部组合，强制最终倍率 ≥ 0.5。
- **`spend-mastery-pool` 命令**：池 XP 按 1:1 兑成指定活动的精通经验，原子提交；三类边界分别报 `INSUFFICIENT_MASTERY_POOL` / `UNKNOWN_ACTIVITY`（跨技能在结构上不可寻址，由未知活动覆盖）/ `MASTERY_POOL_CAP_EXCEEDED`。
- **UI（schema 4 感知，schema 3 自动隐藏）**：活动行精通行（`mastery-progress-{activityId}`）；技能详情精通卡：池填充条 + 4 档检查点（生效/未达成/因消耗失效——最后一态为会话内高水位瞬态展示，不持久化）+ 按活动「注入 N」（`mastery-spend-{activityId}`）；记录页精通总览（`records-mastery`）。
- **内容流程**：`data-v7/` 冻结快照 + `skill-prototype-v7.ts` + p7 槽位 + `7.0.0/3 → 8.0.0/4` 迁移分支（`extendSameSchema` 升级为 schema 感知）+ keyset 8.0.0 条目（同指纹，ID 集合未变）+ 主题精通文案 6 键。
- **测试**：新增 `mastery.test.ts` 13 项（系数表/池上限/检查点纯派生/三类 spend 边界/倍率组合）；codec 7 项含 schema 4 迁移与旧档拒绝；合计 4 文件 32 项。引擎行为（累计节奏、消耗失效、旧档往返）按政策用一次性脚本验证后删除，结果记入 PLAN B4 清单。
- **验证**：`npm run check` 八项全绿；`npx vitest run` 32 passed；`npm run test:e2e` 1 passed；浏览器实测精通卡、注入后档位翻转（含 ETA 随检查点失效变长）与记录页总览。
- **发现并记录一处既有矛盾（本批未动）**：`globalSpeedBonusPermille`/`consumable.speedMultiplierPermille` 按「乘以时长」实现，数值 >1000 时周期变长，与「加速」文档语义相反；B4 冻结 effect 语义，建议单独立批统一方向（详见 PLAN B4 诚实边界）。

## 1.0.0（2026-10-16，规则扩展批：出售命令与技能等级效果扩展，content 7.0.0）

玩法进化第二批。**schema 仍为 3、不新增任何存档键**，只 bump `contentVersion`（6.0.0 → 7.0.0），复用既有 `extendSameSchema` 迁移路径；内容批次按完整流程执行（`data-v6/` 冻结快照 + `skill-prototype-v6.ts` + p6 槽位 + 6.0.0 迁移分支 + 同批主题文案 + 台账/PLAN/CHANGELOG 同步）。规则合同先行写入 `docs/规划/轻量放置核心合同.md`。

- **新增 `sell` 命令与 `sellOffers`**：`profile.json` 固定价格表（5 条：黏土/基础矿料/原木/野生种子/洁净草），原子扣物给硬币、可重复、不占主活动不给 XP；错误码 `UNKNOWN_SELL_OFFER` / `INSUFFICIENT_RESOURCES` / `NUMERIC_LIMIT`。仓库页新增出售区（新锚点 `sell-{offerId}`），「来源与用途」把出售计入物品用途与硬币来源。
- **反套利不变式**：同物买卖时出售单价必须严格低于商店买入单价（内容校验把关）；实测买入 2 组矿花 8 硬币、卖出只得 2，无造币环路。
- **`skill.levels[].effect` 扩展两个字段**（均取当前等级值、不跨等级累加，内容以重复声明保持生效）：
  - `globalXpBonusPermille`（1001–2000）：草药学 Lv5–Lv7 ×1.03、Lv8–Lv10 ×1.06、Lv11–Lv12 ×1.10，与消耗品经验倍率相乘；
  - `offlineCapBonusMs`（≤24h）：农业 Lv4–Lv6 +1h、Lv7–Lv9 +2h、Lv10–Lv11 +4h、Lv12 +6h；`getOfflineCapMs = min(maxOfflineMs + 加成, 24h)`，燃料在封顶窗口上继续延长，回执按同一函数计算。
- **公式收敛到单一出处**：删除引擎内重复的 XP 公式，`getXpPerCycle` 改吃 definition 并合并消耗品 × 全局两级倍率，引擎同源调用；新增导出 `getGlobalXpMultiplier` / `getOfflineCapBonusMs` / `getOfflineCapMs`；离线规划与回执共用同一上限函数。
- **校验与门禁**：`validateSkillLoopDefinition` 校验 effect 至少一字段、倍率范围、离线加成上限与 sellOffers 结构；`check:content-json` 新增出售报价校验、反套利与 C5 下游计入；`check:content-keyset` 纳入 `data-v6/` 并登记 6.0.0/7.0.0（同指纹，ID 集合未变）。
- **UI**：技能详情「等级效果」行按当前等级列出全部效果；离线规划卡在等级加成 >0 时标注来源；燃料描述去掉硬编码「8 小时」并说明农业加成；草药学/农业技能描述补效果说明。
- **测试（按政策两类例外）**：新增 `src/domain/skill-loop/rates.test.ts`（9 项纯派生公式合同：当前等级值不累加、倍率相乘、24h 封顶）；`skill-loop-codec.test.ts` 新增 6.0.0→7.0.0 迁移用例（5 项）。引擎行为（sell 原子性、引擎/rates 一致性、离线窗口端到端）按「引擎类测试暂缓」政策用一次性脚本验证后删除，结果记入 PLAN B3 验收清单。
- **验证**：`npm run check` 八项全绿（退出码 0）；`npm run test:e2e` 1 passed；浏览器实测出售点击（黏土 9→5、硬币 0→1）。

## 1.0.0（2026-10-16，美术与色彩批：场景句、承诺色、时代背景美术与 tone 系统）

按 impeccable / taste 工作流（bolder → colorize → polish → critique）升级视觉与色彩。范围不变：零内容变更（content 仍 `6.0.0`/schema `3`）、零引擎改动、不新增任何存档状态、不改任何物品/技能/工具 ID。

- **物理场景句**：「深夜熄灯的书桌前，只有屏幕亮着，一个人在挂机。」写入 `src/themes/eras.ts` 文件头与 `docs/工程规范.md`，作为一切改色的推导依据（深色底、单一光晕、低环境光）。
- **色彩策略从「克制」升「承诺」**：5 套时代调色板的面板底色 chroma 从 0.014–0.018 提到 0.02–0.04（此前只有强调色有颜色、整屏发灰），中性色一律向时代色相偏移；每个时代新增 3 个语义 tone（gather 采集 / craft 加工 / support 辅助），落在技能行与仓库行的图标容器、组头色点、状态条高亮；映射单一出处在 `src/app/skill-prototype/derivations.ts`。
- **5 张时代背景美术（此前一张都没有）**：AI 生成深色低对比位图（768×1024 JPEG q86，共约 282KB；实测平均亮度 5.1%–11.9%、最高像素 57.3%–61.1%）落 `src/themes/assets/eras/`，经 `--era-scene` 注入固定图层（Vite `new URL(..., import.meta.url)` 资产模式）；industrial/precision/synthetic 另有 `data-era` 选择的细纹理（斜纹/仪表网格/全息网格）；生成方式、亮度实测与许可登记于 `src/themes/assets/SOURCES.md`。
- **时代切换同时改变 4 类元素**：场景位图、极光色相、面板底色相、强调色（超过「≥3 类」验收线）；实测场景层移除后 64.9% 像素发生变化（平均通道差 22.6），确认背景美术真正透出且非常量纯色块。
- **对比度门禁扩容**：`scripts/check-theme-contrast.mjs` 从「只对背景」扩展为对背景/面板/浮层三类表面逐一校验正文/次要/强调，并新增 tone ≥3:1 校验；实测最低 7.02:1。
- **字阶**：`--font-secondary` 与 `--font-floor` 合并为 `--font-caption`（0.7rem），CSS 注释明确其为非层级用途（工具性小字）不参与层级比；主链 1.25/1/0.8rem 相邻比保持 1.25；正文 ≥12px、caption ≥11px。
- **图标集**：43 个自绘内联 SVG 描边 1.7 → 1.75（24×24 网格、圆角端点不变），主行显示尺寸统一 1.4rem，技能/物品行外加 tone 图标容器；`currentColor`、`aria-hidden`、零许可风险不变。
- **动效**：进度条仍只动画 `transform: scaleX()`（未动画 width），极光漂移仅 transform/opacity，全部带 `prefers-reduced-motion`。
- **文案**：清除 `src/` 全部 11 处注释 em dash（含指定的 `EraBanner.tsx`、`RecordsPanel.tsx`、`SkillGrid.tsx` 三处）；UI 文案零 em dash（`DASH` 为 en dash）。
- **修两处既有 CSS 优先级缺陷**（ stash 对照实测确认非本批引入）：技能行内边距与渐变底长期被通用按钮规则覆盖；修正后行高 61px → 55px、420×600 首屏 6 → 7 行、卡片渐变底色恢复生效。
- **证据入库**：`docs/证据/时代演进/` 收 10 张 git 跟踪截图（5 时代 × 420×600/360×480；此前只在被 gitignore 的 `artifacts/`），五时代全图与首屏条带像素均值互异；浏览器实测：场景图 5/5 加载、首屏强调色元素 15–16 处、tone 气泡 13 个、首屏 7 行、360×480 无内容横向溢出。
- **门禁**：`npm run check` 八项全绿（退出码 0）；`npm run test:e2e` 1 passed；`node scripts/check-theme-contrast.mjs` 通过。

## 1.0.0（2026-10-16，存档加固与门禁补强）

修复一次真实死档事故，并把它的成因变成门禁（content 仍为 `6.0.0`/schema `3`，无内容变更）：

- **死档修复**：`decodeSkillLoopSave` 不再把「contentVersion 与当前一致」当作「记录键集完整」的证明。缺少的键按零值补齐（语义与 `extendSameSchema` 一致），未知 ID 仍然拒绝加载且会指名。此前这两种漂移都既走不了同版本快路径、也没有迁移分支，游戏完全无法启动。
- **自诊断报错**：`exactRecord`/`exactDeltaRecord` 改为报告「期望 N 键／实际 M 键／缺失…／多余…」，死档一眼可定位。
- **独占租约修复**：启动解码失败的标签页会立即交还 Web Lock（此前它会一直占着锁，导致其他标签页报「另一个标签页正在使用此存档」，且界面三个按钮都无法自救）；恢复动作（从备份恢复／导入存档）在写入前自动取回独占权。
- **新增 `check:content-keyset`**：`src/content/keyset-manifest.json` 记录每个 contentVersion 的 items/skills/tools ID 集合指纹，同一版本号下改动 ID 集合即失败——这正是该事故逃过全部门禁的原因。指纹只跟踪 ID 集合、不跟踪数值（技能从 3 级扩到 12 级不应报警）。
- **回归测试**：新增 `src/persistence/skill-loop-codec.test.ts`（同版本补齐／未知 ID 拒绝／漂移诊断／5.0.0→6.0.0 迁移），并在 `docs/工程规范.md` 登记「存档解码与迁移」为第二类测试例外。
- **验证方式**：死档自愈与租约交还都在真实浏览器里复现验证；租约那条另做变异反测（去掉修复后测试立刻失败并复现原症状）。

## 1.0.0（2026-10-16，第一批视觉修正重做：设计契约 A–G 与第 0 步债务清理）

按设计契约 10 条重做第一批视觉层。范围不变：零内容变更（content 仍 `6.0.0`/schema `3`）、零引擎改动、不新增任何存档状态。

- **第 0 步债务（6 项，先于视觉，全部清完）**：删除 `playwright.batch1.config.ts`（Playwright 不支持 `rootDir` 选项，`npm run check` 报 TS2769）；`tests/browser/batch1-look.spec.ts` 移入 `scripts/visual-evidence/`（不再落在 `testDir` 内）；`progress.test.ts` 按新政策保留（纯派生公式、零成本）并同步 `docs/工程规范.md`；`.gitignore` 补 `.codebuddy/` 与 `.workbuddy/`；补 5 时代浏览器证据；复跑并留存真实门禁输出。
- **A 极光底**：`<main>` 内挂载 `.skill-prototype-aurora` 与两个 blob，让玻璃的 `backdrop-filter` 有可模糊的光源（此前玻璃浮在纯色底上，模糊无从体现）。
- **B 技能页分组列表**：`SkillGrid` 由同构卡片网格改为语义三组，原料采集（采掘/伐木/钓鱼/生火）、加工制造（金工/制造/烹饪/草药学/炼金/农业）、辅助增益（敏捷/偷窃），组头带小标与满级计数。分组按语义而非 `kind` 派生：生火在内容里是 `craft` 但归采集，草药学是 `gather` 但归加工。
- **C 侧边条纹**：移除所有 >1px 的侧边条纹装饰。
- **D 四级字阶 + OKLCH + 对比度门禁**：字阶比值 ≥1.25；主题基础色转 OKLCH；`scripts/check-theme-contrast.mjs` 改为 OKLCH 转 linear sRGB 再转 gamma 后算 WCAG 亮度，已纳入 `npm run check`。
- **E 进度条 scaleX + ease-out**：状态条、技能卡、详情三处 `<progress>` 全部换成 `transform: scaleX()` 的 span（用 `--progress` 变量），动画只动 transform 与 opacity。
- **F 记录页去英雄数字**：时代卡改为紧凑列表（序号 + 正文），去掉 hero-metric 模板；「总游玩时长」的「未记录」与「不可派生」重复标记去重。
- **G 时代差异一眼看出 + 5 时代对比截图**：新增 `scripts/visual-evidence/era-evidence.spec.ts` 与 `playwright.evidence.config.ts`，向 IndexedDB 注入达到各时代阈值的存档，实测 5 档并各拍 420×600 与 360×480 两张，存于 `artifacts/era-*.png`（10 张）。此前只有 primitive 档在浏览器实测，其余 4 档仅代码审查。
- **修一处启动阻塞**：`src/themes/skill-prototype-v1.ts` 的 `validateSkillPrototypeV1Theme` 原只接受 hex，基础色转 OKLCH 后启动报「Invalid skill-loop theme color」；校验放宽为接受 hex 或 oklch。
- **文案**：`format.ts` 的破折号由 em dash（`—`）改为 en dash（`–`），按契约不用 em dash。
- **门禁**：`npm run check` 七项全绿；`npm run test:e2e` 1 passed（6.6s，端口 1424，本机 Chrome）。

## 1.0.0（2026-10-14，视觉大改造与派生成长层——三批交付第一批）

只动样式与派生展示层：零内容变更（content 仍 `6.0.0`/schema `3`）、零引擎改动、零新增存档状态。

- **玻璃/时代样式护栏**：新增玻璃面板基座、`--progress-track/--progress-fill`、强调色辉光等令牌；`backdrop-filter: blur()` 只用于顶栏与常驻状态条且 ≤8px；每屏辉光 ≤2 处、玻璃嵌套 ≤3 层。**字号回基线**：41 处 <0.75rem（约 9–10px）声明全部收敛为字阶令牌，正文 ≥12px、次要 ≥11px、绝对下限 11px；**进度条三处全部 ≥4px**（原 0.28–0.32rem）。
- **时代演进（零状态派生）**：新增 `src/domain/skill-loop/eras.ts`（`EraId` + `EraThreshold` + 纯函数 `getEraId`：原始 → 青铜（任一技能 ≥Lv7 或任一工具 ≥2）→ 工业（12 技能全 ≥Lv7）→ 精密（全 ≥Lv10）→ 合成（全 Lv12 且 5 条工具线满级））与 `src/themes/eras.ts`（5 套调色板 + 元数据）；外壳注入时代 CSS 变量并在 `<main>` 标 `data-era`；新增 `EraBanner`（尊重 `prefers-reduced-motion`）。新增 `scripts/check-theme-contrast.mjs`（`check:theme-contrast`，已纳入 `npm run check`）：5 套调色板正文/背景 ≥4.5:1、次要 ≥3:1。
- **界面缺陷修复**：「下一步」从独立卡并入状态条第二行（新 `NextStepLine`，删除 `NextStepCard`），固定顶区约 210px 压到约 110px，420×600 首屏技能卡从 4 行回到约 8 行；速率只在状态条显示，技能卡改决策信息（「尚需 X 分钟」「训练中 · 已运行 X」「N 项待解锁」）；修「周期 +0%」→「基准周期」、无燃料「可延长 小于 1 分钟」→「无木炭，无法延长」两处文案并修正 `formatShortDuration`/`formatPercent` 边界语义。
- **「记录」派生成长页**（新页签 `tab-records`，零新状态）：里程碑只用单调值（等级/时代/原型完成）或当前持有量，不用「曾经获得过」；物品图鉴列全部物品的「当前可获得的来源」与「当前持有」；统计页不可派生项（总游玩时长）显式标注「不可派生」；原型完成度为全应用唯一公式（技能维 + 工具维各半）。
- **门禁**：七项检查（prettier/tsc/eslint/architecture/content-library/content-json/theme-contrast）全绿；e2e 启动冒烟 + 批次截图 2 passed（本机 Chrome）；`artifacts/batch1/` 留存 420×600 × 6 与 360×480 × 1 截图。时代演进除 primitive 外的 4 档未在浏览器实测（无存档达到阈值），见 `PLAN.md` B1 验收清单。

## 1.0.0（2026-10-14，内容蓝图第一刀：T1→T2 双层切片）

按 `docs/内容蓝图-技能资源发展体系.md` 落地第一刀，零引擎改动（content `5.0.0` → `6.0.0`，schema 仍为 `3`）：

- **技能扩到 12 级**：12 个技能全部 Lv1–Lv12，XP 门槛按蓝图 5.2 指数曲线（B=180、r=1.26），顶门槛 8,107 XP；等级连续、Lv1=0、严格递增由校验保证。
- **T2 内容**：新增 3 件物品（`clay` / `fish-t2` / `meal-t2`）、16 项 T2+ 活动（10 craft / 6 gather）、12 条配方；金工与制造各新增一条工具线（`metalworking-tool` 3 级、`crafting-tool` 2 级）与 3 条工具升级。当前规模：12 技能 / 27 物品 / 49 活动 / 27 配方 / 5 工具 / 9 升级。
- **修 3 处死胡同**：`vial` 改由「黏土 ×2 → 瓶」制造产出（黏土为采掘 Lv1 副产）；两种工具坯接入金工新工具线；`gem` 接入「复合工具坯（宝石）」配方 + 制造工具 II，下游由 0 变为 2。
- **新增内容校验 C4–C7**（`scripts/validate-content-json.mjs`）：C4 输入可获得性（来源等级 ≤ 使用等级）、C5 下游 ≥2（消耗品按终端 sinks、通货要求商店出口）、C6 净增益环净产出 >0 且有外源、C7 工具升级材料不跨层（`tierOfLevel = ceil(level / 6)`）。复核方另做破坏性变异测试确认校验非空转。
- **存档兼容**：`5.0.0` → `6.0.0` 走同 schema 加法迁移，保留库存/经验/工具/当前活动/待确认回执/增益；**`5.0.0` 快照冻结在 `src/content/data-v5/` + `src/content/skill-prototype-v5.ts`**（不随 `data/` 漂移），迁移签名新增 `p5` 槽位。
- **门禁**：`npm run check`（含新增 C4–C7）与 e2e 启动冒烟通过。
- **已知偏差（待决策）**：既有 T1 活动未套用蓝图 5.3（采集 7000 ms / 7 XP），实测约 15 XP/分钟，比蓝图预期慢约 4 倍，且 T1→T2 速率跳升 5–7 倍；是否对齐见 `PLAN.md` 的「待决策（阻塞 S9）」。

## 1.0.0（2026-10-14，体验重构与数值反馈）

在七技能/12 技能交付之上重构信息架构与反馈密度（不改规则、不改存档，content 仍为 `5.0.0`/schema `3`）：

- **训练页两级导航**：首页改为 12 张技能卡（图标、等级、经验条、速率摘要、状态徽标），点入查看该技能的 2–4 项活动、工具提升与产出去向；原来平铺的 32 项活动不再同时出现。
- **常驻活动状态条**：当前活动压缩为标题栏下的一行（图标、名称、技能等级、周期、单行进度、产出/小时、距下一级 ETA、暂停/恢复），切到仓库/成长页仍可见；未开始时是紧凑的开始引导行。
- **数值层下沉 domain**：新增 `src/domain/skill-loop/rates.ts` 作为**唯一**时长与速率公式；`engine.ts` 的周期计算改为调用它，修掉了 UI 侧“只乘工具、忽略增益与敏捷加速”的漂移（`derivations.ts` 同步收敛）。新增只读类型 `ActivityRate`/`OfflinePlan`。
- **离线规划**：仓库页显示按库存燃料可覆盖的离线窗口、可完成周期、产出与预计经验。
- **仓库分组与搜索**：按 7 个类目分组，有存货的类目默认展开、可手动折叠，组头显示件数与库存状态；新增真实 `<input>` 搜索框（名称/类别/ID）。
- **成长页分组**：按工具线分组显示等级与库存对比，解锁项按技能分组并显示还差多少 XP。
- **图标与动效**：新增内联 SVG 图标集（12 技能 + 24 物品 + 7 类目，`currentColor` 描边、主题化、零许可风险，来源登记于 `src/themes/assets/SOURCES.md`）；新增周期产出飘字与技能升级高亮，全部带 `prefers-reduced-motion` 分支；离线结算不触发飘字（避免刷屏，回执已说明收益）。
- **可访问性**：装饰图标 `aria-hidden`，技能卡/活动按钮带可读名称，进度用 `<progress>`，搜索为真输入框。
- **门禁**：`npm run check` 与 1 项 e2e 启动冒烟通过（冒烟已同步新结构：12 张技能卡、状态条跨页签常驻、双窗口首屏可发现）。清理了 `CurrentActivityCard`/`SkillProgressList` 两个被取代的组件。
- 未做：真人试玩、Windows 实机托盘/保存/重启验收、CC0 位图素材接入（已评估并登记为后续美术升级路径）。

## 1.0.0（2026-10-14，内容平台化与 12 技能）

- **测试最小化**：删除全部 13 个单测文件（约 2300 行）；e2e 收缩为 1 项启动冒烟；`check` 去掉 vitest 并新增 `check:content-json`；`test` 脚本加 `--passWithNoTests`。工程规范确立“里程碑前不写测试、人工清单验收”政策（用户明确接受存档风险）。
- **JSON 内容平台（content `4.0.0`）**：内容迁移到 `src/content/data/*.json`（profile/skills/items/activities/recipes/tools/tool-upgrades），由 `load-prototype-content.ts` 组装并派生初始记录；新增 `scripts/validate-content-json.mjs` 门禁（结构 schema、交叉引用、配方唯一使用、XP 单调、工具升级路由、物品来源闭合、燃料配置）。参照 Melvor（gameData.json）与 IdleFantasy（assets/data 按域 JSON）的数据驱动模式。
- **技能扩充到 12 个（content `5.0.0`）**：新增草药学、炼金、农业、敏捷、偷窃。跨技能闭环：种子↔作物↔烹饪、草药→药水、敏捷印记→迅捷药水、偷窃硬币→商店→基础材料/种子/空瓶。
- **引擎最小扩展（3 处）**：`SkillLevel.effect.globalSpeedBonusPermille`（敏捷全局周期加速，取当前等级值）；`ConsumableEffect.xpMultiplierPermille`（经验增益，与加速至少其一，周期完成时 `max(1, round(xp × permille / 1000))`）；`purchase` 即时命令 + `shopOffers` 内容字段（硬币兑换，原子扣费，`UNKNOWN_OFFER` 错误码）。
- **存档兼容**：新增 `3.0.0`→current 与 `4.0.0`→current 同 schema 加法迁移（保留库存/经验/工具/当前活动/**待确认回执**/增益，仅新键零值）；迁移签名改为具名冻结定义表（p1–p4）。
- **代码规范化**：`SkillPrototypeApp.tsx` 从 1002 行拆为 `src/app/skill-prototype/` 组件族（9 个组件 + `format.ts`/`derivations.ts`，单文件 18–171 行），外壳降到 327 行；`warehouse-relations.ts` 的缺料计算收敛到 `derivations.ts` 单一出处；工程规范新增“函数封装与模块深度”节（单文件 ≤300 行、组件只渲染、派生逻辑单一出处）。
- **UI**：仓库页新增商店区（报价行、买不起禁用态、硬币用途/来源关系）；buff 状态条支持加速与经验两种效果。
- **验收**：`check`（含内容 JSON 校验）通过；e2e 启动冒烟通过；临时端到端验证硬币→商店购买与敏捷全局加速。未做真人长时间试玩与 Windows 实机验收。

## 1.0.0（2026-10-14，七技能体系与消耗端）

在 1.0.0 基线（清场与版本统一）之上交付完整技能体系：

- **七技能**：新增伐木、钓鱼、生火、烹饪、制造，与采掘/金工共七个；跨技能物料流闭合（原木→木炭→熟鱼；原木/硬木→木柄→伐木与钓具工具线）。content `3.0.0`/schema `3`，新技能零引擎改动（数据驱动复用 `advanceSkillLoop`）。
- **重复消费端**：熟鱼食用提供 30 分钟游戏时间、全部活动周期加速 15% 的单一增益槽（重复食用刷新，不叠乘）；周期时长在周期开始时定格。木炭作为离线燃料：离开超过 8 小时基础上限后每份延长 1 小时结算（封顶 8 份），在线推进不消耗，扣减计入回访回执。
- **存档兼容**：content `2.0.0`/schema `2` 与更早版本经显式加法迁移升级到 `3.0.0`/schema `3`，保留库存/经验/工具/当前活动，新键零值初始化，`buffs` 初始为空；不可解释 ID 拒绝并保留原文件。
- **UI**：仓库页新增增益/燃料状态条与食用入口；技能列表紧凑化为单行（七技能首屏可见前三行）；暖色暗色“像素工坊”设计 token（色彩/间距/圆角/阴影/动效）与 Noto Sans 字体栈落地，含 buff 倒计时呼吸动效与减少动态偏好支持。
- **门禁**：阶段末 `check` 13 个测试文件/80 项通过（新增消耗端、燃料、迁移、v3 内容不变量合同测试）；e2e 冒烟 4 项通过（新增“烤鱼并食用”跨技能旅程）。`scripts/project.ps1` 的 e2e 就绪检测修复为容忍 Vite 日志 ANSI 颜色码。
- Windows 实机托盘/保存/重启验收仍待正常可写入的桌面环境；未做真人试玩。

## 1.0.0（2026-10-13，新产品线基线）

用户决定清除历史包袱并统一版本，本版为技能放置新产品线起点；0.8《诸界救援局》产品线到此终止，其代码、文档与验收记录随 2026-10-22 历史归纳移出版本库（仅存于本地全量备份），不再维护、不再迁移旧档。

- **版本统一**：应用版本 0.8.0 → 1.0.0（`package.json`、`src-tauri/tauri.conf.json`、锁文件一致）；包名改为 `skill-idle`；交付产物改名为 `SkillIdle-v<version>.exe`（启动器仅保留 `启动游戏.cmd`）。Tauri identifier 保持 `org.zhujie.rescuebureau`：它决定默认存档根目录，冻结以避免孤立玩家进度。
- **旧玩法移除**：删除 0.8 远征/驻地/故事玩法代码、对应 content（expedition/story/base-game/outpost 各版本）、旧主题、旧 UI、旧存档 codec 与迁移及其测试；`GameRuntime` 重构为完全泛型，只保留 `createConfiguredGameRuntime`；运行时边界测试改用自包含桩 domain 重写，契约覆盖不变。删除前完成全仓引用审计（活入口闭包逐文件核对）。
- **旧文档移除**：删除 `docs/历史资料/`、旧故事设定与索引、旧规划方案、`story-library/` 及 0.8 交接提示词；`PLAN.md`、`README.md`、`docs/架构说明.md` 等重写为“现状+计划”。
- **门禁与测试改革**：新增 `npm run check:quick`（格式+类型+Lint）作为日常门禁；单测收缩为核心合同集（skill-loop 规则/路线/回执、运行时队列与屏障、存档 codec 与迁移、平台、主题、仓库投影）；e2e 收缩为冒烟集；全套门禁只在阶段末运行。叙事库检查脚本替换为精简的内容资料库检查（`check:content-docs`）。
- 运行时现状：profile `skill-prototype-v1`、content `2.0.0`、schema `2`；采掘/金工两技能两档可玩，离线回执已实现；Windows 桌面实机交互以阶段末验收记录为准。
