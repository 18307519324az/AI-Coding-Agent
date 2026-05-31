# AI Coding Agent PRD

> Source: `C:/Users/A1830/Desktop/AI Coding Agent PRD.docx`.
> This Markdown copy is generated from the provided DOCX so the repository has an auditable product baseline.

版本：v0.1项目仓库：18307519324az/AI-Coding-Agent目标形态：Web 控制台 + Agent Runner + GitHub Issue/PR 自动化开发辅助环境：Codex + Repo Skills + MCP产品运行时：OpenAI Agents SDK / Responses API + 自定义工具执行层 + GitHub API

## 1. 项目一句话定位

AI Coding Agent 是一个面向开发者的自动化编程助手：用户选择 GitHub Issue、Bug 描述或功能需求后，系统自动读取代码仓库、生成修改计划、申请用户批准、修改代码、运行测试、执行浏览器验证，并最终生成 Pull Request 草稿或直接创建 PR。

它不是单纯的聊天机器人，而是一个可追踪、可回滚、可审批、可测试的工程型 Agent 系统。

## 2. 产品目标

### 2.1 MVP 目标

MVP 需要完成以下闭环：

用户在 Web 控制台中输入一个任务，例如“修复登录页按钮点击无响应”。

用户绑定或输入 GitHub 仓库地址。

Agent 克隆仓库到隔离工作区。

Agent 分析项目结构、读取相关文件、生成执行计划。

用户确认计划。

Agent 修改代码。

Agent 自动运行 lint、typecheck、unit test。

如果项目包含前端页面，Agent 使用 Playwright 做浏览器验证。

Agent 生成变更摘要、测试结果和风险说明。

用户确认后，Agent 创建 GitHub Pull Request。

### 2.2 非目标

MVP 不做以下事情：

不直接自动合并 PR。

不直接操作生产环境。

不支持任意危险 shell 命令。

不做完整云 IDE。

不做多人协同实时编辑。

不默认让 Agent 自动推送到主分支。

不承诺一次性解决所有复杂任务，而是强调计划、验证、失败回滚和人工审批。

## 3. 目标用户

### 3.1 个人开发者

需求：

快速修复小 Bug。

生成测试。

改善前端页面。

重构重复代码。

自动生成 PR 摘要。

### 3.2 小团队 Maintainer

需求：

自动处理简单 Issue。

识别可自动修复的问题。

自动跑测试并产出风险说明。

降低代码审查压力。

### 3.3 学习型开发者

需求：

让 Agent 给出修改计划和解释。

观察 Agent 如何定位问题。

学习测试、重构和 PR 流程。

## 4. 核心用户故事

User Story 1：Issue 到 PR

作为开发者，我希望选择一个 GitHub Issue，让 Agent 自动分析、修改代码、跑测试并创建 PR，这样我可以节省处理低风险任务的时间。

验收标准：

可以输入 Issue URL 或 Issue 编号。

Agent 能读取 Issue 内容。

Agent 能生成计划。

用户批准后才修改代码。

修改完成后生成 diff、测试结果和 PR 描述。

用户批准后才创建 PR。

User Story 2：失败测试修复

作为开发者，我希望把失败的测试日志交给 Agent，让它定位原因并修复代码。

验收标准：

支持粘贴错误日志。

Agent 能定位可能相关文件。

Agent 能运行指定测试。

修复后必须重新运行失败测试。

不能只改测试来掩盖业务错误，除非用户明确要求。

User Story 3：前端页面去 AI 味

作为开发者，我希望 Agent 生成的前端页面不要有明显“AI 生成味”，而是更像真实产品。

验收标准：

页面避免过度渐变、玻璃拟态、空洞大标题和模板化文案。

页面有真实产品结构：导航、状态、表格、日志、空状态、错误状态。

页面布局紧凑、信息层级清晰。

交互包含 loading、error、disabled、empty、success 状态。

文案具体，不使用泛泛的 “Revolutionize your workflow” 类营销句。

User Story 4：代码审查助手

作为开发者，我希望 Agent 对自己的修改做一次自检，指出潜在风险。

验收标准：

输出改动范围。

输出测试覆盖情况。

输出潜在破坏性变更。

输出需要人工确认的问题。

输出是否建议创建 PR。

## 5. 产品形态

### 5.1 MVP 推荐形态

采用 monorepo：

