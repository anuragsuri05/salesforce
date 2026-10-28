# Slavy

Slavy is a metadata-driven CRM platform modeled on how Salesforce works. Objects, fields, page layouts, validation rules, flows, approval processes, sharing rules and apps are all stored as **metadata**, and one generic engine turns them into working list views, record pages, reports, dashboards, a SOQL query engine and a REST API. Create a custom object in Setup and it gets all of those right away.

It has **zero dependencies**: Node.js ≥ 22.5 with the built-in `node:sqlite`, and a vanilla-JS single-page app with no build step.

## Quick start

```bash
cd slavy
npm start          # http://localhost:3000. The first run seeds a demo org automatically.
npm run seed       # Reset the database to a fresh demo org
npm test           # End-to-end API tests (in-memory database)
```

Every demo user's password is `slavy123`. The login page has one-click buttons for each.

| User | Profile / Role | What they show |
|---|---|---|
| `admin@slavy.dev` | System Administrator / CEO | Everything, including Setup |
| `vp.sales@slavy.dev` | Standard User / VP Sales | Role hierarchy (sees all sales data), Developer Tools permission set |
| `sales.mgr@slavy.dev` | Standard User / Sales Manager | Approves large deals, member of the lead queue |
| `rep1@slavy.dev`, `rep2@slavy.dev` | Sales Representative / Sales Rep | Private opportunities, opportunity sharing rule |
| `support@slavy.dev` | Support Agent | No opportunity access; field-level security hides Account revenue |
| `support.mgr@slavy.dev` | Support Agent / Support Manager | A permission set grants back the revenue field |
| `marketing@slavy.dev` | Standard User + Marketing permission set | Campaigns |
| `viewer@slavy.dev` | Read Only | Read-only everywhere |

Environment variables: `PORT` (default 3000) and `SLAVY_DB` (default `data/slavy.db`; use `:memory:` for throwaway runs).

## What's included

**Platform engine** (`server/`)
- Objects and fields: Text, Text Area, Long Text, Email, Phone, URL, Number, Currency, Percent, Checkbox, Date, Date/Time, Picklist, Multi-Select Picklist, Lookup, Master-Detail, polymorphic lookups (WhatId/WhoId), Formula, Roll-Up Summary and Auto Number.
- A formula language compatible with Salesforce's (IF, CASE, ISPICKVAL, ISCHANGED, PRIORVALUE, ISNEW, BLANKVALUE, TEXT, VALUE, date math, ADDMONTHS, REGEX and more, plus cross-object paths like `Account.Owner.Name` and `$User` / `$Profile`). It powers formula fields, default values, validation rules, flow conditions and assignments, and approval entry criteria.
- Validation rules, required and unique fields, external IDs, restricted picklists, field history tracking, and cascade delete with a Recycle Bin.
- Security:
  - Profiles and permission sets: object CRUD, View All and Modify All, field-level security, and system permissions.
  - Record access: org-wide defaults (Private, Public Read Only, Public Read/Write, Controlled by Parent), the role hierarchy, queues, owner-based and criteria-based sharing rules, and manual sharing.
- Automation:
  - Record-triggered flows, both before-save and after-save, with entry conditions and "only when updated to meet criteria".
  - Scheduled flows and autolaunched flows.
  - Flow elements: update record, update related record, create record, create task, notify, send email (logged), post to feed, and submit for approval.
  - Multi-user approval processes with record locking.
- SOQL: relationship fields, child subqueries, WHERE with AND/OR/NOT, IN, LIKE, INCLUDES, date literals (`LAST_N_DAYS:30`, `THIS_QUARTER`, ...), GROUP BY with COUNT/SUM/AVG/MIN/MAX, ORDER BY with NULLS FIRST/LAST, LIMIT/OFFSET and `FIELDS(ALL)`. Queries respect object, field and record security.
- Reports in tabular, summary and matrix formats, with up to 3 groupings, date bucketing, aggregates and charts. Dashboards run either as the viewer or as a fixed running user.
- Salesforce-style REST API, web-to-lead / web-to-case, global search, Chatter feed with @mentions, notifications, lead conversion, mass actions, CSV import and export, a setup audit trail and login history.

**Web app** (`public/`): login, app launcher, apps and navigation, global search, favorites, global actions, notifications, Home, and list views (table and Kanban, inline edit, filters, list view controls, mass actions). Record pages include highlights, path, inline-editable details, related lists, an activity timeline and composer, Chatter, history, approvals, quick actions, lead conversion and sharing. Also included:
- Reports and the report builder; dashboards and the dashboard builder.
- Calendar, Chatter, Approval Requests, Recycle Bin, Personal Settings and the Developer Console (SOQL, REST explorer, schema, formula tester).
- Full Setup: Object Manager, the field wizard, page layout editor, validation rules, quick actions, App Manager, users, profiles, permission sets, roles, groups and queues, sharing settings, Flow Builder, approval processes, scheduled jobs, the data import wizard, data export, web-to-lead, the audit trail, login history and the email log.
- Light and dark themes.

