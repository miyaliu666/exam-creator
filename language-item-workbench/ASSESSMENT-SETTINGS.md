# Assessment Settings 使用说明

Assessment Settings 位于 `/language-items/assessment-settings`，维护新题共用的命题规则和语言内容。页面只包含 **Item rules**、**Language content** 两个顶层页签。

这里的修改先进入草稿，保存后还需要确认启用。已有题目始终使用自己绑定的已发布设置；修改中央规则不会改写旧题、批准题目或触发生成。

## 1. 先区分三个操作位置

| 位置 | 在这里做什么 |
| --- | --- |
| Assessment Settings | 定义可选 Can-do、模板配置、允许范围、难度、评分、评审和语言内容 |
| New items | 选择 Can-do → Exercise template → Domain → 可选 Context → Difficulty，再选择语言目标、题数和 AI 草稿数 |
| 题目工作区 | 完成当前题目的材料、题干、答案、检查和提交审核 |

Item rule 是一份可复用的配置，由内部稳定身份 `itemRuleId` 区分。界面显示规则名称，不需要作者输入内部编号。

## 2. 编辑、保存、启用

日常操作顺序：

1. 打开设置。系统优先打开自己基于当前发布版本的草稿；没有这样的草稿时，显示当前已发布设置。
2. 当前设置只读时，点击 **Edit settings** 建立可编辑草稿。
3. 在 Item rules 或 Language content 中修改。详情和弹窗的修改先暂存，点击 **Apply to draft** 才合入页面草稿。
4. 点击顶部 **Save changes**，把草稿保存到服务器。
5. 点击 **Use for new items**，运行完整设置检查。
6. 检查通过后，在确认窗口点击 **Confirm and use settings**，新题才开始采用这份设置。

| 顶部状态 | 含义 | 下一步 |
| --- | --- | --- |
| In use for new items | 当前正在使用的已发布设置，只读 | Edit settings |
| Unsaved changes | 页面草稿或尚未应用的编辑有变化 | 先 Apply to draft／Cancel，再 Save changes |
| Saved · Not applied | 草稿已保存，尚未启用 | 继续编辑，或 Use for new items |
| Read-only draft | 草稿属于其他账户 | 可以查看，不能修改这份草稿 |

顶部根据当前状态显示主要操作：有修改时显示 Save changes；已保存时显示 Use for new items。尚未处理的暂存编辑会阻止保存，并提示先应用或取消。

**Apply to draft 不等于保存，Save changes 不等于启用。** 部分已有规则表单直接修改页面草稿，但同样需要全局保存和确认启用。

发布检查失败时，页面显示 Rules need fixes 和具体问题；修改对应设置、保存后再检查。检查通过表示设置结构与约束通过校验，不表示题目已经人工审核通过。

## 3. Item rules：配置可以出什么题

### Configured rules

默认打开 **Configured rules**。每行是一个 **Can-do × Exercise template** 配置，列出 Allowed Domains、Difficulty、Scoring 和操作按钮。Can-do、难度与评分使用共用规则，切换语言内容不另外建立一套规则。

- Search、Can-do、Exercise template 用于查找配置；More filters 提供 Skill、Domain。
- 表格展示全部匹配配置，不按 Context 或难度展开成多行，也不分页。
- **Add item rules** 新建配置；同一个 Can-do 与模板组合只能有一条配置。
- **Edit** 打开该行的暂存详情；**Copy** 建立独立身份的副本，并要求重新选择 Can-do。
- **Remove** 先确认，再从草稿移除该配置。已发布版本及其已有题目保持原规则。
- 不完整或不兼容的已存配置保留在表格中，显示修复提示，不会静默隐藏。

### 四个详情页签

| 页签 | 主要决定 |
| --- | --- |
| Basic settings | Can-do、Exercise template、Allowed Domains、任务要求、可用状态，以及可选 Context 限制和模板默认值 |
| Difficulty | Lower A1、Typical A1、Upper A1 三个完整难度方案 |
| Scoring | 当前规则的评分方式、评分标准和等价答案处理 |
| Review | 固定检查摘要，以及手动维护的补充评审要求 |

详情内切换页签会保留暂存值。完成后点击底部 **Apply to draft**，返回配置表；返回或取消时若有未应用修改，需要明确选择丢弃或继续编辑。