AI-Coding-Agent/  apps/    web/                # Next.js Web 控制台    runner/             # Agent Runner 服务，负责克隆仓库、执行命令、调用模型、生成 patch  packages/    shared/             # 共享类型、工具函数、schema    ui/                 # 设计系统组件    agent-core/         # Agent 状态机、工具注册、审批策略  docs/    PRD.md    ARCHITECTURE.md    SECURITY.md    TESTING.md  .agents/    skills/             # Codex repo-level skills  .codex/    config.toml.example  .github/    workflows/      ci.yml  AGENTS.md  package.json  pnpm-workspace.yaml  README.md

### 5.2 技术栈建议

前端：

Next.js

TypeScript

Tailwind CSS

shadcn/ui 或自定义基础组件

React Hook Form

Zod

TanStack Query

后端 / Runner：

Node.js + TypeScript

Fastify 或 Hono

OpenAI Agents SDK 或 Responses API

simple-git

execa

zod

pino 日志

Prisma

数据存储：

MVP：SQLite + Prisma

v1：PostgreSQL

队列 MVP：内存队列或 SQLite job table

队列 v1：Redis + BullMQ

测试：

Vitest：单元测试

Playwright：E2E 测试

ESLint：静态检查

TypeScript：类型检查

GitHub Actions：CI

部署：

Web：Vercel / Cloudflare Pages / 自托管 Node

Runner：单独部署在受控服务器或容器中

不建议把 Runner 直接放在无隔离的普通 Web Server 里执行任意命令

## 6. Codex 开发环境设计

本项目需要区分两类 Agent：

Codex 开发 Agent：帮助你开发这个项目，需要安装 Skill 和 MCP。

产品内 AI Coding Agent：你要开发出来的产品，运行时有自己的工具、审批和沙箱。

Codex 的 Skill 和 MCP 是为了提高你开发这个仓库的效率，不应该直接等同于产品运行时能力。

## 7. Codex 必装 Skill

Skill 推荐放在仓库级目录：

.agents/skills/  repo-bootstrap/    SKILL.md  agent-architecture/    SKILL.md  issue-to-pr/    SKILL.md  failing-test-repair/    SKILL.md  playwright-e2e-verification/    SKILL.md  de-ai-frontend/    SKILL.md  security-review/    SKILL.md  eval-regression/    SKILL.md  pr-summary/    SKILL.md

### 7.1 Skill 安装策略

优先级：

先使用 Codex 内置 $skill-creator 创建技能。

项目专用技能放到 .agents/skills。

个人通用技能放到 $HOME/.agents/skills。

等项目成熟后，再考虑打包成 plugin。

### 7.2 Skill 清单

| Skill 名称 | 作用 | 触发场景 | 依赖 |
| --- | --- | --- | --- |
| repo-bootstrap | 初始化 monorepo、目录结构、CI、README、AGENTS.md | 新建项目、重构项目骨架 | 无 |
| agent-architecture | 设计 Agent 状态机、工具层、审批层、日志追踪 | 改 Agent 核心逻辑 | Context7 |
| issue-to-pr | 从 Issue 到 PR 的完整开发流程 | 用户要求实现 issue / 修 bug / 创建 PR | GitHub MCP |
| failing-test-repair | 分析失败测试并修复 | 测试失败、CI 失败、错误日志 | GitHub MCP、Playwright |
| playwright-e2e-verification | 写和运行 E2E 测试 | 前端功能、页面交互验证 | Playwright MCP / Playwright CLI |
| de-ai-frontend | 去除前端 AI 味，提升真实产品感 | 生成或重构 UI 页面 | Playwright、可选 Figma |
| security-review | 检查命令执行、token、越权、注入风险 | 改 runner、工具调用、GitHub 权限 | 无 |
| eval-regression | 维护 Agent 评测集和回归测试 | 每次改 Agent 行为 | 无 |
| pr-summary | 生成 PR 描述、测试报告、风险说明 | 创建 PR 前 | GitHub MCP |

## 8. “去前端 AI 味” Skill 详细设计

### 8.1 Skill 名称

de-ai-frontend

### 8.2 Skill 目标

让 Codex 在开发前端页面时避免生成常见 AI 模板风格，产出更像真实 SaaS 产品的 UI。

### 8.3 触发条件

当任务包含以下词语时触发：

前端

UI

页面

dashboard

console

layout

style

polish

去 AI 味

更像真实产品

shadcn

Tailwind

landing page

dashboard page

### 8.4 设计原则

必须避免：

大面积紫蓝渐变背景。

没有业务意义的玻璃拟态卡片。

“Transform your workflow with AI” 这类空洞文案。

所有卡片圆角、阴影、渐变都一样。

页面只有 hero、三个 feature card 和一个 CTA。

