# Assessment Settings 设置说明

本文按当前 `/language-items/assessment-settings` 页面与对应校验代码整理，说明每个区域、字段和按钮的实际用途。页面上的英文名称保留，便于直接对照。版本编号、对象编号和引用关系由系统维护，普通操作不需要输入编号。

工作台统一使用 `Item` 表示完整题目，`Item Bank` 表示题库。`Blueprint slot` 是考试蓝图中的测量位置，数据字段是 `blueprintSlotId`；下文的 Slot 仅是该概念的简称，界面标签使用全称。`Item rules` 是 Blueprint slot × Item format × Primary Can-do 三元组合及其可复用中央规则；`Item setup` 则是具体一道题的六项设置，在三元组合上增加 Domain、Context、Difficulty。`Task family` 是交际任务族，`Scoring contract` 是评分合同，二者均是独立概念。新建、列表、编辑摘要和设置页统一使用这组字段名。

## 1. 这个页面究竟设置什么

Assessment Settings 管理可重复使用的建题规则：哪些考试任务允许哪些题型、以哪个 Can-do 为主目标、允许哪些情境、怎样定义三个 A1 难度等级，以及采用什么评分与交付规则。

这里保存的是中央规则草稿。`Save draft` 只保存，`Publish` 才使通过检查的规则用于新题。已有题目保留创建时绑定的规则，因此发布新设置不会改变旧题。

| 页面 | 用户在这里决定什么 | 设置范围 |
| --- | --- | --- |
| Assessment Settings | 定义可供建题使用的配置、词库、情境及规则 | 一批未来题目共同使用 |
| New items | 从已发布规则选择 Blueprint slot、Item format、Primary Can-do、Domain、Context、Difficulty，并设置题数和语言目标 | 本次创建的一道或多道独立题目 |
| 题目编辑页 | 编辑题干、材料、答案、语言目标、信息点；在已绑定规则范围内调整题目 | 当前题目 |

中央配置的识别关系是：

```text
Slot + Item format + 一个 Primary Can-do
  ├─ Primary skill / Communicative activity
  ├─ 对应的 Task family / Scoring contract / Delivery rules
  ├─ Allowed contexts → 推导可用 Domains
  └─ 本组合的 Lower A1 / Typical A1 / Upper A1 配置
```

这里有两个容易混淆的地方：

- 设置页里选 `Slot → Item format → Primary Can-do`，是在定位一份已存在的中央配置。切换下拉框本身不会给当前配置改名，也不会改变它的主目标。
- 当前实现中，Task family 与 Scoring contract 的合法关系由 Slot 和 Item format 约束。选择 Context 不会重新生成评分合同。Context 决定的是使用情境以及 Domain。

## 2. 从两张关联表查看规则，进入对应表单编辑

页面默认打开 **Rules overview**，另有 **Language content matrix**、**Item rules** 和 **Rule libraries** 四个入口。表格与表单读取、修改同一份设置快照，不维护另一份对应关系。

| 入口 | 纵向与横向／用途 | 编辑入口 |
| --- | --- | --- |
| Rules overview | 每行是实际保存的 Blueprint slot × Item format × Primary Can-do × Context；列展示 Skill／Activity、Domain／Context、三档 Difficulty 和兼容的核心语言条目数 | Edit item rules 定位精确组合；点击难度定位该组合的对应档位；点击 Context 打开相应目录记录 |
| Language content matrix | 每行是稳定身份的语言条目及其词义／结构；每列是一个精确的 Item rules × 有效 Context 组合，表头同时标明 Skill、Blueprint slot、Item format 和 Primary Can-do | 点击条目编辑目录资料；点击单元格编辑该条目在该组合中的考查规则；点击列表头的 Blueprint slot 打开对应 Item rules |
| Item rules | 定位 Blueprint slot → Item format → 唯一 Primary，选择允许的 Context，紧接着设置本组合的三个难度等级 | 沿用完整规则表单 |
| Rule libraries | 维护 Context、Can-do、语言内容、评分合同、审核规则，或查看 Change history；一次只显示选中的库 | 沿用各目录的编辑表单 |

Rules overview 提供 Search item rules、Skill、Context 筛选和分页。缺少 Context、引用不存在／停用／不兼容 Context 的草稿仍显示，并给出 Needs attention；缺失或错误的难度配置也保留修复入口。没有实际保存的配置时显示空状态，不将所有字段任意组合成新规则。Language content 栏的数量表示按当前规则可选的核心条目数，不是题目覆盖量或已确认考查量。

点击 Rules overview 的 View language content，会打开矩阵并定位该 Item rules 与 Context。矩阵支持 Category、Search language content、Skill、Context 和 Item rules 筛选，每页显示四个组合列及二十个条目行，两方向分别翻页。只按条目类别和搜索筛选纵向目录；Skill、Context 和 Item rules 用于筛选组合列，条目不适用时仍显示 Not allowed。失效组合的已存规则保留在 Assessment rules needing attention 中供定位处理。

两张表切换视图、进入表单再返回时保留各自的筛选、分页和所选行／单元格。Back to Rules overview／Back to Language content matrix 返回来源表；表单修改后，返回时显示同一草稿中的更新值。只读快照仍可通过表格打开详情，按钮显示 View，不直接修改已发布设置。

- `Manage contexts` 直接进入 Context 库；回到 Item rules 时保留原组合。
- Skill／Activities、Task family、Scoring contract 合并成只读摘要。Supporting Can-do、证据、边界、参考案例和交付规则收在 `Detailed rules` 内。

### 页面上不同“格子”的含义

