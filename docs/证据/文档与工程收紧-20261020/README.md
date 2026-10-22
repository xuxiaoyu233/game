# 全局梳理与收紧（文档 + 工程 + 素材）

日期：2026-10-20。执行方：CodeBuddy。范围：对现有文档、前端代码、CSS 与素材做一次盘点与收敛，**不改规则、数值、命令、存档**。本页记录“查到了什么、改了什么、哪些需要人决定”。

## 1. 梳理结果（事实）

**文档**：`docs/` 下 75 份 Markdown，分六类（规划 13、交接 9、设计 12、内容资料库 8、证据 44、历史资料 5），但**没有总入口**；`证据/README` 的表格停在 D1-C，最近三批（放置主循环、UI 打磨、UI 完善 2）没有入索引；`交接/README` 与 `规划/README` 仍把已撤回的“长期组合规格 + V2 交接”写成“当前入口”；`设计/README` 仍称 ui-v3 为“最新视觉入口”。

**代码**：
- `camp-navigation.ts` 有一套零引用的面板模式状态机（`CampPanelMode`/`useCampPanelMode`/`setCampPanelMode`），而 `CampTilePage` 用 `body.dataset.panel` 自己实现同一件事。
- `CampHud.tsx` 有一个未使用的 `publicArtUrl` import 与一处恒真条件（外层已判空）。
- `RESOURCE_DISPLAY` 与 `ACTIVITY_ICON_KEYS` 只在本文件用，属于过度导出。
- CSS 存在整块被更高优先级规则取代的旧样式（旧深青 tab、重复的资源行、重复的 44px 声明、零命中的 `.camp-skill-grid`/`.camp-activity`/`.camp-building-stock`/`.camp-upgrade-choice`/`.camp-assistance`/`.camp-activity-actions`）。
- `.camp-skill-card` 仍被民生页与设置页当通用纸卡使用（7 处），**不能整块删**，只删其已死的 3 条 `header` 子规则。

**素材**：
- `public/icons` 27 个 SVG，catalog 引用 20 个；未引用的 7 个（anvil/campfire/hammer-drop/metal-bar/mining/ore/wood-axe）只被 `art-preview` 使用，保留。
- `src/textures/sandbox` 51 张 PNG 全部在 catalog；其中 `town-landscape.png`（3.05MB）已标 `reserved`，却仍被图集插件全量打包。
- 32 张 1–3KB 的早期原型小图只被 catalog 的 `buildingViews` 引用，运行时代码零读取；体积可忽略，保留但**不属于当前绘制路径**。

## 2. 已执行的处理

| 类别 | 动作 | 结果 |
| --- | --- | --- |
| 文档入口 | 新增 [`docs/README.md`](../../README.md)：按问题索引 + 三类文档效力（当前合同 / 交付证据 / 已撤回） | 75 份文档有唯一导览页 |
| 证据索引 | `docs/证据/README.md` 补 V1、V2、Sites、放置主循环、UI 打磨、UI 完善 2 六行，并新增“当前主线”与未测项 | 索引与最近三批对齐 |
| 撤回标注 | `docs/交接/README.md`、`docs/规划/README.md`、`docs/设计/README.md` 把长期组合规格、V2 交接、ui-v3 明确标为“已撤回/来源参考”，当前顺序指向根 PLAN | 后来者不会按撤回稿组织任务 |
| 素材册 | `docs/内容资料库/素材与界面组件.md` 更新条目计数（81＝51+30）、补 14 个技能/作业图标与图集排除说明 | 与 catalog 实际一致 |
| 死代码 | 删除零引用的面板模式状态机、未用 import、恒真条件 | 代码少一条并行机制 |
| 死样式 | 删除旧深青 tab、零命中与重复的 6 组选择器块（`.camp-skill-grid`、`.camp-activity`、`.camp-building-stock`、`.camp-upgrade-choice`、`.camp-assistance`、`.camp-activity-actions`） | 两文件减少约 100 行 |
| 图集 | `town-landscape.png`（3.05MB，已标 reserved）从 `src/textures/sandbox/` 移到 `src/textures/reserved/`，并在 `prepare-atlases.mjs` 保留排除规则；catalog 条目改为指向保留目录、去掉 `frame`/`atlas` 字段 | sandbox 图集 8.21MB → **5.35MB**（-35%）；源文件与 catalog 记录都在，两条打包路径（`prepare-atlases.mjs` 与 `vite.config` 的 Spritesmith）都不再包含它 |

## 3. 验证

- `pnpm run check:quick`、`pnpm run build` 通过；核心合同 42/42（Node 20 + 垫片）。
- 图集裁剪后实机走查（两次，含最终 5.35MB 构建）：新档 → 小镇页，背景、HQ 精灵、地点胶囊、相机钮正常；无 pageerror、无 4xx 请求（`next/civ-idle/.cache/v5/final-atlas-535.png`）。
- 注意：`dist` 需要先清理再构建才能反映新图集（旧产物会残留旧 hash 文件）；`src/images/textures_sandbox.png` 应为 5.4MB 左右。
- 未做视觉回归全量对比：删除的 CSS 均为零命中或被完全覆盖的块，技能页/民生页/设置页均已看过当前截图。

## 4. 留给下一步（需决策）

1. **32 张早期原型小图**（terrain/farm-plot/barn/shed/hq-house/tree/rock 等）仍被 catalog 的 `buildingViews` 段落引用、代码零读取。要么明确它们是“分段建设预留”，要么整段下架（需同时改 catalog 约 35 条与美术规格）。这是唯一还会误导新读者的素材层遗留。
2. **art-preview 的 7 个图标**：如果保留 art-preview 入口，它们应保留；若入口下线，这 7 个可一起归档。
3. **`docs/规划` 与 `docs/证据/历史` 的存量**：本轮只做标注不删减。若要真正“瘦身”，需要一次明确的归档动作（移动到 `docs/历史资料` 并保留 git 历史），不在本轮范围。
4. **CSS 边界**：`sandbox-tokens` 与 `camp-shell` 仍有同属性两处声明（几何/皮肤的职责边界未写死）。建议在适配规格里补一条规则，而不是继续逐块删。

## 5. 复验

```
pnpm run check:quick
pnpm run build                                   # 图集应为 5.3MB 左右
node .cache/run-contracts.mjs tests/*.mjs        # 42/42
```

图集对比：`dist/assets/textures_sandbox-*.png` 8.21MB → 5.35MB。