没有真实 loading、empty、error 状态。

没有表格、筛选、日志、审计轨迹等产品细节。

图标堆砌。

文案过度营销化。

应该采用：

更中性的企业级界面。

明确的信息架构。

左侧导航 + 顶部状态栏 + 主工作区。

真实数据密度。

表格、任务队列、日志时间线、diff 预览、测试结果卡片。

明确的 disabled、loading、error、empty、success 状态。

真实产品文案，例如“等待测试结果”“需要审批”“PR 已创建”。

可访问性良好的按钮、表单和对比度。

移动端至少不崩，但 MVP 以桌面端为主。

### 8.5 页面风格

推荐风格：

背景：中性浅灰或白色。

字体：系统字体。

主色：单一克制主色。

卡片：少量阴影，边框明确。

布局：12 列栅格或左侧导航布局。

表格：真实字段、状态 badge、操作按钮。

交互：按钮有明确状态。

### 8.6 UI 检查清单

每次 UI 改动后必须检查：

是否存在空洞营销文案？

是否存在无意义渐变？

是否所有组件都有状态？

表单是否有 label、placeholder、help text、error message？

任务状态是否清晰？

用户下一步操作是否明确？

移动端是否至少可读？

页面是否像真实工具，而不是模板展示页？

是否通过 Playwright 基础 E2E？

是否通过基本可访问性检查？

### 8.7 示例 SKILL.md

---name: de-ai-frontenddescription: Improve frontend UI to look like a real production SaaS product instead of a generic AI-generated page. Trigger for UI, dashboard, layout, style, polish, Tailwind, shadcn, or "去 AI 味" tasks.---You are improving frontend UI for a real developer tool.Goals:- Make the interface feel like a practical SaaS console.- Prefer restrained layout, real states, meaningful density, and specific product copy.- Avoid generic AI landing-page patterns.Avoid:- Purple/blue gradient hero sections.- Glassmorphism without product purpose.- Empty marketing copy.- Feature-card-only layouts.- Identical rounded cards everywhere.- Icon spam.Require:- Real navigation.- Clear status indicators.- Loading, empty, error, disabled, and success states.- Accessible form labels.- Tables or timelines where useful.- Specific copy tied to AI Coding Agent workflows.- Playwright verification when UI changes affect behavior.Before finishing:1. Summarize UI changes.2. List states covered.3. List any missing states.4. Run lint/typecheck.5. Run or propose Playwright checks.

## 9. Codex 必装 MCP

### 9.1 MVP 必装

## 1. Context7 MCP

用途：

查最新库文档。

降低过期 API 幻觉。

写 Next.js、OpenAI SDK、Playwright、Prisma 代码时使用。

安装：

codex mcp add context7 -- npx -y @upstash/context7-mcp

## 2. GitHub MCP

用途：

读取仓库。

读取 Issue。

读取 Pull Request。

查看 Actions。

创建 Issue / PR。

分析 CI 失败。

生成 PR 摘要。

建议先限制 toolsets：

export GITHUB_PERSONAL_ACCESS_TOKEN="你的 GitHub PAT"codex mcp add github \  --env GITHUB_PERSONAL_ACCESS_TOKEN="$GITHUB_PERSONAL_ACCESS_TOKEN" \  -- docker run -i --rm \    -e GITHUB_PERSONAL_ACCESS_TOKEN \    -e GITHUB_TOOLSETS="repos,issues,pull_requests,actions,code_security" \    ghcr.io/github/github-mcp-server

GitHub PAT 建议权限：

public repo：只给 public repo 相关权限。

private repo：只给目标仓库权限。

不要一开始给 admin、delete、workflow write 等高危权限。

创建 PR 前最好使用 prompt approval。

## 3. Playwright MCP

用途：

浏览器交互。

UI 功能验证。

截图。

可访问性结构检查。

让 Codex 检查真实页面行为。

安装：

codex mcp add playwright -- npx @playwright/mcp@latest

同时建议项目内安装 Playwright CLI / Test：

pnpm create playwright

说明：

MCP 适合探索性浏览器操作。

CLI 更适合稳定、可复现、CI 里的 E2E 测试。

两者都保留：Codex 调试时用 MCP，项目测试用 Playwright Test。

## 10. 可选 MCP