| 外观 | 实际操作 | 是否更改规则 |
| --- | --- | --- |
| 带向下箭头的下拉框 | 单选；部分用于定位当前编辑对象，部分用于修改该对象的属性 | 取决于字段，下文逐项说明 |
| 带 × 的已选标签 | 当前有效选择；点击移除该关联 | 是，不删除词库记录 |
| Choose / Edit | 打开带搜索的多选清单 | 展开或搜索不改规则，勾选才修改 |
| Done / Escape | 收起多选清单 | 不撤销已经做的选择 |
| 复选框 | 勾选允许值或规则开关；Difficulty 使用单选框和一个数量输入框 | 是 |
| 红框错误区域与 Remove | 已保存的选择现在不合法，例如 Context 已停用或不支持主 Can-do | Remove 只移除这条引用 |
| 普通单行或多行输入框 | 编辑名称或规则文字 | 是 |
| 多行列表输入框 | 每行是一条规则、限制或说明 | 是；离开输入框时会清理空行 |
| 数字框 | 编辑一个数量，例如该难度等级的信息点数 | 是 |
| 只有标签和文字、没有输入边框 | 只读值，例如派生 Domain、Skill、合同名称 | 否 |
| Detailed rules / Delivery rules | 展开或收起详细规则 | 否 |
| 并列的两列、三列网格 | 把相关字段放在一起；窄屏会改为上下排列 | 不是额外的规则层级，也不是题目数量 |

已发布设置、其他人的草稿、请求处理中、发布确认窗口打开时，以及发现远程修改冲突时，规则编辑控件会锁定。只读状态下仍可通过定位下拉框查看不同对象。

本文中的“必需”指当前创建或发布流程实际需要满足的约束；“建议完整填写”表示业务上有价值，但当前校验未逐项禁止空文本。它们不能混为一谈。

## 3. 页面导航与保存发布

### 顶部导航

| 控件 | 含义与行为 |
| --- | --- |
| Item Bank | 返回题库。未保存的修改会触发离开确认；请求处理中不可点击。 |
| Sign out / switch account | 退出当前账户。未保存时先确认是否丢弃本地修改；请求处理中不可点击。 |
| Assessment Settings | 页面名称，不是可编辑字段。 |

### 状态与常用按钮

| 控件或状态 | 含义 | 何时可以操作 |
| --- | --- | --- |
| Published | 当前正在供新题使用的已发布设置 | 只读，点击 Edit settings 开始修改 |
| Draft · Saved | 自己的草稿已保存，但尚未发布 | 可以继续编辑；满足条件后可 Publish |
| Draft · Unsaved | 有只存在于当前页面中的修改 | 先 Save draft |
| Read-only draft | 草稿属于其他用户 | 不能修改该草稿 |
| Previous publication / Retired | 历史状态标识 | 不是当前可直接编辑的设置 |
| Edit settings | 从当前已发布规则建立自己的可编辑草稿 | 当前显示只读规则且没有请求进行中 |
| Save draft | 将当前草稿保存到服务器，不启用规则 | 有未保存修改，且没有远程冲突或进行中的请求 |
| Publish | 检查已保存的草稿；通过后打开发布确认窗口 | 草稿已保存、未过期、没有已知阻塞错误或远程冲突 |

页面没有 `Rule version` 或 `Version label` 输入，也没有独立 `Validate`、`Impact` 按钮。内部仍维护不可变的已发布规则和修订号，用于保护已有题目与检查并发修改。

打开页面时，系统优先恢复“自己创建、且基于当前发布设置”的草稿；没有这样的草稿就显示当前发布设置。已被新发布设置替代的旧草稿不会自动抢占默认页面。

### Publish 的完整过程

1. 读取当前已保存草稿，并检查修订号。
2. 校验完整规则，包括引用关系、Context 兼容性、难度范围和共享评分政策。
3. 检查草稿是否仍基于当前发布设置；服务端内部比较发布影响。
4. 如果有错误，显示 `Rules need fixes` 和具体对象名称；不进入确认窗口。
5. 如果通过，打开 `Publish settings for new items?` 窗口。
6. 点击 `Confirm publication` 后，再按已检查的草稿和发布基线执行发布。

| 确认窗口控件 | 含义 |
| --- | --- |
| Rules passed / Rules need fixes | 服务端校验结果，不是人工审核通过状态 |
| Cancel | 取消本次发布，保留已保存的草稿 |
| Confirm publication | 将确认过的设置发布供新题使用 |

点击确认窗口外部不会关闭窗口。请求处理中不能取消、不能再次提交。确认成功后，当前记录切换为只读的 Published 状态。

### 条件出现的恢复按钮

| 控件 | 出现原因 | 点击结果 |
| --- | --- | --- |
| Reload saved draft | 同一草稿在其他页面或设备上出现更新 | 读取服务器上的最新草稿；有本地修改时先确认是否丢弃 |
| Start from published settings | 当前草稿基于较旧的已发布规则 | 从最新发布规则建立新草稿；旧的已保存草稿仍保留，不自动合并 |

后台重新获取数据不会覆盖正在编辑的本地修改。浏览器返回、页面跳转、刷新或关闭页面时，未保存内容会触发相应保护。这是离开确认，不是自动保存；重要修改仍需点击 Save draft。

## 4. Item rules：定义一个建题组合

### 先定位组合

| 字段或按钮 | 含义 | 可编辑性与依赖 |
| --- | --- | --- |
| Blueprint slot | 考试蓝图中的任务位置，例如 Signs, labels, and short notices | 单选定位；显示已配置 Slot，不在这里新建 Slot 或手填标题 |
| Item format | 该 Slot 中的一种作答结构，例如 Single select 或 Matching | 单选定位；选项随 Slot 改变 |
| Primary Can-do | 当前配置的唯一主能力目标 | 单选定位；选项随 Slot 和 Item format 改变 |
| Add item rules | 展开新增配置区，再选一个尚未配置的 Primary 并确认添加 | 候选必须匹配当前 Skill、主 Activity；Task family 和评分合同有效 |
| Cancel new item rules | 关闭尚未添加的配置选择 | 不改已有配置 |
| Manage item rules → Remove these item rules | 删除当前组合及其专属难度配置 | 仅存在另一份同 Slot／题型配置时出现；需确认，不删除 Can-do 库记录 |

