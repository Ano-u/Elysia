# 给 Gemini 的前端实现指令：新版入站引导（强制首进、按模板完成欢迎卡片、联动星海导览）

你现在只负责前端实现，不要改后端接口语义。后端已经完成新版 onboarding 状态机与数据下发，你要严格按接口渲染，不要再用旧的本地 `localStorage` 完成态作为真相来源。

## 1. 目标

把现有 Home 的旧 3 步引导，改成新版“入站引导 + 欢迎卡片 + Home/Universe 导览”流程。

核心规则：

- 只要用户还没有发送过任何内容，就要在每次进入 Home 时提示引导。
- 首次进入且尚未发送内容时：
  - 必须弹出
  - 不能跳过
  - 必须跟着引导走
- 第二次及之后进入、但仍未发送内容时：
  - 仍然会弹出
  - 但可以跳过
- 用户一旦成功发送过任意内容，生产环境下这套入口引导就不再自动弹出。
- 本地联调时，如果后端返回 `guide.display.shouldShow=true` 且 `guide.display.reason="local_debug"`，每次进入仍要显示，但允许跳过。

## 2. 必须使用的新接口字段

请求：

- `GET /api/onboarding/progress?entryId=...`
- `PATCH /api/onboarding/guide-state`

后端现在会在 `GET /api/onboarding/progress` 返回这些关键结构：

- `guide.display`
  - `shouldShow`
  - `allowSkip`
  - `forceBlocking`
  - `reason`
- `guide.draftTemplate`
  - `visibilityIntent`
  - `expectedPublishStatus`
  - `approvalHint`
  - `moodExercise`
  - `fields`
- `guide.featureTour`
- `guide.statusGlossary`
- `guide.contentState`
- 顶层还有一个 `contentState`

不要硬编码欢迎卡片内容。标题、誓言、描述都从 `guide.draftTemplate.fields` 读取。

## 3. `entryId` 的要求

你必须在每次真正“进入 Home 页面”时生成一个新的 `entryId`，并在该次页面生命周期内复用。

建议：

- 进入 Home 页面时生成一次 `const entryId = crypto.randomUUID()`。
- 如果运行环境不支持 `crypto.randomUUID()`，就降级成时间戳 + 随机串。
- 这个 `entryId` 不要在一次页面存活期间反复变化。
- `useQuery` 获取 onboarding 时，调用 `getOnboardingProgress(entryId)`。

目的：

- 避免一次进入 Home 因为重复请求，被后端错误累计多次 `entryCount`。

## 4. 引导流程必须改成这样

### 4.1 入口判定

- 以后不要再用旧的“`completedAt/skippedAt` 是否为空”决定弹不弹。
- 以后统一由 `guide.display.shouldShow` 决定是否显示。
- `guide.display.allowSkip=false` 时：
  - 不显示跳过按钮
  - `Esc` 也不能关闭
  - 不要偷偷调用 `PATCH /api/onboarding/guide-state` 传 `skippedAt`
- `guide.display.forceBlocking=true` 时，整个 overlay 要是阻塞式的。

### 4.2 欢迎卡片任务

新版 onboarding 的第一段不是纯文案介绍，而是要求用户真的完成一张欢迎卡片。

你要做成“任务引导式”：

1. 先引导用户在已有心情里任选 1 个。
2. 然后提示“这个选择是可以取消的”，要求用户取消刚才那 1 个。
3. 再要求用户从已有心情里选满 2 个。
4. 再引导输入标题。
5. 再引导输入誓言。
6. 再引导展开描述区域。
7. 再引导把系统给的欢迎语填进去。

全部要求都来自后端：

- 选心情规则：`guide.draftTemplate.moodExercise`
- 标题 / 誓言 / 描述：`guide.draftTemplate.fields`

其中标题必须填：

- `Hello Elysia！`

誓言必须填：

- `欢迎来到往世乐土！`

描述必须填：

- 后端当前返回的那条欢迎语

不要自己生成欢迎语，不要写死一条固定句子，直接使用后端 `description` 字段对应的 `value`。

### 4.3 审核与提交体验

后端已经保证：

- 按模板填写这张欢迎卡片时，会走轻量通过路径
- `guide.draftTemplate.expectedPublishStatus` 当前是 `published`
- `guide.draftTemplate.visibilityIntent` 当前是 `public`

所以前端在“按模板完成欢迎卡片”的引导里，应默认：

- 公开发送
- 成功后明确反馈“已发送到星海”

你不需要改后端审核逻辑，但要把这层文案体验做出来。

### 4.4 Home 导览

欢迎卡片步骤后，还要继续引导这些内容：

- 主界面下方的“往世乐土”入口
- 记录卡片上的“重新编辑”
- 记录卡片上的消息状态展示
  - 用 `guide.statusGlossary` 做 onboarding 文案来源
  - 至少要覆盖“已发送到星海 / 等待温柔审核 / 只留给自己”
