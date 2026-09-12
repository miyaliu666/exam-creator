# Language content 功能梳理与流程核查

核查日期：2026-09-11。本文结合本次讨论、此前“现在的词汇和语法添加方法是什么？是否可以批量添加，例如 excel 导入？”中的讨论，以及当前代码和本地流程验证。

本文记录现状、发现的问题和待实现需求，不代表已经修改产品功能。此前对 Language coverage 的讨论包含“先不改代码”；历史正文查找、严格语法形式匹配等仍按待实现需求记录。四技能字段是讨论中的设计建议，尚不是已经实现或已经确定的字段变更。

文中 Item 指一份完整的命题条目；Language content entry 指目录里的一个语言内容条目。Item rules、Item setup 和语言条目不是同一层对象。

## 1. 功能的实际边界

Language content 是 Assessment Settings 中的语言内容目录。它回答两个问题：目录里有哪些语言内容，以及每个条目允许用于哪些 Item。

目前的完整关系为：

```text
目录条目：Category + Name + Meaning / Structure + 可选资料
    ↓
适用条件：Mastery scope AND Applicable Can-do AND Applicable Context
    ↓
Settings 草稿 → Save draft → 检查与确认 → Publish
    ↓
新 Item 绑定本次发布的 Settings 版本
    ↓
作者明确选择核心语言目标，或辅助材料类型
    ↓
AI 生成 / 人工编写 → Checks → 人工 Review
    ↓
Planned assessment targets：记录选择了哪些目标
Confirmed assessment targets：结合当前内容的人工证据确认测量目标
```

目录中的资料、Item 明确选择的目标、正文里出现的文字，以及经过证据确认的测量目标，是不同事实。

例如某 Item 选了词汇“我们”，正文还出现了“你”：当前计划目标只包含“我们”；正文里有“你”并不会自动为 Item 增加这个目标，也不会直接变成“已确认考查‘你’”。查找所有正文中出现“你”的历史 Item，是后文单独记录的待实现需求。

## 2. 五类内容的关系

| Category | 管理对象 | Item 中的位置 | 当前要求 | 合理性与边界 |
| --- | --- | --- | --- | --- |
| Vocabulary / 词汇 | 词语或固定表达的一个具体义项 | 核心语言目标 | 新建时必须填写词语和 Meaning | 同一词语的不同义项可以分别建条目；等义的不同文字解释不一定能自动查重 |
| Grammar / 语法 | 一个有名称的结构或用法 | 核心语言目标 | 新建时必须填写 Grammar name 和 Structure | Name 与 Structure 的分工需要结合严格形式查找需求进一步统一 |
| Characters / 汉字 | 单字认读等字符层面的内容 | 核心语言目标 | Name 必填；Pinyin 等可选 | 与词汇包含的字有重叠；选中词汇不会自动增加字目标 |
| Pragmatic functions / 语用功能 | 问候、请求、道歉等交际用途 | 核心语言目标 | Name 必填；其他资料可选 | 不能靠某个词出现就直接确认交际功能得到考查 |
| Supporting material types | 人名、地名等辅助背景材料类型 | 辅助材料引用 | Name 必填；其他资料可选 | 不应成为核心语言目标；类别名不等于实际材料或具体人名 |

划分类别有用途，但它们不是语言学上互不重叠的集合。词汇中包含某汉字，或问候表达中使用某词汇，不能据此把所有关联条目自动加成已考查目标。