`Add item rules` 的意思不是“给一道题增加第二个 Primary”。例如同一 Slot 和题型支持两个 Can-do，系统保存两份可供选择的配置；新建一道题时仍只能从中选一个 Primary。

增加组合不会把旧 Primary 的证据、A1 边界、参考案例、Supporting Can-do 和 Context 选择直接套过来。这些字段会清空，难度以中央默认值初始化；Slot、题型及其对应的任务结构、评分和交付规则继续作为基础。

当前页面没有直接建立跨 Skill、跨主 Activity 合同关系的入口。因此“题型可以用于不同 Skill”不等于“能把任意 Can-do 添加到任意 Slot 和题型下面”。例如 Single select 在不同 Slot 中可能用于 Reading 或 Listening，但不能在已有 Reading 合同下直接套用一个 Speaking 主目标。

只有一个选项的 Item format 或 Primary Can-do 显示为只读文字，不放无意义的单选框。

### 派生信息、范围与规则文字

| 字段 | 含义 | 当前要求 |
| --- | --- | --- |
| Skill / Activities | 主技能及交际活动；有附加活动时标清主活动 | 只读，与 Primary Can-do 一致，不再重复列出 Activities |
| Task family | 此 Slot 和题型执行的交际任务类型 | 只读引用；必须是该 Slot 和题型允许的 Task family |
| Scoring contract | 合同名称及自动评分、逐字段评分或量表评分方式 | 只读引用；必须匹配当前 Slot 和题型 |
| Supporting Can-do（Detailed rules 内） | 本配置可支持的辅助能力 | 可搜索多选，可为空，不能与 Primary 相同 |
| Domains | 当前有效的已选 Context 所归属的领域 | 只读派生；不是第二组需要重复勾选的范围 |
| Allowed contexts | 建题时允许选择的具体情境 | 多选；每份配置必须至少有一个真正可用的 Context |
| Observable evidence | 考生应表现出什么可观察行为，才能证明目标能力 | 可编辑；建议完整填写，当前未逐项强制非空 |
| A1 boundary | 什么仍属于 A1，什么要求已经越界 | 可编辑；建议完整填写，当前未逐项强制非空 |
| Task family coverage | 该类任务应完成的核心行为说明 | 可编辑说明文字；修改文字不会自动更换 Task family 引用 |
| Item structure | 材料、问题和作答之间的组织结构说明 | 可编辑；建议完整填写，不是单题题干 |
| Valid item example | 一个符合此配置的题目示例 | 可编辑；建议填写，不会自动创建一道题 |
| Invalid item example | 一个看似相关但不符合配置的反例 | 可编辑，可按需填写 |
| Prohibited uses | 明确不能拿本配置来测量的内容或行为 | 多行列表，可按需填写 |

一个 Context 只有同时满足以下条件，才进入正常的 Allowed contexts 选择区：存在、未停用、明确支持当前 Primary Can-do、恰好有一个合法 Domain，且名称与 Scope 完整。只属于 Public 并不能证明它适合所有 Public 领域的能力。

例如“购买商品”和“理解公共标志”都可以属于 Public，但只有明确关联了“理解公共标志”这个主 Can-do 的情境，才适用于以该 Can-do 为 Primary 的配置。

之前保存过、现在不合法的选择不会伪装成有效的已选标签，而会保留在红框里：

| 恢复控件 | 作用 |
| --- | --- |
| Invalid selected contexts → Remove | 只取消当前组合与该 Context 的关联，不删除 Context |
| Invalid supporting Can-do → Remove | 只移除无效辅助引用，不删除 Can-do 库中的记录 |
| Use registered task family | 当前 Task family 不合法且系统找到唯一合法替代时，显式修复引用 |
| Use registered scoring contract | 当前评分合同不匹配且系统找到唯一合法替代时，显式修复引用 |

### Delivery rules：查看固定交付规则

点击 `Delivery rules` 展开；下列值均为只读名称，不要求用户填编号。

| 字段 | 表示什么 |
| --- | --- |
| Presentation | 当前题型使用的考生展示方式 |
| Navigation | 是否允许在任务或模块内返回、复查等 |
| Input | 文字输入或字段输入方式 |
| Playback | 音频播放的规则，例如完整播放次数 |
| Recording | 一次录音还是按轮次录音 |
| Speaking rate | 口语输入采用的语速规则 |
| Pauses | 句间或对话轮次间的停顿规则 |

不适用的规则显示 Not applicable。这里没有任意新增 Renderer、输入协议或录音协议的按钮。

## 5. Rule libraries → Can-do library：维护能力词库

| 字段或按钮 | 含义 | 当前要求与行为 |
| --- | --- | --- |
| New Can-do | 准备新增的能力陈述 | 新增时必填、不得重名 |
| Primary skill（新增行） | 新 Can-do 的主技能 | 必选一个；当前初始值是 Reading，新增前应检查 |
| Activity（新增行） | 新 Can-do 的主交际活动 | 必选一个；当前初始值是 Reception |
| Add | 把新 Can-do 加入中央词库 | 自动生成内部编号；不会自动加入任何 Slot、Context 或题目 |
| Can-do | 选择当前查看或编辑的词库记录 | 定位单选，不给任何题目新增主目标 |
| Can-do statement | 编辑选中记录的能力陈述 | 必须有名称、不得与其他 Can-do 重名 |
| Primary skill（记录详情） | 该已有 Can-do 的技能 | 当前界面只读 |
| Activity（记录详情） | 该已有 Can-do 的交际活动 | 当前界面只读 |
| Delete unused | 删除当前草稿内无人引用的 Can-do 记录 | 引用仍存在时拒绝；删除前确认 |

