# 新建 Item：流程与字段说明

## 最短流程

**Item bank → New items → 设置、数量和语言目标 → Generate → Generation jobs → Open item → Use this draft → Edit & preview → Check & submit。**

首页 `/language-items` 是 **Item bank**，用于浏览、筛选和打开题目。**New items** 是单题与多题共用的创建入口；**Generation jobs** 和 **Language coverage** 各有独立页面，不在首页展开。

1. **New items：选设置和数量。** 打开 `/language-items/new`，选择 Blueprint slot、Item format、Primary Can-do、Domain、Context、Difficulty；选项受当前 Assessment Settings 约束。Number of items 默认是 1，改成多个即为多题创建；需要另一套设置时才用 Add another setup。未提交的设置、数量和目标在当前浏览器会话中保留，旧计划不会被改成默认数量。
2. **选择语言目标并生成。** 单题选择 What this item should assess；多题使用 Targets required in every item，并可增加 Different targets for different items。展开 Preview each item's targets 可查看每题分配。Options 中可选填 Name，留空会根据 Blueprint slot 自动命名；AI drafts per item 默认 1。点击 Generate 1 item / Generate N items 后进入 `/language-items/batches?batchId=...` 查看任务。
3. **Generation jobs：查看进度并打开题目。** 批次按名称和创建时间区分；每组显示一次六项设置与共同必选目标，每题显示序号、额外分配目标和生成状态。批次和题目的内部 ID 不在页面展示，数据关联与打开题目仍使用原 ID。页面保留 Pause / Continue、历史和 Open item；离开页面不停止生成，Pause 等待正在进行的模型调用结束。Open item 打开 Prepare，已有候选优先显示；Use this draft 采纳后进入编辑。生成状态与分配目标不表示人工审核通过或正文实际使用了这些目标。
4. **Edit & preview：完善题目。** 左边编辑题目、正确答案或作答要求，右边查看中英对照或切换 Candidate preview 查看考生呈现。修改自动保存，顶部 Saved 表示已保存。保存失败会显示 Retry save。完成后点击 Check & continue。
5. **Check & submit：检查后交给人审核。** 系统先保存再检查；问题旁的 Go to Prepare / Go to editor 返回对应步骤。修改后旧检查结果失效，需要 Check again。通过检查后才能点击 Submit for review；它创建 GitHub PR 并锁定草稿。AI feedback 可选，不能代替人工审核。审核合并、同步成功后才能导出到 Staging。

单组且只创建 1 题时，也可点击 **Write manually**。系统创建草稿、保存已选目标后直接打开 **Edit & preview**；没有语言目标也可先建立空草稿。收到已创建题目的 ID 后，若保存目标失败，会在当前浏览器会话保留恢复记录；刷新或返回后，对相同设置重试会复用该草稿，也可点击 **Open unfinished draft**。手动创建不会调用 AI；之后生成候选或提交审核仍须补齐语言目标、Key information 和相应题型的要求。

Prepare 可补充内部标题、What this item should assess 和中央难度方案要求的 Key information，使用 Generate AI drafts 生成候选，或 Write it myself 进入手动编辑。已有候选时，Edit generation requirements 和 Generate more AI drafts 默认收起；要求需要修复时自动展开。已编写题目内容的草稿重新打开时进入编辑，已提交的版本打开审核状态。

每道题中的 Prepare、Edit & preview、Check & submit 可以随时返回；它们是导航，不会因为点了下一步就创建新 Item。离开、刷新或退出账号时，尚未保存的修改会受到离开提醒保护。不要在 Saved 出现前确认丢弃修改。

**Language coverage** 位于 `/language-items/coverage`。明确设置库存目标后，可把兼容的补题建议带到 New items；建议通过当前浏览器会话交接，由出题人确认数量和目标后再生成。

统计口径为 Planned assessment targets（计划考查目标）、Confirmed assessment targets（已确认考查目标）、Supporting material types (advanced)（背景材料类型）和 Targets and material types (advanced)（目标与材料类型）。选择器可按词汇、语法、汉字、语用筛选候选选项；切换分类不清空已选内容，也不改变查询条件的含义。

## 创建窗口：六个字段只选一次

| 字段 | 含义 | 例子 |
| --- | --- | --- |
| Blueprint slot | 考试蓝图中要覆盖的测量位置，不是某道已有题目。旧界面的 Exam task 指的就是它。 | Basic personal questions and answers |
| Item format | 题目的作答结构。 | Spoken interaction（多轮口语互动） |
| Primary Can-do | 本题主要验证的一项能力，必须且只能选一个。 | Conduct a basic personal exchange |
| Domain | 语言使用的大类领域。 | Personal、Occupational |
| Context | 中央规则允许的具体交际类别，不是题目正文。 | Greetings and introductions |
| Difficulty | A1 内部的难度档，采用本题绑定的中央规则中该档的完整方案。 | Lower / Typical / Upper A1 |

创建后六项选择集中显示在一处 Item setup 摘要中，不需要再次填写。需要纠正 Domain、Context 或 Difficulty 时，点击 Edit item setup。Blueprint slot、Item format、Primary Can-do 和绑定的中央规则版本保持固定；需要改变这些身份条件时，应新建 Item。

