# Exam Creator

## Language Exam Item Creator

### Local Setup

Install Git, Bun, Node.js, and Rust stable. Windows also requires a C++ build toolchain.

```bash
git clone --branch dev https://github.com/miyaliu666/exam-creator.git
cd exam-creator
bun install --frozen-lockfile
```

Set your AI API key in `.env`, for example:

```ini
DEEPSEEK_API_KEY=your_DeepSeek_API_key
```

Build the frontend and start the backend:

```bash
bun run build
cargo run --locked
```

Start the frontend development server in another terminal:

```bash
bun run dev --host localhost --port 8001
```

Open [http://localhost:8001](http://localhost:8001).

[Gist](https://gist.github.com/miyaliu666/0616cc867e90d176880ba68eb7966caa)

Set `MOCK_AUTH=true` in `.env` for local development. With the backend running in debug mode, opening the app automatically creates or reuses the Local User session and enters the home page without a Sign in step. If the backend is unavailable, the app shows a connection error with Retry.

### Workbench Flow

Open **Item bank** at `/language-items` to browse and filter items. **New items** uses one shared setup, quantity and language-target form for one or multiple items. Choose targets required in every item and, optionally, **Targets to distribute**; **Preview target allocation** shows each item's planned targets before generation. **Options** holds an optional name and candidates per item, which defaults to one. Use **Add another setup** only when the batch needs another configuration.

**Generate 1 item / Generate N items** opens **Generation jobs**, which holds progress, pause/resume and history. Each group shows its shared setup and required targets once; item rows show their identity, additional targets and generation state. Open an item, adopt a candidate, edit, check and submit for review. Generation status and assigned targets do not establish approval or actual language use.

A one-item plan can also use **Write manually**, which saves the selected targets and opens **Edit & preview** without calling AI. Empty manual drafts still need complete requirements before generation or submission. **Language coverage** can prepare a compatible creation plan from an explicit inventory goal. See [the item creation guide](language-item-workbench/ITEM-CREATION.md) for field meanings and review steps.

### AI Connection Troubleshooting

If every candidate fails with `The network connection could not be established`, check the backend's launch environment and its access to the configured API host. A server started from a restricted agent shell can inherit its network restrictions even when the browser and a normal terminal can reach the API. Start the backend from a normal network-enabled terminal or an approved network-enabled agent environment.

For the default OpenAI host, this Windows terminal check sends no API key and makes no generation request:

```powershell
curl.exe --max-time 15 --output NUL --write-out "HTTP %{http_code}\n" https://api.openai.com/v1/models
```

An HTTP `401` confirms that this terminal can reach the API over TLS; it does not verify the application's API key or successful generation. Compare connectivity in the backend's launch environment with a normal terminal. After changing the proxy or launch environment, restart the backend so it picks up the change, then verify generation in the application. Refreshing the page alone does not update the backend's connection settings.

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