### Basic settings

每条配置选择一个 Primary Can-do 和一个 Exercise template，Skill 与 activity 来自 Can-do 定义。已有配置的模板保持固定；需要另一模板时新建配置。

**Allowed Domains 直接选择，至少一个。** 它表示这条规则允许在哪些领域使用，并非从 Context 自动推导。

**Task requirements and evidence of success** 描述任务必须完成什么，以及什么表现能证明目标达成。它是共享命题要求，不是当前题目的题干。

**Availability** 控制这条配置是否供新题选择；关闭可用性不会删除历史题目。

**Optional Context restrictions** 可以为空：

- 空列表表示没有登记的 Context 限制；作者仍必须选择允许的 Domain，可以不选预定义 Context。
- 选择了 Context，则新题使用该规则时必须满足这些具体情境限制。
- 所选 Context 必须有效、未停用，归属一个允许的 Domain，并支持当前 Primary Can-do。
- 修改 Can-do 或 Domain 后，不兼容的原有 Context 会保留修复提示；不会自动删除选择。

**Template field defaults** 设置新题的初始字段值。这里允许尚未填写实际题目内容，具体材料和答案在题目工作区完成。

### Difficulty

三档方案分别设置 Input length、Information points、Contextual support、Distractor similarity；没有干扰项的情况可使用相应的不适用值。

每档方案适用于该规则允许的 Context。Information points 是当前题目需承载的信息点数量，不是题数。

显式修改字段会把该字段的默认值与允许范围设成一致的单值，并更新说明；只读或打开页面不会把已有范围压成单值。未修改的历史范围、说明与其他值保留。缺失或不合法的档位必须显式修复。

这些 A1 参数是命题设计要求，不代表已经通过学习者数据完成难度校准。

### Scoring

源模板配置在自己的 **Scoring** 页签维护：

- **Exact match**：按规定的正确答案及等价处理判断。
- **Per response**：分别评价作答组成部分。
- **Analytic rubric**：采用分析性评分标准。

Scoring criteria 描述分值、部分得分和成功标准；Normalization and equivalent responses 描述标准化与可接受的等价表达。具体答案仍逐题编写。

这里修改的是当前规则的评分要求。已有规则使用的共享 Scoring contracts 在 Manage definitions 中另有明确入口，不能据此推断源模板配置共用同一评分合同。

### Review

源模板配置的 Review 显示固定检查摘要：模板结构、Can-do／Domain／Context／难度要求，以及回答是否支持评分标准。

作者可用 **Add criterion** 手动增加补充要求，也可编辑或移除。补充要求中的空白行必须补全或删除后再应用。这一详情页当前没有 Generate review rules 功能。

### Exercise templates（60）

此视图列出完整的 60 个源模板，保留原名称、大小写及重名模板，以 Source skill 区分来源。

点击名称可查看模板说明、源等级、递归字段、类型和必填约束；**Add item rules** 用该模板开始配置 Can-do、Domain、难度和评分。

模板库描述的是可用结构。Source levels 是源资料元数据，不会自动成为某道题的已校准等级；存在练习预览也不代表已具备正式考试交付能力。

### Existing item rules 与共享定义

Configured rules 下的 **Existing item rules** 保留此前的题型规则，包括原有任务条件、Context、语言内容、难度、评分合同和评审绑定。点击 Edit saved rules／View saved rules 进入对应详情。

这些规则不被强制改成源模板配置。它们的 Current Context、难度编辑及语言内容入口按原有精确规则身份工作，Back to item rules 返回原有总览状态。

**Manage definitions** 提供：

- **Contexts and Domains**：编辑共享情境及其领域归属、Can-do 支持范围。
- **Can-do statements**：编辑共享能力定义、Skill、activity 等。
- **Existing rule scoring contracts**：存在已有规则时出现，维护它们使用的共享评分合同。

共享定义修改也先 Apply to draft。对其他规则产生的不兼容会显示修复提示，需要处理后再发布。

已有规则的 **Review rules** 支持自动派生的固定检查、手动补充规则和 **Generate review rules**：