| MCP | 何时安装 | 用途 |
| --- | --- | --- |
| Sentry MCP | 项目上线后 | 根据线上错误自动生成修复任务 |
| Linear / Jira MCP | 有团队项目管理时 | 从任务系统拉需求 |
| Figma MCP | 做正式 UI 设计时 | 读取设计稿并实现 |
| Slack MCP | 团队协作时 | 发送运行结果和审批提醒 |
| Docs / Notion MCP | 有内部文档时 | 读取项目规范 |
| Database MCP | 后期 | 只读查询运行数据，谨慎开放写权限 |

MVP 阶段不建议接太多 MCP。工具越多，Agent 选择错误工具和误操作的概率越高。

## 11. Codex 配置建议

创建项目级示例文件：

.codex/config.toml.example

内容：

approval_policy = "on-request"[mcp_servers.context7]command = "npx"args = ["-y", "@upstash/context7-mcp"]default_tools_approval_mode = "auto"[mcp_servers.playwright]command = "npx"args = ["@playwright/mcp@latest"]default_tools_approval_mode = "prompt"tool_timeout_sec = 120[mcp_servers.github]command = "docker"args = [  "run", "-i", "--rm",  "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",  "-e", "GITHUB_TOOLSETS=repos,issues,pull_requests,actions,code_security",  "ghcr.io/github/github-mcp-server"]env_vars = ["GITHUB_PERSONAL_ACCESS_TOKEN"]default_tools_approval_mode = "prompt"tool_timeout_sec = 120

实际使用时复制：

cp .codex/config.toml.example .codex/config.toml

注意：

.codex/config.toml 可以加入 .gitignore，避免泄漏个人配置。

.codex/config.toml.example 可以提交到仓库。

高危工具必须使用 prompt approval。

创建 PR、写 Issue、触发 Actions 等操作必须人工确认。

## 12. AGENTS.md 设计

项目根目录创建：

AGENTS.md

推荐内容：

# AGENTS.md## ProjectThis repository builds an AI Coding Agent:- Web console for creating and monitoring coding tasks.- Agent runner for cloning repositories, editing code, running tests, and creating PRs.- Strong safety boundary around command execution and GitHub write actions.## Working agreements- Use pnpm.- Use TypeScript.- Keep code modular and testable.- Prefer small, reviewable commits.- Do not add production dependencies without explaining why.- Do not commit secrets.- Do not hardcode tokens.- All shell execution must go through the runner command allowlist.- All GitHub write actions require user approval.- All UI work should use the de-ai-frontend skill.## Required checksBefore finishing a coding task, run:```bashpnpm lintpnpm typecheckpnpm test

For UI changes, also run:

pnpm test:e2e

If a check cannot be run, explain why and provide the exact command the user should run.

### Frontend style

Avoid generic AI landing-page aesthetics.

Build practical SaaS console UI.

Include loading, empty, error, disabled, and success states.

Use specific product copy.

Keep layout restrained and readable.

### Safety

Never run destructive commands without explicit approval.

Never push directly to main.

Never expose environment variables in logs.

Never upload repository content to third-party systems unless required and approved.

---## 13. 产品核心架构### 13.1 总体架构```textUser  ↓Web Console  ↓API Server  ↓Job Queue  ↓Agent Runner  ↓Isolated Workspace  ↓GitHub / Local Tests / Playwright / OpenAI

### 13.2 组件职责

Web Console

负责：

登录。

仓库连接。

创建任务。

展示 Agent 计划。

人工审批。

实时日志。

展示 diff。

展示测试结果。

创建 PR 按钮。

API Server

负责：

用户鉴权。

任务管理。

审批状态。

日志查询。

PR 创建请求。

与 Runner 通信。

Agent Runner

负责：

创建隔离工作区。

克隆仓库。

分析代码结构。

调用模型。

生成计划。

修改文件。

执行允许的命令。

运行测试。

生成 diff。

创建分支。

推送分支。

创建 PR。

Agent Core

负责：

状态机。

工具注册。

模型调用。

计划生成。

失败重试。

审批中断。

trace 记录。

输出结构化结果。

## 14. Agent 状态机

### 14.1 状态定义

CREATED  ↓REPO_CLONING  ↓CONTEXT_ANALYZING  ↓PLAN_GENERATED  ↓WAITING_FOR_PLAN_APPROVAL  ↓IMPLEMENTING  ↓TESTING  ↓E2E_VERIFYING  ↓SELF_REVIEWING  ↓WAITING_FOR_PR_APPROVAL  ↓PR_CREATING  ↓COMPLETED

失败状态：

FAILED_CLONEFAILED_CONTEXTFAILED_IMPLEMENTATIONFAILED_TESTFAILED_E2EFAILED_PR_CREATECANCELLED

### 14.2 每个状态的输出