Reception 指理解输入，Production 指表达，Interaction 指互动，Mediation 指向特定对象转达或处理信息。Activity 与 Reading 等 Skill 是两种不同的分类。

删除保护会检查当前草稿中的主／辅助 Can-do、Context 和语言内容引用。已发布旧设置是独立快照，不会因为删除当前草稿中的词库记录而被改写。

## 6. Rule libraries → Contexts：维护可扩展的具体情境

Context 不是永远不能增加的固定清单。它是在中央设置中维护、有名称、有适用能力和边界的情境目录；发布后才供新题使用。

| 字段或按钮 | 含义 | 当前要求与行为 |
| --- | --- | --- |
| New context | 准备新增的情境名称 | 新增时必填、不得重名 |
| Add Context | 新建情境记录 | 内部编号自动生成；初始为 retired，Domain、Can-do 和 Scope 尚未配置 |
| Concrete context | 选择要维护的情境 | 定位单选；停用项带 retired 标识 |
| Retire Context | 停用情境 | 从新选择的有效候选中排除；保留现有引用以便检查与恢复 |
| Restore Context | 启用或恢复情境 | 名称不空且不重名、Scope 不空、恰好一个合法 Domain、至少有一个有效 Can-do 时才可用 |
| Used by | 有多少份任务配置引用此 Context | 只读；不是使用它的题目数，也不是 Can-do 数 |
| Context name | 当前情境的业务名称 | 必填、不得重名 |
| Primary Domain | 该情境所属的主领域 | 单选且必需；Personal、Public、Educational、Occupational 中选一个 |
| Compatible Primary Can-do | 哪些主能力可以在此情境中测量 | 多选；启用情境至少支持一个，所有引用必须存在 |
| Scope and boundary | 情境包括哪些行为、信息和范围 | 必填；例如“入口、出口、开放时间和简单禁止信息” |
| Explicit exclusions | 明确不属于本情境的内容 | 可为空；填写时每行是一条有效排除项 |
| Invalid compatible Can-do → Remove | 清理指向已不存在 Can-do 的引用 | 只移除关联 |

修改 Domain、Scope、名称、启停状态或兼容 Can-do，会重新计算受影响配置的可用 Domains。已有 Context 引用不会因为它暂时不兼容而被自动删除。

停用被引用的 Context 后，相关 Item rules 会显示红色错误。需要决定恢复 Context，还是到每份相关配置里移除引用、选择其他 Context；不处理这些引用就不能发布合法的新配置。若只是恢复而尚未移除引用，原来的关联仍在。

当前发布校验对 retired 记录也要求名称、Scope 和一个 Domain 完整。新建但尚未填写完的 Context 可以先保存在草稿中，但不能把这份不完整规则直接发布。页面没有新建 Domain 或硬删除 Context 的按钮。

## 7. Difficulty：紧随当前组合设置三个等级

难度与上方任务字段始终使用同一份配置，没有独立的 `Applies to`。点击固定的 Lower A1、Typical A1、Upper A1 切换等级，不再填写等级名称。定位或切换等级不修改规则。

| 字段 | 含义 | 编辑方式 |
| --- | --- | --- |
| Input length | 题目输入材料的长度类型 | 单选 Word or phrase、Short sentence 或 Two related phrases |
| Information points | 本等级要求的信息点数量 | 一个 1–255 的整数 |
| Contextual support | 情境或提示提供的帮助程度 | 单选 High、Moderate 或 Limited |
| Distractor similarity | 错误选项与正确答案的相似程度 | 仅 Single select、Matching 显示；单选 Clearly different、Moderate 或 Closely similar |

每个字段直接设置本等级采用的一个值，页面不再分 Default／Allowed range 两列。选择分类值会同时将默认值和允许集合设为该值；修改信息点数会同时将默认数、最小数、最大数设为输入的数量。无需另行填写范围，也不会同时选择相互矛盾的干扰项设置。

旧设置可能保存了多个允许值或一个信息点范围。页面会显示这份已存范围和默认值，直到用户明确选择一个值或修改数量，才替换为单值规则。打开页面、切换组合或等级不会自动收窄范围；错误值会明确提示，用户通过选择合法值修复。Single select／Matching 的新选项不包含 Not applicable；旧数据若把它与其他相似度混在一起，仍会显示待修复内容。

原 `Definition` 是该等级的文字说明，例如“一条明确信息、词或短语输入、强情境支持”，并非另一项独立参数；它的编辑框已移除。常规 `Independence` 编辑也已移除，日常配置集中在上述四项。读取或切换设置时，已有说明和独立程度保持原样；仅在用户明确修改上述字段时，系统依据四项当前默认值重新生成说明，防止题目理由与 AI 继续引用过时描述。独立程度不随这些修改变化；仅发现不合法的旧独立程度时，显示 `Repair saved independence` 单选修复控件。

| 按条件出现的操作 | 作用 |
| --- | --- |
| Create difficulty settings | 为缺少整套难度的组合显式建立配置 |
| Restore missing levels | 只补缺失等级，不覆盖已有等级 |
| Set distractors to not applicable | 修复无干扰项题型的旧配置，不再显示无关的干扰项表单 |
| Remove inference requirement | 显式移除旧配置中违规开启的复杂推断要求 |
| Repair saved independence | 仅在旧独立程度不合法时显示；选择合法值后修复控件消失 |

复杂推断仍是 A1 固定禁止条件，不是可以开启的难度开关。每次修复都仍需保存、检查与发布。

