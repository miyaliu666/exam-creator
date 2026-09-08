# Language Item Review Repository

本目录是独立、私有 GitHub 审题仓库的模板，不是题库数据库。把**本目录内容**（包括 `.github`）放在审题仓库根目录。应用提交 1–50 道题到 `item-review/<batchId>` 分支，审核者直接修改 PR 内题目 JSON；合并后由 Workbench 重新验证并同步。

本地已有模板、校验器和回归测试；**本文件不代表远程仓库、保护规则、凭据或 Webhook 已配置**。不要把示例替换成真实密钥提交到 Git。

## 1. 远程启用前必须完成的设置

1. 由可信维护者把模板放入审题仓库默认分支。保护默认分支及验证脚本／工作流／依赖文件，普通审题 PR 不能修改它们。启用 GitHub Actions；将动作引用固定到审核过的完整 commit SHA 后投产。
2. 为 `item-submission/*` 创建两组独立 Tag rulesets：第一组限制创建，只有应用的提交身份可创建；第二组禁止更新和删除，不能让审题者或提交身份通过第一组的 bypass 同时绕过不可变约束。普通审题者不得使用提交身份的 token，也不能有修改这些保护规则的管理权限。
3. 为目标分支要求 PR、人工批准，并配置每个 PR head 上的必需状态 `language-item-review/validated`。该状态由模板末尾的独立 reporting job 发布。不要仅依据 `pull_request_target` 所运行的 base commit 上的 job 结果放行。先在试验 PR 验证失败会阻止合并、再次提交后旧成功不能放行新 head。当前严格批次范围会拒绝把其他批次的 base 变更合入审题 head，因此不要同时启用强制分支更新到最新 base 的策略；独立题目的正常并行 PR 合并不要求把新 base 提交混入审题分支。
4. 根据组织策略设置审批者、最新提交重新审批及会话／讨论要求。规则维护 PR 走单独的受控维护流程；本模板故意不允许普通审题分支修改基础设施。
5. 在 Workbench 服务端配置 `GITHUB_REVIEW_ENABLED=true`、`GITHUB_REVIEW_REPOSITORY=owner/repository`、`GITHUB_REVIEW_TOKEN` 和需要的 `GITHUB_REVIEW_BASE_BRANCH`。提交身份需要 Contents 与 Pull requests 读写权限，并获准创建第 2 步的提交标签。
6. 若需自动同步，在 GitHub 建立指向 `https://<服务地址>/api/integrations/github/webhook` 的 Webhook，设置与服务端 `GITHUB_REVIEW_WEBHOOK_SECRET` 相同的 secret，订阅 `pull_request`、`pull_request_review`。未配置该 secret／Webhook 不会自动获得远程回调；仍可使用 Workbench 的手动同步入口。

Tag 是信任根：应用在创建 PR 之前将 `refs/tags/item-submission/<batchId>` 指向原始提交。缺少标签或无法证明 head 包含这个提交，校验立即失败。**如果标签可被审题者重写，本模板不能保证原始规则与来源未被篡改。**不能拿 PR 自己声明的 SHA、PR 描述或“分支最早的提交”替代受保护标签。

工作流使用 `pull_request_target` 的可信 base 代码，不检出或执行 PR 代码，只读取 Git 对象。验证 job 只有仓库读取权限；report job 不执行 PR 数据，仅用 `statuses: write` 为事件中的精确 head SHA 写入结果。自动生成的 `GITHUB_TOKEN` 足够，不需要给 workflow 放置 Workbench 的提交 token。[GitHub 的事件安全说明](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target)及 [rulesets 说明](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)解释了这些机制；实际保护范围必须由仓库管理员验证。

## 2. 应用提交的数据布局（schemaVersion 1.1）

```text
items/<itemId>.json
review-batches/<batchId>.json
review-batches/<batchId>/rules/<sha256(registryVersion)>/
  snapshot.json
  task-package.schema.json
  IF-SINGLE-SELECT.schema.json   # 本批次实际使用的题型；其他题型各有对应文件
```

`items/<itemId>.json` 包含 `schemaVersion`、`itemId`、`title`、`source`、`taskPackage`。`source` 包含不可变的 `batchId`、`versionId`、`versionNumber`、`contentHash`。

Manifest 的每个 `items[]` 记录 `itemId`、`versionId`、`versionNumber`、`path`、`contentHash`、`registryVersion`，以及三个 schema／snapshot 路径。每份规则快照按本批次隔离；不同批次或规则版本不能互相覆盖。

`source.contentHash` 是**原始提交内容**的审计指纹，不是审核修改后的题目 hash。改正题干或答案时保留 source；校验器比较 source 和原始 manifest，不会要求修改后的正文重新匹配原始 hash。

## 3. 审核者可以改什么

