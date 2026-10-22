# 路线细化与素材准备交付

日期：2026-10-18。范围为内容/路线细化及素材落盘，没有实施 D1 游戏规则或修改加载、生产、存档链。工作树分支 `codex/p1-first-tier`，HEAD `98c2699af4bccbae4098cd300df92a8e6920c83e` 未变，之前未提交内容保留。

## 实际交付

- 35 张 Kenney Hexagon Pack PNG（含 6 张后续扩展 reserve），只选择独立物体和无固定建筑的地形；未将商业文明系列或 CivIdle 原版贴图拷入。
- 10 张 Heroicons 操作 SVG：建设、升级、研究、扩地、暂停、恢复、确认、取消、锁定、警告。仅复制选中图标，无包依赖。
- 新增 Game-icons 的 Delapouite/wood-beam SVG，补正板材语义；粮食/木材/石材引用原 A0 文件，未修改历史资产和计数。
- `next/civ-idle/src/scripts/art/sandbox-art-catalog.json` 登记 49 项引用（35 PNG＋10 操作＋四资源），源文件、数字锚点、尺寸、SHA-256、预期图集帧、状态、25 组建筑/时代/等级组合和缺项。
- 原图 PNG 放 `src/textures/sandbox/`，操作图标放 `public/icons/actions/`；`assets-source/SOURCES.md` 与 licenses 保存出处/许可。ZIP 及未选文件只在忽略缓存，不作为交付依赖。

## 可看结果与真实边界

[素材组合稿 HTML](index.html) 和[总览 PNG](素材组合总览.png) 用于审阅比例与组件选择，是文档中的素材联系表，不是游戏运行截图，也不是第三个游戏入口。HTML 的图标使用内嵌副本以支持直接从本地文件打开；游戏接入应使用真实 public 文件和 BASE_URL。

组合按开拓 Lv1/Lv2、工坊 Lv1/Lv2/Lv3 展示，未展示规则不允许的开拓 Lv3。所有组合均为 prototype。农田作物轮廓/田垄、专用灌溉渠、木工坊专用加工部件、动画、正式时代外观与敌人图像仍须完善；水井只是灌溉外观原型，不新增水资源规则。六角图为 120×140，D1 须在原 pointy Grid 验证等比例边缘、底部排序与逻辑点击，不因素材换坐标。

`vite.config.ts` 尚未添加 sandbox 图集生产器，`main.tsx` 尚未装载，TileVisual 尚未绑定状态。因此 PNG 的 atlas/frame 是目标合同，不是已存在的纹理。不要把 25 组图稿写成游戏已经有五建筑/两个时代。

## 来源

- [Kenney 官方包](https://kenney.nl/assets/hexagon-pack) 1.0，CC0；ZIP SHA-256 为 `e4847bf2142e1d808b59bd3039579d21dcce3a871370659598e9cb9ffad1c92c`。
- [Heroicons](https://github.com/tailwindlabs/heroicons) v2.2.0，固定提交 `0435d4ca364a608cc75e2f8683d374e55abbae26`，MIT 原文保留。
- [Wood beam](https://game-icons.net/1x1/delapouite/wood-beam.html)，Delapouite，CC BY 3.0。未来制作信息须更新新增署名，不能改写 A0 历史汇总冒充当时已采用。
- Mindustry 仅作波次模型研究，固定 `17012d61d9e4c3cbd9820d87e81c24495486ac53`，下载的 SpawnGroup.java/Waves.java 保留在忽略缓存，没有进入生产代码或素材包。

## 本轮集中检查

1. 49 项目标文件 SHA-256 与台账一致，PNG 复制前后字节一致；SVG 检查未发现脚本/事件/外链。
2. 25 组组合引用存在。隔离 Edge 无头浏览器打开本地素材文档，117 个图片实例全部解码，0 外部请求、0 pageerror、0 请求失败；1340px 宽画布没有横向溢出。
3. 已人工查看导出的总览，核对五类对象可区分、两时代/等级有组件差异、图标可读。图稿不是正式审美批准或真实游戏交互验收。
4. 不启动游戏，不读玩家数据库；没有运行游戏构建/核心测试/Windows 原生验证。仅做素材交付所需检查，不新增常驻测试套件。

结构化结果：[preparation-summary.json](preparation-summary.json)、[asset-check.json](asset-check.json)。临时下载/挑选/截图脚本在 `.cache/`；项目交付以已选文件、台账、清单、许可和本证据为准。阶段状态只回填根 PLAN。
