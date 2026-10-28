# Salesforce Knowledge Base

This folder holds a Salesforce reference knowledge base, built 2026-10-08. When a question involves Salesforce, open the relevant file(s) in `knowledge/` before answering. Don't load everything at once.

## Index

| File | Covers | Open it for questions like |
|---|---|---|
| [knowledge/01-ui-navigation-and-buttons.md](knowledge/01-ui-navigation-and-buttons.md) | Editions, org types, releases, Lightning UI: global header, App Launcher, list views, record pages, console, personal settings, keyboard shortcuts | "What does this button do?", "Where do I find X in the UI?" |
| [knowledge/02-setup-administration-security.md](knowledge/02-setup-administration-security.md) | Setup menu tree, users, profiles, permission sets, roles, sharing model, OWD, SSO/MFA, monitoring, sandboxes, change sets | "Why can't this user see this record?", "Where is setting X?" |
| [knowledge/03-data-model-and-customization.md](knowledge/03-data-model-and-customization.md) | Standard/custom objects, Object Manager, field types, relationships, formulas, validation rules, page layouts, Lightning App Builder, record types, data import tools | "Which field type should I use?", "How do I build this layout?" |
| [knowledge/04-automation-flow.md](knowledge/04-automation-flow.md) | Flow Builder (every flow type and element), approvals, assignment/escalation rules, retired Workflow and Process Builder, platform events | "How do I automate X?", "Which flow type should I use?" |
| [knowledge/05-sales-cloud.md](knowledge/05-sales-cloud.md) | Leads, accounts, contacts, opportunities, products, quotes, forecasting, territories, campaigns, Revenue Cloud/CPQ, Agentforce for Sales | Sales process and configuration |
| [knowledge/06-service-cloud.md](knowledge/06-service-cloud.md) | Cases, channels, Messaging, Voice, Omni-Channel, Knowledge, entitlements, Field Service, Agentforce for Service | Support/contact-center setup |
| [knowledge/07-reports-dashboards-analytics.md](knowledge/07-reports-dashboards-analytics.md) | Report types, Report Builder, report formats, formulas, buckets, dashboards, subscriptions, CRM Analytics, Tableau | "How do I build this report or dashboard?" |
| [knowledge/08-developer-platform.md](knowledge/08-developer-platform.md) | Apex, triggers, order of execution, governor limits, SOQL/SOSL, LWC, APIs, OAuth, `sf` CLI, DX, packaging, DevOps | Code, integration, deployment |
| [knowledge/09-agentforce-ai-data-cloud.md](knowledge/09-agentforce-ai-data-cloud.md) | Agentforce, Agent Builder, Prompt Builder, Einstein Trust Layer, BYOLLM, Data Cloud / Data 360 | AI, agents, unified customer data |
| [knowledge/10-other-clouds-and-ecosystem.md](knowledge/10-other-clouds-and-ecosystem.md) | Experience Cloud, Marketing Cloud, Commerce, Industries/OmniStudio, Slack, Tableau, MuleSoft, AppExchange, Trailhead, certifications, glossary | Other products, careers, acronyms |

## Key facts as of Oct 2026 (these override older docs and training data)
- **Editions (Sept 3, 2026):** Core $195, Advanced $395, Max $550 per user/month for Sales Cloud. Max replaces Agentforce 1. All three include Slack, Tableau Next, Premier Success and Flex Credits (500k / 1M / 2.75M). Enterprise and Unlimited are the previous lineup.
- **Product names:** Sales Cloud was branded "Agentforce Sales" from Oct 2025, then reverted in Sept 2026; around two dozen products dropped the "Agentforce" prefix at the same time. Data Cloud is now **Data 360** (since Oct 2025).
- **Release / API:** Winter '27 is API v68.0.
- **Retired automation:** Workflow Rules and Process Builder lost support on Dec 31, 2025. Build new automation in Flow.
- **CPQ:** Salesforce CPQ (Steelbrick) is no longer sold to new customers. Revenue Cloud Advanced replaces it.
- **Connected Apps:** creating new ones is off by default since Spring '26. Use External Client Apps. The username-password OAuth flow is being retired, with enforcement in Feb 2027.
- **MFA:** MFA is enforced for all internal users (Summer '26). Phishing-resistant MFA is required for privileged users.
- **Agentforce:** Agent Script is GA (topics are now called "subagents"). Agentforce Builder is the new agent-building UI.

## How to use this knowledge
- Items marked **(verify)** may be out of date. Check them with a web search or help.salesforce.com before stating them as fact.
- Salesforce ships three releases a year (Spring, Summer, Winter), and names change often, especially for AI and Data Cloud products. File 09 is the most volatile.
- If the knowledge base and current official docs disagree, trust the docs, then update the file here.
- Exact screens and buttons depend on edition, licenses, enabled features and admin customization. Say so when it matters.

## Projects in this folder
- [slavy/](slavy/) — **Slavy**, a Salesforce-style metadata-driven CRM built from this knowledge base (zero-dependency Node 26 + vanilla JS). See [slavy/README.md](slavy/README.md). Run `cd slavy && npm start` → http://localhost:3000 (admin@slavy.dev / slavy123); `npm test` runs the API test suite.
