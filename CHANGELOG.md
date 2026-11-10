# Changelog

All notable changes to the "Antigravity History" extension will be documented in this file.

## [0.3.5] - 2026-11-10

### Fixed & Robustness
- **Webview 多脚本时序竞态彻底修复与产物单文件化编译**：
  - 源码保持 `src/webview/assets/js/` 目录下的清晰微模块拆分（`i18n`, `utils`, `state`, `render-cards`, `batch-manager`, `view-controller`, `main`）。
  - 在 `esbuild.js` 构建流水线中引入聚合编译机制，按确定依赖拓扑顺序输出单一生产级脚本 `dist/webview/panel.js`，彻底消除 VS Code 虚拟协议跨进程读取多个外链脚本引发的未就绪竞态与选项卡切换受阻问题。
  - 在 `html-provider.ts` 中恢复为单一 `<script nonce src="panel.js"></script>` 安全注入模式，加载性能提升数倍并强化 CSP 兼容性。
- **前端启动初始化与全局异常兜底加固**：
  - 主控制器 `main.js` 引入 `isInitialized` 防重入机制，移除脆弱的条件挂起，保证 DOM 就绪后立即完成初始化。
  - 首屏无条件即刻调用 `showLoading()` 呈现旋转动画并主动向宿主请求数据，彻底消除黑屏等待感。
  - 挂载全局 `window.onerror` 异常拦截器，发生未知异常时在界面友好呈现错误详情与重试按钮，杜绝静默失败。
  - 方案计划选项卡切换 (`switchTab`) 增加数据主动补偿拉取机制，在数据尚未到达时自动请求 `refreshPlans`，确保无缝切换。

### Refactored & Code Reuse (DRY)
- **双面板公共控制层深度解耦与通用视图控制器抽离**：
  - 新建独立公共视图控制器模块 `src/webview/assets/js/view-controller.js`，抽离全局单例 `window.AG_ViewController`。
  - 统一刷新中枢机制 (`handleRefresh`)：收敛按钮旋转动画、`Loading` 遮罩与单通道 IPC 发送，前后端统一由单点 `refresh` 指令并行并发完成会话对齐与计划扫描，消除链路分化与多余消息。
  - 统一展开与折叠调度 (`expandAll`、`collapseAll`、`toggleGroup`)：集中管理 `collapsedGroups` 状态机，无论在对话历史还是方案计划下，均可无缝执行单项分组展开/收缩与全局一键展开/折叠。
  - 统一分组模式切换 (`setGroupBy`) 与搜索输入防抖处理 (`handleSearchInput`)：规范化维护日期/工作区按钮高亮类名，120ms 防抖更新搜索词并触发视图重绘。
  - 统一激活视图路由分发 (`renderCurrentView`) 与面板切换 (`switchTab`)，将双面板业务渲染器转为纯粹的无状态“视图插件”。
- **主控制器 `main.js` 纯化与瘦身**：
  - 移除所有杂糅的折叠算法、模式判断与动画定时器，`main.js` 纯粹只保留 VS Code 原生 IPC 消息路由器与全局 DOM 事件监听代理，代码量压缩 40% 以上，结构清晰高内聚。
- **双面板公共分组与渲染引擎高度抽象与深度复用**：
  - 抽离通用泛型日期分组算法 `groupItemsByDate` 与工作区分组算法 `groupItemsByWorkspace`，对话历史与方案计划 100% 复用统一的数据聚合逻辑。
  - 抽离通用分组折叠容器渲染器 `renderGroupedContainer`，统一外层分组骨架、动态折叠箭头、标签与条目计数徽章渲染，消除双面板重复拼装代码。
  - 抽象公共卡片组件片段构建器 (`buildCheckboxHtml`, `getStatusDot`, `buildEmptyStateHtml`)，降低 DOM 构建开销，`render-cards.js` 体积大幅精简。
  - 统一批量选择调度器 `getActiveSelectedSet`，双选项卡多选状态机无缝对齐单一数据源。

## [0.3.4] - 2026-11-10

### Refactored & Architecture
- **代码架构全面解耦与四层领域分层重构**：
  - 彻底拆解超千行的巨石单文件 src/panel-manager.ts (1027 行)，建立清晰的 src/panel/ 视图交互层：panel-manager.ts (生命周期与路由)、html-provider.ts (CSP与HTML模板)、export-handler.ts (单项/批量导出与报告)、delete-handler.ts (物理删除与防误触)、refresh-orchestrator.ts (刷新流水线) 与 types.ts。
  - 规范建立 src/core/ 底层协议与扫描引擎层 (ls-client, discovery, recovery, parser, formatter, cache)、src/services/ 业务服务层 (plan-service) 与 src/utils/ 通用基础设施层 (i18n, path-utils)，消除扁平混乱的源码目录。
  - 前端脚本模块化拆分：将 1138 行的巨型闭包 panel.js 拆分为 js/i18n.js、js/utils.js、js/state.js、js/render-cards.js、js/batch-manager.js 与 js/main.js，实现单一职责与高内聚设计。