| 状态 | 输出 |
| --- | --- |
| CONTEXT_ANALYZING | 相关文件列表、项目类型、测试命令建议 |
| PLAN_GENERATED | 修改计划、风险、预计文件 |
| IMPLEMENTING | 文件 diff |
| TESTING | lint/typecheck/test 输出 |
| E2E_VERIFYING | Playwright 报告、截图 |
| SELF_REVIEWING | 风险说明、遗漏项 |
| PR_CREATING | PR URL |

## 15. Agent 工具设计

### 15.1 工具分类

只读工具

read_file

list_files

search_text

git_status

git_diff

read_package_json

read_test_output

低风险写工具

write_file

apply_patch

create_branch

format_files

中风险执行工具

run_lint

run_typecheck

run_unit_tests

run_specific_test

run_playwright_test

高风险工具

install_dependency

push_branch

create_pull_request

trigger_workflow

delete_branch

### 15.2 审批规则

| 工具 | 是否需要审批 |
| --- | --- |
| read_file | 否 |
| search_text | 否 |
| apply_patch | 计划批准后否 |
| run_lint | 否 |
| run_test | 否 |
| install_dependency | 是 |
| push_branch | 是 |
| create_pull_request | 是 |
| trigger_workflow | 是 |
| delete_branch | 是 |
| 任意 shell 命令 | 默认禁止 |

### 15.3 命令 allowlist

MVP 只允许：

pnpm installpnpm lintpnpm typecheckpnpm testpnpm test:e2enpm installnpm run lintnpm run typechecknpm testnpm run test:e2eyarn installyarn lintyarn typecheckyarn testnpx playwright testgit statusgit diffgit checkout -bgit addgit commitgit push

默认禁止：

rm -rfcurl | bashwget | bashsudochmod 777scpsshdocker run --privilegedevalnode -epython -c

说明：后续可以逐步开放，但每次开放都必须记录原因和风险。

## 16. 数据模型

### 16.1 User

type User = {  id: string  email: string  name?: string  createdAt: Date}

### 16.2 Repository

type Repository = {  id: string  owner: string  name: string  url: string  defaultBranch: string  provider: "github"  createdAt: Date}

### 16.3 AgentTask

type AgentTask = {  id: string  userId: string  repositoryId: string  title: string  prompt: string  issueUrl?: string  status:    | "CREATED"    | "REPO_CLONING"    | "CONTEXT_ANALYZING"    | "PLAN_GENERATED"    | "WAITING_FOR_PLAN_APPROVAL"    | "IMPLEMENTING"    | "TESTING"    | "E2E_VERIFYING"    | "SELF_REVIEWING"    | "WAITING_FOR_PR_APPROVAL"    | "PR_CREATING"    | "COMPLETED"    | "FAILED"    | "CANCELLED"  branchName?: string  prUrl?: string  createdAt: Date  updatedAt: Date}

### 16.4 AgentRunLog

type AgentRunLog = {  id: string  taskId: string  level: "debug" | "info" | "warn" | "error"  phase: string  message: string  metadata?: Record<string, unknown>  createdAt: Date}

### 16.5 Approval

type Approval = {  id: string  taskId: string  type: "PLAN" | "INSTALL_DEPENDENCY" | "PUSH_BRANCH" | "CREATE_PR"  status: "PENDING" | "APPROVED" | "REJECTED"  payload: Record<string, unknown>  createdAt: Date  resolvedAt?: Date}

### 16.6 TestResult

type TestResult = {  id: string  taskId: string  command: string  status: "PASSED" | "FAILED" | "SKIPPED"  output: string  durationMs: number  createdAt: Date}

## 17. API 设计

### 17.1 创建任务

POST /api/tasks

请求：

{  "repositoryUrl": "https://github.com/example/repo",  "title": "Fix login button",  "prompt": "The login button does not respond when clicked.",  "issueUrl": "https://github.com/example/repo/issues/12"}

响应：

{  "taskId": "task_123",  "status": "CREATED"}

### 17.2 获取任务详情

GET /api/tasks/:taskId

响应：

{  "id": "task_123",  "status": "WAITING_FOR_PLAN_APPROVAL",  "plan": {    "summary": "Investigate login button event handler and auth submit flow.",    "files": ["apps/web/app/login/page.tsx"],    "risks": ["May affect auth flow"]  }}

### 17.3 审批计划

POST /api/tasks/:taskId/approvals/:approvalId/approve

### 17.4 拒绝计划

POST /api/tasks/:taskId/approvals/:approvalId/reject

请求：