三个长度选项分别是 Word or phrase（词或短语）、Short sentence（短句）、Two related phrases（两个相关短语）；它们是长度类型，不是精确的字数输入。

支持程度的 High／Moderate／Limited 表示帮助由多到少；干扰程度的 Clearly different／Moderate／Closely similar 表示选项区分越来越难。Not applicable 由系统用于没有干扰项的题型，不需要手动选择。新增配置时，非 Single select／Matching 题型的干扰项默认值和允许值初始化为 Not applicable；已有不适用设置只通过上述修复按钮显式更改。

每个组合都必须有 Lower A1、Typical A1、Upper A1，不能重复等级。较新设置缺失专属配置时会报错，不能把全局默认值当成已经为本组合配置过的规则。

单题采用创建时绑定的组合和等级配置；信息点数不再一律限制为两个，仍需依据该 Can-do 的证据边界，例如明确涉及一至三个信息点的目标。通过本表编辑后采用固定数量，尚未修改的旧范围继续保留，旧版规则也保留原有校验语义。复杂推断是 A1 的固定禁止条件，发布校验会阻止要求复杂推断的配置，不能通过修改 Upper A1 来绕过。

## 8. Rule libraries → Language content：浏览和维护语言内容目录

完整字段关系、流程实测及与此前讨论的差距见 [Language content 功能梳理](LANGUAGE-CONTENT-REVIEW.md)。当前目录筛选、Item 适用条件、正文出现与确认考查是不同概念；发布目录尚不会自动回查旧 Item，语法 Structure 也尚未成为正文匹配规则。

这里维护词汇、汉字、语法、语用功能和辅助内容的中央目录及适用条件。进入后显示条目表格，可按类别、名称／释义／拼音、掌握范围、Can-do 和 Context 筛选。主表显示名称、限定义项／语法结构、掌握范围及适用条件；关联较多时可展开全部。一个 Item 实际要测哪些条目，在 New items 或 Prepare 中选择。

| 字段或按钮 | 含义 | 当前要求与行为 |
| --- | --- | --- |
| Category | 选择 Vocabulary、Characters、Grammar、Pragmatic functions 或 Supporting material types | 决定条目类型及必填字段；列表分类只筛选，不改变条目 |
| Word or phrase / Grammar name / Name | 条目显示的词、字或语法功能名称 | 编辑标签按类别显示；必填，保留作者原文 |
| Meaning | 词汇纳入本目录的具体义项 | 新词汇必填；旧条目缺失时允许逐步补充，已有义项不能清空 |
| Structure | 语法结构，如 A 是 B | 新语法必填；旧条目缺失时允许逐步补充，已有结构不能清空 |
| Details → Pinyin / English meaning | 拼音与简短英文释义 | 可选；用于显示、搜索；English meaning 对应原 englishGloss 数据字段，与 Meaning 独立保存，不自动互译或校验一致性 |
| Details → Examples / Usage restrictions | 例句和用法边界 | 可选；随设置版本保存；选为核心目标时传入真实 AI 生成和 AI feedback，文字限制不是程序硬检查 |
| Details → Sources / Notes | 来源与备注 | 可选；保存供追溯和审核；选为核心目标时随资料传给真实 AI，来源链接不自动抓取 |
| Mastery scope | 该条目按理解、表达或两者兼有的用途提供 | 可选 Not restricted、Receptive (understanding)、Productive (expression)、Receptive and productive |
| Applicable Can-do | 可以用到此条目的主／辅助 Can-do 范围 | 直接搜索多选；未选时显示 Not restricted，空集合表示不限制 |
| Applicable Context | 可以用到此条目的 Context 范围 | 直接搜索多选；未选时显示 Not restricted，空集合表示不限制 |
| Unavailable Can-do → Remove | 移除不存在的 Can-do 引用 | 只清理条目关联 |
| Unavailable Context → Remove | 移除已不存在或已停用的 Context 引用 | 只清理条目关联，不删除情境 |

Receptive 对应理解类使用，Productive 对应表达类使用，Receptive and productive 同时允许两类，Not restricted 不加这一层限制。一个 Item 是否可选某条目，要同时满足 Context、主／辅助 Can-do 和掌握范围三个条件。新增默认不限制，编辑已有条目不会自动清空范围。目录默认显示 Category 和 Search；Mastery scope、Can-do、Context 收在 More filters，收起时显示已启用的附加筛选数量。

这里的空集合语义与 Item rules 的 Allowed contexts 不同：语言条目的兼容集合为空可以表示“不限制”，但一组 Item rules 不能没有任何可用 Context。

### Language content matrix → Language assessment rule

矩阵单元格同时表达“当前范围是否允许选用”与“是否已定义考查规则”。Allowed + Assessment rule not defined 表示条目目前可选但未填写该组合的考查规范；它不同于 Not allowed。已有规范显示 Understanding、Controlled production、Free production 或 Assessment rule incomplete，不能把这些设计状态解释为实际题目已经考到该语言内容。

点击单元格打开 Language assessment rule，固定显示该条目以及 Blueprint slot、Item format、Primary Can-do、Context；这些身份不能在弹窗中改成另一组合。

| 字段／操作 | 含义 |
| --- | --- |
| Applicability → Allowed within entry scope | 在条目现有范围内允许，不放宽 Applicable Can-do、Applicable Context 或 Mastery scope |
| Applicability → Excluded for this combination | 只排除当前精确的 Item rules × Context，不改变其他组合或条目总体范围 |
| Assessment mode | Reading／Listening 使用 Understanding；Writing／Speaking 使用 Controlled production 或 Free production；Not specified 表示尚未选择 |
| Communicative purpose | 本组合使用该词义／结构要完成的交际目的 |
| Required evidence | 题目应要求理解或产出的具体表现，每行一条 |
| Acceptable responses | 可接受表达或答案变体，仍须符合固定评分规则 |
| Failure patterns | 看似出现目标、实际未取得考查证据等无效设计或表现 |
| Prerequisites | 完成任务所依赖的前置语言知识 |
| Valid item example / Invalid item example | 该组合的合格例题与反例；填写文字不会自动创建题目 |
| Apply to draft | 将暂存规则应用到当前设置草稿，尚未保存到服务器或发布 |
| Remove rule; use entry scope | 确认后移除本组合的规则，恢复按条目总体范围判断；不删除语言条目 |