目前系统用不同 ID 分别管理各类条目；核心目标写入 `targetContentIds`，辅助类型写入 `supportingContentRefs`。客户端与服务端会校验两类引用不能混放。[字段分区校验](../server/language_items/validation.rs#L193)

## 3. 全部字段及其关系

| 页面字段 / 内部字段 | 填写规则 | 与其他字段的关系 | 系统如何使用 | 是否必要 |
| --- | --- | --- | --- | --- |
| Category / `kind` | 新建时选择；已存在的条目不能改变类别 | 决定名称标签、必填义项或结构，以及核心／辅助分区 | 显示、筛选、查重、目标选择与校验 | 必要 |
| Word or phrase / Grammar name / Name / `label` | 全部类别必填 | 与类别、Meaning 或 Structure 一起参与身份比较 | 显示、搜索；词汇与汉字还用于正文字符串匹配 | 必要 |
| Meaning / `meaning` | 新词汇必填；旧条目原来缺失时允许逐步补全 | 说明本词汇条目纳入范围的具体义项；与英文简释独立 | 显示、搜索、查重、AI 参考 | 词汇必要；不是自动生成的翻译 |
| Structure / `pattern` | 新语法必填；旧条目原来缺失时允许逐步补全 | 与 Grammar name 共同说明语法；参与语法身份比较 | 显示、搜索、AI 参考 | 当前是必填描述文字，尚不是可执行匹配规则 |
| Mastery scope / `masteryScope` | 默认 Not restricted；可选理解、表达、两者兼有 | 与 Item 的主要报告技能匹配；再与 Can-do、Context 条件取交集 | 候选条目兼容性与服务端校验 | 有限制用途；目前“不限制”和“两者兼有”行为重复 |
| Applicable Can-do / `canDoIds` | 搜索多选；不选表示 Not restricted | 命中 Item 的 Primary Can-do 或任一辅助 Can-do 即满足本维度 | 兼容性、筛选、引用有效性校验 | 有限制用途；不需要为所有条目强行枚举 |
| Applicable Context / `contextIds` | 搜索多选；不选表示 Not restricted | 必须包含 Item 当前 Context，或本字段不限制 | 兼容性、筛选、引用有效性校验 | 有限制用途；不需要为所有条目强行枚举 |
| Details → Pinyin / `pinyin` | 可选 | 对应条目读音；不自动从词语生成或验证 | 显示、搜索、AI 参考 | 可选资料 |
| Details → English meaning / `englishGloss` | 可选 | 对应条目的简短英文解释；与 Meaning 不自动同步 | 作者显示、搜索、AI 参考；显式填写优先于内置显示提示 | 可选资料；English meaning 是显示名称，数据字段仍是 englishGloss |
| Details → Examples / `examples` | 可选，多条 | 展示条目预期的用法；不是某个 Item 的正文 | 保存、导出；被选为核心目标时传给真实 AI | 可留空，不应强求作者编造 |
| Details → Usage restrictions / `restrictions` | 可选，自由文字 | 说明允许、排除或需要注意的用法 | 保存、导出；核心目标的 AI 参考 | 可留空；不是机器必定执行的禁止规则 |
| Details → Sources / `sources` | 可选，多条 | 记录语言条目的依据；不同于某个 Item 的原创性证据 | 保存、导出、追溯；核心目标的 AI 参考 | 可留空；链接不自动读取 |
| Details → Notes / `notes` | 可选，自由文字 | 放无法由其他字段表达的补充记录 | 保存、导出；核心目标的 AI 参考 | 可留空 |
| ID / `id` | 单条新建自动生成；新增导入可自动生成；更新导入必须使用现有 ID | 连接发布版本中的条目与 Item 引用；类别不可随同一 ID 改变 | 稳定关联、更新、引用校验 | 内部必需，日常新增表单不需要手填 |
| Additional metadata / 其他未识别字段 | 导入可用 JSON 对象保留；编辑时保留已有资料 | 不得覆盖标准字段，也不应混成另一个并行字段体系 | 序列化、保存、导出；核心目标会随对象传给 AI | 为兼容来源资料保留，不宜作为日常作者输入 |

词汇示例：Word or phrase 填“我们”，Meaning 填“第一人称复数，指说话者及与其同属一组的人”，Pinyin 可填 `wǒmen`，English meaning 可填 `we; us`。这几项分别说明形式、义项、读音和英文简释；系统不会证明它们彼此一致。

语法示例：Grammar name 可以是一个作者容易识别的名称，Structure 可以是 `因为……所以……`。但当名称本身也是 `因为……所以……` 时，两个必填字段重复；这需要在设计层统一，见第 9 节。

Examples、Usage restrictions、Sources、Notes 都是可选资料。缺少这些资料不会单独阻止添加、保存或发布；没有可靠依据时应留空。它们可人工填写或从表格导入，不能因为系统收到了文字就认为文字已经被验证正确。

当前还有一个表单不一致：新建汉字、语用或辅助类型时，Meaning／Structure 默认不显示；如果条目已经通过导入带有这些字段，Details 才显示它们。因此导入能表达的部分资料在新建弹窗中不能直接输入。[表单条件](../client/features/language-items/content-entry-fields.tsx#L20)

完整字段契约见 [前端 ContentIdOption](../client/features/language-items/types.ts#L644)、[服务端 ContentIdOption](../server/language_items/registry.rs#L137)。

## 4. 三个适用范围如何共同起作用

一个条目能否用于当前 Item，取决于三个条件同时成立：

```text
Context 匹配
AND 主／辅助 Can-do 至少一个匹配
AND Mastery scope 与 Item 的主要报告技能匹配
```

| 维度 | 空值 | 非空值 |
| --- | --- | --- |
| Applicable Context | 不限制 | Item 的 Context 必须在所选列表中 |
| Applicable Can-do | 不限制 | Item 的主要或辅助 Can-do 中至少一个在所选列表中 |
| Mastery scope | 不限制 | Receptive 允许 Listening / Reading；Productive 允许 Speaking / Writing；Receptive and productive 两类都允许 |

例如一个词汇限定 Reading／理解、Can-do A、Context D01，Item 即使在 D01，也必须同时具有兼容的 Can-do 和理解类主要技能才能使用。列表中选多个 Can-do 是本维度内的“任一匹配”，不是要求 Item 同时拥有全部 Can-do。

适用条件只是允许范围。把某词设为“表达”不代表生成出的 Item 一定要求考生说出或写出它；实际考查关系需要内容和证据确认。

现有条目的限制也不应在编辑或导入时被默认清空。新增的空值表示不限制；更新导入的空白表示保留原值。这是两个不同操作的语义。

服务端验证引用存在、Context 未停用、掌握范围值有效；目前没有进一步验证这些限制组合后是否至少对应一个可用 Item。因此作者可以保存引用均有效、但实际无法被某些或任何现有 Item setup 使用的组合。

代码依据：[客户端兼容逻辑](../client/features/language-items/content-compatibility.ts#L6)、[服务端要求检查](../server/language_items/validation.rs#L1120)、[掌握范围映射](../server/language_items/validation.rs#L1217)。

## 5. 单条新增、查重、编辑与搜索

操作路径为 Assessment Settings → Rule libraries → Language content。已有条目显示在目录表格中；New entry 打开单条新增弹窗，点击条目打开编辑。

新增时，输入名称后立即比较同类别的已有名称。当前查重会规范全半角、大小写和多余空白，并识别部分内置语法／语用条目的已知中英文显示别名。

| 情况 | 当前行为 |
| --- | --- |
| 同类别、同名、相同 Meaning／Structure | 阻止新增或将现有条目改成这个身份 |
| 同类别、同名、不同 Meaning／Structure | 展示已有条目，允许直接编辑；确实是不同义项或用法时，需要显式确认 |
| 词汇“我们／第一人称复数”，新增“我们／we” | 显示同名条目，但不能自动证明两种释义等义 |
| 词汇中包含一个已有汉字 | 不跨类别合并，不自动增加汉字考点 |
| 已经存在重复记录，修改 Notes 等资料 | 保留编辑能力；改变名称或身份字段才重新查重 |
| 比较的条目或输入内容发生变化 | 原来的同名确认失效，需要重新检查 |

查重没有做 AI 语义判断，也不检查英文释义、拼音、例句是否重复或正确。汉字、语用和辅助类型的精确身份比较目前主要依赖类别与名称；Meaning／Structure 只有在词汇／语法的对应类别中参与身份比较。

目录搜索覆盖显示名称、Meaning、Structure、Pinyin 和 English meaning。More filters 中的 Can-do／Context 筛选会包含不限制该维度的条目，因此是在找“适用于该范围”的条目；这不等于只找“明确标注了该引用”的条目。Examples、Sources、Notes 不在当前目录主搜索范围中。

编辑弹窗是暂存区。Add to draft／Apply changes 才将修改放入页面上的 Settings 草稿；Cancel 可以丢弃。离开页面、刷新和退出账号会检查未保存或未应用的修改。条目基线变化时，弹窗会阻止直接覆盖，保留暂存值供处理。

代码依据：[规范化与查重](../client/features/language-items/content-catalog-model.ts#L42)、[过滤搜索](../client/features/language-items/content-catalog-model.ts#L83)、[弹窗确认和基线检查](../client/features/language-items/content-entry-dialog.tsx#L20)。

## 6. Excel、Markdown 与粘贴批量导入

Import 将文件和粘贴内容汇入同一套预览。支持 `.xlsx` 工作簿、`.md`／`.markdown` 表格、`.tsv`／`.txt` 表格，以及直接粘贴 Excel 复制的制表符数据。也可以先粘贴名称列表，再在预览里补足必填字段；自由段落不会被自动理解为完整语言学条目。

Download template 提供 Excel 和 Markdown 模板。模板包含字段名以及当前 Can-do／Context 对照。Excel 的说明页和引用页不参与导入；公式单元格需先替换为文字值。当前不支持直接上传 `.csv` 文件。

解析后的流程为：

1. 表头已识别且不冲突时直接进入预览；否则进入 Column mapping。
2. 每行显示来源位置、字段、错误和同名条目，可以编辑或明确排除。
3. More fields 展开可选列；Set scopes for included rows 显式批量修改所选行的范围。
4. 必填字段、引用、重复身份等检查通过后，应用参与的行到 Settings 草稿。
5. 再执行 Save draft、Publish，供之后的新 Item 使用。

| 操作 | 新增模式 Add new entries | 更新模式 Update existing entries by ID |
| --- | --- | --- |
| 默认模式 | 是 | 必须明确切换 |
| ID | 可自动生成；不得占用现有 ID | 必须是当前目录已有 ID，通常从 Export 获取 |
| Category | 支持逐行填写或用空白单元格的默认类别 | 不得改变现有条目的类别 |
| Name | 必填 | 空白保留原值；不得清成空名称 |
| Meaning／Structure | 新词汇／新语法分别必填 | 空白保留；已有完整的必填内容不得用清空指令删除 |
| 空白可选文字字段 | 未提供 | 保留原值 |
| 空白范围字段 | Not restricted | 保留原范围 |
| `__CLEAR__` | 显式空值，仍需通过必填检查 | 清空可选字段；范围清空后表示 Not restricted |
| 范围中的 `Not restricted` | 明确不限制 | 明确取消原有该维度限制 |
| 文件没有列出的旧条目 | 保持原样 | 保持原样，不删除 |
| Additional metadata | 添加来源扩展字段 | 合并扩展字段，保留未提供的旧字段 |

Can-do 和 Context 支持现有 ID 或能唯一对应的名称；多值用分号分隔。Examples 和 Sources 支持分号分隔，或 JSON 字符串数组；值本身包含分号或换行时应使用数组。Additional metadata 必须是 JSON 对象，不能覆盖 ID、Category 等标准字段。

预览只应用明确参与且通过检查的行；有问题的行可以修正或排除。每个文件上限 5 MiB，预览合计上限 5,000 行。还有未处理粘贴文字或未完成列对应时，不能只应用已有部分后悄悄丢掉剩余输入。

Export 导出所有符合当前筛选的条目，不只是当前分页；含 ID、可选资料和未知扩展字段，可以用于后续按 ID 更新。页面预览里的文件名／行号帮助定位导入问题，不会自动作为条目 Sources 写入。

代码依据：[导入字段](../client/features/language-items/content-import-columns.ts#L1)、[新增与更新解析](../client/features/language-items/content-import-model.ts#L37)、[导入预览协调](../client/features/language-items/content-import-dialog.tsx#L29)、[Excel 读写与模板](../client/features/language-items/content-import-files.ts#L19)。

## 7. Save draft、Publish 与新旧 Item

三个保存层级需要分别理解：

| 操作 | 保存到哪里 | 新 Item 是否可见 | 旧 Item 是否改变 |
| --- | --- | --- | --- |
| Add to draft／Apply changes | 页面中的 Settings 草稿 | 否 | 否 |
| Save draft | 服务端可继续编辑的 Settings 草稿 | 否 | 否 |
| Publish | 新的不可变 Settings 发布版本，并设为活动版本 | 此后创建的新 Item 可见 | 保留原绑定版本 |

Save draft 检查拥有者、草稿状态和 revision，并校验语言条目的类型、ID、必填内容及引用。Publish 还执行整个 Settings 的完整校验、活动基线和 revision 检查，再激活发布版本。已发布快照不可直接编辑。

新 Settings 草稿可以补充来源文件里的词汇／语法元数据；已有显式值，包括作者明确清空的值，会被保留。已发布历史快照不会在读取时获得这些新语言规则。

新旧 Item 分别使用自己的 Registry 版本做选择、兼容性检查、AI 生成和引用解析。发布新词汇不能自动把旧 Item 迁移到新目录；需要历史正文查找时，应单独计算出现关系，而不是修改旧 Item 的固定引用。

代码依据：[Settings 页面保存与发布](../client/features/language-items/use-registry-settings.ts#L49)、[服务端 Save draft](../server/routes/language_assessment_settings.rs#L294)、[服务端 Publish](../server/routes/language_assessment_settings.rs#L695)、[新 Item 绑定版本](../server/routes/language_items.rs#L667)。

## 8. AI、Checks、Review 与 Language coverage 实际识别什么

| 环节 | 当前实际读取的内容 | 能判断什么 | 不能据此声称什么 |
| --- | --- | --- | --- |
| 条目保存／Settings 发布校验 | 字段类型、必填项、ID、类别、有效 Can-do／Context、掌握范围 | 数据结构及引用是否合法 | 不证明拼音、释义、例句、来源和语言规则正确 |
| Item 目标选择和要求检查 | 绑定版本的条目、Item 的技能／Can-do／Context | 引用是否存在、分区是否正确、适用条件是否兼容 | 不证明目标实际出现在正文或被考查 |
| 真实 AI 生成 | 核心目标完整条目、Item setup、信息点、内容与评分规则等 | 尽力参考义项、结构和可选资料生成 AI drafts | 自由文字限制不是保证执行的硬检查 |
| AI feedback | 核心目标完整条目、Item 内容、确定性检查等 | 提供独立建议 | 不替代正式 Checks 或人工 Review |
| Prepare → Word and character check | 兼容的词汇／汉字名称和当前候选正文 | 字符串是否出现，选中的词／字是否没有出现 | 不做分词义项辨析，不自动判断语法或语用，不证明考查成立 |
| Language evidence and sources | 作者对当前 Item 内容的关系判断与依据 | 将目标标注为理解必需、产出必需、机会、辅助或未体现等 | 没有证据或只出现文字，不能自动算已确认考点 |
| Planned assessment targets | 保存的核心目标引用 | 作者明确计划测量了哪些目标 | 不覆盖所有正文出现的语言内容 |
| Confirmed assessment targets | 与当前内容关联的已审查核心目标证据 | 对理解或产出确有必要的核心目标 | 不把可选表达机会、辅助材料或未体现目标算入 |

真实 AI 当前有一项缺口：核心 `targetContent` 会解析成完整对象，但辅助 `supportingContentRefs` 只传 ID，没有同时传入辅助条目的名称、例句、使用规则等。因此“所有条目资料都会传给 AI”这个说法过于宽泛，应限定为被选中的核心目标资料。[生成输入](../server/language_items/ai.rs#L471)、[AI feedback 输入](../server/language_items/ai.rs#L597)

Prepare 的文字检查只对 Vocabulary、Characters 执行字符串包含检查；Grammar、Pragmatic functions 明确留给人工确认。词汇的多个义项即使都命中同一文字，也不能据此确定实际使用了哪个义项。[正文匹配逻辑](../client/features/language-items/metadata-fields.tsx#L87)

当前覆盖统计只投影保存的目标／辅助引用和证据，不扫描 Item 正文。统计在一个 Registry 版本内进行；旧记录缺乏可用证据时是未知状态，不能直接当作零覆盖。[覆盖字段](../server/language_items/coverage.rs#L66)、[确认目标规则](../server/language_items/coverage.rs#L135)

Sources 链接不会触发自动打开、语料导入或 RAG。条目 Sources 描述这个语言条目的依据；Item 的 Language evidence and sources 描述具体 Item 的使用证据和材料来源，两者不能互相替代。

## 9. 合理性结论与待整理事项

目前单条新增、统一导入、暂存后保存发布、保留历史版本的主流程是合理的。主表单保留身份字段与适用条件，可选资料收在 Details，也符合减少填写负担的方向。下列问题需要分别处理，不能靠增加引导文字掩盖。

| 优先级 | 问题 | 影响与已核实依据 | 后续处理方向；本次未实现 |
| --- | --- | --- | --- |
| P2 | 服务端没有同身份内容查重 | Save draft 检查重复 ID，但两个不同 ID 的同类别、同名、同义项条目可以保存并通过 Registry 校验；本地诊断已复现 | 服务端应与单条／导入的身份规则一致，仍允许现有重复记录修改非身份资料；保留历史快照 |
| P2 | 辅助材料详细资料未进入 AI 输入 | `supportingContentRefs` 仅为 ID，无法让真实 AI 读取自定义辅助类型的说明 | 从 Item 绑定版本解析辅助条目，一并给生成与 AI feedback；继续保持核心／辅助分区 |
| P2 | 汉字、语用、辅助类型的内置丰富资料未补进当前目录快照 | 共用解析器只构造基本字段；草稿丰富化只处理词汇和语法。原 YAML 的汉字读音／关联词语、语用例式／礼貌条件、辅助规则等仍未进入丰富条目 | 只在新草稿按稳定 ID 和未改名条件补齐，保留显式编辑；不要补写已发布历史快照 |
| P3 | Grammar name 与 Structure 可能重复，严格查找对象不明确 | 新语法两项必填，但仅作为名称和说明；当前没有自动语法形式匹配 | 根据用户已表达的登记形式匹配需求，统一哪一个字段是标准形式、哪一个只是可选显示标题 |
| P3 | Mastery scope 的 Not restricted 与 Receptive and productive 当前行为相同 | 两者均允许理解和表达类主要技能；只是保存值不同 | 若采用未来 Applicable skills 方案，需要明确迁移含义，不能直接丢掉已有值或改变历史快照 |
| P3 | 新建表单和导入表达能力不完全一致 | 非词汇／语法条目可以通过导入携带 Meaning／Structure，新建弹窗默认没有相应输入 | 若这些类别需要定义，保留一个合适的可选定义字段；不要增加所有类别都必须填写的说明 |
| P3 | 范围组合可能没有可用 Item | 引用逐项有效不等于其交集非空 | 如需检查，应提示具体不兼容组合；避免自动清空作者限制 |

关键代码位置：

- [前端身份规范化与比较，content-catalog-model.ts:42](../client/features/language-items/content-catalog-model.ts#L42)
- [服务端仅有 ID 唯一性检查，registry_content.rs:159](../server/language_items/registry_content.rs#L159)
- [只有词汇／语法的来源丰富化，registry_content.rs:20](../server/language_items/registry_content.rs#L20)
- [通用目录条目构建时空置丰富字段，registry.rs:1365](../server/language_items/registry.rs#L1365)
- [核心目标对象与辅助 ID 的生成输入，ai.rs:471](../server/language_items/ai.rs#L471)
- [AI feedback 核心对象解析，ai.rs:597](../server/language_items/ai.rs#L597)

不建议要求作者补齐 Examples、Usage restrictions、Sources、Notes 来弥补这些问题。这些字段应继续保持可选，可靠资料才填写。也不需要重新增加范围开关、重复新增入口、长篇教程或把技术 ID 放回日常条目表单。

## 10. 此前讨论中的需求：现状与尚未实现部分

### 10.1 新增词汇／语法后查找历史正文

此前希望新登记并发布一个语言条目后，能够找到历史 Item 正文中的相关使用，即使当初没有把它选为目标。例如只选了“我们”的旧 Item，正文出现“你”，以后新增或查询“你”时也能找到。

这应是一种“正文出现情况”查询，独立于当前 Planned assessment targets 和 Confirmed assessment targets。查询可以使用某个明确选择的目录版本解释查找对象，扫描历史 Item 的考生可见内容，返回匹配位置和 Item；不需要重写旧 Item 绑定的 Registry 或目标引用。

至少需要明确匹配内容的版本、搜索区域、是否包含题干／选项／材料，以及重复出现时是统计 Item 数还是出现次数。命中表示形式出现；义项、实际考查和评分依赖仍是另一层判断。

现状：没有这项覆盖查询。当前单版本的引用与证据统计继续保持原含义。

### 10.2 严格登记语法形式匹配

此前明确要求“严格搜索语法名称，即因为……所以……”。应按登记的书面形式解释：在同一约定正文范围内，出现“因为”，之后出现“所以”，中间允许有约定的间隔内容。不能仅搜索“原因”等语义，也不能把其他因果表达自动扩展成同一登记形式。

这不是要求正文中出现字面省略号，而是需要将登记形式中的省略号解释为间隔。跨句、跨字段、标点、全半角、空白和多个命中的处理都需要定义。登记格式若同时含 `A/B` 或其他抽象符号，也不能在没有约定时自行推断。

现状：Structure 是说明字符串，Grammar name 是名称；Prepare 不自动识别语法，覆盖统计也不运行这种模式。不能声称已支持严格语法查找。

建议保留一个作者需要填写的标准语法形式，例如 `因为……所以……`，让它同时作为目录显示和形式查找的依据；功能解释作为可选资料。这样无需让作者重复填写两个相同字段。既有不同名称与 Structure 应保留并逐条整理，不能直接覆盖历史值。这是后续整理方向，本次没有执行字段迁移。

### 10.3 四技能字段建议

将理解／表达转成 Listening、Speaking、Reading、Writing 的 Applicable skills，是此前讨论中的可选设计建议。它可以更直接表达只用于 Reading、不用于 Listening 等限制，但当前尚未采用。

如果以后采用，需要给旧值确定兼容映射：Receptive 对应 Listening + Reading，Productive 对应 Speaking + Writing；Not restricted 与 Receptive and productive 的既有值应保留明确处理规则。它仍然是条目可用范围，不能从正文出现一个词就推断它实际被听、说、读或写考查。

此前讨论包含“先不改代码”。本轮按功能梳理范围记录上述方案，不把讨论建议当成已经发布的产品规则。

### 10.4 选中的目标必须落实考查

用户已明确：计划考查“因为……所以……”，生成的 Item 就必须考查这个目标。当前保存目标引用和将资料传给 AI，只能表达要求；正文出现检查即使以后支持严格形式，也只能证明文字出现。确认该结构对理解或作答确实必要，还需要内容、答案及考查证据配合。现有人工证据与 Review 可支持这层判断，不能声称生成阶段已自动保证所有目标实质落实。

## 11. 本次验证记录与限制

以下状态汇总本次实际操作、自动测试和代码核查。测试使用专用数据库，与日常 Item 和设置分开。

| 核查范围 | 当前结果 | 覆盖内容与边界 |
| --- | --- | --- |
| 前端相关自动测试 | 73 项通过 | 覆盖现有目录、导入、查重及相关模型；不是新增历史语法搜索的测试 |
| 隔离后端诊断流程 | 17 个阶段完成并符合诊断预期 | 包含保存／回读、无效引用与范围拒绝、重复 ID、revision、发布与新旧版本固定、兼容性、mock 生成 |
| 单条新增／编辑浏览器流程 | 已验证 | 仅填写名称和义项，Details 全部留空，加入草稿；保存后重开编辑并回读资料。查重另由自动测试覆盖 |
| Excel 浏览器导入 | 已验证 | 读取真实 `.xlsx`、预览和应用 |
| Markdown 浏览器导入 | 已验证 | 表格解析、预览和应用 |
| 按 ID 更新浏览器流程 | 已验证 | 显式 Update 模式、预览、空白保留与字段更新 |
| Save draft 与刷新回读 | 已验证 | 页面修改保存后可重新读取 |
| 实际筛选结果 Excel 导出 | 已验证 | 下载真实 Excel，并检查导出包含当前筛选结果 |
| 浏览器 Publish | 已验证 | 隔离环境中 Rules passed → Confirm publication → Published；发布后目录只读 |
| 发布后 New items 选择新条目 | 已验证 | 完成 Item setup；导入词汇和“因为……所以……”语法均能搜索并选择；未填 Details 的条目也可用 |
| Write manually 与 Prepare 回读 | 已验证 | 选中两个新目标后 Write manually 进入 Edit & preview，显示 Saved；回到 Prepare 后目标仍保留 |
| AI 输入预览 | 已验证 mock 提示，真实输入由代码核查 | 页面显示 Offline simulator: no prompt is sent to an AI provider；没有调用真实 AI。核心完整对象与辅助 ID 的区别来自当前请求构造代码 |
| 临时验证数据与服务清理 | 已完成 | 停止专用服务；仅删除专用数据库，集合数由 17 降为 0；保留测试报告和文件，正常应用数据未改动 |

17 阶段中的“backend-duplicate-name-and-meaning-observation”是专门揭示缺口的诊断：两个不同 ID 的相同名称／义项被服务端接受，Registry validation 仍返回有效；诊断在隔离发布前删除了重复测试条目。因此“诊断通过”不表示服务端查重功能正确。

隔离流程还验证了：可选 Details 全部省略也能保存并用于新 Item；新增目录内容不会进入尚未发布或绑定旧版本的 Item；不兼容的目标可以保留在待修复草稿，但 Checks 和 generation 会阻止继续生成；测试生成使用 deterministic mock，没有真实 provider 调用。

浏览器主流程使用 Reading signs、Single select 等六项 Item setup 完成手动创建，验证的“因为……所以……”是可搜索、可选择的登记目标；这并不表示已经自动识别了正文中的语法形式。

后端诊断证据保存在本地 [language-content-flow-result.json](../docs/language-content-flow-result.json)。`docs/` 为本地诊断目录，不作为产品数据或已发布规则。

浏览器操作记录见 [language-content-ui-flow-result.json](../docs/language-content-ui-flow-result.json)，实际导出回读断言见 [language-content-ui-export-result.json](../docs/language-content-ui-export-result.json)。导出事件观察曾超时，但下载的真实 Excel 已成功解析并验证，未将观察超时判作产品导出失败。

测试期间登录状态曾反复失效；改用 `localhost:8094` 后完成发布。代码支持同主机不同端口共用 Cookie 导致失效的可能性，未将此推断当作已证实根因。隔离服务最初复制的旧二进制没有新增 AI prompt 接口；更新为当前构建后，预览正常返回 mock 状态。正常应用服务和数据未改动。

清理结果见 [language-content-flow-cleanup-result.json](../docs/language-content-flow-cleanup-result.json)：测试端口已关闭，专用数据库已删除；合成语言条目、临时 Settings 和测试 Item 均随该数据库清理。

本次没有证明 AI 会准确执行自由文字限制，也没有验证例句、拼音和释义的语言学正确性；没有实现历史正文搜索、登记语法匹配或四技能字段。上述内容需要各自明确规格后再实施。