{  "reason": "Please avoid touching auth provider code."}

### 17.5 获取日志

GET /api/tasks/:taskId/logs

### 17.6 获取 diff

GET /api/tasks/:taskId/diff

### 17.7 创建 PR

POST /api/tasks/:taskId/create-pr

请求：

{  "title": "Fix login button click handler",  "body": "Summary, tests, risks..."}

## 18. 前端页面设计

### 18.1 页面清单

/  Dashboard/repositories  Repository List/repositories/new  Connect Repository/tasks  Task List/tasks/new  Create Agent Task/tasks/[id]  Agent Run Detail/settings  Settings

### 18.2 Dashboard

展示：

当前运行中的任务。

最近完成任务。

失败任务。

PR 创建数量。

测试通过率。

常用仓库。

### 18.3 Create Task 页面

字段：

Repository URL

Issue URL，可选

Task title

Task prompt

Branch prefix

Test command override，可选

是否允许安装依赖，默认否

是否允许创建 PR，默认需要审批

### 18.4 Task Detail 页面

核心模块：

任务状态条。

Agent 当前阶段。

执行计划卡片。

审批区。

日志时间线。

文件 diff。

测试结果。

E2E 截图和报告。

PR 草稿。

风险说明。

### 18.5 前端状态要求

每个核心页面都必须有：

loading state

empty state

error state

disabled state

success state

示例：

没有任务时：展示创建任务入口，而不是空白。

Runner 离线时：展示明确错误和重试按钮。

等待审批时：按钮文案必须明确，例如“批准计划并开始修改代码”。

测试失败时：展示失败命令、摘要和完整日志入口。

## 19. Agent 输出格式

### 19.1 Plan 输出

{  "summary": "Fix login button click handler and add regression test.",  "assumptions": [    "The issue is reproducible in the local web app."  ],  "targetFiles": [    "apps/web/app/login/page.tsx",    "apps/web/tests/login.spec.ts"  ],  "steps": [    "Inspect login form component.",    "Find missing onSubmit or disabled state issue.",    "Patch handler.",    "Add Playwright regression test.",    "Run lint, typecheck, and e2e test."  ],  "risks": [    "Auth flow may depend on external provider mocks."  ],  "requiresApproval": true}

### 19.2 Self Review 输出

{  "summary": "Updated login submit handler and added regression test.",  "changedFiles": [    "apps/web/app/login/page.tsx",    "apps/web/tests/login.spec.ts"  ],  "testsRun": [    {      "command": "pnpm lint",      "status": "PASSED"    },    {      "command": "pnpm typecheck",      "status": "PASSED"    },    {      "command": "pnpm test:e2e login.spec.ts",      "status": "PASSED"    }  ],  "risks": [    "External auth provider behavior was mocked locally."  ],  "recommendation": "Ready for PR review."}

### 19.3 PR Body 输出

## Summary- Fixed login button click handling.- Added regression test for login form submission.## Tests- pnpm lint- pnpm typecheck- pnpm test:e2e login.spec.ts## RiskLow. The change is isolated to the login form.## Notes for ReviewerThe external auth provider was mocked in E2E tests.

## 20. 测试全流程

### 20.1 本地开发测试命令

根目录 scripts：

{  "scripts": {    "dev": "pnpm --parallel dev",    "lint": "pnpm -r lint",    "typecheck": "pnpm -r typecheck",    "test": "pnpm -r test",    "test:e2e": "pnpm --filter web test:e2e",    "format": "pnpm -r format",    "ci": "pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e"  }}

### 20.2 单元测试

覆盖：

Agent 状态机。

命令 allowlist。

审批逻辑。

GitHub URL 解析。

PR body 生成。

日志脱敏。

Zod schema 校验。

示例用例：

- should reject dangerous command: rm -rf- should require approval before create_pull_request- should move from PLAN_GENERATED to WAITING_FOR_PLAN_APPROVAL- should redact tokens from logs- should parse GitHub issue URL

### 20.3 集成测试

覆盖：

创建任务后能入队。

Runner 能创建工作区。

Runner 能克隆测试仓库。

Agent 能读取 package.json 并判断包管理器。

Agent 能生成计划。

审批后能执行 patch。

测试失败后状态变为 FAILED_TEST。

PR 创建前必须有审批。

### 20.4 E2E 测试

使用 Playwright。

核心路径：

用户打开 Dashboard。

用户连接测试仓库。

用户创建任务。

页面进入任务详情。

Agent 生成计划。

用户批准计划。

页面展示日志增长。

