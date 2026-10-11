# 项目开发约定

这是本地优先的桌面放置游戏。遵循 [工程规范](docs/工程规范.md) 和已有原子能力合同。

- 游戏规则只进入 `src/domain`；规则禁止访问时钟、随机数、DOM、网络、磁盘或 React。
- 机械数值进入 `src/content`；主题文字、配色和背景进入 `src/themes`，不进入游戏存档。
- UI 通过 `GameRuntime.dispatch` 发命令，禁止直接修改游戏状态、直接调用规则后保存。
- 单一运行时、单一动作队列、单一保存队列。保留离线补算、导入、关闭、失败恢复的屏障语义。
- 存档格式或机械内容不兼容时必须显式迁移并加验证；不得静默重置、覆盖坏档或沿用旧版本产量补算。
- 非组件源码文件使用 `kebab-case.ts`，React 组件使用 `PascalCase.tsx`。类型 PascalCase，变量/函数 camelCase，模块常量 UPPER_SNAKE_CASE，内容 ID 用稳定英文 kebab-case。
- 保持严格 TypeScript，不使用 `any` 绕过错误，不关闭严格模式。Promise 必须 await、返回或显式捕获失败。
- 新依赖锁定版本、更新锁文件。禁止提交存档、缓存、依赖、编译产物、密钥。
- 提交前运行 `./scripts/project.ps1 check`；影响 UI 运行 `e2e`；影响 Rust/桌面运行 `native-check` 和 `native-build`。
- 文档中的“已实现”“已验证”“待验收”必须与实际结果对应。不得把浏览器验证写成 Windows 托盘/置顶验收。

不要自行发布 Sites、启用账号云同步、自动开机运行或推送 Git；这些都不属于当前工程搭建。