### Added & UI Enhancement
- **方案计划全维度支持日期与工作区分组智能折叠**：
  - 方案计划卡片完全打通按修改时间分组（今天 / 昨天 / 更早）与按所属项目工作区分组的双模式切换，最新修改方案即刻置顶。
  - 支持方案计划独立分组箭头折叠与展开，并无缝接入顶栏【全部展开】与【全部折叠】一键全局控制。
  - 修复卡片与分组选择器样式类名匹配问题，彻底消除非批量模式下的复选框错位渲染与布局塌陷，全面恢复圆角边框与悬浮效果。

### Performance
- **三级渐进式非阻塞流式刷新体系**：
  - 阶段一（毫秒级极速首屏）：优先基于内存与本地持久化缓存推送数据，面板打开与刷新首屏耗时由数百毫秒缩短至 5ms 以内，彻底消除界面白屏与等待感。
  - 阶段二（快速本地对齐）：磁盘物理实体与方案计划并发异步扫描，淘汰幽灵残留会话，秒级同步最新文件修改时间。
  - 阶段三（后台静默网络富化）：语言服务进程探测与未索引标题网络补偿转为异步后台队列，不阻塞前端交互，探测完成后局部静默富化。

## [0.3.3] - 2026-11-10

### Added
- **历史记录与方案计划单项物理删除**：
  - 会话卡片与方案卡片操作区新增独立的危险删除按钮。
  - 会话删除深度物理清理本地 .db、.db-wal、.db-shm、.pb 实体文件与关联脑图日志目录，并强一致性同步更新与回写本地 cache.json 缓存。
  - 方案计划删除严格校验父级沙箱安全性，递归物理删除对应脑图工件目录。
- **批量管理多选模式与一键批量删除**：
  - 顶部操作栏新增【批量管理】交互模式开关，支持随时切入与退出。
  - 激活批量模式后展示专属批量操作工具条，支持全选、反选、取消全选、已选计数与一键批量删除。
  - 卡片左侧优雅滑出高对比复选框，支持复选框勾选与卡片整行点击选中，配合高亮微光边框与背景反馈。
- **VS Code 原生模态安全防误触机制**：
  - 单项删除与批量删除均接入 VS Code 原生模态（Modal）对话框，明确展示删除对象标题与条目数量，防止日常开发误触造成数据资产受损。
- **全链路中英文双语国际化适配**：
  - 补充批量控制栏、危险按钮、模态确认提示及操作反馈的全量双语词典。

### Performance & Fixed
- **批量删除极速并发与零延迟自动刷新**：
  - 后端删除重构为非阻塞异步并发架构（Promise.all 分批并发），预计算目录缓存，彻底消除同步遍历卡死主事件循环的问题，删除效率提升 10 倍以上。
  - 引入即时响应式乐观更新机制（Optimistic Instant Refresh）：用户在模态确认框点击确认的微秒瞬间，前端即刻自动剔除目标卡片并平滑重绘，实现与方案计划一致的秒级自动刷新体验。
  - 增加取消安全防护：用户若在确认弹窗点击取消，完整保留当前多选勾选状态，零副作用。

## [0.3.2] - 2026-11-03

### Changed
- **版本号同步与全平台发布适配**：同步 Open VSX 与 GitHub 发布版本至 0.3.2。

## [0.3.1] - 2026-11-03

### Added
- **工件标签升级为交互式单件下载按钮**：
  - 将卡片底部的【实施方案 (implementation_plan.md)】、【任务清单 (task.md)】、【变更报告 (walkthrough.md)】及其他参考文档全量升级为可点击的交互胶囊。
  - 点击任意文档标签即可直接弹出系统另存为对话框，精准单独保存对应工件，无需打包全部文件。
  - 单件保存时自动按工件类型进行规范默认命名（如：标题_实施方案.md、标题_任务清单.md、标题_变更报告.md）。
  - 增加精致悬浮微动效、手型光标与高对比色彩反馈，交互更自然直观。

## [0.3.0] - 2026-11-03

### Fixed
- **方案计划列表无法加载彻底修复**：
  - 修复后端消息分发器中遗漏 refreshPlans、exportPlanSingle、exportPlanAll 处理分支的缺陷。
  - 解决打包工具因缺少公开显式调用将脑图扫描模块误判为 dead-code 剥离的问题，方案数据完整打包。
  - 彻底打通双向通信管道，面板启动、切换标签及全局刷新时均同步调度 handleRefreshPlans()，秒级呈现本地全部方案计划。
  - 解决在 CSP 安全策略下空状态刷新按钮被拦截的隐患，全量升级为安全高效的事件委托。