未填写某组合的 assessment rule 时，旧有空范围仍表示 Not restricted，不会自动转成“不允许”。如条目总体范围排除了当前组合，选择 Allowed 也不能解除限制；需关闭弹窗、打开条目编辑器明确修改其总体范围。Excluded 则在总体允许范围内进一步收紧，生成、目标选择和服务端兼容性检查均使用这一精确排除条件。

弹窗修改先暂存，取消时可丢弃修改；Apply to draft 后仍需 Save draft 和 Publish。尚未应用的表单参与离开、刷新和退出保护，不能绕过暂存步骤直接保存或发布。弹窗打开后，相关条目、Item rules 或 Context 发生变化时，会保留输入并阻止应用，提示重新打开。发布仍需检查与确认，旧快照和已创建题目保持原样。

这些字段存储在语言条目的 assessmentRules 中。生成 prompt v0.7 和独立 AI 初审请求会获得与当前 Blueprint slot、Item format、Primary Can-do、Context 精确匹配的规则，用作正文、答案和考查证据的规范。此处提供的是规则输入及其使用边界；不代表已实现自动起草全部中央规则、独立难度校准或真实试测分析的新管线。语义判断也不会因规则已填写而自动成为通过 Checks、Review 或实测难度的证明。

### 目录编辑与导入

New entry 打开单条新增；点击列表条目查看或编辑详情。编辑在弹窗中暂存，Cancel 丢弃暂存，Apply changes／Add to draft 才写入页面上的设置草稿。暂存内容同样参与离开页面、刷新和退出账号保护；弹窗打开后条目若在别处被修改或移除，应用会被阻止，暂存值保留供查看和复制，关闭后重新打开可读取最新条目。Supporting material types 是辅助背景内容类型，不应因此自动变成 Item 的核心测量目标。

Import 使用同一套预览处理 Excel（`.xlsx`）、Markdown 表格（`.md`）和页面粘贴。可粘贴 Excel 复制的制表符表格，也可以只输入一列名称，再在预览中补充字段。Markdown 按带表头的表格读取，不推断自由段落。Download template 可选 Excel 或 Markdown，给出字段格式与现有 Can-do／Context 对照；Export 导出所有符合当前筛选的条目，包含稳定条目 ID，供以后更新使用。

已识别且没有歧义的表头直接进入导入预览；未知或重复表头保留全部输入，进入 Column mapping。预览显示可编辑的行、来源位置、错误和同名条目。Include all／Exclude all 切换参与导入的行，Set scopes for included rows 批量设置范围，More fields 展开附加列。新增词汇需要 Meaning，新增语法需要 Structure；新增的空范围表示 Not restricted，更新时空白继续保留旧值。Can-do／Context 使用现有 ID 或能唯一对应的名称，多值使用分号；无效或停用引用必须修正。新建单条统一使用 New entry，导入不再提供另一套空行新增入口。

单条新增和导入均先按类别和名称比较，忽略大小写、全半角及多余空白，并匹配已知内置中英文显示名称。例如已有“我们／第一人称复数”时，新填“我们／we”仍显示同名条目，作者可以直接打开已有条目编辑。相同名称且相同义项／结构阻止新增；不同义项需确认后保留。查重不进行 AI 语义判断，不跨词汇和汉字类别合并；词汇包含某汉字也不自动增加一个汉字目标。已有重复条目仍能修改备注、范围等资料，更改名称或义项才重新要求查重；比较内容变化后需重新确认。

Import mode 默认选择 Add new entries。更新已有条目必须显式选择 Update existing entries by ID，并提供当前目录中存在的稳定 ID；预览显示字段变化。更新中的空白保留旧值，`__CLEAR__` 清空可选字段，Not restricted 或 `__CLEAR__` 将适用范围设为不限制。文件没有列出的已有条目保持原样。参与导入的行全部通过校验后一次加入草稿；有错误时可以明确排除这些行再继续。输入上限为每文件 5 MiB、每次预览合计 5,000 行；仍有未预览文字或未完成字段对应时，不能应用已有行。

所有新增、编辑和导入都仍需 Save draft，再 Publish。新建设置草稿可按稳定 ID 为名称未改变的内置条目补充源文件中的义项、结构、拼音等资料；不会覆盖已写入的值，也不会把新增资料直接写入已发布快照。旧题继续绑定原规则。未知的附加资料在编辑和导出更新过程中保留。

## 9. Rule libraries → Scoring contracts：维护评分规则文字

| 字段或按钮 | 含义 | 当前要求与行为 |
| --- | --- | --- |
| Scoring contract | 选择要查看的 Slot 和题型评分合同 | 定位单选，显示合同业务名称 |
| Blueprint slot | 合同适用的考试蓝图任务位置 | 只读 |
| Item format | 合同适用的题型 | 只读 |
| Scoring type | 自动评分、逐字段评分或分析量表等评分方式 | 只读；不能用自由文本任意换评分算法 |
| Contract status | 该合同的规则成熟度或使用状态 | 只读；与整个设置页面的草稿／发布状态不同 |
| Task-specific scoring requirements | 本合同中特有的评分证据要求 | 多行可编辑列表；例如回复须实际回应给定消息 |
| Score cap or exclusion | 某种不足是否触发分数上限或排除条件 | 可按需填写，例如只抄写而未完成交际目的时的限制 |