六个下拉框采用相同交互：占位提示只在未选择的输入框内显示，不进入选项列表。展开时其他字段淡化，当前选中项带勾选；选择、按 Esc 或点击列表外后恢复正常显示，已有选择不丢失。

## 数量、语言目标和可选项

| 字段／操作 | 含义 |
| --- | --- |
| Number of items | 本组要创建多少道独立题目，默认 1；一次最多 50 题，多个设置组的数量相加计算。 |
| What this item should assess / Targets required in every item | 单题要考查的目标／本组每一道题都必须考查的目标。单题和多题使用同一份选择，数量变更不清空目标；不必列出题目中出现的每个词。 |
| Different targets for different items | 分配到本组不同题目的额外目标；目标少于题数时循环复用，多于题数时每题可能分到多个。缩为 1 题时，这些目标全部分给该题。 |
| Preview each item's targets | 生成前按实际分配规则查看每题的完整目标集合，包括共同必选目标；这是命题计划。 |
| Options → Name (optional) | 本次创建的内部名称，留空自动按 Blueprint slot 命名；不改变测量要求。 |
| Options → AI drafts per item | 每道独立题目的 AI 题稿数，默认 1，可下拉选择常用数量或直接输入正整数，不设 3 或 5 个的业务上限；例如 5 题 × 2 份 AI 题稿仍是 5 道题，由作者逐题采纳。已有 item 的再次生成使用相同控件。 |
| Add another setup | 增加另一组设置、数量与目标；全批次最多 20 组、合计最多 50 题。 |

共同目标与分配目标可以只填其中一项；AI 生成需要本组有语言目标。两份选择不能包含同一条目标；不兼容的已有目标会保留并提示修复。分配按所选目标的顺序轮流进行，例如 2 题分配 A、B、C，结果是第 1 题 A＋C、第 2 题 B；3 题分配 A、B，结果是 A、B、A。以 Preview each item's targets 的逐题结果为准。词汇、语法、汉字、语用分类只筛选候选选项，不修改已选目标。

## 创建后修改 Item setup

Edit item setup 用于纠正本题的设置，不是另一套必须走完的建题步骤。

1. 打开 Edit item setup，在窗口内选择新的 Domain、Context 或 Difficulty。选项仍来自这道题已经绑定的 Assessment Settings。
2. 查看将要采用的完整难度方案和影响提示。窗口中的选择先暂存，不会立即修改草稿；Cancel 放弃本次暂存选择。
3. 点击 Apply changes，才将新设置应用到本题。难度方案的材料长度、信息点数量、支持程度等由中央规则决定，在作者页只读显示。作者不再逐项填写 Difficulty tuning 或 Difficulty rationale。
4. 按可修复问题清单处理与新设置冲突的语言目标、辅助内容或信息点。系统保留原有选择、信息点文字、材料、题干和答案，不会替作者删除或截断。需要减少信息点时，由作者明确选择并删除多余项；需要增加时，补全相应要求。
5. 检查已有题目内容是否仍符合新情境和难度，必要时修改后重新运行正式检查。应用变更后，之前的检查结果失效；只有当前草稿通过检查才能提交审核。

例如，题目原来要求提取“时间”和“地点”两个信息点，改用只要求一个信息点的难度方案后，这两条内容仍保留。作者决定保留“时间”，明确删除“地点”，再相应调整材料、问题和答案并重新检查。切换难度不会自动把一道已有题改写为合格的新难度题。

发布新的 Assessment Settings 只影响之后创建的新 Item。Edit item setup、重新检查和创建修订草稿都不会把旧题升级到最新规则版本。

## Prepare：作者给题目的要求

| 字段／区域 | 含义 |
| --- | --- |
| Item title | 作者在题库中识别、检索这道题的名称；考生看不到。 |
| What this item should assess | 本题真正要考的词汇、语法、汉字或语用功能，中英对照显示，可按中文或英文搜索。选择列表受 Can-do、Context 和掌握范围约束。 |
| Key information | 本题需要考生提取或表达的事实、信息或意图，例如姓名、开门时间。它是命题简要要求，不是正确答案。数量来自所选中央难度方案；超出要求的已有条目由作者明确删除。 |
| Information point type | 将信息归为时间、地点、姓名、行动等，帮助保持结构化要求；右侧填写具体内容。 |
| Suggestions | 快速填入一个空的信息点，可以继续改写。 |
| Supporting material types（可选） | 人名、地名等背景材料的类型，默认收起；这里不选择要考查的词汇或语法。 |
| AI drafts per item | 一次生成几个备选草稿，不是题目数量或考生作答次数。 |
| Language coverage check | 已有正文时，仅自动检测词汇、汉字是否在文本中出现；语法、语用另列为人工确认，不因名称未出现而提示未使用。文本出现不等于实际考查，不代替正式检查。 |
| Item setup / Edit item setup | 集中查看本题的六项设置及只读难度要求；需要纠正 Domain、Context 或 Difficulty 时，暂存、查看影响并明确应用。 |

