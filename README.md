# Exam Creator

## Language Exam Item Creator

登录后可从 Landing Page 进入独立的中文 A1 题项工作台。当前软件按 15 个 Blueprint Slot 创建题项，并实现 7 种 Item Format 的 21 个合法组合。新建顺序固定为“考试任务 → 锁定能力目标 → 允许题型 → 系统实现合同”，随后完成领域、情境、难度、语言内容、命题、校验、GitHub 审核与 Staging 交付。每个 Item Format 自动加载唯一的固定编辑/预览模板，同时完整保留能力、语言内容、评分、交付和审核合同；内部规范编号默认不向普通用户展示。

本地开发可设置 MOCK_AUTH=true；登录页会提供“命题人 / 审核人”两个预设身份，也可创建更多测试审核人。服务端禁止作者审核自己的版本，不同审核人可分别完成不同审核门。AI 默认使用无需网络的 deterministic mock；可通过 LANGUAGE_ITEM_AI_PROVIDER=deepseek、LANGUAGE_ITEM_AI_MODEL 和 DEEPSEEK_API_KEY 启用 DeepSeek，OpenAI 也保留为可选 provider。模型输出不会自动批准或绕过服务端校验。

工作台提交的版本化资源位于 `language-item-workbench/`：`registries/` 保存可机读业务规则，`contracts/` 保存编译时 TaskPackage 合同。

## Using the Application

### Landing Page

From the landing page, you can see the exams saved to the database, and online users and what they are doing.

### Edit Page

#### Tag Config

The tag config consists of multiple tag sets, where a set of tags is required to have at least a specified number of questions.

##### Example

```
Question 1
tags: ["tag a", "tag b"]

Question 2
tags: ["tag a", "tag c"]
```

```
config:
  tags:
    - set: ["tag a"]
        number_of_questions: 2
    - set: ["tag c"]
        number_of_questions: 1
```

The above config would cause both Q1 and Q2 to be added to each generated exam. Q1 and Q2 fulfil the first tag config, and Q2 fulfils the second config.

Notice how the `number_of_questions` fields are not accumulated.

#### Question Type Config

The question type config is where the total number of questions is configured. For _Multiple Choice_ type questions, the `Number of Questions` field should only ever be `1`. In essence, for Multiple Choice\_ question types, read the inputs as:

- Number of Type: How many "Multiple Choice" questions should each exam have?
- Number of Questions: 1... always 1...

So, think of the "Multiple Choice" question type _less_ of a single question, and more of a group of questions whose element count is always one.

For Dialogue question types, it becomes clearer:

- Number of Type: How many "Dialogues" should each exam have?
- Number of Questions: For each "Dialogue", how many Multiple Choice questions should it have?

#### Questions

Available question types:

- Multiple Choice
- Dialogue

A multiple choice question consists of the question itself, optional extra context for the question, and the answers.

A dialogue question consists of context for the dialogue, and _multiple_ multiple choice questions. This is used for when multiple choice questions are linked to the same piece of context.

Questions may be given _tags_ to allow the exam generation the ability to ensure certain topics in the exam are covered.
