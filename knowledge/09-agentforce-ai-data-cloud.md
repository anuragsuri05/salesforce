# 09 — Agentforce, Einstein AI, and Data 360 (formerly Data Cloud)

> **What this file covers**
> Salesforce's AI stack end to end: naming history, Agentforce (builder, Agent Script, agents, actions, channels, testing, observability, pricing), Einstein Trust Layer, Prompt Builder, models (Einstein Studio/BYOLLM, Koa), RAG, and predictive Einstein.
> Data 360 (formerly Data Cloud): ingestion, DLO/DMO, identity resolution, insights, segments, activation, zero-copy, credits; plus Slack AI, Tableau Next, MuleSoft, and Informatica as they relate to agents.

> **As-of date / volatility warning**
> Written **2026-10-08** (just after Dreamforce '26, Sept 2026, and around the **Winter '27** release). This is the fastest-moving area of Salesforce: product names have changed several times in 24 months (including a **partial rename reversal in Sept 2026**). Pricing, SKUs, GA status, and UI labels change every release (3 per year). Treat anything marked **(verify)** as uncertain, and when a user's org shows different labels, trust the org and current Help docs (help.salesforce.com, developer.salesforce.com) over this file.

---

## 1. Naming history and timeline

### 1.1 AI assistant / agent brand lineage