- 左上角前往星海的按钮

### 4.5 Universe 导览

从 `guide.featureTour` 驱动星海操作导览，至少要覆盖：

- 点击卡片
- 把心心拖到卡片上
- 拖动画布
- 放缩画布

如果当前实现无法一屏做完，可以做成：

- Home 阶段先引导到左上角星海入口
- 用户进入 Universe 后继续后半段导览

但整体视觉和文案要连贯，不能像两个互相断开的系统。

## 5. 代码改造要求

优先修改这些文件：

- `apps/frontend/src/domains/home/HomeView.tsx`
- `apps/frontend/src/components/ui/HomeGuideOverlay.tsx`
- `apps/frontend/src/components/ui/ProgressiveInput.tsx`
- `apps/frontend/src/lib/apiClient.ts`
- `apps/frontend/src/types/api.ts`
- `apps/frontend/src/domains/universe/UniverseView.tsx`
- `apps/frontend/src/domains/universe/StarSeaCanvas.tsx`

### 5.1 `apiClient`

- 把 `getOnboardingProgress()` 改成支持 `entryId` 参数。
- 请求路径改成：`/api/onboarding/progress?entryId=...`

### 5.2 类型定义

你必须同步补全 onboarding 新字段的 TS 类型，至少包括：

- `OnboardingGuideDisplay`
- `OnboardingGuideDraftTemplate`
- `OnboardingGuideMoodExercise`
- `OnboardingGuideDraftField`
- `OnboardingGuideFeatureTourItem`
- `OnboardingGuideStatusHint`
- `contentState`
- `OnboardingGuideState.entryCount / lastPresentedAt / lastEntryId`

### 5.3 HomeView 里的状态机

现在 HomeView 里的旧逻辑有这些问题：

- 还在用本地 `GUIDE_COMPLETED_STORAGE_PREFIX`
- 还在按旧的 `welcome -> spotlight -> safety` 三段切
- `guideStep` 只对应旧 3 个 step

这些都要重构。

新的做法：

- 后端是展示真相来源
- 前端只保存当前会话中的 UI 进度
- `guide.display.shouldShow` 决定开场是否显示
- `guide.display.allowSkip` 决定是否出现跳过
- `guide.steps` 负责大阶段
- `guide.draftTemplate` 负责欢迎卡片任务细节
- `guide.featureTour` 负责 Home / Universe 互动导览细节

### 5.4 `PATCH /api/onboarding/guide-state`

你需要在合适时机同步：

- 切换大步骤时，更新 `lastSeenStep`
- 用户完成完整 onboarding 时，传 `completedAt`
- 只有 `allowSkip=true` 时，用户点跳过才传 `skippedAt`

注意：

- `skippedAt` 不能在 `forceBlocking=true` 时发送
- 即使用户跳过了，只要还没发过内容，下次进入还是会再次出现，这是后端设计，不要前端自己屏蔽

## 6. UI / 交互要求

### 6.1 不要做成普通“弹窗说明书”

这次引导要更像“被爱莉带着做完第一张卡片”，不是一连串 PPT 文案。

要点：

- 让用户每走一步，都能看到当前具体要做什么
- 输入型步骤要直接指向输入框
- 选心情步骤要能明确反馈“已选 1 个 / 已取消 / 已选 2 个”
- 描述步骤要先强调“先展开描述”
- 成功发布后要给明显的柔和确认反馈

### 6.2 首次进入不能绕开

- 首次进入时不能点遮罩关闭
- 不能按 Esc 关闭
- 不能显示“稍后再看”
- 不能保留旧的本地强制跳过逻辑

### 6.3 本地联调体验

如果后端返回的是本地调试强制模式：

- 每次进入都显示
- 但允许跳过
- 建议在 UI 里用很轻的一行字提示“当前是本地联调模式”

## 7. 提交后需要自检

请你在完成实现后，自己检查并说明：

1. 首次进入且无内容时，是否真的无法跳过。
2. 第二次进入且仍无内容时，是否会再次弹出且可跳过。
3. 欢迎卡片是否严格使用后端给的标题、誓言、描述。
4. 心情选择是否完成了“选 1 个 -> 取消 -> 选 2 个”的引导流程。
5. 成功提交欢迎卡片后，是否刷新 onboarding 状态并关闭引导。
6. Home 与 Universe 的导览点是否都已覆盖。
7. 本地调试强制显示模式是否可用。

## 8. 后端联调依据

请以这些文件为准，不要自己猜接口：

- `docs/frontend-contract.md`
- `docs/openapi.yaml`

尤其注意：

- onboarding 版本已升级为 `home-guide-v3`
- `GET /api/onboarding/progress` 现在有 `entryId`
- 返回结构里新增了 `display / draftTemplate / featureTour / statusGlossary / contentState`
