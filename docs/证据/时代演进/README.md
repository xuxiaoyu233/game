# 时代演进证据（B2 美术与色彩批，2026-10-16）

14 张截图：7 个时代 × 2 个小窗尺寸（420×600、360×480）。每张由 `scripts/visual-evidence/era-evidence.spec.ts` 产出：向 IndexedDB 注入达到该时代阈值的存档，reload 后断言 `<main data-era>`，再截取首屏（非全页）。本目录 10 张旧图（5 时代）已重生为 7 时代 × 2 窗口共 14 张。

## 截图前的等待条件（2026-10-16 修正，曾产出无效图）

早先这批图里出现过「主体空白」的无效截图：只有顶栏与状态卡，页签与技能列表不在画面里。两个根因，都已修复：

1. **等待条件不足（竞态）**：`data-era` 在首帧就写入，而技能列表晚一个渲染周期。原来只等 `data-era` 断言就截图，偶尔抓到列表还没绘制的帧。现在截图前依次等待：12 个 `[data-testid^="skill-card-"]` 全部存在且首个可见、页签 `tab-training` 可见、`document.fonts.ready`，以及每次 `setViewportSize` 之后两个 `requestAnimationFrame`（一个给布局、一个给极光与进度条上色）。
2. **层叠错误（真 bug，已修 CSS）**：B2 引入的 `.skill-prototype-scene` 是 `position: fixed; z-index: 0`，画在了静态流内内容（页签、技能面板）之上；只有两片带 `backdrop-filter` 的玻璃面板因为自带层叠上下文而幸免。也就是说线上 App 的技能列表曾被背景层盖住，e2e 冒烟只查 DOM 所以没发现。修复：`skill-prototype.css` 给 header / status-wrap / tabs / tab-panel 显式 `position: relative; z-index: 1`，把内容层抬到环境层之上。本目录 14 张图均为修复后重生，并已逐张人工核对「主体非空」（可见页签 4 枚、技能分组与技能行）。

| 文件                         | 时代 | 窗口    |
| ---------------------------- | ---- | ------- |
| `era-primitive-420x600.png`  | 原始 | 420×600 |
| `era-primitive-360x480.png`  | 原始 | 360×480 |
| `era-bronze-420x600.png`     | 青铜 | 420×600 |
| `era-bronze-360x480.png`     | 青铜 | 360×480 |
| `era-verdant-420x600.png`    | 青翠 | 420×600 |
| `era-verdant-360x480.png`    | 青翠 | 360×480 |
| `era-industrial-420x600.png` | 工业 | 420×600 |
| `era-industrial-360x480.png` | 工业 | 360×480 |
| `era-precision-420x600.png`  | 精密 | 420×600 |
| `era-precision-360x480.png`  | 精密 | 360×480 |
| `era-aurora-420x600.png`     | 极光 | 420×600 |
| `era-aurora-360x480.png`     | 极光 | 360×480 |
| `era-synthetic-420x600.png`  | 科技 | 420×600 |
| `era-synthetic-360x480.png`  | 科技 | 360×480 |

同目录的 [`评分-美术与色彩.md`](评分-美术与色彩.md) 是 B2 的 critique 记录：六维（层级/间距节奏/可读性/色彩策略/动效/反 slop）前后评分、每条的证据（文件行号、令牌值、截图位置），以及六条禁令的 grep 自查表与已知缺口。

复跑方式（本机 Chrome + 空闲端口，证据目录被 git 跟踪，可复现可 review）：

```powershell
$env:PROJECT_E2E_BROWSER_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
$env:PROJECT_E2E_PORT="1424"
npx playwright test --config playwright.evidence.config.ts
```

横向对比要点：时代切换同时改变场景位图、极光色相、面板底色相与强调色；七档形成连续色温梯度——原始/青铜为相邻暖色时代（差异在场景图细节与强调色相），青翠（春绿）落在青铜与工业之间，工业蓝灰、精密青、极光（品红/靛）落在精密与科技之间、科技紫为尾部；相邻档（原始↔青铜、青翠↔工业、精密↔极光、极光↔科技）差异最小，建议人工对比时重点看这两两配对。