### Improved
- **导出路径栏操作按钮视觉精致化重构**：
  - 重写 .export-path-bar .btn 与 .btn-secondary.btn-sm 样式规范，消除刺眼的巨大白色高亮块。
  - 采用高度 20px、字号 11px、深色微边框的内敛微型按钮设计，与路径文字视觉高度融合统一。
  - 切换至【方案计划】标签页时自动静默隐藏进度条横幅，维持方案浏览界面极简纯粹。
  - 全面审查并清除残留表情符号（Emoji），符合高严肃性企业级代码与注释规范。

## [0.2.9] - 2026-11-03

### Fixed
- **彻底消除恢复进度条卡在 3/3 假死问题**：
  - 修复当激活会话数等于 0 时未能分发 recoverDone 完成信号的代码缺陷，确保进度条 100% 正常关闭。
  - 前端增加自闭环平滑淡出保护，当已完成数达到总量时 500ms 后自动隐藏，杜绝任何网络抖动下的界面卡滞。
- **方案计划列表秒开加载**：
  - 将方案计划扫描与推送前置为极速同步非阻塞执行，彻底解除受对话恢复网络延迟的阻塞。
  - 扩展脑图扫描目录，全量覆盖 customAppDirs、antigravity、antigravity-ide 与历史备份目录。
- **空白会话过滤与 URL 中文路径解码**：
  - 自动识别并跳过 48KB 纯空数据库的死循环探测，消除无效网络超时。
  - 会话卡片工作区路径增加标准 URL 中文解码，彻底解决显示类似 %E5%AE%8C%E6%95%B4%E7%89%88 的乱码现象。

## [0.2.8] - 2026-11-03

### Added
- **方案计划与历史记录彻底隔离**：
  - 将脑图工件目录从常规会话扫描中解耦，彻底杜绝方案计划误混入会话列表导致无法下载报错的问题。
  - 面板顶栏新增【对话历史】与【方案计划】双栏切换开关，实现数据与视图物理隔离。
- **脑图方案计划专属下载与弹窗保存机制**：
  - 新增专用方案服务模块，自动扫描并提取 implementation_plan.md 方案核心大标题及关联工作区路径。
  - 支持【另存方案】单文件下载：弹出 VS Code 原生另存为对话框，默认定位到该方案关联的项目工作区根目录，直接保存 implementation_plan.md。
  - 支持【全部工件】一键打包导出：弹出文件夹选择窗口，一键将实施方案、任务清单、变更检查报告全套文档导出到项目专属目录中。
  - 支持【源目录】快速定位：支持一键在操作系统文件资源管理器中直接定位到脑图工件物理存储目录。

## [0.2.7] - 2026-11-03

### Added
- **脑图目录纳管与 Wal 活跃时间感知**：
  - 自动扫描并纳管本地 brain 脑图目录（~/.gemini/antigravity/brain），解决脑图型对话历史未被索引的问题。
  - 精准感知 SQLite .db-wal 活跃写入日志时间戳，确保刚产生交互的最新会话即刻置顶呈现。
  - 导出 DiskConversationItem 数据结构与 getValidDiskConversationIds 辅助函数。
  - 增强会话标题提取解析能力，支持多段用户输入条目的拼接还原。
- **强一致性缓存淘汰机制 (Prune)**：
  - 新增 pruneCache 淘汰接口，自动对比物理磁盘真实会话集合，彻底清理磁盘上已物理删除的幽灵残留会话。
- **新版进程探测与 HTTP/HTTPS 双协议自适应**：
  - 进程探测器新增对新版 Antigravity / agy.exe 及 agy 命令行实例的扫描识别。
  - 支持从命令行参数直接提取 --hub-port（映射为 directPort），增强参数容错兼容性。
  - 客户端通信层自适应支持 HTTP 与 HTTPS 双协议交互，内置端口协议缓存，提升连接建立速度与稳定性。

### Improved
- **前端事件委托与高性能懒渲染引擎**：
  - 升级面板交互为全量事件委托（Event Delegation）机制，去除为每个卡片独立绑定监听器的冗余开销，降低 95% 监听负载。
  - 优化分组折叠与按需渲染逻辑，折叠状态下不再构建 DOM，实现海量会话场景下的秒级秒开。

## [0.2.6] - 2026-08-17