## AI (bring your own model: Claude, ChatGPT or Gemini)

1. Log in as `admin@slavy.dev`, then go to **Setup → AI → AI Settings**.
2. Pick **Anthropic Claude**, **OpenAI (ChatGPT)** or **Google Gemini** and paste your API key.
3. Choose a model. "Load models" lists every model your key can use, and the default for Claude is `claude-opus-5-5`.
4. Click **Test connection**, switch **Enable AI** on, and save.

You can also set the key with an environment variable instead: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY`. Keys are encrypted at rest (AES-256-GCM; the encryption key comes from `SLAVY_SECRET` or `data/.secret`) and are never sent to the browser.

| Feature | Where | Needs API key |
|---|---|---|
| **Slavy Agent**: a chat assistant that searches, queries, summarizes, creates and updates records, logs calls, posts to Chatter and submits approvals | ✨ button in the header | Yes |
| **Record summaries, field suggestions (e.g. case classification), prompt templates** | "Slavy AI" card on record pages | Yes |
| **Email drafts** | "Draft with AI" in the record email composer | Yes |
| **Prompt Builder**: reusable prompts with merge fields (`{!Name}`, `{!Account.Name}`, `{!RecordDetails}`, `{!Activities}`) | Setup → AI → Prompt Builder | Yes |
| **AI Prompt flow step**: fills a field in the background after save | Flow Builder → AI group | Yes |
| **Formula & SOQL generation** | "Generate with AI" in formula editors, "Ask AI" in the Developer Console | Yes |
| **Lead & Opportunity scoring** (with the factors behind each score) | Record AI card, Home, Setup → Predictive Scoring | No |
| **Insights** (overdue, slipping and stuck deals; aging cases; uncontacted hot leads) | Record AI card, Home | No |

**Trust layer.** The agent and every AI feature run with the requesting user's permissions, so the model only sees and changes what that user can. On top of that:
- Changes made by the agent need the user to click **Confirm** first.
- Emails and phone numbers are masked before data leaves Slavy, and restored in the response.
- Every call is recorded in **Setup → AI → AI Audit Trail**.
- Each AI feature can be switched off individually.
- Only users with the **Use AI Features** permission can use AI.

The agent's personality, topics and allowed actions are configured in **Setup → AI → Agent Builder**.

## REST API

```bash
# 1. Get a token
curl -s -X POST localhost:3000/services/oauth2/token \
  -d grant_type=password -d username=admin@slavy.dev -d password=slavy123
# 2. Use it
TOKEN=...   # access_token from step 1
curl -s localhost:3000/services/data/v1.0/sobjects/Account/describe -H "Authorization: Bearer $TOKEN"
curl -s "localhost:3000/services/data/v1.0/query?q=SELECT+Name,Amount,Account.Name+FROM+Opportunity+LIMIT+5" -H "Authorization: Bearer $TOKEN"
curl -s -X POST localhost:3000/services/data/v1.0/sobjects/Lead -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"LastName":"Lovelace","Company":"Analytical Engines"}'
```

Endpoints:
- `GET /services/data/v1.0/sobjects`
- `GET .../sobjects/{Object}/describe`
- `POST .../sobjects/{Object}`
- `GET`, `PATCH`, `DELETE .../sobjects/{Object}/{Id}`
- `PATCH .../sobjects/{Object}/{ExternalIdField}/{value}` (upsert)
- `GET .../query?q=`
- `GET .../search?q=FIND {term}`
- `GET .../limits`

## Architecture

```
server/
  index.js        HTTP server and routing          db.js        SQLite schema and helpers
  metadata.js     objects, fields, generic metadata  records.js   record engine (CRUD, formulas, roll-ups, validation, history)
  security.js     profiles, permission sets, sharing  automation.js validation rules, flows, approvals, notifications
  formula.js      formula language                  conditions.js filter and date-literal engine
  soql.js         SOQL parser and executor          reports.js   reports and dashboards
  features.js     search, feed, sharing, lead convert, import/export, home
  api/            core.js (app API), setup.js, analytics.js, rest.js (Salesforce-style REST)
  seed.js         demo org
public/
  js/app.js       shell and router     js/lib.js   DOM, icons, modals, menus   js/api.js   API client and metadata cache
  js/fields.js    field rendering and editors, lookups, record form
  js/views/       home, list, record, search, reports, dashboards, calendar, chatter, devconsole ...
  js/setup/       Setup pages        js/components/  filter, formula and assignment editors
```

Records live in one table with a JSON data column, described by the metadata. This is the same "universal data dictionary" idea Salesforce's multi-tenant architecture uses. IDs are 15 characters, and the first 3 are the object's key prefix (`001` Account, `003` Contact, `006` Opportunity, ...).

Slavy is an independent project. It isn't affiliated with or endorsed by Salesforce, and it uses none of Salesforce's code or branding.