页面展示 diff。

页面展示测试通过。

用户批准创建 PR。

### 20.5 Agent Eval 测试

建立目录：

evals/  cases/    fix-simple-ts-error.json    add-unit-test.json    improve-ui-de-ai.json    reject-dangerous-command.json    failing-test-repair.json  runner.ts

每个 case 包含：

{  "id": "fix-simple-ts-error",  "repoFixture": "fixtures/simple-ts-app",  "prompt": "Fix the TypeScript error.",  "expectedFilesChanged": ["src/index.ts"],  "mustRunCommands": ["pnpm typecheck"],  "forbiddenCommands": ["rm -rf"],  "successCriteria": [    "typecheck passes",    "diff is minimal",    "summary is generated"  ]}

### 20.6 安全测试

必须测试：

token 是否会出现在日志中。

Agent 是否能执行禁止命令。

未审批是否能 push。

未审批是否能创建 PR。

是否能读取工作区外文件。

是否能通过 prompt 注入绕过 allowlist。

是否能访问 .env 并输出。

是否能删除仓库文件。

### 20.7 前端去 AI 味测试

人工 + 自动检查：

自动检查：

页面是否存在空状态。

页面是否存在错误状态。

关键按钮是否有 disabled 状态。

表单是否有 label。

任务详情是否有日志时间线。

是否存在测试结果展示。

是否存在 diff 展示。

人工检查：

页面是否像真实开发工具。

文案是否具体。

是否过度使用渐变和装饰。

是否一眼能看懂任务状态。

是否有明确下一步操作。

## 21. CI/CD 流程

### 21.1 GitHub Actions

创建：

.github/workflows/ci.yml

内容：

name: CIon:  pull_request:  push:    branches:      - mainjobs:  test:    runs-on: ubuntu-latest    steps:      - uses: actions/checkout@v4      - uses: pnpm/action-setup@v4        with:          version: 10      - uses: actions/setup-node@v4        with:          node-version: 22          cache: pnpm      - run: pnpm install --frozen-lockfile      - run: pnpm lint      - run: pnpm typecheck      - run: pnpm test      - run: pnpm test:e2e

### 21.2 PR 必须通过

lint

typecheck

unit test

e2e test

agent eval smoke test

## 22. 安全与合规要求

### 22.1 Secrets

禁止：

把 GitHub token 写入日志。

把 OpenAI API key 写入日志。

把 .env 提交到仓库。

把用户仓库内容发送到非必要第三方。

必须：

使用环境变量。

日志脱敏。

token 权限最小化。

PR 创建前展示完整 diff。

高危操作必须审批。

### 22.2 工作区隔离

每个任务必须有独立目录：

.workspaces/  task_123/    repo/

任务完成后：

默认保留一段时间方便调试。

用户可以删除。

后台定期清理。

### 22.3 命令执行边界

所有命令必须经过：

User Request  ↓Agent Plan  ↓Command Policy  ↓Approval Check  ↓Execution  ↓Log Redaction  ↓Result Storage

禁止 Agent 自由拼接 shell 命令执行。

## 23. 开发里程碑

Phase 0：仓库初始化

目标：

初始化 monorepo。

添加 README。

添加 AGENTS.md。

添加 PRD。

添加 Codex skills。

添加 CI。

交付物：

