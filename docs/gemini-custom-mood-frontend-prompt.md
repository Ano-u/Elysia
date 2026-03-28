# 给 Gemini 的前端修复指令：心情 Tag 去重 + 标题解耦 + 最多选 2 个

请只修改前端，不要改后端接口语义。当前前端有一组明确的逻辑错误，需要按下面要求修正。

## 1. 先修正现在的错误语义

- 现在 UI 把“情绪 tag”和“标题 `moodPhrase`”混用了，这个是错的。
- 正确语义：
  - `moodPhrase` 永远是标题。
  - `quote` 永远是誓言。
  - `description` 永远是正文。
  - 情绪 tag 单独走 `extraEmotions`。
- 现在页面里出现了两个“情绪心境 / 情绪 tag”区块，这也是错的。
  - 最终页面只能保留一个情绪选择区。

## 2. 必须遵守的后端契约

接口：

- `GET /api/records/mood-options`
- `POST /api/records`
- `PATCH /api/records/:id`
- `GET /api/records/:id`
- `POST /api/records/:id/comments`

请求字段语义：

```ts
type MoodMode = "preset" | "other_random" | "custom";

type RecordLikePayload = {
  moodPhrase: string; // 标题，不是情绪
  quote?: string | null;
  description?: string;
  extraEmotions?: string[]; // 0-2 个，真正的情绪 tag
  moodMode?: MoodMode; // 仅用于 UI 状态/来源元数据
  customMoodPhrase?: string | null; // 自定义情绪文本
  isPublic?: boolean;
};
```

后端约束：

- `extraEmotions` 最多 2 个。
- 选了自定义情绪时：
  - `customMoodPhrase` 必须有值。
  - 这个自定义值必须也出现在 `extraEmotions` 里，作为 2 个情绪 tag 之一。
  - 中文最多 5 个字，英文最多 2 个词。
- `moodPhrase` 不会再被后端替换成自定义情绪。
- `GET /api/records/mood-options` 的 `rotating` 每次进入都可以视为新的随机结果。

## 3. 这次前端必须实现成什么样

### 3.1 只有一个情绪选择区

- Home 创建态只保留一个“情绪心境 / 心情 tag”模块。
- 不要在外层写一个标题、组件内部再写一个标题。
- 编辑态、回复态也保持同一套语义，不要再复制出第二套情绪 UI。

### 3.2 情绪 tag 的选择规则

- 用户最多可选 2 个情绪 tag。
- tag 必须支持：
  - 点击选中
  - 再点一次取消选中
- 当已选满 2 个时：
  - 再点未选中的 tag，不要强制替换旧值
  - 给轻提示或禁用态都可以，但不要静默改写

### 3.3 标题与情绪彻底解耦

- `MainInputCard` 里的标题输入框只绑定 `moodPhrase`。
- 不要再因为选了自定义情绪，就把标题长度规则切成“5 个字 / 2 个词”。
- 不要再把主情绪 selector 的点击结果写进 `moodPhrase`。
- 提交时：
  - `moodPhrase` 提交标题
  - `extraEmotions` 提交选中的情绪 tag
  - `customMoodPhrase` 只提交自定义情绪文本

### 3.4 自定义情绪交互

- 点击“自定义情绪”后，不要弹窗，不要跳页。
- 在同一个情绪模块下方展开输入框。
- 输入框是“自定义情绪”的输入，不是标题输入。
- 展开时机：
  - 选中自定义 tag 后展开
  - 取消自定义 tag 后收起
- 行为：
  - 输入值实时校验：中文最多 5 个字，英文最多 2 个词
  - 超限立即提示并阻止提交
  - 选中自定义时，把自定义文本加入 `extraEmotions`
  - 取消自定义时，从 `extraEmotions` 移除该值，并清空或重置 `customMoodPhrase`

## 4. 随机与预设的正确展示方式

- 高频 tag：
  - 优先固定展示
  - 更稳定、更靠前
- 低频 tag：
  - 来自 `rotating`
  - 每次进入页面重新拿一组随机结果
  - 不是“点一次随机情绪就重新抽一个词”
- 自定义：
  - 作为一个明确入口
  - 不是普通预设 tag 的文案替身

## 5. 请复用已有 UI 资产，不要重做成另一套

- 复用现有长条波动动画和视觉语言。
- 优先查看并复用：
  - `apps/frontend/src/components/ui/MoodStripSelector.tsx`
  - 历史实现里和情绪选择相关的设计
  - `apps/frontend/src/domains/universe/UniverseView.tsx.orig`
  - `apps/frontend/src/domains/universe/UniverseView.tsx.bak`
- 目标是保留长条波动质感，只修逻辑和信息架构，不要把它改成普通按钮组。

## 6. 需要你改的重点文件

至少检查并修正这些地方：

- `apps/frontend/src/domains/home/HomeView.tsx`
- `apps/frontend/src/components/ui/MainInputCard.tsx`
- `apps/frontend/src/components/ui/MoodStripSelector.tsx`
- `apps/frontend/src/domains/mindmap/MindMapDetailModal.tsx`
- `apps/frontend/src/domains/universe/UniverseView.tsx`
- `apps/frontend/src/lib/moodPhraseValidation.ts`
- `apps/frontend/src/lib/apiClient.ts`
- `apps/frontend/src/types/api.ts`

## 7. 编辑态与回复态必须一致

- 编辑已有记录时：
  - 标题从 `record.moodPhrase` 回填
  - 已选情绪从 `record.extraEmotions` 回填
  - 自定义输入框是否展开，由 `record.customMoodPhrase` 和 `extraEmotions` 决定
- 回复卡片创建态也要完全遵守同一语义：
  - 回复标题仍是标题
  - 回复情绪仍是 `extraEmotions`

## 8. 验收标准

- 页面里只出现一个情绪选择区。
- 标题、誓言、正文都不再被情绪选择影响。
- 情绪 tag 最多可选 2 个，并且可以取消选中。
- 选择自定义时，下方展开输入框。
- 创建、编辑、回复三条链路都提交正确 payload。
- 每次进入页面时，低频 tag 都是从 tag 库里随机出来的一组。
- 继续保留长条波动动画。

## 9. 输出要求

- 直接改现有前端代码。
- 改完后给我一份简短说明：
  - 修了哪些逻辑错误
  - 哪些组件被改动
  - 如何保证 `moodPhrase` 与 `extraEmotions` 完全解耦