| Period | Name | Notes |
|---|---|---|
| 2016 (Sept) | **Salesforce Einstein** | Umbrella brand for predictive AI (Lead/Opportunity Scoring, Einstein Discovery, Next Best Action, Einstein Bots, Einstein Vision/Language). |
| Mar 2023 | **Einstein GPT** | First generative AI branding (email generation, service replies). Partnership with OpenAI. |
| Sept 2023 (DF '23) | **Einstein Copilot** + **Einstein 1 Platform** + **Einstein Trust Layer** + **Einstein Copilot Studio** (Prompt Builder, Skills Builder, Model Builder) | Copilot = conversational assistant in Lightning. GA Feb 2024. |
| 2024 | **Einstein 1 Studio** | Copilot Builder, Prompt Builder, Model Builder grouped. "Skills" renamed **Actions**. |
| Sept 2024 (DF '24) | **Agentforce** (GA Oct 25, 2024) | Einstein Copilot renamed **Agentforce Assistant** (later "Agentforce (Default)" / Employee agent). Copilot Builder became **Agent Builder**. Atlas Reasoning Engine introduced. Einstein 1 Edition renamed **Agentforce 1 Edition** (verify exact date; 2024–2025). |
| Dec 2024 | **Agentforce 2.0** | Prebuilt skills library, Slack actions, MuleSoft/Tableau actions, deeper Atlas reasoning, agentic RAG improvements. |
| Mar 2025 (TDX '25) | **Agentforce 2dx** | "Developer experience" release: Agentforce DX (CLI/VS Code), Agent API, proactive/ambient agents (data-triggered), AgentExchange marketplace, Testing Center expansions. |
| Jun 23, 2025 | **Agentforce 3** | **Agentforce Command Center** (observability), native **MCP** client support, expanded AgentExchange (30+ partners), updated Atlas architecture, natively hosted Anthropic models (via Bedrock inside trust boundary). Source: https://investor.salesforce.com/news/news-details/2025/Salesforce-Launches-Agentforce-3-to-Solve-the-Biggest-Blockers-to-Scaling-AI-Agents-Visibility-and-Control/ |
| Oct 2025 (DF '25) | **Agentforce 360** | Platform rebrand: Agentforce 360 = Agentforce Platform + **Data 360** + Customer 360 apps + Slack. New **Agentforce Builder**, **Agent Script**, **Agentforce Voice**, **Agentforce Vibes** (AI coding). Clouds renamed (Sales Cloud → "Agentforce Sales", Service Cloud → "Agentforce Service", Marketing → "Agentforce Marketing", Commerce → "Agentforce Commerce", Revenue Cloud → "Agentforce Revenue Management"). |
| Spring '26 (Feb 2026) | New Agentforce Builder **GA**; Agent Script **Beta**; Canvas view default. | |
| Apr 15, 2026 (TDX '26) | **Headless 360** | Everything in the platform exposed as API / MCP tool / CLI; 60+ MCP tools, 30+ coding skills for Claude Code, Cursor, Codex. Source: https://salesforcebreak.com/2026/04/17/headless-360/ |
| Summer '26 (Jun 2026) | Agent Script **GA**; legacy agent → new builder upgrade; Multi-Agent Orchestration (Beta); "Setup with Agentforce" GA (non-billable). | Source: https://admin.salesforce.com/blog/2026/jens-top-summer-26-release-features-for-admins |
| Sept 3, 2026 | **Editions simplified**: Core / Advanced / Max (Max replaces Agentforce 1 Edition). | Source: https://www.salesforce.com/news/stories/salesforce-simplifies-editions-2026/ |
| ~Sept 14, 2026 | **Partial rename reversal**: ~two dozen products drop "Agentforce" from names (e.g., Agentforce Sales → **Sales Cloud** again; Headless 360 platform → **Salesforce Platform**). **Agentforce 360** keeps its name. | Source: https://thenextweb.com/news/salesforce-drops-agentforce-branding-product-names-dreamforce |
| Sept 2026 (DF '26) | **AIforce** (Claudeforce, Slackforce, Agentforce Coworker), **Koa** CRM reasoning model, job-ready agents, long-horizon runtime, Agent Optimizer, AI Skills. | Source: https://www.salesforce.com/blog/dreamforce-2026-announcements/ |

> Note: the Sept 2026 reversal means **both** naming styles appear in docs, Trailhead and orgs right now. "Sales Cloud" and "Agentforce Sales" refer to the same product; same for Service Cloud / Agentforce Service. Edition SKUs (Sept 2026) still use names like "Agentforce Sales Max" (verify exact SKU strings).

### 1.2 Data platform lineage

Customer 360 Audiences (2020) → Salesforce CDP (2021) → Marketing Cloud Customer Data Platform → **Salesforce Genie** (DF '22) → **Data Cloud** (2023) → **Data 360** (rename effective Oct 14, 2025). Functionality unchanged by rename; Setup menus, API names, object prefixes, and many Help pages still say "Data Cloud" (e.g., `ssot__` namespace, `__dlm` suffix, "Data Cloud Setup"). Source: https://www.salesforceben.com/salesforce-data-cloud-renamed-to-data-360-as-part-of-agentforce-360/

### 1.3 Editions / bundles lineage

| Name | Period | Notes |
|---|---|---|
| Einstein 1 Edition (Sales/Service) | 2024 | ~$500/user/month list; bundled Data Cloud, Copilot, Prompt Builder. |
| Agentforce 1 Edition (Sales/Service/Industries) | 2025 – Sept 2026 | $550/user/month; included Flex Credits (2.5M/org/yr originally, reported). |
| **Core / Advanced / Max** editions | Announced Sept 3, 2026 | Core $195 (replaces Enterprise, 500k Flex Credits), Advanced $395 (replaces Unlimited, 1M Flex Credits), Max $550 (replaces Agentforce 1, 2.75M Flex Credits). All include Agentforce, Slack + Slackbot, analytics, security, Premier Success. Existing Agentforce 1 customers can upgrade to Max at no added cost. Source: https://www.salesforce.com/news/stories/salesforce-simplifies-editions-2026/ (credit amounts per org vs per user: **verify**) |
| Salesforce Foundations | 2024– | Free entitlement for Enterprise+ Sales/Service customers; includes Agentforce Builder, Prompt Builder, Agent Script, Agentforce Vibes, plus starter Data 360 / Flex Credit amounts (verify current quantities). |

---

## 2. Agentforce: concepts and architecture

### 2.1 Core building blocks

| Concept | Description |
|---|---|
| **Agent** | A configured AI agent (metadata: `Bot` + `BotVersion` + `GenAiPlannerBundle` in classic builder; `AiAuthoringBundle` with a `.agent` Agent Script file in the new builder). Has a type (Employee vs Customer/Service), a role/description, an agent user, topics/subagents, actions, variables, channels. |
| **Topic** (classic) / **Subagent** (Agent Script terminology, 2026) | A job-to-be-done grouping: classification description (when to use), scope, instructions, and the set of actions available. The reasoning engine first classifies user intent into a topic/subagent, then plans with that topic's actions. Docs now use `subagent` blocks in Agent Script; the UI and older docs still say "topic" (verify current UI label in user's org). |
| **Instructions** | Natural-language guidance per topic (classic) or `reasoning.instructions` in Agent Script; can mix deterministic logic and prompt text. |
| **Actions** | Tools the agent can call: standard (out-of-box) or custom (Flow, Apex, Prompt Template, API/External Service, MuleSoft, MCP tool, other agents). |
| **Atlas Reasoning Engine** | Salesforce's planner/orchestrator (ReAct-style loop: classify → plan → act → observe → respond). Updated in Agentforce 3 and again with Agent Script hybrid reasoning. |
| **Agent user** | For service/customer-facing agents, a dedicated running user (`Einstein Agent User` profile / "Agentforce Service Agent" user) whose permission sets determine record access. Employee agents run as the invoking user. |
| **Variables / Context** | Context variables (e.g., `MessagingSession` fields like `RoutableId`, `EndUserLanguage`) and custom variables; in Agent Script, `mutable` and `linked` variables. Filters can gate topics/actions on variable values. |
| **Connections / Channels** | Where the agent is deployed: Lightning panel, Messaging for In-App & Web (MIAW), Experience Cloud, Slack, Voice, Agent API, etc. |
| **Agent Router / start_agent** | Entry point that runs on every user message and routes to subagents (Agent Script). |

### 2.2 Classic topic configuration fields (Agent Builder, 2024–2025)

- **Name / API Name**
- **Classification Description** — what the topic is for; used to route utterances.
- **Scope** — what the agent can/can't do in this topic.
- **Instructions** — list of individual instruction strings (best practice: short, specific, non-contradictory).
- **Actions** — attached actions; each action has **instructions** (description used by LLM to decide), input instructions, output display options (`Show in conversation`), and "Require user confirmation".
- **Topic filters** — conditions on variables to include/exclude.
- System topics on new agents (vary by version): *General FAQ*, *Escalation*, *Off Topic*, *Ambiguous Question*, *Single Record Summary*, etc.

### 2.3 Limits worth knowing (classic; verify for current release)

- Up to ~15 topics per agent recommended (hard limits have been raised over time; verify).
- Up to ~15 actions per topic recommended; too many actions degrades routing accuracy.
- Instructions are prompt text — they are not guaranteed to be followed deterministically. Use Agent Script `if`/`run`/`transition`, action filters, or Flow logic for hard rules.

---

## 3. Agentforce Builder, Agent Script, and Agentforce Studio

### 3.1 Agentforce Studio

Agentforce Studio is the umbrella (Setup app area) for building and managing agents: **Agentforce Builder**, **Prompt Builder**, **Testing Center**, **Models (Einstein Studio)**, **Agentforce Observability** (Analytics, Optimization, Health Monitoring), and Agent Script editors. Access via App Launcher → *Agentforce Studio*, or Setup → *Agentforce Agents*.

### 3.2 Builder generations

| Generation | Period | UI |
|---|---|---|
| Copilot Builder | 2024 | Actions + Plan canvas preview. |
| **Agent Builder** (classic) | Oct 2024 – 2025 | Left panel: Topics, Actions, Connections, Language; center: topic detail; right: **Conversation Preview** with **Plan Canvas** / plan tracer showing topic selected, actions invoked, inputs/outputs, and reasoning. Requires agent to be **deactivated** to edit, then **Activate**. Versioning (agent versions) added 2025. |
| **New Agentforce Builder** | Announced DF '25; GA Spring '26 | Conversational development studio: describe the agent in natural language, builder generates Agent Script; switch between **doc-like Script editor** and **low-code Canvas view** (Canvas default since Spring '26); real-time preview + live debugging; Agentforce Vibes coding assistant built in. Legacy agents upgradable in a few clicks (Summer '26), converted to Agent Script. |

### 3.3 Agent Script (Beta Spring '26, GA Summer '26)

A Salesforce-specific language for agents that combines deterministic control with LLM reasoning ("hybrid reasoning"). Stored as a `.agent` file inside an **`AiAuthoringBundle`** metadata component (deployable with Salesforce CLI / Agentforce DX).

**Top-level blocks** (source: Trailhead "Agent Script Basics" — https://trailhead.salesforce.com/content/learn/modules/agent-script-basics/read-the-language-behind-the-canvas; reference: https://developer.salesforce.com/docs/ai/agentforce/guide/ascript-reference.html):

| Block | Purpose |
|---|---|
| `system` | Global instructions/persona, required messages (welcome, error). |
| `config` | Agent identity: developer name, default agent user, agent type. |
| `variables` | Global variables: `mutable` (agent can set) and `linked` (read-only, sourced from session, e.g., `@MessagingSession.ContactId`). |
| `language` | Supported locales. |
| `connection` (verify) | Channel-specific settings / instructions (e.g., messaging). |
| `start_agent` | Entry point evaluated on every user message (the router). |
| `subagent <name>` | (formerly topic) — `description`, `actions`, `reasoning` (`instructions`, `actions` the LLM may choose). snake_case names. |

**Instruction styles**
- `|` lines = prompt text sent to the LLM.
- `->` = hybrid/logic instructions, resolved deterministically **before** the prompt is assembled (`if`, `else`, `run @actions.x`, `set @variables.y = ...`, `transition to @subagent.z`).
- References: `@variables.Name`, `@actions.name`, `@subagents.name`; in prompt text use `{!@variables.Name}`.
- `available when <condition>` gates an action/subagent on state (verify keyword spelling).
- `before_reasoning` / `after_reasoning` hooks for deterministic steps around the LLM loop (verify).

**Illustrative snippet** (approximate; check official reference for exact syntax):

```text
variables:
    LifetimeValue: mutable number = 0
        description: "The value of Lifetime_Value__c from the Contact record."
    contact_id: linked string
        source: @MessagingSession.ContactId
        description: "The contact ID of the end user."

subagent order_status:
    description: "Help customers check the status of an existing order."
    reasoning:
        instructions: ->
            if @variables.LifetimeValue >= 50000:
                | Thank the customer for being a Platinum member!
            | Ask for the order number if it is not known, then look it up.
        actions:
            lookup_order: @actions.Get_Order_Status
```

**Why it matters:** instruction-only agents are non-deterministic; Agent Script lets you enforce "always verify identity before refund", fixed sequences, hand-offs, and guardrails in code while leaving open-ended dialog to the LLM.

### 3.4 Agentforce DX (pro-code)

- Salesforce CLI `agent` commands (verify exact set): `sf agent generate agent-spec`, `sf agent create`, `sf agent generate authoring-bundle`, `sf agent preview`, `sf agent test create|run|results`, `sf agent generate test-spec`, `sf agent activate|deactivate`, `sf agent publish authoring-bundle`.
- VS Code: Agentforce DX extension, Agent Script language support (syntax highlighting, validation), Agentforce Vibes (AI coding partner; earlier called "Agentforce for Developers"/"Einstein for Developers").
- Metadata types: `Bot`, `BotVersion`, `GenAiPlannerBundle` (formerly `GenAiPlanner`), `GenAiPlugin` (topic), `GenAiFunction` (action), `GenAiPromptTemplate`, `AiAuthoringBundle` (Agent Script), `AiEvaluationDefinition` (tests).

### 3.5 Testing

| Tool | What it does |
|---|---|
| **Conversation Preview / Plan Canvas** (builder) | Ad-hoc testing; shows chosen topic, actions, inputs/outputs, reasoning trace. Preview can run against live data — actions really execute (be careful with DML). |
| **Agentforce Testing Center** (GA ~Spring '25) | Batch tests: upload CSV or AI-generate test cases (utterance, expected topic, expected actions, expected response). Metrics: topic match, action match, response quality/outcome, plus custom evaluations (latency, string/number checks). Runs in sandbox recommended; consumes credits (verify). Metadata `AiEvaluationDefinition`; CLI `sf agent test run`. |
| **Voice & conversation (multi-turn) testing** | Beta (DF '26): multi-turn grading with task-resolution metrics. |
| **Custom Scorers** | DF '26: API GA, UI Beta — grade sessions against custom evaluation logic. |
| **A/B Experimentation** | Beta Oct 2026 — compare agent variants with analytics. |
| **Prompt Testing (batch)** in Prompt Builder | Beta (DF '26). |

### 3.6 Multi-agent

- **Multi-Agent Orchestration** (Beta Summer '26): build specialized agents (e.g., billing, shipping) and an orchestrator ("Superagent") that delegates in one conversation.
- **Agent2Agent (A2A)** protocol support and **MCP** (client since Agentforce 3; Salesforce-hosted MCP servers via Headless 360) — verify GA status per feature.
- **AgentExchange**: marketplace (formerly part of AppExchange) for agent templates, actions, MCP servers, partner agents.

---

## 4. Agent types and prebuilt agents

### 4.1 Employee vs customer-facing

| | Employee agent | Service / customer-facing agent |
|---|---|---|
| Former names | Einstein Copilot → Agentforce Assistant → "Agentforce (Default)" agent → **Agentforce Coworker** (DF '26, GA) (verify mapping) | Einstein Bots (predecessor) → Agentforce Service Agent (ASA) → "Agentforce Service" / Help Agent |
| Runs as | Logged-in user (their sharing/FLS) | Dedicated **agent user** |
| Surfaces | Lightning Experience side panel, Salesforce mobile, Slack, Agentforce Chat Client, Lightning Desktop | Messaging for In-App & Web, Experience Cloud sites, SMS/WhatsApp/other Messaging channels, Voice, Agent API, Slack |
| Billing | Flex Credits / per-user add-on / included in editions | Conversations ($2) or Flex Credits; **Help Agent resolutions** priced per resolution |

### 4.2 Prebuilt/templated agents (names drift — verify current templates in Setup)

| Agent | Purpose |
|---|---|
| **Agentforce Coworker** (DF '26) | Autonomous employee teammate inside Salesforce; NL Q&A across CRM, Slack, connected sources; executes plans by orchestrating other agents. GA. |
| **Service Agent / Help Agent** | Autonomous case deflection/resolution on messaging/web; Help Agent billed per successful resolution (400 Flex Credits per resolution on rate card ≈ $2). |
| **Service Rep Assistant** | Assists human reps (in Max/editions). |
| **SDR Agent** (Sales Development) | Nurtures inbound leads via email, answers questions, books meetings. |
| **Sales Coach** | Role-plays deals (discovery, pitch, negotiation) using deal context. |
| **Account Research / Prospecting agents** | Research accounts, draft outreach. |
| **Opportunity Management / Pipeline Management** | Deal updates, next steps (verify names). |
| **Merchant Agent** (Commerce) | Helps merchants set up sites, promotions, product descriptions. |
| **Buyer Agent** (B2B Commerce) | Self-service B2B ordering/reordering. |
| **Personal Shopper / Shopper Agent** (B2C Commerce) | Product discovery and guided shopping on storefronts. |
| **Campaign Agent / Marketing agents** | Generate campaign briefs, audiences, content, journeys (Marketing Cloud Next). |
| **Field Service agent / Field Voice** | Scheduling, pre-work briefs; hands-free voice for field reps (GA in mobile app, DF '26). |
| **Industry agents** | Financial Services (banking, wealth, insurance), Health (patient services, care coordination), Public Sector (case intake, permits), Manufacturing, Automotive, Consumer Goods, Media, Nonprofit, Education. |
| **Job-ready agents** (DF '26): **Piper, Hunter, Casey, Paige, Fin, Carter, Marshall** | Persona-named, job-specific agents (e.g., Piper = inbound SDR/lead nurturing; Fin = multichannel customer service; Hunter = outbound sales, GA Nov 2026; Marshall = back-office/supply chain). Mapping of all names to roles: verify. |
| **Agentforce for Setup** ("Setup with Agentforce") | Admin assistant for Setup tasks; GA Summer '26; non-billable. |
| **Agentforce Vibes** | AI coding agent for Salesforce developers (VS Code / Code Builder). |
| **Agent Optimizer** (DF '26, GA Oct 2026) | Agent that diagnoses/builds/refines other agents. |

### 4.3 Long-horizon agents (DF '26)

Long-horizon runtime: goal planning + durable execution so agents pursue goals over days/weeks. Pilot now; GA Nov 2026 (per Salesforce DF '26 blog).

---

## 5. Actions

### 5.1 Standard actions (examples)

Query Records, Identify Record by Name, Summarize Record, Draft or Revise Email, Answer Questions with Knowledge (RAG over Knowledge articles), Get Record Details, Update Record, Create Record (verify availability), Find Similar Cases, Draft Sales Email, Identify Object by Name, Extract Fields and Lookups from User Request, Get Activities Timeline, Search Slack (Slack actions), Create Canvas (Slack), Get Data Cloud/Data 360 data, Tableau insights. Standard actions consume 20 Flex Credits each in production.

### 5.2 Custom action types

| Type | How | Notes |
|---|---|---|
| **Flow** | Autolaunched flow (no screen) with input/output variables marked *Available for input/output*. | Most common low-code action. Descriptions on variables matter — the LLM reads them. |
| **Apex** | `@InvocableMethod` (with `label`, `description`) using `@InvocableVariable` wrapper classes for inputs/outputs. | Must be bulk-safe signature (`List<Request>` → `List<Response>`). Agent user needs class access. |
| **Prompt Template** | Flex or other template invoked as an action, returns generated text. | Good for summarization/generation steps. |
| **External Services / API** | Register OpenAPI spec as External Service with Named Credential → invocable actions. | |
| **MuleSoft API** | MuleSoft for Agentforce: Topic Center / API Catalog turns Anypoint APIs into agent actions. | |
| **MCP tools** | Agentforce 3+: register MCP servers (via AgentExchange/registry) as tools (verify GA scope). | |
| **Other agents** | Agent-to-agent delegation (orchestration). | |
| **AI Skills** (DF '26) | Reusable governed instructions for repeatable work across agents. Pilot now, GA Oct 2026. | |

Apex example:

```apex
public with sharing class OrderStatusAction {
    public class Request {
        @InvocableVariable(required=true description='Order number provided by the customer')
        public String orderNumber;
    }
    public class Response {
        @InvocableVariable(description='Human-readable order status')
        public String status;
    }
    @InvocableMethod(label='Get Order Status'
                     description='Returns the current status of an order given its order number.')
    public static List<Response> getStatus(List<Request> requests) {
        List<Response> out = new List<Response>();
        // bulkify: collect order numbers, single SOQL
        Set<String> nums = new Set<String>();
        for (Request r : requests) nums.add(r.orderNumber);
        Map<String, Order> byNum = new Map<String, Order>();
        for (Order o : [SELECT OrderNumber, Status FROM Order WHERE OrderNumber IN :nums]) {
            byNum.put(o.OrderNumber, o);
        }
        for (Request r : requests) {
            Response res = new Response();
            res.status = byNum.containsKey(r.orderNumber) ? byNum.get(r.orderNumber).Status : 'Not found';
            out.add(res);
        }
        return out;
    }
}
```

### 5.3 Action configuration in the builder

- **Agent Action Instructions** (description), **Input instructions**, **Output instructions**.
- *Require Input* / *Collect data from user*; *Filter from agent action* (hide output); *Show in conversation* (display output to user).
- *Require user confirmation* before running (for side-effecting actions).
- Rich output: Lightning Types / custom Lightning types to render structured responses (cards, lists) in supported channels; **Deterministic Rendering** via Agent Connections with channel-specific instructions (GA DF '26).

---

## 6. Deploying to channels

| Channel | Notes |
|---|---|
| **Lightning Experience** | Employee agent panel (Agentforce icon in header). Assign permission set (e.g., "Use Agentforce Default Agent"/"Agentforce Coworker" — verify). |
| **Salesforce mobile app** | Employee agent; voice for employee agents (pilot DF '26); Field Voice GA. |
| **Messaging for In-App and Web (MIAW)** | Primary web chat channel for service agents: create Messaging Channel → Omni-Channel Flow routes to agent → Embedded Service Deployment → code snippet on site. Escalation to human via Omni-Channel. (Legacy Chat/Embedded Chat retired Feb 2026 — verify.) |
| **Experience Cloud** | Embedded Messaging deployment on LWR/Aura sites; also "Agentforce for Experience Cloud" components. |
| **Enhanced messaging channels** | SMS, WhatsApp, Facebook Messenger, Apple Messages for Business, LINE via Messaging. |
| **Slack** | Deploy agents to Slack (DM/channel); Slackbot as agentic front door; Slack actions in agents. |
| **Agentforce Voice** | Real-time voice agents (Service Cloud Voice / contact center). Languages expanded DF '26 (Spanish, Italian, German, Portuguese, Japanese, Canadian French). Voice actions 30 Flex Credits. |
| **Agent API** | REST API to start sessions and send messages to agents from any app (Connected App / External Client App with client credentials; `/einstein/ai-agent/v1/agents/{agentId}/sessions`). Streaming supported. |
| **Agentforce Mobile SDK / Headless Experience Layer** | Embed agents in custom mobile apps; Headless Experience Layer (Beta DF '26) renders UI widgets once across surfaces. |
| **Email / Data-triggered (ambient)** | Agents invoked by Flow, Apex, platform events, Data 360 triggers (proactive agents, 2dx). |
| **Claude (Claudeforce)** | DF '26: Salesforce in Claude via AIforce (open beta, 37 prebuilt sales skills reported). |
| **Microsoft Teams** | Agentforce in Teams (2025, verify GA). |

---

## 7. Observability and operations

| Component | Details |
|---|---|
| **Agentforce Command Center** (Agentforce 3, Jun 2025) | Single pane for agent health, usage, adoption; Tableau-powered dashboards; alerts. |
| **Agentforce Observability** (GA late 2025) | Inside Agentforce Studio: **Agent Analytics** (deflection, abandonment, escalation, volume, quality scores), **Agent Optimization** (step-level traces: utterances, LLM calls, tool calls, guardrail checks, timings; clusters similar sessions), **Agent Health Monitoring** (GA; error rates, latency, 16+ indicators). |
| **Session Tracing Data Model (STDM)** | Data 360 DMOs storing sessions → interactions → steps → messages; query via Data 360 Query API or Tableau. Requires Data 360 enabled. |
| **Unmetered observability** | Salesforce announced observability (session tracing ingestion, metrics, dashboards) is unmetered across all Agentforce SKUs (verify effective date). Source: https://www.salesforce.com/blog/agentforce-observability/ |
| **Voice Observability** | GA DF '26 — audio quality and degradation. |
| **Einstein / Agentforce audit trail & feedback** | Generative AI Audit and Feedback Data stored in Data 360 (DMOs like `GenAIGatewayRequest`, `GenAIGeneration`, `GenAIFeedback`); reports via Einstein Generative AI Audit and Feedback dashboards. |
| **Utterance Analysis / Agentforce Analytics** | Earlier (2025) features; folded into Observability. |
| **Digital Wallet** | Consumption tracking for Flex Credits / Data 360 credits (Setup → Digital Wallet). |

---

## 8. Pricing models (Agentforce)

Source: https://www.salesforce.com/agentforce/pricing/ and Flex Credits Rate Card (Aug 18, 2026): https://www.salesforce.com/en-us/wp-content/uploads/sites/4/assets/pdf/agentforce/Flex-Credits-Rate-Card-08.18.2026.pdf

### 8.1 Timeline

| Date | Model |
|---|---|
| Oct 2024 | **$2 per conversation** (customer-facing). Conversation = 24-hour session (verify definition). |
| May 2025 | **Flex Credits** introduced: action-based, $0.10/action. |
| 2025 | **Per-user add-ons**: Agentforce for Sales/Service/Field Service $125/user/month; Industries $150; unmetered employee agent use. |
| 2025–Sept 2026 | **Agentforce 1 Editions** $550/user/month. |
| Mar 2, 2026 | Pricing overhaul (Data 360 + Agentforce on unified Flex Credits rate card) — verify details. |
| Sept 2026 | **Core/Advanced/Max** editions with included Flex Credits. |

### 8.2 Current models (late 2026)

| Model | Price | Notes |
|---|---|---|
| **Flex Credits** | $500 per 100,000 credits ($0.005/credit) | Standard or custom action = **20 credits** (~$0.10) prod / 16 sandbox. Voice action = **30** (~$0.15) / 24 sandbox. Buying: **Pre-Purchase**, **Pre-Commit** (monthly billing on baseline), **PayGo**. No rollover. |
| **Conversations** | $2 per conversation | Customer-facing agents only; can't mix with Flex Credits in same org. |
| **Help Agent resolutions** | 400 Flex Credits per resolution (~$2); sandbox 0 | Charged only on successful autonomous resolutions. |
| **Per-user add-ons** | $125/user/month (Sales, Service, Field Service); $150 (Industries) | Unmetered employee agent use + AI suite. |
| **Agentforce User License** | $5/user/month + Flex Credits | Employee access with metered usage. |
| **Editions** | Core $195 / Advanced $395 / Max $550 per user/month | Included Flex Credits: 500k / 1M / 2.75M. |

### 8.3 LLM prompt meters on rate card (Aug 2026)

| Usage type | Credits per prompt (prod/sandbox) |
|---|---|
| BYO LLM Starter Prompts | 2 / 2 |
| Salesforce-enabled LLM Basic Prompts | 2 / 2 |
| Standard Prompts | 4 / 4 |
| Advanced Prompts | 16 / 16 |

(Applies to Agentforce 1/Agentforce for Sales/Service/Industries and products that no longer use **Einstein Requests**; legacy contracts still meter "Einstein Requests" — verify per contract.)

Other meters: Speech-to-Text 150 credits/hour; Text-to-Speech 6,000 per 1M chars; Translation 4,000 per 1M chars; Personalization Decisioning 100 per 1k decisions; Headless 360 record CRUD / process invocation "TBA" (Aug 2026).

---

## 9. Einstein Trust Layer

Sits between Salesforce apps/agents and LLMs. Applies to Prompt Builder, Agentforce, Einstein generative features, Models API.

| Stage | Feature | What it does |
|---|---|---|
| Prompt (outbound) | **Secure data retrieval** | Grounding respects user's sharing, FLS, CRUD (agent user for service agents). |
| | **Dynamic grounding** | Merge fields, related lists, Flow/Apex outputs, Data 360 retrievers injected into prompts at runtime. |
| | **Data masking** | Detects PII/PCI (names, emails, phones, credit cards, SSNs, etc.) via pattern + ML; replaces with placeholders before sending; **demasks** in response. Configurable per entity type; also field-level **Data Classification/sensitivity** mapping. Masking not applied for Salesforce-hosted models in some cases and can be turned off (verify current defaults; for agents masking is often off by default because it hurts reasoning). |
| | **Prompt defense** | System policies/instructions to reduce prompt injection and hallucination. |
| Gateway | **Secure LLM gateway** | Routes to Salesforce-hosted or partner models (OpenAI/Azure OpenAI, Anthropic via Bedrock, Google Gemini via Vertex) or BYOLLM. |
| | **Zero data retention** | Contracts with third-party providers: no prompt/response retained or used for training. |
| Response (inbound) | **Toxicity detection / scoring** | Scores outputs (and prompts) across categories (toxicity, hate, violence, sexual, profanity, physical harm); scores logged. |
| | **Demasking** | Restores masked values. |
| Logging | **Audit trail** | Prompts, masked prompts, responses, toxicity scores, feedback stored in Data 360 (requires Data 360 provisioned) — "Einstein Generative AI Audit and Feedback". |
| | **Feedback** | Thumbs up/down + free text captured to audit DMOs. |

Setup: Setup → **Einstein Trust Layer** (enable data masking, configure entities; Einstein Generative AI audit toggles). Source overview: https://developer.salesforce.com/docs/ai/agentforce/guide/trust.html

Also: **Policy-Based Governance** in Data 360 (ABAC-style data policies, tagging/classification) and Informatica governance increasingly layered on top.

---

## 10. Prompt Builder

### 10.1 Template types

| Type | Invoked from | Notes |
|---|---|---|
| **Sales Email** | Email composer (Einstein "Draft with Einstein"), actions | Inputs: recipient (Contact/Lead) + related object. |
| **Field Generation** | Lightning record page field (Dynamic Forms) — sparkle button on a text field | Bound to object + field; output fills field for user review. |
| **Record Summary** | Agent "Summarize Record" action / record page | Used by employee agent summaries. |
| **Flex** | Flows, Apex, agent actions, REST API | Up to 5 custom inputs (any object or text) (verify limit). Most versatile. |
| Others | **Knowledge Answers**, **Case Summary/Work Summary** (service), Marketing/Commerce-specific types, **Automated** templates (verify) | Some types are product-specific or legacy. |

### 10.2 Grounding / resources

- **Merge fields** — record fields, related records via lookups (`{!$Input:Account.Name}`).
- **Related lists** — include related records (fields selectable).
- **Flows** — Template-Triggered Prompt Flow returning text via `Add Prompt Instructions`.
- **Apex** — `@InvocableMethod` with `CapabilityType` annotation (e.g., `PromptTemplateType://einstein_gpt__flex`) returning `Prompt` string.
- **Data 360 / Data Cloud** — DMO data via data graphs, Related attributes; **retrievers** for RAG (unstructured/semantic search).
- **Knowledge**, **Global variables** (e.g., current user, `$Organization`).

### 10.3 Prompt Template Workspace (UI)

- Left: **Resources** insert picker (Fields, Related Lists, Flows, Apex, Retrievers), instructions editor.
- Right: **Configuration** (template type, object, model selection — Salesforce default or BYO/specific model, e.g., GPT-4o/Claude/Gemini).
- Buttons: **Preview** (choose sample record; shows **Resolution** — resolved prompt — and **Response** with masking applied), **Save**, **Save As** (new version or new template), **Activate**/**Deactivate**, **Versions**, **Generate/Improve** (AI-assisted prompt writing — verify label), **Model settings** (temperature where allowed).
- DF '26 enhancements: **Conditional expressions** (branching, Beta), **Reference visibility** (GA), **Prompt Testing** batch (Beta).
- Templates are metadata (`GenAiPromptTemplate`) and versioned; only active version is used.
- Invoke from Apex via `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(...)` and from REST `/einstein/prompt-templates/{apiName}/generations`.

Permissions: **Prompt Template Manager** (build), **Prompt Template User** (run) permission sets.

---

## 11. Models: Einstein Studio / Model Builder, BYOLLM, Models API, Koa

### 11.1 Einstein Studio (aka Model Builder; now "Models" in Agentforce Studio)

Lives in Data 360. Manages:

| Model type | Description |
|---|---|
| **Salesforce-enabled / standard LLMs** | Salesforce-managed access to OpenAI GPT family (incl. Azure OpenAI), Anthropic Claude (hosted in Salesforce trust boundary via Amazon Bedrock), Google Gemini (Vertex AI), plus Salesforce models (e.g., xGen, **Koa**). Exact model list changes monthly — check "Supported Models" in Help. |
| **BYOLLM** | Connect your own: OpenAI, Azure OpenAI, Amazon Bedrock (Anthropic Claude, etc.), Google Vertex AI (Gemini), Databricks, or any via **LLM Open Connector** spec. Create **configured model** with temperature/params, test in **Model Playground**, then select in Prompt Builder / agents. |
| **Predictive (no-code) models** | Build regression/binary classification models on DMO data in Data 360 (clicks), deploy, use in Flows/Apex/fields. |
| **BYOM (predictive)** | Connect models from Amazon SageMaker, Google Vertex AI, Databricks, Snowflake (verify) with zero-copy features. |

### 11.2 Models API

REST + Apex (`aiplatform.ModelsAPI`) for direct generations, chat, embeddings through the Trust Layer, e.g., `/einstein/platform/v1/models/{modelName}/generations` (model names like `sfdc_ai__DefaultOpenAIGPT4OmniMini`, `sfdc_ai__DefaultBedrockAnthropicClaude...` — verify). Used to build custom gen-AI features in Apex/LWC.

### 11.3 Koa (DF '26)

Salesforce's first **CRM reasoning model**, post-trained from **NVIDIA Nemotron 3 Super** on synthetic CRM scenarios (14+ industries; no customer data). Salesforce controls weights; inference inside Salesforce trust boundary. Claims ~3x fewer errors on CRM actions per Salesforce CRM Benchmark. **Pilot now; GA Winter 2026 (U.S. regions)**. Source: https://investor.salesforce.com/news/news-details/2026/Announcing-Koa-Salesforces-First-CRM-Reasoning-Model-Built-on-NVIDIA-Nemotron/default.aspx

### 11.4 Atlas and model selection

Agents use the Atlas reasoning engine with a Salesforce-chosen default planner model (historically OpenAI GPT-4o family; Anthropic Claude available natively since Agentforce 3). Admins can select models for agents (verify UI availability per release).

---

## 12. Retrieval Augmented Generation (RAG)

### 12.1 Pipeline

1. **Ingest unstructured data** into Data 360: Knowledge articles, files (PDF, HTML, text) via **Unstructured Data Lake Objects (UDLO)** from S3/GCS/Azure Blob, SharePoint, Google Drive, Salesforce Files, Slack, web crawls (verify connectors). Also structured text fields in DMOs.
2. **Chunking** (by passage/section; configurable) and **vectorization** (embedding model, e.g., E5 Large / OpenAI embeddings) → **Search Index** (Vector, **Hybrid** = vector + keyword). Produces UDMO + chunk + index DMOs.
3. **Retriever**: configuration that queries a search index with filters, number of results, returned fields. Default retriever auto-created per index; custom retrievers via Einstein Studio (Retrievers tab).
4. **Grounding**: add retriever to a Prompt Template (resource "Retrievers"), or use in agent action ("Answer Questions with Knowledge" uses default Knowledge retriever; custom Flex template + retriever for other sources).
5. Trust Layer + citations (Agentforce citations show source articles).

### 12.2 Notes

- **Agentforce Data Library (ADL)**: simplified setup — upload files or select Knowledge, auto-creates index and retriever for agents (2025).
- **Agentic RAG / Agentforce Retrieval** improvements (2.0+): reranking, query rewriting, ensemble retrievers.
- **Intelligent Processing** and **Unstructured Processing** meters consume Data 360 credits (150 / 600 credits per MB base tier — see §14.10).
- **Agent Context Engine** (DF '26): GA Dec 2026 (verify scope). **Agent Memory** (Winter '27): shared memory across agents.

---

## 13. Predictive Einstein (classic)

| Feature | What | Notes |
|---|---|---|
| **Einstein Lead Scoring** | 1–99 score on Lead from conversion patterns; top positive/negative factors. | Needs ~1,000 leads + 120 conversions in 6 months for custom model, else global model (verify thresholds). Field `LeadScore`. |
| **Einstein Opportunity Scoring** | 1–99 likelihood to close. | Included in Sales Cloud Enterprise+ (with Sales Cloud Einstein originally). |
| **Einstein Activity Capture (EAC)** | Syncs email/calendar; feeds insights. | Data stored outside core objects (AWS) unless "Activities 360" mode. |
| **Einstein Conversation Insights** | Call recording/transcript analysis. | |
| **Einstein Forecasting** | Predictive forecasts. | |
| **Einstein Case Classification / Routing / Article Recommendations / Reply Recommendations** | Service predictive features. | Many superseded by gen-AI equivalents. |
| **Einstein Discovery** (CRM Analytics) | Statistical models + stories; "Einstein Prediction" fields; predictions in Lightning via component, Flow, Apex. Requires CRM Analytics Plus / Einstein Predictions license. | Being superseded by Einstein Studio predictive models (verify). |
| **Einstein Prediction Builder** | Clicks-based binary/numeric predictions on custom fields. | Legacy; Einstein Studio is successor. |
| **Next Best Action / Einstein Recommendations** | Recommendation records + Strategy (Flow-based Recommendation Strategy) → Einstein Next Best Action component. | Strategy Builder retired in favor of Flow. |
| **Einstein Bots** | Rules-based/NLU chatbots. | Retiring path → Agentforce; **Einstein Bot Upgrade Tool** (Agentforce Labs, DF '26) converts bots to agents. |

---

## 14. Einstein Setup and enabling generative AI

Typical sequence (verify current UI):
1. Ensure edition/licenses (Enterprise+, Agentforce/AI SKUs or Foundations).
2. **Data 360 provisioned** (required for audit trail, RAG, many agent features; Foundations includes basic provisioning).
3. Setup → **Einstein Setup** → *Turn on Einstein* (generative AI).
4. Setup → **Agentforce Agents** → enable Agentforce (and the default employee agent).
5. Assign permission sets: e.g., *Agentforce Default Admin*, *Prompt Template Manager/User*, *Einstein Agent Permissions*, *Data Cloud Admin/User*, *Agentforce Service Agent User* (agent user) — names vary (verify).
6. Configure Trust Layer (masking, audit), Einstein Generative AI audit data.
7. For service agents: create agent user, Messaging channel, Omni-Channel flow, Embedded Service deployment.

---

## 15. Data 360 (formerly Data Cloud)

### 15.1 What it is

A hyperscale data platform built on a lakehouse (Apache Iceberg/Parquet storage; Hyperforce) that ingests and harmonizes data, resolves identities into unified profiles, computes insights, segments and activates, and provides grounding/context for AI. Natively integrated with Salesforce metadata (DMOs appear as objects; usable in Flow, Apex, reports, Lightning, Prompt Builder, Agentforce). DF '26 repositioning: a **governed context service** for any authorized agent (Agentforce, Claude, ChatGPT, Slackbot), incl. **Headless Data 360** (~200 APIs) — source: https://www.infotech.com/research/dreamforce-2026-data-360-tableau-informatica

### 15.2 Architecture flow

```
Sources ──(Connectors / Ingestion API / Zero-copy federation)──▶ Data Streams
   ▶ Data Lake Objects (DLO, __dll)  [raw, source-shaped; optional Data Transforms]
   ▶ Data Mapping ▶ Data Model Objects (DMO, __dlm) [Customer 360 Data Model, harmonized]
   ▶ Identity Resolution (ruleset) ▶ Unified Individual / Unified Account (+ link objects)
   ▶ Calculated Insights / Streaming Insights / Data Graphs / Search Indexes
   ▶ Segments ▶ Activations ▶ Activation Targets
   ▶ Data Actions / Data 360-triggered Flows / Agent grounding / Analytics
```

### 15.3 Key objects and concepts

| Concept | Description |
|---|---|
| **Data Stream** | Ingestion pipeline from one source object; category **Profile**, **Engagement** (requires event-time field), or **Other**. Refresh: batch (full/upsert), streaming. |
| **Data Source Object (DSO)** | Transient staging representation of source data. |
| **Data Lake Object (DLO)** | Persisted storage of ingested data (`__dll`). Can be created by streams, transforms, or manually. |
| **Data Transforms** | Batch (visual/SQL-like) or streaming transforms DLO→DLO (clean, join, aggregate). |
| **Data Model Object (DMO)** | Harmonized, canonical entity (`__dlm`), virtual view over mapped DLOs. Standard DMOs from **Customer 360 Data Model** (namespace `ssot__`): Individual, Contact Point Email/Phone/Address/App, Party Identification, Account, Sales Order, Engagement objects (Email Engagement, Website Engagement), Product, Case, etc. Custom DMOs allowed. |
| **Data Mapping** | Map DLO fields → DMO fields; required mappings for identity resolution (Individual + contact points + Party Identification). |
| **Data Space** | Logical partition (brand/region/BU) for data, metadata, and permissions; `default` data space always exists. Data streams/DLOs assigned to spaces; filters per space. |
| **Identity Resolution Ruleset** | **Match rules** (exact, fuzzy name, normalized email/phone, Party Identification) and **Reconciliation rules** (last updated, most frequent, source priority) → **Unified Individual** (`UnifiedIndividual__dlm`) and **Unified Link** objects; also Unified Account (B2B). Up to 2 rulesets per data space (verify). Runs on schedule (or near-real-time). Expensive meter (Unification 75,000 credits per 1M rows base tier). |
| **Unified Profile** | Unified individual + contact points + insights; viewed via Profile Explorer / Customer 360 profile components. |
| **Calculated Insights (CI)** | Batch multi-dimensional metrics in ANSI SQL (measures + dimensions), e.g., LTV, RFM. Schedules 1–24h. Usable in segments, activations, personalization, and on records. |
| **Streaming Insights** | Near-real-time aggregates over engagement data in time windows; can trigger **Data Actions**. |
| **Data Graphs** | Denormalized JSON-like views across DMOs (profile + related) for low-latency retrieval, grounding, and real-time personalization. Standard or real-time data graphs. |
| **Segments** | Audience definitions on a segment-on entity (Unified Individual, Account, etc.) using attributes, related objects, CIs. Types: standard, **real-time segments**, **waterfall**, **nested**, **Einstein/AI segments** (natural-language "Agentic Segmentation", Winter '27). Publish schedules (12h/24h, rapid publish 1–4h). |
| **Activation** | Publish segment members + attributes to a target. |
| **Activation Targets** | Marketing Cloud Engagement, Marketing Cloud Account Engagement (Pardot), Marketing Cloud Personalization, Data Cloud/Data 360 (internal), file storage (S3, SFTP, GCS, Azure), ad platforms (Google Ads, Meta, Amazon Ads, LinkedIn, The Trade Desk, etc.), Loyalty, Commerce. Activation Agent (Winter '27) configures multichannel activations. |
| **Data Actions** | Event-driven outputs when data changes/insight conditions met → targets: Platform Event, Webhook, Marketing Cloud, Data 360-triggered Flow (verify list). |
| **Data 360-triggered Flows** | Flow type that runs when a DMO or CI record changes (in Flow Builder: "Data Cloud-Triggered Flow"). Used for real-time automation on unified data. |
| **Related Lists / Copy Fields / Enrichments** | Show DMO data on CRM records (Related List enrichment) or copy values into CRM fields (Copy Field enrichment). |
| **Data Kits / Data Bundles** | Packageable Data 360 metadata (streams, mappings, CIs) for deployment across orgs; also standard bundles for Salesforce CRM, Marketing Cloud, Commerce. |
| **Sandbox support** | Data 360 in sandboxes (2025+); sandbox multipliers not tiered. |

### 15.4 Ingestion: connectors and APIs

| Method | Notes |
|---|---|
| **Salesforce CRM connector** | Native: Sales/Service/any objects from the home org and other orgs; starter bundles. |
| **Marketing Cloud Engagement** (starter bundles: email, MobileConnect, MobilePush), **Account Engagement**, **Marketing Cloud Personalization**, **B2C Commerce**, **Loyalty** | Native connectors. |
| **Cloud storage** | Amazon S3, Google Cloud Storage, Azure Blob/ADLS, SFTP. |
| **Web & Mobile SDK** | Engagement events from web/mobile (Interactions SDK). |
| **Ingestion API** | REST, schema via OpenAPI YAML; **Streaming** (near-real-time micro-batches, ~3 min) and **Bulk** (CSV jobs). Requires Ingestion API connector + data stream. Endpoint on Data 360 tenant (`https://<tenant>.c360a.salesforce.com/api/v1/ingest/...`). |
| **MuleSoft Anypoint connector** | For Data 360 ingestion/query. |
| **Third-party connectors** | Hundreds via MuleSoft and native (e.g., Snowflake, Databricks, BigQuery, Redshift, Postgres, Kafka, Google Ads, etc.); Informatica connectors (2026, verify). |
| **Zero-Copy (Data Federation)** | Query external lakehouses in place: **Snowflake, Databricks, Google BigQuery, Amazon Redshift**, also Azure/Fabric, Teradata, Oracle (verify). Modes: live query (federation), **file federation / Iceberg** (read Iceberg tables directly), caching acceleration. **Data sharing (sharing-out)**: expose DLO/DMO/CI data to Snowflake, Databricks, BigQuery, Redshift without copying (Zero-Copy Sharing-Out meter: 60 credits/1M rows). DF '26: BigQuery federation + sharing extended. |
| **Unstructured** | UDLOs from storage/SharePoint/etc. for RAG. |

### 15.5 Query and access

| API | Notes |
|---|---|
| **Query API** (v1/v2, `/api/v2/query`) | ANSI SQL over DLO/DMO/CI (`SELECT ... FROM UnifiedIndividual__dlm`). Async/pagination for large results. Also via **Connect API** / Apex `ConnectApi.CdpQuery`. Queries meter (3 credits per 1M rows base tier). |
| **Profile API / Calculated Insights API / Data Graph API** | Low-latency lookups for a profile, CI values, data graph by key. |
| **Universal ID / Data 360 Connect REST** | Metadata and query endpoints. |
| **SOQL** | Limited SOQL support on DMOs from core (verify). |
| **JDBC/Python connector, Tableau** | BI access. |
| **Headless Data 360 / MCP** | DF '26: ~200 APIs available to authorized agents (Claude, ChatGPT, Slackbot, Agentforce). |

### 15.6 Data 360 app navigation tabs (verify per org; commonly)

Data Streams · Data Lake Objects · Data Model · Data Transforms · Identity Resolutions · Unified Profiles / Profile Explorer · Calculated Insights · Streaming Insights · Data Graphs · Segments · Activations · Activation Targets · Data Actions · Data Action Targets · Search Index · Einstein Studio (Models) · Query Editor · Data Explorer · Data Spaces · Data Kits / Data Share Targets · Consumption Cards. Setup lives under **Data Cloud Setup** (gear → Data Cloud Setup) for connectors, ingestion API, Data Share targets, Other Connectors, permissions.

### 15.7 Permission sets (examples)

Data Cloud Admin, Data Cloud Architect / Marketing Admin, Data Cloud Marketing Manager / Specialist, Data Cloud User, Data Cloud Data Aware Specialist (names vary; verify). Data space–level permission sets control access per space.

### 15.8 Governance

- **Data Spaces**, **Data Classification / tags**, **Policy-Based Governance** (attribute-based access policies, masking policies) — GA 2025 (verify).
- **Consent** objects (Contact Point Consent, Data Use Purpose) in data model.
- **Salesforce Catalog** (Winter '27): searchable business context of fields, objects, permissions.
- Informatica data quality, MDM, lineage (post-acquisition integration).

### 15.9 Data 360 pricing model

- Historically: separate **Data Services Credits** (consumption) + **Data Storage** (per TB) + segmentation/activation add-ons; Data Cloud provisioned free with some editions (Data Cloud Starter / Foundations entitlements, e.g., limited credits + 1 TB?) (verify).
- **2026: Data 360 consumes Flex Credits** on the unified rate card with **volume-based tiered multipliers** (tiers reset monthly; sandbox untiered). Pricing overhaul effective **Mar 2, 2026** (verify specifics).

### 15.10 Data 360 meters (Flex Credits Rate Card, Aug 18, 2026)

| Usage type | Unit | Base (≤300k) | Tier 2 (300k–1.5M) | Tier 3 (1.5M–12.5M) | Tier 4 (>12.5M) | Sandbox |
|---|---|---|---|---|---|---|
| Data 360 Prep | 1M rows processed | 40 | 32 | 16 | 8 | 32 |
| Unification | 1M rows | 75,000 | 60,000 | 30,000 | 15,000 | 60,000 |
| Segmentation | 1M rows | 50 | 40 | 20 | 10 | 40 |
| Activation | 1M rows | 60 | 48 | 24 | 12 | 48 |
| Zero-Copy Sharing-Out | 1M rows shared | 60 | 48 | 24 | 12 | 48 |
| Queries | 1M rows processed | 3 | 2.4 | 1.2 | 0.6 | 2.4 |
| Unstructured Processing | 1 MB | 150 | 120 | 60 | 30 | 120 |
| Intelligent Processing | 1 MB | 600 | 480 | 240 | 120 | 480 |
| Streaming Pipeline | 1M rows | 3,500 | 2,800 | 1,400 | 700 | 2,800 |
| Real-Time Pipeline | 1M combined events, API & actions | 250,000 | 200,000 | 100,000 | 50,000 | 200,000 |
| Code Extension | compute unit | 40 | 32 | 16 | 8 | 32 |

Cost levers: incremental (upsert) refresh instead of full, fewer/cheaper identity resolution runs, avoid real-time pipelines where batch suffices, filter streams at source, use zero-copy federation with care (queries still meter), monitor in Digital Wallet / consumption cards.

### 15.11 Winter '27 / DF '26 Data 360 items

- **Agentic Segmentation and Activation** (describe audience conversationally; Activation Agent).
- **Agent Memory** (shared interaction memory across agents).
- **Salesforce Catalog**.
- **Agentic Customer Data Platform** (GA), **Agent Context Engine** (GA Dec 2026).
- Source: https://trailhead.salesforce.com/content/learn/modules/winter-27-release-highlights/see-whats-new-data360-mulesoft-tableau-informatica

---

## 16. Slack AI and Slack as the agentic surface

| Item | Details |
|---|---|
| **Slack AI** (2024–2025) | Channel/thread recaps, search answers, huddle notes, daily recaps, file summaries, translation; bundled in paid plans from mid-2025 (verify plan specifics). |
| **Slackbot (agentic)** | 2025–2026 rebuild into a personal AI agent; DF '26: two-way voice conversations and real actions (update records, start automations). |
| **Agentforce in Slack** | Deploy Salesforce agents to Slack; Slack actions (search Slack, create canvas, send DM) usable in agents; Slack as Agentforce channel. |
| **Slackforce** (AIforce, DF '26) | Salesforce brought into Slack; **Slackforce Surfaces** — Slackbot builds live, interactive interfaces (filter, explore, comment, act). Slackforce GA October 2026 (per Salesforce DF '26 blog). |
| **Slack platform for agents** | Agents & AI Apps framework, Real-time Search API, MCP server for Slack, Workflow Builder AI steps (verify GA). Third-party agents (incl. Claude) in Slack. |
| **Editions** | Slack + Slackbot included in all new Core/Advanced/Max editions (Sept 2026). |

---

## 17. Tableau Next and agentic analytics

| Item | Details |
|---|---|
| **Tableau Next** | Agentic analytics platform built on Data 360 + Agentforce; GA with **Tableau+** SKU (2025). Composable, API-first; dashboards/visualizations on Data 360 semantic models. |
| **Tableau Semantics** | Semantic layer (metrics, definitions) shared by Tableau Next and agents (GA with Tableau Next). |
| **Agent skills** | **Concierge** (NL Q&A), **Data Pro** (data prep assistant), **Inspector** (proactive monitoring/alerts). |
| **Tableau Agent** (formerly Einstein Copilot for Tableau) | In Tableau Cloud/Desktop: NL viz creation, calc help. Winter '27: **Tableau Agent: Proactive Intelligence**. |
| **Tableau Knowledge** (Winter '27) | Structures data + semantic models into connected graphs for agents. |
| **Tableau Studio** (Winter '27) | NL dashboard authoring in Tableau Desktop. |
| **CRM Analytics** | Still exists (Einstein Analytics lineage), hosts Einstein Discovery; Agent Analytics dashboards often Tableau-powered. |
| **Agentforce Observability dashboards** | Tableau Next–powered. |

---

## 18. MuleSoft for Agentforce

- **MuleSoft for Agentforce: Topic Center & API Catalog** (2025): annotate APIs with topics/actions metadata in API designs so they appear as agent actions.
- **Agent Builder actions from MuleSoft APIs**; **MuleSoft AI Chain (MAC)** connectors for LLMs in Mule flows.
- **MuleSoft Agent Fabric** (2025): agent registry, broker, governance (Agent Visualizer, Flex Gateway for A2A/MCP traffic) (verify components).
- **MCP support**: MuleSoft can expose APIs as MCP servers and connect to MCP servers.
- Winter '27: **AI Cost Management** (token limits per department/app), **Agent Kill Switch** (halt individual agents, tamper-proof audit), **MuleSoft Headless** (governed access via Slack, Claude, Teams).
- **Intelligent Document Processing (IDP)** for document extraction into flows.

---

## 19. Informatica acquisition

| Item | Detail |
|---|---|
| Announced | **May 27, 2025**; ~$8B equity value, $25/share cash. |
| Closed | **Nov 18, 2025** (ahead of schedule). Source: https://www.salesforce.com/news/ (Informatica completion press release) / https://seekingalpha.com/news/4523363-salesforce-completes-acquisition-of-informatica |
| What it adds | IDMC: data catalog, integration (ETL/ELT), data quality, governance & privacy, metadata management, **MDM**, lineage. |
| Positioning | "Data 360 provides data and context, Informatica makes the data AI-ready, Tableau provides semantics." |
| 2026 products | **Informatica Headless** (IDMC as headless services for agents), **AI Lifecycle Governance** (risk scoring, audit trails), **Unstructured Data Cataloging** (Winter '27). Informatica continues selling standalone (multi-cloud, incl. non-Salesforce). Licensing integration with Data 360: verify. |

---

## 20. Related platform pieces

- **Headless 360** (TDX Apr 2026): platform-as-API/MCP/CLI; platform naming later reverted to "Salesforce Platform" (Sept 2026). Rate card has Headless 360 usage types (record CRUD, process invocation – TBA pricing).
- **Agentforce Vibes**: AI coding agent (vibe coding) for Apex/LWC/metadata; also in Agentforce Builder; uses Salesforce-hosted models and supports MCP.
- **AIforce** (DF '26): layer carrying Data 360 context + Customer 360 semantics to any surface; partners at launch reportedly incl. Anthropic, AWS, Google, Lovable, Vercel, DocuSign, Gamma, Jasper, Ramp, Rippling (verify).
- **Claudeforce**: Salesforce in Claude (Anthropic partnership); open beta.
- **Enterprise AI Harness** (DF '26): secure, monitor, trace, govern agents across the enterprise (verify details).
- **Missionforce** (public sector/defense) — Missionforce Operations GA in U.S. regions (DF '26).
- **Marketing Cloud Next** — Marketing built natively on Data 360 + Agentforce (agentic marketing; campaign agent).
- **Agentforce Contact Center** — unified voice/digital contact center with agents + humans (2025–2026; verify naming after Sept 2026 reversal).

---

## 21. Quick reference: "where do I configure X?"

| Task | Where |
|---|---|
| Turn on generative AI | Setup → Einstein Setup |
| Build/edit agent | Setup → Agentforce Agents → (Open in Builder) / Agentforce Studio |
| Prompt templates | Setup → Prompt Builder (or Agentforce Studio → Prompt Builder) |
| Models / BYOLLM | Einstein Studio (Data 360 app) / Agentforce Studio → Models |
| Trust Layer masking | Setup → Einstein Trust Layer |
| Batch tests | Agentforce Studio → Testing Center (or `sf agent test run`) |
| Agent analytics/traces | Agentforce Studio → Observability (Analytics / Optimization / Health) |
| Usage/billing | Setup → Digital Wallet; Your Account app |
| Data 360 connectors | Data Cloud Setup → Connectors / Other Connectors |
| Identity resolution | Data 360 app → Identity Resolutions |
| Segments/activations | Data 360 app → Segments / Activations / Activation Targets |
| Search index / retrievers | Data 360 app → Search Index; Einstein Studio → Retrievers |
| Agent on website | Setup → Messaging Settings (channel) → Omni-Channel Flow → Embedded Service Deployments |

---

## 22. Gotchas / common confusions

1. **Names in flux.** "Agentforce Sales" (Oct 2025–Sept 2026) is Sales Cloud again; "Data 360" = Data Cloud; "Agentforce 1 Edition" → "Max" edition (Sept 2026); "Einstein Copilot" → Agentforce Assistant → default employee agent → Agentforce Coworker. API names/metadata (`Bot`, `GenAiPlugin`, `__dlm`, "Data Cloud Setup", "Einstein" permission sets) did **not** change with marketing renames. Match the user's terminology and mention the alias.
2. **Agentforce versions ≠ release names.** Agentforce 2.0/2dx/3/360 were marketing waves; features ship in Spring/Summer/Winter releases. Ask which release the org is on (Winter '27 rolling out Oct 2026).
3. **Topic vs subagent.** Agent Script uses `subagent` blocks; the classic builder and much documentation say "topic". Same concept.
4. **Instructions are not guarantees.** LLM may ignore an instruction. Enforce hard rules with Agent Script deterministic logic, action filters/conditions, Flow/Apex validation, and permissions on the agent user.
5. **Preview executes real actions.** Conversation preview runs Flows/Apex against org data — test in sandbox.
6. **Agent user permissions.** Service agents fail silently ("I can't help with that") when the agent user lacks object/field/Apex class/Flow access. Employee agents inherit the user's access.
7. **Action descriptions are prompts.** Vague invocable labels/descriptions and variable descriptions cause wrong routing. Too many actions per topic hurts accuracy.
8. **Data 360 is a prerequisite** for audit trail, feedback, RAG/search indexes, Observability (STDM), BYOLLM via Einstein Studio. Many "gen AI won't enable" issues trace to Data 360 not provisioned.
9. **Billing models can't be mixed carelessly.** Conversations ($2) and Flex Credits can't be used concurrently in the same org for customer-facing agents. Legacy contracts may still meter Einstein Requests. Sandboxes consume credits (lower multipliers for actions; Help Agent resolutions 0 in sandbox).
10. **Flex Credits don't roll over**; tier multipliers for Data 360 reset monthly; Unification (identity resolution) and Real-Time Pipeline are by far the most expensive meters.
11. **Zero-copy isn't free.** Federation avoids storage/ETL but queries, sharing-out, and acceleration still consume credits; live-query latency depends on the external warehouse.
12. **Data masking can hurt agents.** Masked names/emails can break reasoning; Salesforce-hosted models may not require masking. Understand per-feature defaults before enabling (verify current defaults).
13. **Zero data retention applies to Salesforce-contracted providers.** For BYOLLM, retention is governed by *your* contract with the provider.
14. **DLO vs DMO.** DLO = stored raw (`__dll`); DMO = harmonized virtual model (`__dlm`). Segments/IR operate on DMOs; you must map Party Identification/contact points for identity resolution to work.
15. **Calculated vs Streaming Insights.** CIs are batch SQL (hourly+); Streaming Insights are windowed near-real-time and pair with Data Actions.
16. **Data Cloud-triggered Flow ≠ record-triggered flow.** It runs on DMO/CI changes, in Data 360 context, with its own limits and latency.
17. **Prompt Builder template type determines where it can be used.** Field Generation only on Dynamic Forms fields; Sales Email in email composer; Flex for Flow/Apex/agent actions. Only the **active** version runs.
18. **Einstein predictive ≠ generative.** Lead/Opportunity Scoring, Discovery, Prediction Builder, NBA are classic ML features with their own licenses and data thresholds; they are not Agentforce.
19. **Einstein Bots are legacy.** New conversational builds should be Agentforce agents; use the Einstein Bot Upgrade Tool (Agentforce Labs) for migration. Legacy Live Agent Chat retired; use Messaging for In-App and Web.
20. **DF '26 announcements are mostly pilot/beta.** Koa (pilot; GA Winter 2026 U.S.), long-horizon agents (GA Nov 2026), Claudeforce (beta), A/B experimentation (beta). Don't present them as universally available.
21. **Informatica is owned but not merged.** It remains a separate product line (IDMC) with its own licensing; integration with Data 360 is progressing via headless services and catalog features.
22. **Pricing figures here are list prices** from public pages and rate cards (Aug 2026); enterprise deals vary widely. Always point users to the current rate card and their Order Form.
