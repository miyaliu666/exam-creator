# Exam Creator

## Language Exam Item Creator

登录后可从 Landing Page 进入独立的中文 A1 题项工作台。Assessment Settings 维护并发布可复用规则；New item 从已发布规则中选择 Blueprint slot、Item format、Primary Can-do、Domain、Context、Difficulty 六项条件，随后进入 Prepare → Edit & preview → Check & submit，完成命题、校验、GitHub 审核与 Staging 交付。内置规则覆盖 15 个 Blueprint slot 和 7 种 Item format 的 21 个组合，每种题型加载固定的编辑／预览模板。创建后只需在 Item setup 查看设置；Edit item setup 可暂存并明确应用 Domain、Context、Difficulty 的纠正，采用本题绑定的完整中央难度方案。现有内容会保留，冲突由作者处理，变更后须重新检查；新规则发布不会改写旧题。详见 [工作台说明](language-item-workbench/README.md)和[建题流程](language-item-workbench/ITEM-CREATION.md)。

本地开发可设置 MOCK_AUTH=true；登录页会提供“命题人 / 审核人”两个预设身份，也可创建更多测试审核人。服务端禁止作者审核自己的版本，不同审核人可分别完成不同审核门。AI 默认使用无需网络的 deterministic mock；可通过 LANGUAGE_ITEM_AI_PROVIDER=deepseek、LANGUAGE_ITEM_AI_MODEL 和 DEEPSEEK_API_KEY 启用 DeepSeek，OpenAI 也保留为可选 provider。模型输出不会自动批准或绕过服务端校验。

工作台提交的版本化资源位于 `language-item-workbench/`：`registries/` 保存可机读业务规则，`contracts/` 保存编译时 TaskPackage 合同。

## 在另一台电脑运行

先安装 Git、Bun 和 Rust stable，以及 Rust 编译所需的平台工具链（Windows 使用 Visual Studio Build Tools 的“使用 C++ 的桌面开发”组件）。

```sh
git clone --branch dev https://github.com/miyaliu666/exam-creator.git
cd exam-creator
bun install --frozen-lockfile
```

如果已经克隆过仓库，先在项目目录运行 `git fetch origin`，切换到 `dev`，再运行 `git pull --ff-only` 和依赖安装命令。

通过安全方式单独复制原电脑的 `.env` 到项目根目录，或参照 `sample.env` 新建配置并填写：

- `COOKIE_KEY`：恰好 64 字节。
- `MONGODB_URI_PRODUCTION`、`MONGODB_URI_STAGING`：新电脑可访问的 MongoDB 连接地址。
- `SUPABASE_URL`、`SUPABASE_KEY`：服务端启动所需的非空 Supabase 配置。
- `MOCK_AUTH=true`：仅用于本地 debug 开发；使用 GitHub 登录时改为配置 OAuth 参数。
- `PORT=8080`、`ALLOWED_ORIGINS=http://127.0.0.1:8080,http://127.0.0.1:8001`。
- 按需复制 AI provider、模型、API key 和 GitHub review 配置；不配置 AI 时使用离线 mock。

`.env` 和数据库内容不会随 Git 推送。工作台题目、规则版本、AI 记录等保存在 Staging MongoDB 中；要继续使用现有数据，新电脑须连接同一数据库，或另行迁移原电脑的本地数据库。地址中的 `127.0.0.1` 指新电脑本身。

在项目根目录构建前端并启动后端：

```sh
bun run build
cargo run --locked
```

打开 `http://127.0.0.1:8080` 即可使用已构建的应用。开发时在另一个终端运行 `bun run dev`，改用 `http://127.0.0.1:8001` 获得前端热更新；后端仍需保持运行。

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
