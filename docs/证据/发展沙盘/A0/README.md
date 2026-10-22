# A0 证据：已有美术接入只读预览

日期：2026-10-17。执行者：CodeBuddy。范围：仅 PLAN 的 A0；未进入 D0-R/D1，未推送、未发布。**A0 是只读外观预览，不启动游戏、不读写玩家存档，不代表 D0-R 数据保护已完成，也不代表动态建设已实现。**

后续核对：见 [Codex 复核与方向对齐](复核-20261017.md)。下文保留交付时报告；其中两处展示不一致已由 D0-R 附带更正（2026-10-17）：① 预览资源面板删除“矿石”行，只保留粮食/木材/石材/板材四行（ore 图标仍留在素材清单 `art-manifest.ts` 作为候选）；② 署名面板 ore 的作者只记 Faithtoken，作者汇总改为 Lorc 7、Delapouite 1、John Redman 1、Faithtoken 1（原报告“Lorc（8 枚）”为交付时笔误，`SOURCES.md` 逐图台账中 ore 始终为 Faithtoken，无误）。更正证据见 [D0-R 报告](../D0-R/README.md)；本文件的原始截图和日志不改写。

## 结论

A0 退出条件全部满足：`next/civ-idle/` 中已有可打开、可构建的只读美术预览，主景/纹理/图标/配色实际接线并有完整来源台账；dev 与生产 preview 双通道验证通过；预览链不触碰游戏启动、ticker 与玩家数据。**A0 状态建议更新为已交付、待用户验收。**

## 基线与工作区

- 执行前：分支 `codex/p1-first-tier`，HEAD `98c2699af4bccbae4098cd300df92a8e6920c83e`；工作区前轮未提交改动全部保留（未执行 reset/clean/恢复）。
- 执行后：分支/HEAD 不变；根仓库被跟踪文件未新增改动（`PLAN.md` 仅按证据更新 A0 状态）；`next/profectus/**`、`src/themes/**`、`src/app/**` 未被修改。
- 旧素材未动验证：复制后复算源文件 SHA-256，与复制前记录逐一致（主图 `3eb3d0c27124d2ec…`、primitive `b522e1ed79392bc5…`、bronze `6bf9201bba37b3ec…`、wheat `3da43b7e3abc87df…`、rock `f28bc9255e9974b0…`）。
- Node：任务要求 Node 24；本机 PATH 仅 v20.19.4 且 `install_binary` 连续 EPERM 失败，改用官方 `node-v24.14.0-win-x64.zip` 解压到 `.cache/toolchain/`（忽略目录），本轮 tsc/vite build/preview/走查均在该 Node 24.14.0 下执行。

## 素材接线（实际复制，非只列清单）

台账：`next/civ-idle/public/art/SOURCES.md`（源/目标路径、尺寸、通道、SHA-256、来源、处理）。复制脚本 `.cache/a0-copy-assets.mjs` 带 SHA-256 校验，13 个文件全部一致：

| 素材         | 源                                                                                                                | 目标（新工程局部目录）                | 尺寸/通道    | 用途           |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------ | -------------- |
| 夜间工坊主景 | `next/profectus/public/art/midnight-workshop-v1.png`                                                              | `public/art/midnight-workshop-v1.png` | 2024×777 RGB | 主视图区全景   |
| 开拓纹理     | `src/themes/assets/eras/primitive.jpg`                                                                            | `public/art/eras/primitive.jpg`       | 768×1024 RGB | 低对比时代氛围 |
| 工坊纹理     | `src/themes/assets/eras/bronze.jpg`                                                                               | `public/art/eras/bronze.jpg`          | 768×1024 RGB | 低对比时代氛围 |
| 图标 ×10     | `next/profectus/public/icons/{wheat,wood-pile,rock,metal-bar,ore,mining,wood-axe,hammer-drop,anvil,campfire}.svg` | `public/icons/*.svg`                  | SVG 单色路径 | 资源/操作面板  |

- 图标许可：game-icons.net，CC BY 3.0；作者 Lorc（8 枚）、Delapouite（wood-pile）、John Redman（rock）、Faithtoken（ore）——署名在预览页「制作信息与署名」面板和 SOURCES.md 中均可访问。其余 8 个图标本轮不采用、不复制。
- 配色：只提取 token 值（深蓝 `#0e151a`、石板 `#162128`、暖金 `#d8b47b`、浅绿 `#94c6b0` 等），写入预览局部样式 `.art-preview` 作用域，不导入旧 foundation.css 及其字体依赖；系统中文字体（Microsoft YaHei/PingFang SC）。
- 不采用（记录在案）：`character.jpg`（人物）、`corner-filigree.png`（RGB 黑底无透明通道）、`mini/era-*.jpg`（待风格核对）。

## 预览入口与隔离性

- 入口：`art-preview.html` + `src/scripts/art-preview.tsx` + `src/scripts/art/ArtPreviewApp.tsx` + `src/scripts/art/art-preview.css`；Vite `build.rollupOptions.input` 多入口，游戏 `index.html` 保留。
- 隔离验证（走查实测）：
  - 预览页 `indexedDB.databases()` = `[]`——未创建/读取任何玩家库；
  - 不导入 `main/Bootstrap/Global/ClientUpdate`，无 GameTicker；页面无 `pageerror`；
  - dev 26 个请求、preview 16 个请求，**外部请求 0**，失败/4xx-5xx 0；
  - 资源面板 5 行全部显示 `—` 并标注"非实际库存"；时代切换（开拓/工坊）角标为"开拓 · 外观预览 / 工坊 · 外观预览"，切换仅改低对比纹理叠加（primitive→bronze，实测 URL 变化）；操作按钮点击只弹「为外观预览：未接入游戏」提示；
  - 游戏入口 `index.html` 仍返回 200 且 canvas 正常加载（保留验证）。