### Added
- **单条导出双模切换（另存为弹窗 / 直接静默保存）**：
  - 新增 `aghistory.singleExportMode` 配置项（`dialog` 另存为弹窗 / `direct` 直接保存）。
  - Webview 控制栏新增单条导出模式下拉切换，支持在“点击 MD/JSON 弹出系统保存窗口”与“点击直接保存至默认/工作区目录”之间一键切换。
- **多语言国际化 (i18n) 与动态语言切换**：
  - 完整支持简体中文 (`zh-CN`，默认) 与英语 (`en`) 双语自由切换。
  - Webview 顶部控制栏新增语言下拉选择器，切换即时重绘，无需重启插件或重载窗口。
  - 新增 `aghistory.language` 全局配置项，自动记忆并持久化用户的语言偏好。
  - 新增 VS Code 扩展清单标准多语言资源文件 `package.nls.json` 与 `package.nls.zh-cn.json`。
- **全链路国际化适配**：
  - VS Code 状态栏 Tooltip、系统消息弹窗通知、另存为文件对话框过滤器与标题、批量导出报告（TXT）均适配当前选定语言。

## [0.2.5] - 2026-08-17

### Added
- **单条导出另存为弹窗交互**：点击会话卡片上的 MD 或 JSON 按钮时，唤起 VS Code 原生另存为文件对话框（Save Dialog），默认定位到该会话所属的项目工作区根目录，支持自由选择目标文件夹与自定义文件名保存。

### Fixed
- **项目工作区与数据目录资源管理器打开修复**：重构本地路径规范化函数与资源管理器调起逻辑，优先调用 VS Code 原生 `revealFileInOS` 并配备系统进程兜底，彻底解决 Windows 环境下点击项目路径及会话数据存储目录无法打开的问题。

### Improved
- **全量中文化与交互体验优化**：全面汉化面板日期分组、空状态提示、加载状态及操作通知，增强路径不存在时的中文警示提示。

## [0.2.4] - 2026-08-14

### Improved
- **安全加固与多实例探测优化**：
  - 增强 LanguageServer 进程发现与 CSRF 动态嗅探逻辑，提升多工作区或多实例并发运行时的会话索引稳定性。
  - 优化 esbuild 构建与打包脚本，强化发布产物安全。

## [0.2.3] - 2026-08-14

### Added
- **按所属项目工作区归类导出（双模式）**：
  - 新增 `aghistory.exportStrategy` 配置项（`workspace` / `unified`），支持按会话所属的项目工作区自动归类导出或统一主目录扁平导出。
  - Webview 顶栏新增导出归属模式快速切换下拉选择器。
- **中文标题与文件命名增强**：
  - 导出文件名完整保留中文、英文字符及常见符号，自动过滤操作系统非法字符。
  - 单条导出完成后弹出系统通知，并提供“打开文件”与“打开所在文件夹”快速直达。

## [0.2.2] - 2026-08-14

### Fixed
- **适配 Antigravity 2.5.5+ 架构变动**：
  - 适配新版本应用数据目录路径迁移（支持 `.gemini/antigravity-ide` 与 `.gemini/antigravity` 多目录混合扫描）。
  - 解决新版下历史会话无法被扫描和展示的问题，磁盘物理会话全量优先读取与平滑后台元数据回填。

## [0.2.1] - 2026-03-31

### Fixed
- **Recovery 机制修复**：修复最新对话无法出现在面板的 bug
  - `endIndex: 1` -> `5`：请求更多步骤确保 LS 完成对大型对话的索引写入
  - Recovery 成功后增加 500ms 等待，避免在 LS 异步写入完成前就重新拉取列表

## [0.1.9] - 2026-03-17

### Fixed
- **Export All 导出问题修复**：修复导出文件夹只有报告 txt 而无 md/json 的问题
  - 根因：`handleExport` 在无 endpoint 时静默 return 不抛异常，导致错误统计失效
  - 新增空数据检测（API 返回空 steps 时标记为失败）
  - `exportFormat` fallback 默认值修正为 `'all'`（与 package.json 一致）

### Improved
- 导出报告增加 `Format`/`Level`/`Output` 字段，失败项明确标记 FAILED
- 导出文件夹名增加 fieldLevel 后缀（如 `export_20260317_172457_full`）
- 全链路 `[AG-DEBUG]` 调试日志（可通过开发者控制台查看）

## [0.1.0] - 2026-03-14

### Added
- Conversation dashboard — browse all AI conversations grouped by date
- Search conversations by title
- Export individual conversations as Markdown or JSON
- Bulk export all conversations with one click
- Configurable export path, format, and detail level (default / thinking / full)
- 100% local, read-only, zero telemetry
- Status bar quick access button (`AG History`)
- Support for Windows, macOS, and Linux
- Compatible with Antigravity IDE and VS Code