下方六个并列“格子”是六种评分政策，不是六道题，也不是六个默认评分维度：

| 政策格子 | 负责的问题 | 例子 |
| --- | --- | --- |
| Normalization | 哪些答案写法可按批准规则统一 | 是否去掉外侧空格，日期或时间哪些形式等价 |
| Partial credit | 是否按匹配项、字段或量表维度分别得分 | 每个正确匹配独立得分 |
| Invalid response | 空答、无效选项、多选、离题等如何处理 | 单选题提交多个答案如何计分 |
| Technical incident | 技术失败如何与考生能力区分 | 录音上传失败不能直接当作能力不足得零分 |
| Adjudication | 评分争议如何解决 | 什么时候交由第三位评分者裁决 |
| Rater qualification | 人工评分者需要哪些资格或训练 | 具备相应 A1 评分训练 |

每个政策格子内部：

| 字段 | 含义与约束 |
| --- | --- |
| Summary | 人能理解的政策概述；必需有内容 |
| Details | 政策细则，每行一条；根据政策需要填写 |
| Used by N scoring contracts | 当前有 N 份合同共享这份政策；数量不是评分点数 |

修改共享政策时，界面会更新同一政策在其他相关合同中的引用副本。它不是“只给当前合同改一句备注”。服务端会检查同一政策引用是否出现矛盾内容。Not applicable 政策保持只读。

显示为“Blank response”“Technical failure”“Scoring on hold”等文字的条目，对应内部规则名称；界面隐藏编号不改变规则身份。政策文字的编辑也不等于新增一套自动评分程序，仍须由已实现的题型和评分流程执行。

## 10. Rule libraries → Review rules / Change history

| 区域／字段 | 含义 | 可编辑性 |
| --- | --- | --- |
| Required reviews | 题目后续必须完成的审核环节，例如编辑、能力与等级、语言内容、评分、公平性和技术检查 | 只读显示当前中央规则 |
| Published limitations | 当前规则仍有哪些使用限制或证据限制 | 多行可编辑列表；按实际情况填写 |
| Change history | 在 Rule library 中选中后查看操作、操作人和时间 | 只读，不提供版本切换、回滚或撤销按钮 |

点击设置页的 Publish，发布的是中央规则；它不等于完成某一道题的全部人工审核，也不会把题目自动发布到 Staging。

## 11. 一个完整例子：阅读公共开放时间通知

下面是按当前字段可以完成的示例配置，不代表示例值已经自动写进数据库。

### 选择任务与情境

1. 在 Item rules 选择 Blueprint slot：`Signs, labels, and short notices`。
2. Item format 选择 `Single select`。
3. Primary Can-do 选择 `Understand signs, labels, and short notices`，始终只有一个。
4. 查看派生 Skill 为 Reading、主 Activity 为 Reception；查看对应 Task family 和评分合同。
5. Supporting Can-do 可以留空。
6. Allowed contexts 选择 `Understand public signs and opening information`。它明确支持该主 Can-do，且属于 Public；Domains 因而显示 Public。
7. 展开 Detailed rules，Observable evidence 填写“能够从极短通知中识别开放时间、入口或直接的禁止信息”。
8. A1 boundary 填写“信息明确、文本短，不依赖文化知识或隐含态度”。
9. Valid item example 可填写“通知写‘星期一不开门’，要求判断星期一能否进入”；反例可以是“根据长篇公告推断作者态度”。

不应因为 `Complete a simple purchase` 也属于 Public，就把它当成自动兼容。要先检查它的 Compatible Primary Can-do 是否真的包含当前主能力，并确认其范围与任务目的吻合。

### 配置三个等级

在当前组合下方的 Difficulty 直接分别编辑三个等级，不再重复选择组合：

| 配置项 | Lower A1 示例 | Typical A1 示例 | Upper A1 示例 |
| --- | --- | --- | --- |
| Input length | Word or phrase | Short sentence | Two related phrases |
| Information points | 1 | 1 | 2 |
| Contextual support | High | Moderate | Limited |
| Distractor similarity | Clearly different | Moderate | Closely similar |

每行只设置一个值；系统同步保存对应默认值与单值范围。这里的变化是在 A1 内增加材料量或降低支持程度，复杂推断始终不允许。

### 如需新增情境

假设还需要“校园图书馆开放安排”：

1. 点击 Manage contexts，在 Contexts 输入名称并点击 Add Context。
2. 将 Primary Domain 设为 Educational，选择支持“理解标志、标签和简短通知”的 Can-do。
3. Scope 写清“校园图书馆入口、开放日期、开放时间及简单借阅提示”；需要时填写排除项。
4. 点击 Restore Context 启用。
5. 回 Item rules，在原组合的 Allowed contexts 中明确勾选它。新增进词库本身不会自动加入所有任务配置。
6. 原 Public 情境与新 Educational 情境都被选中且有效时，Domains 显示两个领域。

### 保存、发布、建题

完成设置后点击 Save draft，再点击 Publish。处理校验错误，通过后点击 Confirm publication。

然后回 Item Bank 点击 New items：选择同一 Blueprint slot、Item format 和唯一 Primary Can-do，再选择 Public 与公共开放信息 Context，或者 Educational 与校园图书馆 Context；最后选择一个难度等级。Number of items 保持 1，在 What this item should assess 选择语言目标。Options 中的 AI drafts per item 默认 1，也可输入有效正整数。点击 Generate 1 item 进入 Generation jobs，打开生成的题目后在 Prepare 比较 AI 题稿，点击 Use this draft 进入 Edit & preview，编辑实际通知、题干、选项和正确答案。也可在 New items 直接选择 Write manually，保存已选目标并进入 Edit & preview；之后生成或提交审核前仍须补齐要求。具体流程见 `ITEM-CREATION.md`。