## 主景展示与可读性

- 主图以 `background-size: cover` + `background-position: center 42%` 展示，保持 2024:777 实际比例不拉伸；实测解码尺寸 2024×777（dev 与 preview 均验证）。
- 深蓝底 + 暖金强调 + 浅绿辅助的石木质感面板；图标以 CSS mask + `currentColor` 着色为暖金。
- 960×720：主景充分展示（工坊、锻炉、木堆、暖灯清晰可见），右侧资源/操作/缺项三面板可读（截图 `dev-960x720.png`、`preview-960x720.png`）。
- 420×600：单列堆叠，主景保留中央工坊带，文字可读，横向溢出 0px（截图 `dev-420x600.png`、`preview-420x600.png`）。
- 全部截图为**只读外观预览**，非玩法联动、非正式美术验收。

## 构建与走查（Node 24.14.0，阶段末集中一次）

| 检查                           | 结果                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit`                 | 0 错误                                                                                                                                                     |
| `vite build`                   | 成功；产出 `dist/art-preview.html` + 独立 chunk `artPreview-*.js`（10.94 kB，与游戏 4072 kB chunk 分离）；游戏 `index.html` 保留；主图/纹理/图标全部进产物 |
| dev 走查（960×720 + 420×600）  | 全部通过（见上）                                                                                                                                           |
| 生产 preview 走查（4174 端口） | 全部通过（见上）                                                                                                                                           |
| 外部请求 / 玩家数据            | 0 外部请求；indexedDB 为空                                                                                                                                 |
| 旧素材完整性                   | 源文件 SHA-256 复算一致                                                                                                                                    |

原始日志：`.cache/a0-build.log`、`.cache/a0-walkthrough.mjs`、`.cache/a0-preview-check.mjs` 及本目录 `walkthrough-log.txt`、`preview-log.txt`。

## 纯展示素材清单（供 D1/D2 复用）

`next/civ-idle/src/scripts/art/art-manifest.ts`：`ART_ENTRIES` 记录 13 条素材的 key / URL（`BASE_URL` 相对路径）/ 原尺寸 / 通道 / 锚点 / 用途 / 状态 / 来源；`ART_GAPS` 记录 5 项缺项。清单只含展示元数据——不存库存、解锁或时代进度，不派生产量/成本，不写入存档，不构成第二套规则。

## 缺项与补图提示词（本轮不生图）

| 缺项                              | 阶段 | 现状                                                       |
| --------------------------------- | ---- | ---------------------------------------------------------- |
| 独立农田（基础 + 扩建/灌溉部件）  | D1   | 无合格独立资产；不能从全景裁切冒充，不把整图热点当动态建设 |
| 独立木工坊（基础 + 升级部件）     | D1   | 全景工坊为插画内容，不与建设绑定                           |
| 不带固定建筑的建设区地形          | D1   | 未生成；缺位期间建设区用明确占位                           |
| 伐木场/采石场/仓库与两时代外观    | D2   | D2 资产组合小样阶段交付                                    |
| 道路/田垄/水渠/货架/灯具/时代装饰 | D2   | 同上                                                       |

可直接使用的补图提示词（风格基准 = 本主图）：见 `docs/设计/沙盘美术接入规格.md`「可复用的补图提示词」（农田小样、农田升级部件、木工坊小样三条已成型）；建设区空地按同风格补一条：

> 以附图夜间矿场与木工坊为唯一美术风格参考，制作同一放置沙盘的建设区空地地形：固定斜俯视相机与光向，深蓝夜色、自然石木材质、少量暖色灯火；画面只包含一小块平整的可建设地面（泥土与石板相接、边缘略高），不含建筑、人物、文字、UI、山体或完整景观。透明背景 PNG，四周边界清楚可拼贴，整件物体不裁切，四周留少量安全边距。请交单块地形，避免把多个地块连在同一张图里。

## 未验证项

1. 未在物理断网环境验证（本轮无外部请求已等效证明无外部依赖；断网复测可留给 D1）。
2. 未做真人审美走查（截图供用户验收）。
3. 未验证更窄窗口（<420px）与高 DPI 缩放表现；未验证 Firefox/Chromium 非 Edge 内核。
4. 预览页未接键盘可达性细节（焦点顺序可用但未专项走查）。
5. Node 24 为本地解压工具链（`.cache/toolchain/`），未写入仓库配置；`install_binary` 的 EPERM 失败原因未深究（不影响交付）。

## 边界声明

- A0 未修改保存规则、机械内容、D0-R 状态或任何游戏入口行为；`index.html` 游戏入口保持原样。
- 预览中的固定建筑是插画内容，不与玩家建设绑定；"外观预览"标签在所有时代切换与资源展示处明示。
- A0 不代表 D0-R 已完成；实际游戏仍须完成数据保护修复并经复核验收后方可进入 D1。