- 固定检查始终需要满足；Edit source 回到来源设置。
- AI 建议使用当前未保存的页面草稿，需要已配置的真实提供方；结果逐条展示差异，由作者明确选择应用。
- 未选择的建议和未提及的手动规则保持原样；建议不会自动保存或发布。
- 来源改变时，旧补充规则保留原来源记录。需检查差异并明确接受更新；来源过期可能阻止发布。
- 没有保存新评审规则集的历史发布版本继续使用原有评审语义。

## 4. Language content：查看、导入和编辑条目

在 Item rules 的规则行点击 **View content**，或在已有规则详情点击 **View available content**，直接进入与该规则匹配的内容列表。若规则允许多个 Context，可在列表上方切换 Context。列表按所选语言、规则的 Can-do、技能所需的 Mastery 范围筛选；没有匹配条目时，可在同一页点击 **New entry** 或 **Import**。

单独打开 Language content 时显示完整 Directory。**Show all content** 清除规则筛选。条目类别包含 Vocabulary、Grammar、Characters、Pragmatic functions 和 Supporting material types；还可按语言、类别、等级和 Can-do 查找。

Chinese、English、Spanish 的条目按 Language 分开维护，Item rules 的 Can-do、Context、难度与评分规则共用。缺少 language 的历史条目按中文读取。

条目具有稳定身份。重复判断包含语言、类别、名称，以及词汇义项或语法结构；同形异义可保留为不同条目。同一已有条目的有效语言不能改变，换语种应新建。

- 英语词汇的 **Meaning 可选**；其他语言保留原有义项要求，语法条目保留 Structure 要求。
- Import 支持 Excel、Markdown 和粘贴表格，先预览、检查重复与错误，再加入草稿；不再导入条目级 Context 限制。
- 新增时，空 Language 使用 Import language；文件也可以混合多种语言。
- 更新时使用导出的 ID；空单元格保留原值，`__CLEAR__` 显式清空允许清空的字段，未出现的行不删除。
- 英语／西班牙语样例先进入预览，是原创、未校准的示例，不自动导入或发布。
- 批量修改、单条编辑和导入都纳入同一套草稿保存与确认启用流程。

新设置的 Context 范围由 Item rule 决定；条目仍可设置 Applicable Can-do 和 Mastery scope。新草稿会清除旧条目的独立 Context 范围与逐组合 Assessment requirements。若已有草稿含这些旧配置，打开后会显示 Unsaved changes，需要 Save changes 才能启用；已有题目绑定的已发布快照保持原样。

## 5. 出错、冲突和返回

- **Retry loading settings**：初始加载或刷新失败时重新读取数据；已有本地编辑保留。
- **Reload saved draft**：发现服务器上的同一草稿已更新时，明确确认丢弃本地修改后加载最新草稿，并清除旧的暂存编辑。
- **Start from published settings**：草稿基线过期时，从最新发布设置重新开始；旧的已保存草稿保留，未保存内容需明确确认丢弃。
- 弹窗或详情出现 Settings changed 时，保留编辑内容供检查，但禁止覆盖新数据；复制必要内容后重新打开。
- 普通视图切换保留独立筛选和定位；显式重载／重新建立草稿会重置编辑状态，避免旧弹窗继续作用于新草稿。
- 页面离开、刷新和退出时保护尚未保存或应用的修改。此保护不是自动保存；请求失败也不会自动发布。

设置页不提供 Reference sources、Change history、Published limitations 入口，但其已有记录和 API 保留。外部语料不会因修改设置自动导入或用于生成。

## 6. 实现位置

- 页面与生命周期：`client/features/language-items/registry-settings-panel.tsx`、`use-registry-settings.ts`。
- 源模板配置与模板库：`exercise-settings-workspace.tsx`、`exercise-settings-detail.tsx`、`exercise-settings-library.tsx`。
- 已有规则与评审：`registry-item-rules-detail.tsx`、`registry-review-rules-editor.tsx`。
- 内容匹配与历史快照兼容：`content-compatibility.ts`、`content-context-scope.ts`、`content-assessment-rules.ts`。
- 服务端保存／发布、语言范围和检查：`server/routes/language_assessment_settings.rs`、`server/language_items/registry_store.rs`、`content_assessment.rs`、`content_context.rs`、`validation.rs`。