AI 候选对应生成时的命题要求。更改 Domain、Context、Difficulty、语言目标、辅助内容或信息点后，基于旧要求的候选会显示 Earlier requirements，Use this draft 不可用；完成新的命题要求后点击 Generate AI drafts 重新生成。仅修改 Item title 或题目正文不会因此停用候选；采纳时仍须通过系统检查。

## Edit & preview：截图中的口语互动字段

新生成的 AI 草稿包含仅供作者和审核者使用的英文对照。在生成草稿卡片、Edit & preview 和 Check & submit 中可查看逐项中英对照；Candidate preview 始终呈现中文考生内容。可在编辑步骤修正英文，译文随草稿自动保存。中文修改后，对应旧译文不再作为当前译文显示，需要更新英文。历史草稿没有译文时继续使用中文预览，不会自动调用 AI 或改写历史版本。

译文保存在 `authoringPackage.englishTranslations`，每条记录包含相对于 `candidatePayload` 的 JSON pointer `path`、原文快照 `sourceText` 和 `englishText`。采纳 AI 草稿、保存、冻结和 GitHub 审核保留此作者资料；考生 API 与交付中的考生正文不包含它，内部 Staging 存档仍保留完整 TaskPackage。英文释义是作者参考，不改变原有中文目标和难度校验。

| 字段／区域 | 应填写什么 | 示例 |
| --- | --- | --- |
| Situation | 考生看到的具体场景。Context 是分类，Situation 是这道题的场景文字。 | 你第一天上班，正在认识一位新同事。 |
| Candidate instructions | 告诉考生要完成什么。 | 回答同事的问题，然后向同事问一个相关问题。 |
| Conversation roles | 对话双方的称呼，默认 Examiner / Candidate，通常不用改。 | 同事 / 你 |
| Examiner prompt | 这一轮考官说的话，或已登记的音频引用。 | 你叫什么名字？ |
| Expected candidate action | 这一轮希望考生完成的交际动作，不是范文答案。 | 介绍姓名；询问对方姓名 |
| Add exchange | 增加一组考官提示与考生回应要求。 | 再问工作或时间安排 |
| Candidate preview | 查看场景、说明及对话结构；Candidate responds 表示考生在这里作答，不是预填答案。预览不是实际录音考试。 | — |
| Scoring rules | 中央规则自动决定的评分方法、分值、量表和异常处理，默认收起，只读。 | 固定 A1 口语互动量表，12 分 |
| Author notes（可选） | 给作者或审核者的备注，考生看不到，默认收起。 | 音频需重新录制 |

Key information 和 Expected candidate action 不是两份答案：前者说明整道题的信息范围，后者说明每一轮的交际行为。评分规则也不是另一份要填写的答案。

## 其他六种 Item format 的专属输入

| Item format | 需要作者完善的内容 |
| --- | --- |
| Single select | 阅读／听力材料、题干、选项、正确选项。 |
| Matching | 材料与说明、左右两组内容、正确配对。 |
| Restricted input | 材料与问题、作答字段、可接受答案。 |
| Form entry | 场景、说明、表单字段名称与输入类型、可接受值／判分标准、是否必填。 |
| Typed message | 场景、说明、收件人、写作目的、可选原消息、答案必须包含的内容；长度限制可展开。 |
| Spoken response | 场景、说明、可见口语提示、答案必须包含的内容；准备／作答时间可展开。 |

客观题的正确答案与可接受值供作者和评分使用，不显示在考生预览中。写作／口语的 Required response content 是给考生的作答要求，不是范文，也不能重写中央评分量表。

## 从主流程移除或收起的内容

- 首页只保留 Item bank 的浏览、筛选与导航，生成任务和覆盖分析进入各自页面；New item 与 Bulk create 合并为一个 New items 入口。
- 名称改为可选自动命名，与每题候选数一起放入 Options；删除常驻后台生成说明、默认单候选时的重复数量以及进度页重复选候选说明。
- 用 Different targets for different items 和可展开的 Preview each item's targets 说明目标分配；进度页每组只显示一次共同设置与必选目标。
- Write manually 直接进入编辑，不再进入 Prepare 后重复选择手动编写。
- 删除 Blueprint slot 搜索输入、重复的标签页／跳转按钮、Save now、Save & validate、重复的预览标题和状态。
- 删除作者页面的完整 TaskPackage JSON 编辑框，不删除底层数据。
- 删除重复的 Context／Difficulty 编辑区域和作者可填的 Difficulty tuning／Difficulty rationale；用单一 Item setup 摘要与 Edit item setup 窗口承接设置纠正，完整难度方案只读显示。
- 删除预览里没有录音／考试行为的 Start recording / Start interaction 按钮。
- 评分规则、可选备注、角色／时间／长度设置、历史与版本详情按需展开，保留必要信息但不占满主页面。
- 唯一的正式提交入口位于 Check & submit。History & item details 保留版本、归属、审计和交付记录，不是新建必填步骤。

中央规则仍从 Assessment Settings 维护。打开或查看旧题不会改写其正文、答案和版本绑定；只有作者明确应用设置或编辑内容时才产生相应草稿变更。评分合同和审核权限沿用现有规则。
