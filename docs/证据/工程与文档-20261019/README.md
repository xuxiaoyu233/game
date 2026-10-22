# 工程与文档细化（2026-10-19）

范围：只做工程与文档体系，不新增机械内容、不改 UI 视觉与机械数值。主工程 `next/civ-idle`，分支 `codex/p1-first-tier`，HEAD `98c2699af4bccbae4098cd300df92a8e6920c83e`。

## 结果

| 项 | 结果 |
| --- | --- |
| 测试 | 38 项全过（原 4 个文件改用共享加载器，断言不变；新增迁移 5、队列 4、目标 5、库存 3） |
| 类型 | `tsc --noEmit` 0 错误；命令/建筑/slot 角色/era 用稳定联合类型与守卫收窄 |
| 性能 | 同规模快照下，顶栏一帧的库存+上下文计算 0.29ms → 0.045ms（约 6.4×），六资源结果逐项相等 |
| 文档 | 架构说明、规划入口、首版规格、两份采用合同、C1-R 复核已按当前事实更新或追加后续状态；新增证据总索引 |
| 回归 | 浏览器主线 19/19、迁移 4/4、生产构建通过；未改机械值与存档格式 |

## 结构变化

- `shared/sandbox/camp-migration.ts`（新）：`classifyCampSaveVersion` + `applyC1ProfileMigration` + `applyD1CProfileMigration`，纯字段迁移；`camp-survival` 只保留物资发放与缓存清理。
- `shared/sandbox/camp-queue.ts`（新）：串行队列，失败不阻断后续；`camp-commands` 改用它，命令签名与保存失败文案不变。
- `shared/sandbox/camp-stock.ts`（新）：一次遍历聚合六资源三口径；`campResourceStockView` 与新的 `campStockSnapshot` 共用。
- `shared/sandbox/camp-goal-plan.ts`（新）：目标顺序与文案的纯决策，输入为事实（是否有设施、能否建设、是否短缺等）；`camp-goals` 只做数据装配与地块解析。
- `tests/_load.mjs`（新）：递归加载 `shared/**` 的 TypeScript 模块；遇到 `src/scripts/**` 直接报错，避免测试拉入应用壳层。

## 类型收紧

- 新增 `CampSlotRole` 与 `isCampEra`；`allowedCampBuilding` 的 role 参数、`CampCommand` 的 `building`/`resource` 改为 `CampBuilding`/`GatherResource`。
- `campGrowthContext` 的 era 不再用 `as`；`campRankOf`、存档校验的 2 星许可映射改为守卫/共享表；删除 `BuildingLogic` 中未使用的 `campOutputModifier` 导入。
- 命令内部的 `isCampBuilding`/`isGatherResource` 运行时校验保留，作为非法字符串的边界防线。

## 性能基准

`perf.json`：2025 地块、6 建筑、1 条运输；9 轮 × 20 次取中位数。

| 路径 | 每帧耗时 |
| --- | --- |
| 旧：6× `campResourceStockView` + 2× `campGrowthContext` + 2× `campAvailable` | 0.29 ms |
| 新：1× `campStockSnapshot` + 1× `campGrowthContext` | 0.045 ms |

六资源的 `available`/`inConstruction`/`inTransit` 与旧实现逐项相等（`mismatches: []`）。未做跨 tick 缓存，避免同一 tick 内晋升后读到旧值。

## 门禁

`next/civ-idle/package.json` 新增：

- `npm run test`：`node --test tests/*.mjs`
- `npm run check:quick`：`prepare-atlases` → `tsc` → Biome（error 级，`src/scripts` + `shared`）→ `node --test`

测试文件不纳入 Biome 门禁（旧测试文件的风格差异不阻塞合同）。

## 文档更新

- `docs/架构说明.md`：日期与状态落点改为 schema5/`d1-c-1`（含 era、sandboxRank），模块表补 camp-goals/camp-migration/camp-stock/camp-queue/offline-summary/tests 加载器，删除“promote/时代/星级留待后续”的过期表述。
- `docs/规划/README.md`：D1-C 已交、下一批 C2；补本批证据入口。
- `docs/规划/发展沙盘首版规格.md`：修正“尚未实现/工坊未做/8h 留 C/扩地待定”等 8 处。
- `docs/规划/D1-C工坊成长采用合同.md`、`C1食物与人口采用值.md`：文首追加执行/后续状态，采用值不改。
- `docs/证据/发展沙盘/C1-R/复核-20261019.md`：追加“后续状态：F1–F4 已修”，原结论保留。
- `docs/证据/README.md`（新）：阶段索引、结论、未测项总览。

## 未测项

- 真人试玩、长期平衡、Windows 托盘/置顶、屏幕阅读器全项。
- 性能只测同规模快照下的计算耗时，不含 Pixi 渲染与浏览器帧率。
- 迁移的浏览器级验证仍沿用 D1-C 的 4 项；本批新增的迁移合同是纯函数级，不重复端到端。

## 复跑

```powershell
cd D:\小游戏\next\civ-idle
node --test tests/*.mjs
node_modules\typescript\bin\tsc --noEmit -p tsconfig.json
node_modules\@biomejs\biome\bin\biome check .\src\scripts\ .\shared\ --diagnostic-level=error --config-path=./
```

浏览器主线与迁移脚本在 `.cache/d1c-verify.mjs`（`--stage=all` / `--stage=migrate`），原始日志在 `.cache/d1c-regress-*.log`。