README.mdAGENTS.mddocs/PRD.mddocs/ARCHITECTURE.mddocs/SECURITY.md.codex/config.toml.example.agents/skills/*.github/workflows/ci.yml

Phase 1：Web 控制台 MVP

目标：

Dashboard。

Create Task 页面。

Task Detail 页面。

mock 数据。

去 AI 味 UI。

交付物：

可运行前端。

基础页面状态完整。

Playwright E2E 覆盖核心页面。

Phase 2：Runner MVP

目标：

创建任务。

克隆仓库。

创建隔离工作区。

读取项目结构。

生成计划。

等待审批。

执行 patch。

运行测试。

交付物：

Agent 状态机。

工具 allowlist。

日志系统。

测试结果记录。

Phase 3：GitHub PR 闭环

目标：

创建分支。

commit。

push。

创建 PR。

生成 PR body。

交付物：

Issue 到 PR 的完整链路。

PR 前审批。

PR 后展示链接。

Phase 4：质量增强

目标：

Agent eval。

安全测试。

更细的失败恢复。

UI polish。

E2E 增强。

交付物：

evals 目录。

安全测试报告。

更稳定的失败提示。

Phase 5：部署

目标：

Web 部署。

Runner 部署。

环境变量配置。

日志和监控。

交付物：

staging 环境。

部署文档。

运维手册。

## 24. MVP 验收标准

MVP 完成需要满足：

用户能创建一个 Agent Task。

Agent 能克隆指定 GitHub 仓库。

Agent 能分析代码并生成计划。

用户能批准或拒绝计划。

Agent 能修改代码。

Agent 能运行 lint/typecheck/test。

前端任务详情页能展示状态、日志、diff 和测试结果。

用户能批准创建 PR。

系统能创建 GitHub PR。

所有高危操作必须审批。

日志不能泄漏 token。

UI 通过去 AI 味检查。

CI 全部通过。

## 25. 推荐的第一批 GitHub Issues

可以在你的新仓库里创建这些 Issue：

Issue 1：Initialize monorepo

内容：

Initialize the AI-Coding-Agent monorepo with pnpm, TypeScript, apps/web, apps/runner, packages/shared, packages/agent-core, and basic CI.

Issue 2：Add AGENTS.md and Codex skills

内容：

Add repository-level AGENTS.md and initial Codex skills under .agents/skills, including de-ai-frontend, agent-architecture, issue-to-pr, failing-test-repair, security-review, and eval-regression.

Issue 3：Build Web Console mock UI

内容：

Build the initial Web Console with Dashboard, Create Task, Task Detail, mock data, and realistic SaaS UI states.

Issue 4：Implement Agent Task state machine

内容：

Implement AgentTask state machine with CREATED, CONTEXT_ANALYZING, PLAN_GENERATED, WAITING_FOR_PLAN_APPROVAL, IMPLEMENTING, TESTING, SELF_REVIEWING, WAITING_FOR_PR_APPROVAL, PR_CREATING, COMPLETED, and FAILED states.

Issue 5：Implement command allowlist

内容：

Implement safe command execution policy for runner. Block dangerous shell commands, redact secrets, and require approval for high-risk operations.

Issue 6：Implement GitHub PR creation

内容：

Implement branch creation, commit, push, and pull request creation with explicit approval before GitHub write actions.

Issue 7：Add Playwright E2E

内容：

Add Playwright E2E tests for creating a task, approving a plan, viewing logs, viewing diff, and approving PR creation.

Issue 8：Add Agent eval suite

内容：

Add eval cases for simple TypeScript fix, failing test repair, UI polish, dangerous command rejection, and PR summary generation.

## 26. 给 Codex 的第一条开发 Prompt

在仓库初始化后，可以这样让 Codex 开始：

Read AGENTS.md and docs/PRD.md. Use the repo-bootstrap skill.Initialize this repository as a pnpm TypeScript monorepo for AI-Coding-Agent.Create:- apps/web Next.js app- apps/runner Node TypeScript service- packages/shared- packages/agent-core- docs/ARCHITECTURE.md- docs/SECURITY.md- docs/TESTING.md- .github/workflows/ci.yml- .codex/config.toml.example- .agents/skills with the initial skills from the PRDRequirements:- Use restrained SaaS UI style.- Include loading, empty, error, disabled, and success states in the web mock.- Add lint, typecheck, test scripts.- Add at least one unit test for command allowlist.- Add at least one Playwright smoke test.- Do not add secrets.- Do not push to GitHub without asking.

## 27. 风险列表

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| Agent 执行危险命令 | 高 | allowlist + 审批 |
| token 泄漏 | 高 | 日志脱敏 + 最小权限 |
| 修改范围过大 | 中 | 计划审批 + diff 审批 |
| 测试不稳定 | 中 | 固定命令 + E2E 分层 |
| UI 看起来像模板 | 中 | de-ai-frontend skill |
| 误创建 PR | 中 | 创建 PR 前审批 |
| 依赖安装引入风险 | 中 | 安装依赖必须审批 |
| Agent 幻觉项目结构 | 中 | 先读文件，再计划 |
| MCP 工具过多导致误用 | 中 | 只装必要 MCP |
| 成本不可控 | 中 | 限制上下文、任务时长、重试次数 |

## 28. 最终完成定义

项目达到以下状态，才算完成 v1：

Web 控制台可正常使用。

Runner 可稳定执行任务。

支持 GitHub Issue 到 PR。

支持人工审批。

支持测试和 E2E 验证。

支持 Agent 自检报告。

支持日志和 trace。

支持安全命令策略。

支持至少 5 个 eval cases。

UI 达到真实 SaaS 产品水准。

README 能让新用户 10 分钟内跑起来。

CI 通过。

至少成功对一个真实测试仓库创建 PR。