## 12. 常见疑问与当前边界

| 疑问 | 当前实际行为 |
| --- | --- |
| 为什么切换 Slot 不显示 Unsaved？ | 这是切换正在查看的配置，没有改配置内容。 |
| 为什么没有 Slot title 输入？ | Slot 名称由中央 Slot 资料提供，不在组合配置中重复手填。 |
| 为什么 Add item rules 以后还是只有一个 Primary？ | 此操作新建了另一份可选组合；每份组合和每道题都只有一个 Primary。 |
| 为什么一个 Context 名称存在，但选不到？ | 它可能已停用、不支持所选 Primary，或者 Domain／名称／Scope 不完整。 |
| 为什么 Primary Domain 显示空选项并提示多个领域？ | 该记录实际存着多个 Primary Domain；页面不再假装只有第一个。选择一个领域修正。已知原始历史 D19／D20 在创建新草稿时按原始资料迁移，已发布记录与自定义配置不改写。 |
| 为什么 Domain 没有独立多选框？ | 设置页从真正有效的已选 Context 派生 Domain，避免两边选出矛盾范围。 |
| 为什么 Publish 不可用？ | 常见原因是未保存、正在请求、远程冲突、发布基线过期，或仍有已知阻塞校验错误。 |
| Save draft 成功是不是设置已生效？ | 不是。成功只表示草稿保存；Publish 确认成功才供新题使用。 |
| 三个 A1 等级是否会自动按数值单调递增？ | 当前检查等级齐全、取值合法和默认／允许范围一致；不会自动证明三个等级心理测量意义上逐级变难。 |
| 规则检查通过是否等于测量设计有效？ | 不等于。它证明结构与引用满足当前确定性约束，证据文字、任务效度与难度合理性仍需人工判断。 |
| Context 库是否支持直接删除？ | 当前只有新增、停用和恢复，没有硬删除按钮。 |
| 能否直接改技术 Schema 或新增题型？ | 当前设置页没有这些操作；技术契约由代码与注册文件维护。 |
| 所有说明文本是否都强制必填？ | 不是。Context 名称、Scope 等有明确拦截；任务证据、案例和部分说明文本尚未逐项强制非空。 |

## 13. 实现与依据文件

界面的当前规则以活动发布快照和它的草稿为准。仓库中的 Registry 文件提供基础资料，不能把已发布后单独修改的草稿误认为仍与原 YAML 完全相同。

| 范围 | 相对仓库路径 |
| --- | --- |
| 独立页面、返回和退出账户 | `client/pages/language-assessment-settings.tsx` |
| 工具栏、错误、历史 | `client/features/language-items/registry-settings-panel.tsx` |
| 保存、发布准备、并发与未保存保护 | `client/features/language-items/use-registry-settings.ts`、`registry-workflow.ts` |
| 校验反馈和发布确认窗口 | `client/features/language-items/registry-workflow-feedback.tsx` |
| 两条操作路径、唯一组合选择与基础库 | `client/features/language-items/registry-rule-editor.tsx` |
| 当前组合、增删组合与详细规则 | `client/features/language-items/registry-blueprint-editor.tsx`、`registry-configuration.ts`、`registry-configuration-actions.tsx`、`registry-task-rules.tsx` |
| 跟随组合的难度表格 | `client/features/language-items/registry-difficulty-editor.tsx`、`registry-difficulty-rows.tsx`、`registry-difficulty.ts` |
| 单选、文本、无效引用控件 | `client/features/language-items/registry-form-controls.tsx` |
| 可搜索的紧凑多选 | `client/features/language-items/registry-multi-select.tsx`、`registry-multi-select-options.ts` |
| 名称显示与内部引用转换 | `client/features/language-items/registry-display-text.ts`、`registry-reference-labels.ts` |
| 组合、Context、Domain、难度依赖 | `client/features/language-items/registry-capability.ts` |
| 语言内容兼容性 | `client/features/language-items/content-compatibility.ts` |
| 新建题目与单题设置 | `client/features/language-items/new-language-item-dialog.tsx`、`metadata-fields.tsx` |
| Registry 数据类型、基础资料装载 | `server/language_items/registry.rs` |
| 发布条件与中央规则校验 | `server/language_items/registry_store.rs` |
| 设置保存／发布 API | `server/routes/language_assessment_settings.rs` |
| 单题验证实际约束 | `server/language_items/validation.rs` |

基础 Registry 目录为 `language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/`，主要包括：

| 设置类别 | 目录内文件 |
| --- | --- |
| Slot | `blueprint/a1-slot-registry-v0.2-provisional.yaml` |
| Can-do | `construct/a1-can-do-registry-v0.2-provisional.yaml` |
| Context | `construct/a1-context-registry-v0.2-provisional.yaml` |
| Task family | `formats/a1-task-family-registry-v0.2-provisional.yaml` |
| Item format / Presentation | `formats/a1-item-format-registry-v0.2-provisional.yaml`、`formats/a1-renderer-registry-v0.2-provisional.yaml` |
| Scoring | `scoring/a1-scoring-registry-v0.2-provisional.yaml` |
| Delivery | `policies/a1-delivery-policy-registry-v0.2-provisional.yaml` |
| Language content | `content/` 下的词汇、汉字、语法、语用及辅助内容注册文件 |
| Review | `review/a1-review-registry-v0.2-provisional.yaml` |
| 技术数据契约 | `schemas/` 下的题型与 TaskPackage Schema |

难度默认值及每组合配置的装载还应对照 `server/language_items/registry.rs`；它们不只是一个界面上的 Lower／Typical／Upper 标签。