| 内容 | 审核 PR 中的处理 |
| --- | --- |
| `title` | 可改，不能空白 |
| `candidatePayload` | 可修题干、刺激材料、选项、字段、提示等；必须符合原题型完整 schema |
| `scoringPackage` 的答案、计分点说明／分值、具体任务标准 | 可改；答案必须指向有效响应单元，分值总和必须匹配最大分值，使用锁定的标准化政策 |
| `authoringPackage.notes` | 可改，保持在作者分区，不放到考生分区 |
| `authoringPackage.englishTranslations` | 可修英文对照；`path` 定位考生正文中的人类可读文本，`sourceText` 保存对应中文，`englishText` 为英文。修改中文后同步更新译文；考生分区禁止此字段 |
| `content.targetContentIds`、`supportingContentRefs`、`requiredInformationPoints` | 可修，但必须符合原快照的内容分区、Can-do、context、技能掌握范围和所选难度的信息点数 |
| `mediaRefs`、`variation` | 可改且必须符合数据契约；CI 不下载远程媒体，不代替版权、真实性和内容安全审核 |
| `source`、题目及任务身份、版本、中央规则绑定 | 不可改 |
| 创建时的主 Can-do、skill、activity、domain、context、完整 difficulty | 不可改；需要改变任务配置时返回 Workbench 修改草稿并重新提交 |
| `renderer`、`deliveryPolicyRefs`、`reviewPackage` | 不可改；不能通过 JSON 伪造人工批准 |
| 评分契约编号／版本、rubric、benchmark 版本 | 不可改 |
| Manifest、snapshot、两个 schema、其他批次文件、工作流／脚本 | 不可改；仅允许本批次 manifest 列出的 item JSON 发生审核修改 |

完整锁定路径定义在 `scripts/registry-checks.mjs` 的 `validateLockedFields`。Title／候选内容／答案修改有效，不等于人工审批已完成；人工审题与服务器导入仍分别执行。

## 4. 校验范围

- 以受保护提交为唯一原始来源，校验分支祖先、batch、item identity、immutable source，拒绝额外文件、删题、跨批次修改、symlink、可执行文件或 submodule 伪装成 JSON。
- 比对原始与 head 的 Manifest／规则文件字节，执行原始快照中的完整 Draft 2020-12 TaskPackage schema 和对应七种题型之一的 candidate schema，而不是宽松的替代 schema。Ajv 不加载远程引用。
- 校验 slot × format × 唯一 Primary Can-do、task family、renderer、delivery、scoring contract／rubric、context/domain 和内容引用关系。
- 校验每组合难度范围；现代快照缺失组合不退回全局难度。用户新增的 context ID 可以通过语法校验，但必须真实存在于所锁定的快照并与配置兼容。
- 检查答案引用、响应单元与计分点、计分合计、信息点引用；递归检查 candidate JSON 的嵌套对象和数组，阻止常见答案／评分／审核内部字段泄露，包括允许自由对象的 `sourceProfile`。
- 英文对照是独立校验的可选作者资料。旧快照未声明 `englishTranslations` 时，仅在用于 schema 校验的临时副本中去掉这一已独立校验的字段；其他字段仍执行原始 schema，快照和提交文件不被改写。原文变化后旧译文不作为当前内容显示；历史未带译文的题目继续有效。

CI 是确定性的第一道门禁，不等于全部教学质量判断，也不识别写进普通字符串的所有“暗示答案”。服务端在同步合并文件时仍重新执行完整 Workbench 校验和来源检查。发现不同步的业务校验应同时更新服务端与本模板，并增加回归测试。

## 5. 本地运行

需要 Node.js 22+、Git 和 npm。在独立审题仓库根目录：

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
node scripts/validate-review.mjs --repo . --batch <batchId> --base <完整base提交SHA> --head <完整PR-head提交SHA>
```

先从可信远程获取对应 `item-submission/<batchId>` 标签与 head 对象。CLI 不接受 PR 提供的 `--submission` 覆盖值；自己解析精确受保护标签。任何缺失／不符合条件以非零退出码失败。测试使用临时本地 Git 仓库，不连接 GitHub、数据库或 Webhook。

本项目内可直接运行 `node --test language-item-workbench/review-repository/tests/*.test.mjs`；部署模板后用模板自己的锁文件安装依赖。锁文件版本与完整性摘要来自本项目锁定的 Ajv 8.20.0 依赖树。

## 6. 来源与升级

- 从旧 Python 校验器升级时，在默认分支完整安装本模板，并删除 `.github/workflows/validate-language-items.yml` 和 `scripts/validate_language_items.py`；旧脚本只接受 `schemaVersion: "1.0"`，会拒绝应用现在提交的 `1.1` 文件。先用真实 Git 历史、原始提交标签和 PR head 执行新版校验，再部署；历史 1.0 文件保留原样，新校验器只读取当前批次。
- 默认分支升级后，给现有审题分支追加保持原 tree 的空提交以触发新的 `synchronize` 检查；不要把默认分支 merge/rebase 进题目分支，也不要只重跑旧 workflow。确认新 head 的 `language-item-review/validated` 成功；如分支保护仍要求旧 check，由维护者同步调整所要求的状态。
- 服务端生成文件与 Manifest：`server/routes/language_item_github.rs`；创建原始提交标签：`server/language_items/github.rs`。
- 主要服务端业务校验：`server/language_items/validation.rs`；完整 TaskPackage 契约：`language-item-workbench/contracts/language-item-task-package-v0.1.schema.json`。
- `tests/fixtures/` 保留真正的完整契约与 single-select／form-entry schema 的回归副本；运行时始终使用提交资产，不使用测试副本。
- 只接收新的 schemaVersion 1.1 批次。旧 1.0 历史文件没有新的完整资产／不可变标签，不能伪装成 1.1；需要重新提交，或由维护者设计独立且有审计记录的迁移。
- 已发布 Registry 快照和已经提交的规则资产不可变。context 语法从固定 D01–D20 扩展为注册表引用，不改变 TaskPackage 0.1 的字段结构；新版草稿经发布后，使用其新快照创建并提交题目。不要直接重写历史快照来让旧批次通过。
