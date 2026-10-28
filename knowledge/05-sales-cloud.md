# Sales Cloud — End-to-End Reference (Leads to Revenue, Forecasts, Territories, AI)

**What this file covers:** Every major Sales Cloud object and feature — leads, accounts, contacts, opportunities, products/price books, quotes, contracts/orders, campaigns, forecasting, territories, activities — with the buttons/actions on each record and the Setup paths that control them.
Also covers productivity add-ons (Sales Engagement, Dialer, Inbox, Maps, Console), Einstein/Agentforce for Sales, PRM, Revenue Cloud/CPQ, Sales Planning, and editions/pricing.
Status as of Oct 2026; anything about packaging, names, or prices that changes often is marked "(verify)".

---

## 0. Naming & Packaging Snapshot (2026)

| Item | Current status (Oct 2026) |
|---|---|
| Sales Cloud brand | Renamed **"Agentforce Sales"** at Dreamforce Oct 2025 (part of the "Agentforce 360" umbrella). **Reverted to "Sales Cloud"** in Sept 2026, one week before Dreamforce 2026. Expect docs, Trailhead, and contracts from 2025–26 to use both names. |
| Platform umbrella | "Agentforce 360" (kept). "Salesforce Platform" briefly marketed as "Headless 360 Platform", then reverted (verify) |
| Revenue Cloud | Revenue Cloud Advanced (RCA) / Revenue Lifecycle Management (RLM) was renamed **"Agentforce Revenue Management"** in Q3 FY26 (late 2025). Docs and the UI still use "Revenue Cloud" in places. It may have reverted like Sales Cloud did (verify). |
| Salesforce CPQ (Steelbrick, `SBQQ__` managed package) | **End of Sale since March 2025** (no new-logo sales). It is **not end of life**: existing customers can renew, add users, and get support. Industry estimates put EOL around 2029–2030 (verify; not officially announced). |
| Einstein 1 Sales edition | Renamed **Agentforce 1 Sales** (2024–25) |
| Essentials / Professional editions | Replaced for new buyers by **Starter Suite** / **Pro Suite** (2024) |

### CURRENT editions (since Sept 3, 2026) — Core / Advanced / Max

Confirmed against Salesforce's announcement: https://www.salesforce.com/news/stories/salesforce-simplifies-editions-2026/
Salesforce replaced Enterprise/Unlimited/Agentforce 1 for new purchases of Sales, Service and Industries with three editions. Each one bundles Slack, Tableau Next, the Premier Success Plan, enterprise security and built-in AI.

| Edition | Sales Cloud list price (per user/month, annual) | Flex Credits included |
|---|---|---|
| **Core** | $195 | 500,000 |
| **Advanced** | $395 | 1,000,000 |
| **Max** (replaces Agentforce 1) | $550 | 2,750,000 |

The table below shows the **previous** lineup. It still matters for existing customers on renewals and for older docs and screenshots. Whether Starter/Pro Suite are still sold to small businesses alongside Core/Advanced/Max: (verify).

### Previous editions & list prices (pre-Sept 2026; USD per user/month, billed annually; list prices rose ~6% in Aug 2025)

| Edition | List price | Key notes |
|---|---|---|
| **Starter Suite** | $25 | Up to ~10 users. Sales + Service + Marketing-lite starter CRM, guided setup. Very limited customization, no API. |
| **Pro Suite** | $100 | Products/price books, quotes, forecasting, more customization. Limited API (verify). Replaces Professional Edition. |
| **Enterprise** | $175 (was $165) | Full API, Flow automation, record types, sales processes, Territory Management, Pipeline Inspection, Collaborative Forecasts, opportunity splits, custom report types, sandboxes (Developer). The most common edition. |
| **Unlimited** | $350 (was $330) | Adds Premier Success / 24x7 support, Full sandbox, higher limits. Historically bundled Sales Engagement, Conversation Insights, Einstein for Sales features, and Revenue Intelligence pieces (verify exact bundle). |
| **Agentforce 1 Sales** (formerly Einstein 1 Sales / "Unlimited+") | $550 | Unlimited + Agentforce/Einstein generative AI, Data Cloud credits, Slack, Tableau/CRM Analytics pieces, Revenue Intelligence, Sales Engagement, Enablement (verify bundle). |
| Legacy: Essentials / Professional / Performance | n/a | Still exist for renewing customers. Performance ≈ Unlimited + Einstein + data enrichment (no longer sold). |

- Add-ons sold separately (typical): Sales Engagement, Revenue Intelligence, Sales Cloud Einstein / Agentforce add-ons (per user, e.g. "Agentforce for Sales add-on" ~$125/user, verify), Agentforce Flex Credits (~$500 per 100k credits ≈ $0.10/action, verify), Salesforce Maps, Sales Dialer, Enablement, Sales Planning, Agentforce Revenue Management (RCA ~$200/user/month for the "Advanced" tier, verify), Shield, Data Cloud.
- Feature availability is tied to edition **and** to permission set licenses (PSLs). Always check the PSL a feature needs (for example "Sales Engagement", "Sales Cloud Einstein", "Inbox", "Maps").

---

## 1. Lead Management

### 1.1 Lead object essentials
- `Lead` is a separate object from Contact/Account. Required standard fields: **Last Name, Company** (Company is not required when Person Accounts are enabled; leads with a blank Company convert to a Person Account), and **Lead Status**.
- Key fields: `Status`, `Rating`, `LeadSource`, `OwnerId` (user **or queue**), `IsConverted`, `ConvertedAccountId`, `ConvertedContactId`, `ConvertedOpportunityId`, `ConvertedDate`, `IsUnreadByOwner`, `Email`, `Industry`, `AnnualRevenue`, `NumberOfEmployees`.
- Lead Source picklist values are shared with Opportunity/Contact/Account Lead Source (verify per org).

### 1.2 Web-to-Lead
- Setup → **Web-to-Lead**: enable it, set the **Default Lead Creator** (the user shown as creator) and a default response template. Click **Create Web-to-Lead Form**, pick fields, set a Return URL, and optionally enable **reCAPTCHA** (spam filter). It generates HTML that posts to `https://webto.salesforce.com/servlet/servlet.WebToLead?encoding=UTF-8` with a hidden `oid` (org ID).
- **Limit: 500 web leads per 24 hours** per org. Overflow is emailed to the default creator and processed later. A pending request queue exists (verify). Need more? Use the API, Flow-based forms, Experience Cloud, or Marketing Cloud Account Engagement (Pardot) forms.
- Web-to-Lead can apply the **active Lead Assignment Rule** (the checkbox on the settings page) and **Lead Auto-Response Rules** (Setup → Lead Auto-Response Rules: entries + email templates, first-match).
- Hidden fields can set Campaign (`Campaign_ID`, `member_status`) to add the lead as a campaign member. Custom fields use their 15-char field ID or API name in the generated form.
- Gotchas: no file uploads; picklist values must match exactly; validation rules **do fire** (a failed lead is dropped silently and an email goes to the default creator); duplicate rules can block it.

### 1.3 Lead Queues
- Setup → **Queues** → New: label, supported objects (Lead), queue members (users, roles, roles & subordinates, public groups), optional queue email + "Send Email to Members".
- Queues show up as list views on the Leads tab. Members use **Accept** (Classic) or **Change Owner** to claim leads. In Lightning, Omni-Channel can route leads too.
- Queue members get access to queue-owned records.

### 1.4 Lead Assignment Rules
- Setup → **Lead Assignment Rules**. **Only one rule can be active** per object. A rule has ordered **rule entries** (criteria or formula → assign to user/queue, plus an optional email template). First match wins. If nothing matches, the lead goes to the **Default Lead Owner** (Setup → Lead Settings).
- Fires on: Web-to-Lead, Data Import Wizard (checkbox), Data Loader (setting), API with the `AssignmentRuleHeader`, Apex `Database.DMLOptions.assignmentRuleHeader`, and manual create/edit when the user checks **"Assign using active assignment rule"** (it appears in the edit layout if added to the page layout's layout properties; can be default-checked).
- Flow: no native "run assignment rules" element. Use an invocable Apex action or the `AssignmentRuleHeader` via Apex (verify; some AppExchange actions exist).

### 1.5 Lead Statuses
- Lead Status picklist (Object Manager → Lead → Fields → Lead Status). Each value has a **Converted** flag and one value is **Default**. At least one value must be Converted. The Convert dialog only offers Converted statuses.
- Different record types can expose different status values. Sales Path on Lead uses these statuses (the final "Converted" step opens the Convert dialog).
- SOQL: `SELECT MasterLabel FROM LeadStatus WHERE IsConverted = true` (required in Apex conversion).

### 1.6 Lead Conversion (Convert button)
**Convert dialog (Lightning) fields:**
| Section | Options |
|---|---|
| **Account** | Create New (name defaults to Company) **or** Choose Existing (search; matching accounts suggested via duplicate/matching rules) |
| **Contact** | Create New (from lead name) or Choose Existing (matches shown) |
| **Opportunity** | Create New (name defaults to "Company-") or choose an existing open opportunity on that account (Lightning) or **"Don't create an opportunity upon conversion"** checkbox |
| **Record Owner** | Owner of the new records (defaults to lead owner) |
| **Send Email to Owner** | Checkbox (Classic; verify in Lightning) |
| **Converted Status** | Picklist of statuses where Converted = true |
| Person Account | If Person Accounts are on and Company is blank → creates a Person Account |

- Lead Settings (Setup → Lead Settings / Object Manager → Lead → Lead Settings, verify path):
  - **Hide Opportunity Section of Convert Lead Window**; **Select "Don't create an opportunity upon conversion" by default**
  - **Require Validation for Converted Leads** (runs Lead validation rules, triggers, and required fields at conversion)
  - **Preserve Lead Status** (do not change status on owner change); **Enable Conversions on the Salesforce Mobile App**
  - **Use Apex Lead Convert** (lets Apex triggers fire with customizations; Classic-era option)
  - Default Lead Owner; Notify default owner
- Permissions: **"Convert Leads"** plus Create on Account/Contact/Opportunity. **"View and Edit Converted Leads"** lets a user see and edit converted leads.
- **Mapping custom fields**: Object Manager → Lead → Fields & Relationships → **Map Lead Fields**. Map each custom lead field to one custom field on Account, Contact, **or** Opportunity (one target per lead field). Data types must be compatible (text→text of equal or greater length, picklist→picklist or text, number precision must fit, lookup→same object lookup). **Formula fields cannot be mapped** (as targets; the source can be read only via Apex/Flow). Standard fields map automatically (Company→Account Name, etc.).
  - To map one lead field to several objects, create helper fields or use a Flow/trigger on Account/Contact/Opportunity creation that reads `Lead.ConvertedAccountId`.
- **What conversion does:**
  - Creates/updates Account, Contact, and optional Opportunity. Existing records are **not overwritten** except blank fields. In Lightning, existing Contact fields with values stay; blank ones get filled (verify behavior per field).
  - **Lead activities, campaign memberships, notes/files, and attachments move** to the contact (and the opportunity, depending). Campaign history goes to the contact. If the lead's campaign is a primary campaign source, the Opportunity's **Primary Campaign Source** gets set (the most recently associated campaign).
  - The Lead becomes **read-only** with `IsConverted = true`. It is hidden from list views and standard lookups. Reports use the "Converted" fields. **Converted leads cannot be unconverted** (IsConverted cannot be set back to false; delete/recreate the lead or undo the created records manually).
  - Lead **owner** becomes owner of new records. The opportunity contact role is created automatically (primary).
  - Lead **Lead History** field-tracking remains on the lead.
- Apex: `Database.LeadConvert lc = new Database.LeadConvert(); lc.setLeadId(id); lc.setConvertedStatus(status); lc.setDoNotCreateOpportunity(true); Database.convertLead(lc);` Up to 100 per call. Flow has no native Convert element (use Apex invocable; verify any 2025+ native action).
- **Bulk convert**: Lightning list views do not support mass convert natively. Use Apex or AppExchange.

### 1.7 Lead Scoring
- **Einstein Lead Scoring (ELS)**: ML score 1–99 on `Lead` (field shows score; the Einstein Lead Score component shows top positive and negative factors). Needs a model. An **org-specific model** requires enough history (roughly **≥1,000 leads created and ≥120 converted in the last 6 months**, verify). Otherwise a **global model** is used. Setup → Einstein Lead Scoring: segment by fields/record types, exclude fields. Refreshes ~every 10 days (model) and scores roughly every 6 hours (verify).
- Availability: historically in the Sales Cloud Einstein add-on and Unlimited/Performance. Included in Agentforce 1 Sales (verify).
- Non-AI options: formula/rollup scoring fields; Account Engagement (Pardot) **Score** (activity) and **Grade** (fit, A–F); Marketing Cloud Engagement scoring; Data Cloud calculated insights.

### 1.8 Lead record buttons/actions (typical Lightning)
| Button/Action | Purpose |
|---|---|
| **Convert** | Opens the conversion dialog (needs Convert Leads) |
| **Change Owner** | Assign to user/queue (option to send notification email) |
| **Edit / Delete / Clone** | Standard |
| **Find Duplicates / View Duplicates** | Duplicate rule alerts → Merge (leads: up to 3) |
| **Merge Leads** (via duplicates) | Pick master, choose field values, related items reparented |
| **Add to Campaign** | Creates CampaignMember with status (list view: "Add to Campaign" mass action) |
| **Submit for Approval**, **Printable View**, **Check for New Data** (Data.com, retired) | |
| Activity composer: New Task / Log a Call / New Event / Email | Activity timeline |
| **Enroll in Cadence** (Sales Engagement) / **Call** (Dialer) | Add-ons |
| List view: **New, Import, Change Owner, Change Status, Add to Campaign, Assign Label, Send List Email, Kanban** | |

---

## 2. Accounts

### 2.1 Business vs Person Accounts
| | Business Account | Person Account |
|---|---|---|
| Model | Account (company) with related Contacts | Single record = Account + Contact combined (B2C) |
| Fields | Account fields | Account fields + Contact fields (`__pc` suffix for custom contact fields, e.g. `Hobby__pc`; standard `PersonEmail`, `PersonMobilePhone`, `PersonBirthdate`) |
| Flag | `IsPersonAccount = false` | `IsPersonAccount = true`, `PersonContactId` links the hidden contact |
| Record type | Business record type(s) | Person Account record type(s) on Account |

- **Enabling is irreversible.** Prereqs: at least one Account record type; Contact OWD = **Controlled by Parent**; profiles with Read on Account must have Read on Contact. Enable via Setup → Account Settings → "Allow Person Accounts" (self-service since ~2020) or by Support.
- Person accounts can't have direct child contacts, can't be in an account hierarchy as a parent (verify), and can't merge with business accounts. Converting between types means changing the record type via Apex/Data Loader (only if no related contacts, etc.).
- Lead conversion with a blank Company creates a person account.

### 2.2 Account Hierarchy
- `ParentId` self-lookup. The **View Account Hierarchy** action (Lightning) shows a tree grid. Columns are configurable (Object Manager → Account → **Hierarchy Columns**, up to 15 fields; verify). Displays up to ~2,000 accounts (verify).
- No automatic rollups of opportunities across the hierarchy. Use reports with the "Accounts with Hierarchy"-style approach, Flow/Apex rollups, or Data Cloud / CRM Analytics. A Salesforce Maps/"Account Hierarchy rollups" feature exists in industry clouds (Financial Services Cloud etc.).

### 2.3 Account Teams
- Setup → **Account Teams** → Enable. Team Roles picklist (Account Team Roles). Members get access levels for **Account, Opportunity, Case** (Read Only / Read/Write), plus Contact visibility under Private sharing.
- Users can set a **Default Account Team** on their user record (Advanced User Details → Default Account Team) and choose to auto-add it to accounts they own. Lightning buttons: **Add Team Members**, **Add Default Team**, **Delete Team**, **Display Access**.
- Object: `AccountTeamMember` (supports Apex/Flow). Account team membership creates `AccountShare` rows.
- Changing account owner: option "Keep Account Team" (verify; Lightning has a checkbox for transferring teams and opportunities).

### 2.4 Contact Roles on Accounts & Account Contact Relationships (ACR)
- **Account Contact Roles** (`AccountContactRole`): legacy "Contact Roles" related list on Account (roles like Decision Maker, Influencer). Being superseded by ACR.
- **Contacts to Multiple Accounts** (Setup → **Account Settings** → "Allow users to relate a contact to multiple accounts"): creates the `AccountContactRelation` junction.
  - Every contact has one **direct** relationship (its `AccountId`, `IsDirect = true`) plus any number of **indirect** relationships.
  - Fields: `Roles` (multi-select picklist), `IsActive`, `StartDate`, `EndDate`, custom fields.
  - Related lists: **Related Contacts** (on Account) and **Related Accounts** (on Contact). The **Add Relationship** button. You cannot delete the direct ACR (change the contact's primary account instead).
  - Person accounts can be related as contacts to business accounts (indirect).
  - Not supported in some places (e.g. some Experience Cloud sharing; verify). Sharing for indirect contacts is not inherited.

### 2.5 Account Merge
- Merge **up to 3 accounts** at a time. Choose the master record and field-by-field values. Related records (contacts, opportunities, cases, activities, etc.) are reparented to the master and the losers go to the Recycle Bin.
- Lightning: from **duplicate alerts → View Duplicates → Merge**, or from the Accounts list via the **Merge Accounts** action (verify availability; Classic had a "Merge Accounts" link on the Accounts tab). Requires **Delete** on accounts (and Merge/"Edit" on related). Business accounts merge only with business accounts, person with person.
- Hierarchy: when you merge accounts with children, the children's ParentId repoints to the master. Account teams merge. Sharing on losers is lost.
- API: `Database.merge(master, duplicateIds)` (up to 2 duplicates per call).

### 2.6 Account record buttons/actions
New Contact / New Opportunity / New Case / New Note, **Edit, Delete, Change Owner** (options: transfer open opportunities and cases owned by others, closed opportunities, open/closed activities, keep team), **View Account Hierarchy**, **Sharing** (manual share; "Sharing Hierarchy" in Lightning), **Clone**, **Submit for Approval**, **Check for New Data** (retired Data.com), **Merge** (via duplicates), **Add Relationship**, **Printable View**, **Enable as Partner / Enable as Customer** (Experience Cloud, Manage External Account), **Log a Call / New Task / New Event / Email**, Einstein **Account Summary/Research** (AI, verify), **Relationship Map / Account Plans** (Account Plans feature, Spring '24+, verify).

---

## 3. Contacts

- `Contact.AccountId` = direct account (optional; a contact without an account is a **private contact** visible only to the owner and admins).
- **Reports To** (`ReportsToId`) self-lookup builds an org chart. **Contact Hierarchy** view: Lightning action "View Contact Hierarchy" (verify).
- **Contacts to Multiple Accounts**: see 2.4 (ACR).
- **Merge Contacts**: up to 3; master/field selection. Restrictions: you can't merge contacts with different direct accounts in some cases (Lightning allows choosing; verify), and contacts linked to portal/community users have extra rules (only one may be an active portal user; the master must be that one, verify). Related lists (activities, opportunities contact roles, campaign members, cases) reparent.
- Fields: `Email`, `HasOptedOutOfEmail`, `DoNotCall`, `HasOptedOutOfFax`, `EmailBouncedReason/Date`, `LeadSource`, `Birthdate`, `MailingAddress`, `IndividualId` (link to the Individual object for privacy/consent).
- Buttons: Edit, Delete, Clone, Change Owner, **Enable Customer User / Enable Partner User** (Experience Cloud), **Add to Campaign**, **Request Update** (Classic), **Add Relationship**, **New Opportunity**, **Enroll in Cadence**, Email/Call/Log a Call, Merge (via duplicates), Submit for Approval.

---

## 4. Opportunities

### 4.1 Stages, Probability, Forecast Category
- **Stage** picklist values carry **Type** (Open / Closed-Won / Closed-Lost), a default **Probability %**, and a **Forecast Category** (Pipeline, Best Case, Commit, Closed, Omitted). Editing Stage auto-sets Probability and Forecast Category. Users can override Probability (and Forecast Category, if field-level security allows).
- Standard values: Prospecting (10%), Qualification (10%), Needs Analysis (20%), Value Proposition (50%), Id. Decision Makers (60%), Perception Analysis (70%), Proposal/Price Quote (75%), Negotiation/Review (90%), Closed Won (100%), Closed Lost (0%).
- Derived fields: `IsClosed`, `IsWon`, `ExpectedRevenue` (= Amount × Probability), `ForecastCategory` (system values) vs `ForecastCategoryName` (label).
- **Close Date** is required. It drives forecasting period placement, pipeline reports, and push-count tracking (`PushCount` increments when the Close Date moves into a later month, API only; verify). **Amount** is either manual or the sum of Opportunity Products (when products exist, Amount becomes read-only and derived).

### 4.2 Sales Process & Record Types
- **Sales Process** (Setup → Sales Processes) = a subset of Stage values. Each Opportunity record type must have a sales process. Different teams get different stage sets. Lead equivalent: **Lead Process** (statuses). Case: Support Process. Solution: Solution Process.

### 4.3 Path (Sales Path)
- Setup → **Path Settings** → Enable → New Path: object (Opportunity, Lead, Account, Contact, Case, Quote, Order, Contract, custom), record type, picklist (Stage/Status or any picklist). Per step: up to 5 **Key Fields** and **Guidance for Success** (rich text, links, video). Toggle **Celebration** (confetti) on a step (e.g. Closed Won), with frequency options.
- **Mark Stage as Complete / Mark as Current Stage** buttons. Closing prompts for the Closed Won/Lost choice (and Loss Reason if configured as a key field). Remember-user-preference: whether the Path is expanded.
- Path ≠ validation. Use validation rules to enforce key fields.

### 4.4 Opportunity Teams (Team Selling) & Splits
- Setup → **Opportunity Team Settings** → Enable Team Selling. Team member roles (the same Team Member Role picklist as account teams). Access: Read Only / Read/Write. **Default Opportunity Team** on the user record (auto-add on create/owner change). Buttons: **Add Opportunity Team Members, Add Default Team, Delete Team**.
- **Opportunity Splits** (Setup → Opportunity Splits Settings; requires Team Selling; enabling can take time and runs a background job):
  - **Revenue split** type: percentages must total **100%** across team members (based on Amount). The owner gets 100% by default.
  - **Overlay split** type: can total any % (e.g. specialists, SEs). Not counted toward the 100%.
  - **Custom split types** on any currency field of Opportunity (up to 5 active split types; verify).
  - Splits can feed Collaborative Forecasts (the Opportunity Revenue Splits / Overlay splits forecast types).
  - Removing a team member with a revenue split forces reallocation. A split owner must be a team member.

### 4.5 Opportunity Contact Roles (OCR)
- `OpportunityContactRole`: Contact + Role (Business User, Decision Maker, Economic Buyer, Economic Decision Maker, Evaluator, Executive Sponsor, Influencer, Technical Buyer, Other) + **IsPrimary** (one primary).
- Since Spring '20, OCR supports **custom fields, triggers, validation rules, page layouts, Lightning record pages** (verify), and the **Primary Contact** related flow. "Require a primary contact role" can be enforced only through validation/Flow (a historical gap). The Opportunity record has `ContactId` (primary contact at creation, settable on insert).
- Lead conversion creates a primary OCR automatically.

### 4.6 Products / Opportunity Line Items & Schedules
- `OpportunityLineItem` (Opportunity Product): Product (via `PricebookEntryId`), Quantity, Sales Price (`UnitPrice`), Discount, `TotalPrice`, Date, Description, Line Description. An opportunity can use **one price book** (`Pricebook2Id`). Changing the price book deletes the existing line items.
- Buttons on the Products related list: **Add Products** (choose the price book first if none, select products, enter quantity/price), **Edit Products**, **Choose Price Book**, **Sort**.
- **Product Schedules** (Setup → Product Schedules Settings): enable **Quantity** and/or **Revenue** schedules, plus default schedules per product (set on the product: Schedule Type **Divide** or **Repeat**, installment period Daily/Weekly/Monthly/Quarterly/Yearly, number of installments). Opportunity products get an **Establish / Re-establish / Edit Schedule** button. `OpportunityLineItemSchedule` object. Collaborative Forecasts can forecast on **product schedule date** (forecast type "Product Schedules"; verify naming).
- **Product families** support family-based forecasts.

### 4.7 Big Deal Alerts
- Setup → **Big Deal Alert** (only **one alert per org**). Settings: Alert Name, **Trigger Probability %**, **Trigger Amount** (in the corporate currency), From Name/Email, To recipients, CC/BCC, **Notify Opportunity Owner**, email template, Active checkbox.
- Fires **once per opportunity** when it meets both thresholds (it does not re-fire unless the opportunity drops below and climbs back, verify). Multi-currency: compares in the corporate currency. For anything richer use Flow + email/Slack/notifications.

### 4.8 Opportunity History & Field History
- **Stage History** related list (`OpportunityHistory`): automatically records changes to Stage, Amount, Probability, Close Date, Forecast Category, and Expected Revenue, with who and when. Always on; not configurable.
- **Field History Tracking** (`OpportunityFieldHistory`): up to 20 fields per object (more with Shield Field Audit Trail, up to 60). Retained 18 months in the UI and 24 months via API (more with Shield).
- Reports: **Opportunity History** report type; **Historical Trending** reports (Setup → Historical Trending: up to 8 fields on Opportunity; day/week/month snapshots over the last 3 months, verify); **Waterfall charts** (Opportunity pipeline changes).
- **Opportunity Field History** + **Pipeline Inspection** "Changes" columns depend on history.

### 4.9 Pipeline Inspection
- Setup → **Pipeline Inspection** → enable (Enterprise, Performance, Unlimited; no extra cost for the core feature). Opens from the Opportunities tab: the **Pipeline Inspection** button.
- Features: metrics/KPI bar (Total, Closed Won, Commit, Best Case, Pipeline, Open; "Moved In/Out"; "Pushed"), filter by period/owner/team/list views, **change highlights** (amount up/down = green/red, close date pushed, stage moved), **Change history** (last 7 days or a custom range), inline editing, **Flow chart / Waterfall** views, an **activity column** ("Last Activity", "Next Step").
- **Einstein-powered**: **Deal Insights** (e.g. "Close date in past", "Deal unlikely to close by close date", "No activity in X days", "Deal predicted to slip"), **Opportunity Score**, the **Einstein Forecast / "Expected to close"** column, and **Pipeline summaries / Agentforce** generative summaries (needs Sales Cloud Einstein / Unlimited / Agentforce add-ons, verify).
- Works with Splits and Territories as filters (verify).

### 4.10 Other opportunity features
- **Kanban view** (any list view → display as Kanban): group by Stage (or another picklist), summarize by Amount/Expected Revenue, drag cards between columns (the stage change runs validation; Closed Won/Lost columns trigger a prompt). Can't be used on list views with more than ~... records displayed at once (loads incrementally; verify). Not available for some objects without a picklist.
- **Similar Opportunities** (Classic setting: find closed-won opportunities with matching criteria).
- **Opportunity Update Reminders** (Classic: weekly emails to managers about direct reports' opportunities).
- **Opportunity Score** component (Einstein Opportunity Scoring: 1–99 + factors).
- **Next Step** field, **Loss Reason** (custom, common), **Competitors** related list (`OpportunityCompetitor`, Classic legacy).
- **Opportunity Products from Quote sync** (see Quotes).
- Buttons: Edit, Delete, Clone, **Clone with Related** (clone with products/contact roles; Lightning "Clone with Related" lets you select related lists, verify), Change Owner, **Close** (via Path), **New Quote**, **Add Products**, **Sharing**, **Submit for Approval**, **Add Opportunity Team Members**, **Edit Opportunity Splits**, **Pipeline Inspection** (tab-level), **Enroll in Cadence**, Einstein "Summarize" (Agentforce, verify).

---

## 5. Products & Price Books

| Concept | Detail |
|---|---|
| `Product2` | Catalog item: Name, ProductCode, Family, IsActive, Description, QuantityUnitOfMeasure, schedule defaults, `StockKeepingUnit` |
| `Pricebook2` | **Standard Price Book** (exactly one, `IsStandard = true`, can't be deleted) + any number of **custom price books** (e.g. by region/channel). Custom books have IsActive and Description. |
| `PricebookEntry` | Product × Price Book × **Currency**: `UnitPrice` (list price), `UseStandardPrice`, `IsActive`. |
| Rule | A product must have a **standard price** (an entry in the standard book) **before** it can be added to a custom price book in that currency. |
| Multicurrency | One PricebookEntry **per currency** per product per book. An opportunity's currency limits the products available (entries in that currency). |

- Buttons on Product: **Add Standard Price**, **Add to Price Book**, **Edit / Delete prices**, **Edit Schedule defaults**. On Price Book: **Add Products**, **Edit All**, **Deactivate**.
- Price Book access is controlled by sharing (Price Book OWD: No Access / View Only / Use). "Manage Price Books" and "Manage Products" permissions.
- Discounting is free-form (Discount field on the line, or Sales Price override). Approvals via Approval Processes or Flow. Complex pricing → CPQ/Revenue Cloud.
- **Multicurrency**: enable via Setup → Company Information → **Currencies / Manage Currencies** (self-enable in Setup; historically through Support). **Irreversible.** Adds `CurrencyIsoCode` to all records. Corporate currency + active currencies + conversion rates.
  - **Advanced Currency Management (ACM)**: **dated exchange rates** (`DatedConversionRate`) apply to **Opportunities, Opportunity Products, Opportunity Product Schedules, campaign opportunity fields, and reports**. **Not** applied to most other objects or to roll-up summary fields (with ACM on, cross-currency roll-ups use static rates; verify) and formula fields use the static rate.
  - Users have a **personal currency** that controls report display. Forecasts use the forecast currency setting (corporate or personal, verify).

---

## 6. Quotes

- Enable: Setup → **Quote Settings** → Enable (then add the Quotes related list to Opportunity layouts; the setup prompt offers this). Editions: Pro Suite+ / Enterprise+ (verify).
- `Quote` belongs to **one Opportunity** (an opportunity can have many quotes). `QuoteLineItem` mirrors opportunity products (same price book). Fields: Expiration Date, Status (Draft, Needs Review, In Review, Approved, Rejected, Presented, Accepted, Denied), Bill/Ship/Quote To addresses, Tax, Shipping & Handling, Discount, Subtotal, Grand Total, `IsSyncing`.
- **New Quote** from an opportunity copies the opportunity products to quote line items and the account/contact addresses.
- **Start Sync / Stop Sync**: **only one quote per opportunity syncs** at a time. While syncing, changes to quote line items ↔ opportunity products flow both ways, and standard fields sync. **Custom fields do not sync by default**; you must build Flow/Apex sync (or use the quote line item/opportunity product field-mapping approach via automation, verify). Starting a sync replaces the opportunity's products with the quote's lines.
- **Quote Templates** (Setup → **Quote Templates**): drag-and-drop template editor (Lightning-styled builder; sections, fields, lists of line items, text/images). Activate a template.
- **Create PDF** button → choose a template → **Preview** → **Save to Quote** (creates a `QuoteDocument` in the Quote PDFs related list) or **Save and Email Quote**. **Email Quote** button sends the generated PDF as an attachment via the email composer. PDFs are static snapshots.
- Quote PDFs limited to 25 line-item "list" components per template (verify); for advanced docs use Salesforce Docs/Document Generation (Industries/RCA), Conga, DocuSign Gen, etc.
- Quote approvals: Approval Process on Quote. Quote-to-order: native Orders aren't auto-created from quotes (Flow needed). CPQ/RCA handle this.
- Buttons: **Create PDF, Email Quote, Start Sync / Stop Sync, Add Line Item, Edit Lines, Submit for Approval, Clone**.

---

## 7. Contracts & Orders

### Contracts
- `Contract`: Account (required), Status (Draft, In Approval Process, Activated), Start Date, Contract Term (months), End Date (calculated if configured), Owner Expiration Notice, Customer/Company Signed By/Date, Special Terms.
- Setup → **Contract Settings**: **Auto-calculate Contract End Date**, **Send contract expiration notices to account and contract owners**, **Enable Contract Auto-Expiration** (status → Expired after End Date), Contract History tracking.
- **Activate** button (needs the "Activate Contracts" permission). Activated contracts lock certain fields.
- Contracts are not auto-created from opportunities natively (Flow). CPQ creates contracts from opportunities ("Contracted" checkbox) with subscriptions.

### Orders
- Setup → **Order Settings** → **Enable Orders**. Options: **Enable Negative Quantity**, **Enable Zero Quantity**, **Enable Reduction Orders** (verify current set), Enable Optional Price Books for Orders.
- `Order`: **Account required**, Contract (optional or required by setting), Effective Date, Status (Draft → Activated; status *category* Draft/Activated), Price Book, `OrderItem` (Order Products). Once activated, products can't be added/removed. Use a **Reduction Order** to reduce quantities.
- Buttons: **Activate / Deactivate**, **Add Products**, **Edit Products**, **Create Reduction Order** (verify), **Clone**.
- Permissions: "Activate Orders", "Edit Activated Orders", "Create Reduction Orders".
- Order Management (OMS, B2B/B2C Commerce) is a separate product that uses Order Summary objects.

---

## 8. Campaigns

- **Marketing User** checkbox on the User record (or the Campaign "Manage" permissions) is required to create/edit campaigns. The Campaign object is in all editions (Pro+ for full features; verify Starter).
- **Campaign Hierarchy**: `ParentId`, **up to 5 levels**. Hierarchy statistics fields (aggregated across the hierarchy): `NumberOfLeadsInHierarchy`, `NumberOfContactsInHierarchy`, `NumberOfResponsesInHierarchy`, `NumberOfOpportunitiesInHierarchy`, `AmountAllOpportunitiesInHierarchy`, `AmountWonOpportunitiesInHierarchy`, `BudgetedCostInHierarchy`, `ActualCostInHierarchy`, `ExpectedRevenueInHierarchy`. **View Campaign Hierarchy** action.
- **Campaign Members** (`CampaignMember`): a Lead **or** Contact (or person account) linked to a campaign, with `Status` and `HasResponded`. One membership per person per campaign. Add via **Add Leads / Add Contacts** buttons, **Add to Campaign** from a record or list view, reports ("Add to Campaign" from lead/contact reports, up to 50k), Data Import Wizard ("Add to campaign" option), Flow/API.
- **Member Statuses**: per campaign (`CampaignMemberStatus`). Defaults are **Sent** and **Responded** (Responded flagged as "Responded"). The **Advanced Setup** button edits the status values, default status, and the Responded flag. **Campaign Member Status cannot be deleted while in use**; it must always have one default. Flows/Apex creating a campaign should create statuses (a record-triggered flow on Campaign is a common pattern).
- **Campaign Influence**:
  - **Campaign Influence 1.0** (legacy): Campaign Influence related list on Opportunity, auto-association based on the contact's campaign membership within a time frame (Setup → Campaign Influence → "Auto-associate").
  - **Customizable Campaign Influence** (current): attribution models. **Primary Campaign Source** model (default; 100% to the opportunity's `CampaignId`), plus custom models (via Apex/API) and **Account Engagement (Pardot) B2B Marketing Analytics models: Even Distribution, First Touch, Last Touch** (verify). Objects: `CampaignInfluence`, `CampaignInfluenceModel`. Influence is credited only via contact roles on the opportunity. Settings: "Auto-association" timeframe (days before opportunity creation), "Only one primary model", "Lock model", etc.
  - Campaign related lists: **Influenced Opportunities** (verify naming).
- **Primary Campaign Source** (`Opportunity.CampaignId`): set from lead conversion or manually. Drives the standard campaign stats "Opportunities in Campaign" / "Won Opportunities".
- **ROI**: fields `BudgetedCost`, `ActualCost`, `ExpectedRevenue`, `ExpectedResponse` (%), `NumberSent`, plus calculated counts. Standard **Campaign ROI Analysis Report** (ROI = (Won Amount − Actual Cost) / Actual Cost). Use custom formula fields for an ROI %.
- Other: Campaign **Type** (Advertisement, Email, Webinar, Conference, Trade Show, Partners, Referral Program, Direct Mail, Telemarketing, Public Relations, Banner Ads, Other), **Campaign record types**, **Campaign Member page layouts** (separate for leads/contacts), **Campaign Member Type**, campaign sharing (OWD for Campaign). **List emails** (Send List Email from campaigns; verify limits).
- Buttons on Campaign: **Manage Campaign Members**, **Add Leads / Add Contacts** (search/import), **Advanced Setup** (member statuses), **View Campaign Hierarchy**, **Clone**, **Send List Email**, **Import Leads/Contacts (Data Import Wizard)**, **Campaign Influence related lists**.

---

## 9. Forecasting (Collaborative Forecasts)

### 9.1 Setup
- Setup → **Forecasts Settings** → **Enable Forecasts**. Then:
  1. **Forecast Types** (up to **4 active** by default; verify current limit, some orgs ≥ 6). Each type = an object + measure + date type + optional filter.
  2. **Forecast Period**: **Monthly** or **Quarterly**, start month, number of periods to display (up to 12 months or 8 quarters, verify).
  3. **Forecast Currency**: corporate currency or each user's personal currency (multicurrency).
  4. **Cumulative Forecast Rollups** on/off (see 9.4).
  5. **Adjustments**: enable manager adjustments and/or owner adjustments per forecast type.
  6. **Quotas**: Show Quotas; per forecast type.
  7. **Forecast Hierarchy** (Setup → Forecasts Hierarchy): enable users (must have the "Allow Forecasting" checkbox on the user record), assign a **forecast manager** per role node (one manager per role), and choose role-based or **territory-based** hierarchy.
  8. Optional: Default forecast type for users; **Show Opportunity Pane**, columns/list view settings on the opportunity pane; **Forecast Category** mapping is on the Stage picklist.

### 9.2 Forecast types (sources/measures)
| Source object | Measures | Notes |
|---|---|---|
| Opportunities | Revenue (Amount), Quantity (TotalOpportunityQuantity), **custom currency field** (custom measure) | Date: Close Date |
| Opportunity Product (Line Items) | Revenue, Quantity | Product Date or Opportunity Close Date |
| Product Schedules | Revenue, Quantity | Schedule date |
| Opportunity Splits | Revenue splits, Overlay splits, custom split types | Requires Splits |
| Product Families | Revenue, Quantity by family | Opportunity products |
| Territories (ETM) | Opportunity revenue/quantity by territory hierarchy | Requires ETM; territory forecast hierarchy |
| Custom/filtered | **Filtered forecast types** (filter opportunities by record type, type, etc.; verify filter support) | Since ~Summer '22 |

- Opportunity owner, split, or territory determines who the opportunity rolls up to.

### 9.3 Forecast Categories
- Pipeline → Best Case → Commit → Closed, plus Omitted (excluded). Driven by the Stage mapping (overridable on the opportunity). Category labels can be renamed. You can't add new categories.

### 9.4 Rollups
- **Cumulative rollups (on)**: columns are **Closed Only**, **Commit Forecast** (Closed + Commit), **Best Case Forecast** (Closed + Commit + Best Case), **Open Pipeline** (Pipeline + Best Case + Commit).
- **Individual categories (off)**: Pipeline, Best Case, Commit, Closed shown separately.
- Rollups aggregate up the forecast hierarchy (manager = own + subordinates).

### 9.5 Adjustments & Quotas
- **Manager adjustments**: a manager overrides a subordinate's or their own rollup amount in a category (adjusts the number seen by their own manager). **Owner adjustments**: users adjust their own forecast. Adjustments show an icon; history is kept. Adjustments can be "frozen" with Forecast Submission (verify) and are cleared if forecasting is disabled/reconfigured.
- Adjustments are tied to a forecast type, period, and category. Changing the hierarchy or currency can purge adjustments.
- **Quotas**: `ForecastingQuota` object, loaded via Data Loader/API/Flow (or the "Quotas" UI in forecasts for some types; verify). Per user (or territory), per period, per forecast type. Shows **Quota** and **Attainment %** columns. Managers' quotas are separate (not auto-summed).
- **Forecast Submission/Snapshot**: "Submit Forecast" / forecast notes & historical snapshots (feature varies by release; verify).

### 9.6 Forecasts page buttons & UI
| Element | What it does |
|---|---|
| Forecast type selector (**Change Forecast / Forecast Type**) | Switch forecast type (Opportunity Revenue, Product Family, etc.) |
| Range / period selector | Change the start period / displayed range |
| **Display Options**: Show/Hide **Quota**, Show/Hide **Chart** (Forecasts chart), change **currency**, Show Notes | Display controls |
| **Export** (CSV) | Exports forecast rows (verify availability) |
| Hierarchy rollup tree / **"Forecasts for" (Forecast Manager selector)** | Navigate forecast hierarchy (managers) |
| Click a cell → **Opportunity pane** (related opportunities list, editable inline, list views/filters) | Drill down |
| **Adjust** (pencil on a cell) | Manager/owner adjustment |
| **Notes** (forecast notes, Summer '23+, verify) | Commentary per forecast |
| **Einstein Forecasting** column / prediction | AI prediction for the period |
| **Pipeline Inspection** link | Jump to inspection |

### 9.7 Einstein Forecasting
- AI prediction of forecast attainment per user/manager per period (Opportunity Revenue type, quarterly/monthly, verify). Needs ~2 years of history (verify). Part of the Sales Cloud Einstein / Revenue Intelligence bundle. Shows a predicted amount and trends on the Forecasts page.

### 9.8 Legacy
- **Customizable Forecasts** (pre-2013) and "Forecasts (Classic)" are retired. Some older orgs still had to migrate. Forecasting via Revenue Intelligence / CRM Analytics dashboards complements it.

---

## 10. Enterprise Territory Management (ETM / "Sales Territories")

- Setup → **Territories Settings** → Enable (formerly "Enterprise Territory Management"; the original "Territory Management 1.0" is retired). Defaults: Account/Opportunity/Case access for territory users.
- **Objects**: `Territory2Model`, `Territory2Type` (with **priority**, used for opportunity territory assignment), `Territory2`, `UserTerritory2Association` (users + Role in Territory), `ObjectTerritory2Association` (Account ↔ Territory, AssociationCause = Territory2Manual or Territory2AssignmentRule), `ObjectTerritory2AssignmentRule` (+ rule items), `Territory2ObjectExclusion` (exclude accounts from rules).
- **Model states**: **Planning** (build, preview rule results), **Active** (only one), **Archived** (cannot reactivate, verify), **Cloning**, plus transitional (Activating/Archiving, Activation/Archive Failed). Model limits by edition (e.g. Enterprise 2 models, Performance/Unlimited 4; verify). Territories per model: default 1,000, raise via Support (up to 99,999+; verify).
- **Territory Types**: categorize territories (e.g. Named, Geographic, Overlay). **Territory Type Priority** helps the **opportunity territory assignment filter** choose among multiple territories.
- **Territory Hierarchy**: a tree view of the model (drives **territory-based forecasting** and access roll-up).
- **Assignment Rules**: account criteria (up to 10 rule items plus filter logic). Inherit to descendant territories ("Apply to Child Territories", verify). **Run Assignment Rules** (on a territory or at model level), or automatically when accounts are created/edited ("Evaluate this account against territory rules on save" checkbox on the account edit layout; API `Territory2AssignmentRuleHeader`; verify).
- **Manual assignment**: add accounts to a territory directly.
- **Opportunity Territory Assignment**: `Opportunity.Territory2Id`. Set manually (from the account's territories) or via the **Opportunity Territory Assignment Filter** (an Apex class implementing `TerritoryMgmt.OpportunityTerritory2AssignmentFilter`). Salesforce provides a sample filter (choose the territory with the highest-priority type). Run via Setup → "Run Opportunity Filter" (on demand or scheduled; verify), or keep open opportunities assigned automatically.
- **Territory-based forecasts**: forecasts settings → enable a territory forecast type; forecast managers set per territory; opportunities roll up by `Territory2Id`.
- Access: users in a territory get the access set at the territory level (Account Read/Edit, Opportunity, Case, Contact). Sharing recalculation happens on model activation.
- Reports: "Territories with Accounts/Users" etc. Activation of a large model is async and can take hours.
- Related: **Salesforce Maps Territory Planning** (draw territories on a map and sync to ETM), **Sales Planning** (capacity/quotas).

---

## 11. Activities

### 11.1 Tasks & Events
- **Task**: Subject, Due Date (`ActivityDate`), Status, Priority, `WhoId` (Lead/Contact), `WhatId` (Account/Opportunity/Case/custom, etc.), `TaskSubtype` (Task, Email, Call, ListEmail, Cadence, LinkedIn), Call fields (CallType, CallDurationInSeconds, CallDisposition), `IsRecurrence` and recurring settings (Recurring Tasks in Lightning, verify), **Repeat this Task** (regenerate after completion).
- **Event**: Start/End datetimes or `IsAllDayEvent`, Location, `ShowAs`, invitees (`EventRelation`), recurring events (Lightning supports creating series; verify), event reminders.
- **Shared Activities** (Setup → Activity Settings → "Allow Users to Relate Multiple Contacts to Tasks and Events"): **up to 50 contacts** per activity (one lead OR up to 50 contacts). Irreversible-ish (can't disable once enabled; verify) and uses `TaskRelation`/`EventRelation`.
- `Activity` is a polymorphic shared object. Activities have no sharing of their own and follow the parent ("Controlled by Parent").
- **Activity Timeline** (Lightning): Upcoming & Overdue, past activities by month, filters, Expand All. Composer actions: **New Task, Log a Call, New Event, Email** (global actions; customize on the layout).
- Archived activities: events/tasks older than 365 days (closed) are archived (`IsArchived`); query with `ALL ROWS`/queryAll.
- **Email**: `EmailMessage` (Lightning email). Enhanced Email (on by default) stores emails as EmailMessage records related to records. Email templates (Lightning / Classic). **Send List Email**, email tracking (opens via tracking pixel, verify), **Einstein Email Insights**, **Email Logging**.

### 11.2 Einstein Activity Capture (EAC)
- Connects Microsoft 365/Exchange or Google Workspace accounts. **Automatically captures emails and events** and shows them on the activity timeline of related records (contacts, leads, accounts, opportunities). Can also **sync contacts and events** between Salesforce and the email/calendar.
- **Storage**: captured emails/events historically were **not stored as Salesforce records** (they lived in a separate AWS store). So they were not reportable via standard reports or SOQL, had 6-month/2-year retention depending on license, and only appear in the timeline and Activity Metrics/EAC dashboards. Newer releases add **"Store activity data in Salesforce"** / Activity 360 reporting and Data Cloud-based storage options (verify current behavior in your org).
- Configurations: Setup → Einstein Activity Capture → **Configurations** (assign users/profiles, choose what to sync, exclusions, sharing settings for captured activity). **Activity Metrics** (Spring '20+) creates reportable count fields.
- Included in Sales Cloud (standard EAC; limited) and expanded in Inbox / Sales Engagement / Einstein licenses (verify).
- **Gotcha**: EAC-captured activities do not fire triggers/flows and are not in `Task`/`Event` (unless the new storage option is used).

### 11.3 Outlook / Gmail Integration & Lightning Sync
- **Outlook Integration** and **Gmail Integration** (Setup → Outlook Integration and Sync / Gmail Integration and Sync): side panel in Outlook/Gmail to view/create Salesforce records, **Log email** (manual email logging to records), and templates. **Enhanced email with Inbox** features need the Inbox license.
- **Lightning Sync** (contact & event sync for Exchange/Google): being **retired**. Salesforce directed customers to **Einstein Activity Capture sync** (verify retirement date; announced for ~2024–2026).
- **Salesforce for Outlook** (the old desktop add-in): retired (end of support ~June 2023, removed Dec 2023, verify).

### 11.4 Salesforce Inbox
- Add-on (also included in Sales Engagement / some Unlimited bundles, verify). Features in the Outlook/Gmail integration: **email tracking** (opens/clicks), **Send Later**, **Insert Availability** (scheduling), **Templates**, **Einstein Recommended Connections**, **Email Insights**, and reminders.
- The **Inbox mobile app** was retired (~2023–2024; verify). Inbox features live inside the Outlook/Gmail integrations and the Salesforce mobile app.

---

## 12. Sales Engagement (formerly High Velocity Sales, HVS)

- Renamed from **High Velocity Sales** to **Sales Engagement** (2022). Permission set license: **Sales Engagement** (Sales Engagement Basic / User / Cadence Creator / Quick Cadence Creator permission sets). Included in Unlimited and Agentforce 1 Sales in recent packaging; an add-on otherwise (verify).
- **Cadences** (Sales Cadences): Cadence Builder (Flow-style canvas) with steps: **Call**, **Email** (manual or automated, with templates), **Custom Step** (e.g. LinkedIn), **Wait**, **Branch** (on email open/click/reply or call outcome). Active/inactive cadences, **Quick Cadences** (lightweight, by rep).
  - Targets: leads, contacts, person accounts. **Enroll in Cadence** button (record), mass add from list views/reports; **Cadence Assignment Rules** (auto-enroll via assignment rules); Flow actions **"Assign Target to Sales Cadence"** / **"Remove Target from Sales Cadence"**.
  - **Call outcome / disposition** tracking; reporting (Sales Cadence Step Tracker, etc.).
- **Work Queue** (utility bar component): prioritized list of today's cadence steps (calls, emails, tasks) per rep. Work Queue settings: sort order, **custom fields in work queue**, Einstein lead/opportunity score in the queue, compact layouts.
- **Sales Engagement Settings**: Enable, assign permission sets, add the Work Queue utility item to sales apps, **Activity reminders**, **Email Settings** (Send through Gmail/Outlook/Salesforce), **Automated emails with Einstein**.
- Related: **Engagement Alerts** (email open notifications), **Accounts / Leads prioritization**, **Einstein Call Coaching** (now Conversation Insights).

## 13. Sales Dialer (formerly Lightning Dialer)
- Telephony within Salesforce (Twilio-based in the US/Canada and some other countries). **Click-to-dial** from records, **call logging** (auto-creates a Task), **Voicemail Drop** (prerecorded), **Local Presence** (local caller ID), **call recording** (with consent settings), **call transfer**, **Dialer utility bar**, **power/list dialing** with Sales Engagement. Licensing: **Sales Dialer Unlimited** / minutes-based add-ons (verify).
- Alternative: **Open CTI** (Call Center definition + softphone from 3rd-party vendors such as Five9, RingCentral) or **Service Cloud Voice** (Amazon Connect, partner telephony).
- **Conversation Insights** (Einstein) can analyze Dialer call recordings.

## 14. Sales Console & Productivity UI
- **Sales Console** app (Lightning **console navigation**): workspace tabs + subtabs, split view list, utility bar (Notes, History, Recent Items, Macros, Work Queue, Dialer), pinned regions (verify), keyboard shortcuts. Included in Sales Cloud Unlimited; add-on/included per edition (verify) — "Sales Console User" permission historically required. Lightning **Console App** settings in App Manager → "Navigation style: Console".
- **Kanban** (list view display), **Split View**, **Lightning Home** with the Assistant (Einstein Assistant: overdue tasks, opportunities with no activity, etc.), **Performance chart** (closed + open > 70% vs goal), **Quarterly Performance** component, **News** (retired, verify).
- **Seller Home** (Spring '24+): consolidated rep home (Today's Events, Tasks, Pipeline, Insights, Agentforce panel; verify naming/availability).
- **Sales Path**: see 4.3 (Path on Lead/Opportunity).
- **Notes** (Enhanced Notes, `ContentNote`), **Files**, **Chatter** on records.
- **Duplicate Management**: Matching Rules + Duplicate Rules (standard rules for Account, Contact, Lead) → alerts/blocks; **Duplicate Record Sets** and **merge** from them.

## 15. Sales Programs (verify — newer feature)
- **Sales Programs** (introduced ~2025 in Sales Cloud, verify name/GA): a way for sales leaders/ops to define a time-bound selling motion (e.g. "Q3 upsell of Product X to existing accounts"): a target audience (accounts/contacts), goals, enablement content, recommended actions/cadences, and tracking of progress. Ties into **Enablement** (Sales Programs in the Enablement app are learning programs for reps, a different concept) and **Sales Engagement** cadences.
- **Enablement (formerly "myTrailhead for sales"/Sales Enablement)**: Programs with exercises, outcomes, and milestones linked to CRM metrics; Agentforce role-play coaching integrates here. Separate add-on (included in Agentforce 1 Sales, verify).
- **Gotcha**: "Sales Programs" (Enablement learning programs) vs "Sales Programs" (pipeline-generation motion) are easy to confuse. Confirm which one the user means.

---

## 16. Einstein for Sales (Predictive & Generative AI)

| Feature | What it does | Licensing (verify) |
|---|---|---|
| **Einstein Lead Scoring** | 1–99 conversion likelihood + factors | Sales Cloud Einstein / UE / A1 |
| **Einstein Opportunity Scoring** | 1–99 likelihood to close + positive/negative factors. Needs closed-history (≥200 closed-won and 200 closed-lost in 2 years, else global model; verify). | Opened to Enterprise+ for free (2023; verify) and full in Einstein |
| **Einstein Forecasting** | AI forecast prediction on the Forecasts page | Revenue Intelligence / Sales Cloud Einstein |
| **Deal Insights** / **Pipeline Inspection insights** | Slip risk, no activity, close-date changes, inactivity | Einstein / UE |
| **Einstein Activity Capture** + **Activity Metrics** | Email/calendar capture and sync | Standard (limited) / Inbox / Einstein |
| **Einstein Conversation Insights (ECI)** | Analyzes call/video recordings (Zoom, Teams, Sales Dialer, Service Cloud Voice, partner telephony): transcripts, **keywords/trackers** (competitors, pricing), **next steps**, **call summaries** (generative), coaching. | Included in Unlimited / Sales Engagement / A1 |
| **Einstein Relationship Insights (ERI)** | Browser-based research assistant that found relationships on the web and in emails. It was a pilot/beta and **retired** (~2023; verify). | n/a |
| **Einstein Email Insights / Recommended Connections** | Email intent detection, warm-path connections | Inbox / Einstein |
| **Einstein Next Best Action** | Recommendation strategies (Flow-based) on record pages | Platform |
| **Revenue Intelligence** | Bundle: Pipeline Inspection insights, Einstein Forecasting, CRM Analytics Revenue Insights dashboards (Sales Analytics, Revenue Insights) | Add-on (~$220/user, verify) |
| **Einstein Generative (Einstein for Sales / Sales GPT)** | **Sales Emails** (draft personalized emails from CRM context), **Call Summaries/Explorer**, **Opportunity/Account summaries**, **Sales Summaries**. Now delivered via **Agentforce** (Einstein Copilot was renamed Agentforce Assistant in late 2024, then simply "Agentforce" in Lightning). | Agentforce add-ons / A1 Sales / Flex Credits |

---

## 17. Agentforce for Sales (2024–2026)

> Product names shift quickly; treat specific SKUs as (verify).

| Agent / capability | What it does |
|---|---|
| **Agentforce SDR** / **Sales Development Agent** (formerly "Einstein SDR Agent") | Autonomous agent that works inbound/outbound leads around the clock: answers prospect questions from approved knowledge, handles objections, nurtures through email, qualifies, and **books meetings** for reps. Runs as its own agent user with admin-assigned permissions. Uses CRM + Data Cloud grounding and guardrails (topics/instructions, approved sources, send limits, opt-out compliance). Set up in Agentforce Studio / the Setup "Sales Development" page (verify). |
| **Agentforce Sales Coach** (formerly "Einstein Sales Coach Agent") | Role-play practice for reps on a specific opportunity (pitch, objection handling, negotiation) through voice/text, with personalized feedback grounded in deal data. Add-on ("Agentforce Sales Coach"), available in Enterprise, Performance, Unlimited (verify). |
| **Sales Emails** (Einstein Sales Emails) | Generative email drafting from the record composer / Outlook-Gmail integration. Uses prompt templates (Prompt Builder: "Sales Email" template type). |
| **Agentforce (Assistant) for Sales actions** | Standard sales topics/actions: summarize record/opportunity, find similar deals, update records, draft close plans, **Pipeline Management** (identify at-risk deals), **Meeting Prep**, **Call Explorer** (Q&A over call transcripts), **Account Research / Account Summaries**. |
| **Sales Agent / Prospecting Agent / Deal Agent / Lead Nurturing Agent** (verify exact names) | Variants marketed in 2025–26 (e.g. "Agentforce Sales Agent" for outreach/follow-up). Packaging under "Agentforce Sales" (Oct 2025 – Sept 2026) and now Sales Cloud. |
| **Agentforce in Slack** for sales | Deal rooms / Slack Sales Elevate (deal alerts and pipeline in Slack), agent interaction in Slack. |

- Pricing models: **Flex Credits** (per action ~ $0.10; $500/100k credits), legacy **$2 per conversation**, **per-user add-ons** (e.g. Agentforce add-ons for Sales Cloud ~ $125/user/month), or included in **Agentforce 1 Sales** ($550). Enterprise+ edition required. (verify all)
- Prereqs: Einstein generative AI enabled (Einstein Setup), **Data Cloud** provisioned (for most agents), Einstein Trust Layer settings, agent user/permission sets, Prompt Builder for templates.

---

## 18. Partner Relationship Management (PRM)

- Built on **Experience Cloud** with the **Partner Central** template (Lightning). Licenses: **Partner Community** / **Partner Community Login**, or **Channel Account** licenses (account-based; verify).
- Steps: Enable Digital Experiences → create the partner site → **Enable as Partner** on the partner **Account** (Manage External Account) → **Enable Partner User** on Contacts. Partner roles: up to 3 roles per partner account (Executive/Manager/User; configurable in Setup → Digital Experience Settings, "Number of partner roles", verify).
- **Deal Registration**: partners submit opportunities (or leads) through the portal using a "Deal Registration" record type plus an **approval process** (approve → channel manager and partner co-own/convert). Conflict checks via duplicate rules. Native Flow templates exist in Partner Central (verify).
- **Lead Distribution**: assign leads to partner users/queues; partners **Accept/Reject** (lead inbox component). **Lead/Opportunity sharing** to partner accounts via sharing sets/sharing rules, **Channel Manager** (partner account owner).
- **Channel Programs & Levels** (`ChannelProgram`, `ChannelProgramLevel`, `ChannelProgramMember`): tiers like Gold/Silver with benefits.
- **Market Development Funds (MDF)**: `PartnerFundAllocation`, `PartnerFundRequest`, `PartnerFundClaim`, `PartnerMarketingBudget`.
- **Partner Performance dashboards**, **Partner Forecasting** (partners in the forecast hierarchy), **Enablement for Partners**, **Agentforce partner agents** (verify).
- External sharing model: separate external OWD; partner role hierarchy below the partner account owner's role.

---

## 19. Salesforce Maps

- Add-on (formerly MapAnything; managed package `maps__`). Tiers: **Salesforce Maps** (plotting records, routing, check-in, schedules), **Maps Advanced** (more routing/visit scheduling), **Maps Territory Planning** (territory balancing, ETM sync), **Live Tracking** (GPS tracking of field reps; verify current tiers).
- Features: plot leads/accounts/opportunities on a map with **Marker Layers** (base objects), **Data Layers** (third-party demographic/firmographic data), **Route optimization**, **Schedule (Visit Planning)**, **Check-In/Check-Out** (creates activities), **Mass actions from maps** (change owner, add to campaign), **Nearby** (find records near me in mobile), **Territory Planning** (alignments → ETM territories).
- Requires geocoding (Data Integration Rules for addresses or the Maps geocoding). Licensed per user. Permission sets: Salesforce Maps, Maps Admin.

---

## 20. Revenue Cloud / CPQ

### 20.1 Lineage
| Product | Tech | Status |
|---|---|---|
| **Salesforce CPQ** ("Steelbrick", acquired 2015) | Managed package `SBQQ__` (Quote `SBQQ__Quote__c`, `SBQQ__QuoteLine__c`, Price Rules, Product Rules, Bundles, Subscriptions, Amendments/Renewals, Quote Templates, QLE (Quote Line Editor), Advanced Approvals `sbaa__`) | **End of Sale (Mar 2025)**. Supported for existing customers, but no new features beyond maintenance. EOL not announced (estimates ~2029–2030, verify). |
| **Salesforce Billing** (`blng__`) | Managed package on top of CPQ: invoices, payments, revenue schedules | End of Sale alongside CPQ (verify) |
| "Revenue Cloud" (2020–2023 marketing name) | Bundle of CPQ + Billing + Subscription Management + B2B Commerce | Rebranded |
| **Subscription Management** (2021–22) | API-first, core platform | Folded into RLM |
| **Revenue Lifecycle Management (RLM)** / **Revenue Cloud Advanced (RCA)** (2024+) | **Native, on-core** (not a managed package), API-first, built on Industries-style **Product Catalog Management**, **Salesforce Pricing**, **Product Configurator**, **Transaction Management** (Quote/Order), **Dynamic Revenue Orchestrator (DRO)**, **Contract Lifecycle Management (CLM)**, **Usage/Consumption Management**, **Billing** (invoicing, payments), **Document Generation** | Strategic product. Renamed **Agentforce Revenue Management** (Q3 FY26); tiers like **Revenue Cloud Growth** and **Revenue Cloud Advanced** (~$200/user/month, verify). Requires Sales Cloud Enterprise+. |

### 20.2 RCA / Revenue Management components
- **Product Catalog Management (PCM)**: catalogs, categories, **attribute-based products** (Attribute Definitions/Categories), **Product Classifications**, bundles (`ProductRelatedComponent`), qualification/disqualification rules, selling models (**One-Time, Term-Defined, Evergreen**; `ProductSellingModel`).
- **Salesforce Pricing**: **Pricing Procedures** (built with Business Rules Engine / Expression Sets: list price → volume tiers → attribute-based pricing → discounts → derived pricing), **Price Book Entries** with selling models, **Price Adjustment Schedules** (tiers/volume), **Pricing Waterfall** (audit of price steps), **Context Definitions** (data mapping for pricing/config).
- **Product Configurator**: constraint-based configuration (Constraint Modeling Language/visual builder), configuration rules.
- **Quotes & Orders (Transaction Management)**: uses the **standard `Quote`/`Order` objects** (extended) with `QuoteLineItem`/`OrderItem`, the **Transaction Line Editor**, Quote-to-Order, ramp deals, amendments, renewals, and cancellations through **Asset Lifecycle** (`Asset`, `AssetStatePeriod`, `AssetAction`).
- **Contracts (CLM)**: clause library, document templates, redlining, e-signature integrations.
- **Billing**: Billing Schedules, Invoices, Payments, Credit/Debit memos, Revenue Recognition integrations, Tax engine adapters, **Usage-based** rating.
- **Dynamic Revenue Orchestrator (DRO)**: decomposes orders into fulfillment steps.
- **Agentforce for Revenue**: quote creation from natural language, pricing/discount guidance, contract summaries (verify).
- **Migration from CPQ**: no automatic migration. Plan for data model mapping (SBQQ objects → standard Quote/Order/Asset), rule rebuild (Price Rules → Pricing Procedures; Product Rules → Configurator constraints), and doc templates. A Salesforce **migration tool/assessment** and partner accelerators exist (verify).

### 20.3 CPQ (legacy) cheat sheet for supporting existing orgs
- Key objects: `SBQQ__Quote__c` (Primary checkbox syncs to the Opportunity), `SBQQ__QuoteLine__c`, `SBQQ__ProductOption__c`, `SBQQ__ProductFeature__c`, `SBQQ__PriceRule__c`, `SBQQ__ProductRule__c`, `SBQQ__Subscription__c`, `SBQQ__DiscountSchedule__c`, `SBQQ__QuoteTemplate__c`.
- Flow: Opportunity → **New Quote** (CPQ) → **Edit Lines** (QLE) → Add Products (bundles/options) → price rules calculate → **Generate Document** → Primary quote syncs lines to the Opportunity → Closed Won → **Ordered** (creates an Order) / **Contracted** (creates a Contract + subscriptions) → **Amend / Renew** from the Contract.
- Calculation via the CPQ **Quote Calculator Plugin** (JavaScript/QCP), runs in a Heroku-hosted engine. Large quote handling: "Large Quote Threshold", background calculation.
- Package settings: Pricing & Calculation, Subscriptions & Renewal (Renewal Model: Contract-based vs Asset-based), Order settings, Plugins.

---

## 21. Sales Planning

- **Sales Planning** (native, ~2023+; verify current packaging): territory planning, account segmentation, **capacity planning**, **quota setting and allocation**, and **coverage modeling**, built on Salesforce (uses Data Cloud / Tableau-based spreadsheets, "Planning workspaces"). Outputs can push to **ETM territories** and **ForecastingQuota** records.
- Previously **"Salesforce Sales Planning powered by Anaplan"** (OEM via Anaplan, ~2020–2022). That was replaced by the native offering (verify).
- Complements: **Maps Territory Planning** (geographic), **Sales Programs**, Spiff (**Salesforce Spiff** = incentive compensation management, acquired 2024).

---

## 22. Sales Analytics & Reporting (quick list)
- Standard report types: Leads, Lead History, Accounts & Contacts, Opportunities, Opportunity History, **Opportunities with Products**, **Opportunities with Contact Roles**, Opportunity Splits, Opportunity Teams, Campaigns with Campaign Members, Campaign ROI, Forecasting Items, Activities, Territories.
- **Historical Trending**, **Reporting Snapshots** (scheduled copies into a custom object), **Joined reports**, **Bucket fields**, **Row-level formulas**, **Dashboards** (dynamic dashboards: Enterprise 5 / Unlimited 10).
- **CRM Analytics** (Tableau CRM) **Sales Analytics** app template; **Revenue Insights**; Tableau Next / "Tableau Semantics" for sales (verify).

---

## 23. Object-by-Object Button / Action Cheat Sheet

| Object | Standard buttons & actions (Lightning) |
|---|---|
| **Lead** | Convert, Change Owner, Edit, Delete, Clone, Add to Campaign, Submit for Approval, View Duplicates/Merge, Printable View, Enroll in Cadence, Call (Dialer), New Task/Event/Log a Call/Email. List: New, Import, Change Owner, Change Status, Add to Campaign, Send List Email, Assign Label, Kanban/Split view |
| **Account** | New Contact, New Opportunity, New Case, New Note, Edit, Delete, Change Owner, Sharing / Sharing Hierarchy, View Account Hierarchy, Clone, Submit for Approval, Enable as Partner/Customer (Manage External Account), Add Relationship, Merge (duplicates), Add Team Members/Add Default Team/Display Access (Account Team related list), Account Plan (verify) |
| **Contact** | Edit, Delete, Clone, Change Owner, New Opportunity, New Case, Add to Campaign, Enable Customer/Partner User, Add Relationship, View Contact Hierarchy, Enroll in Cadence, Merge (duplicates) |
| **Opportunity** | Edit, Delete, Clone, Clone with Related, Change Owner, Mark Stage as Complete (Path), New Quote, Add Products/Edit Products/Choose Price Book, Add Opportunity Team Members, Edit Opportunity Splits, Contact Roles (Add/Edit), Submit for Approval, Sharing, Enroll in Cadence. Tab: Pipeline Inspection, Kanban, Import |
| **Opportunity Product** | Edit, Delete, Establish/Re-establish/Edit Schedule |
| **Product** | Edit, Delete, Clone, Add Standard Price, Add to Price Book, Edit Schedule |
| **Price Book** | Add Products, Edit, Delete, Clone, Deactivate |
| **Quote** | Create PDF, Email Quote, Start Sync / Stop Sync, Add Line Item / Edit Lines, Submit for Approval, Clone |
| **Contract** | Activate, Edit, Delete, Clone, New Order (verify), Submit for Approval |
| **Order** | Activate / Deactivate, Add Products, Edit Products, Reduction Order (verify), Clone |
| **Campaign** | Manage/Add Leads/Add Contacts, Advanced Setup (member statuses), View Campaign Hierarchy, Clone, Send List Email, Import |
| **Campaign Member** | Edit, Delete (Remove), Status change, Convert (lead members, via the Lead) |
| **Forecasts page** | Forecast type selector, period range, Display Options (Quotas, Chart, Currency), Adjust, Opportunity pane, Notes, Export (verify), Einstein prediction |
| **Territory (ETM)** | Run Assignment Rules, Add Accounts (manual), Add Users, View Hierarchy, Preview rule results, Activate model / Archive / Clone model |
| **Task / Event** | Edit, Delete, Mark Complete, Create Follow-Up Task/Event, Change Date/Priority/Status, Change Owner (verify), Log a Call composer |

---

## 24. Key Setup Paths (Quick Reference)
| Feature | Setup path |
|---|---|
| Web-to-Lead | Setup → Web-to-Lead |
| Lead Assignment / Auto-Response Rules | Setup → Lead Assignment Rules / Lead Auto-Response Rules |
| Lead Settings, Map Lead Fields | Object Manager → Lead → Fields & Relationships → **Map Lead Fields**; Setup → Lead Settings |
| Person Accounts | Setup → Account Settings (or Support) |
| Contacts to Multiple Accounts | Setup → Account Settings |
| Account Teams | Setup → Account Teams |
| Opportunity Teams / Splits | Setup → Opportunity Team Settings / Opportunity Splits Settings |
| Sales Processes / Path | Setup → Sales Processes; Setup → Path Settings |
| Big Deal Alert | Setup → Big Deal Alert |
| Product Schedules | Setup → Product Schedules Settings |
| Quotes / Templates | Setup → Quote Settings / Quote Templates |
| Contracts / Orders | Setup → Contract Settings / Order Settings |
| Campaign Influence | Setup → Campaign Influence |
| Forecasts | Setup → Forecasts Settings / Forecasts Hierarchy / Forecasts Quotas (verify) |
| Territories | Setup → Territories Settings / Territory Models / Territory Types |
| Pipeline Inspection | Setup → Pipeline Inspection |
| Activities | Setup → Activity Settings; Setup → Einstein Activity Capture; Outlook Integration and Sync; Gmail Integration and Sync |
| Sales Engagement | Setup → Sales Engagement Basic Settings / Cadences (verify) |
| Einstein Lead/Opp Scoring | Setup → Einstein Lead Scoring / Einstein Opportunity Scoring |
| Agentforce | Setup → Einstein Setup, Agentforce Agents / Agentforce Studio, Prompt Builder |
| Multicurrency | Setup → Company Information → Currency settings / Manage Currencies |

---

## Gotchas / Common Confusions

1. **Sales Cloud vs "Agentforce Sales"**: the same product. It was renamed in Oct 2025 and reverted in Sept 2026. "Agentforce Sales" in documents from that period means Sales Cloud. Revenue Cloud ↔ "Agentforce Revenue Management" is the same kind of alias.
2. **CPQ "end of sale" ≠ "end of life"**: existing Steelbrick CPQ customers are still supported and can add licenses. New customers get Revenue Cloud Advanced. CPQ (`SBQQ__Quote__c`) and native Quotes (`Quote`) are different objects. RCA uses the native `Quote`/`Order`.
3. **Converted leads are permanent** and read-only. There is no "unconvert". Test mappings in a sandbox. Formula fields can't be mapping targets, and each lead field maps to only one target field.
4. **Only one active assignment rule** per object, and it doesn't auto-run on API/Flow inserts without the header (or the "Assign using active rule" checkbox in the UI).
5. **Web-to-Lead 500/day** limit. Failed leads (validation/duplicates) are silently dropped and emailed to the default lead creator.
6. **Person Accounts are irreversible** and require Contact OWD = Controlled by Parent. Contact custom fields appear on Account with `__pc`.
7. **Direct vs indirect ACR**: you can't delete the direct relationship. Indirect relationships do not grant sharing.
8. **Probability/Forecast Category come from the Stage** but are overridable. Changing the stage picklist's mapping does not retro-update existing opportunities.
9. **Opportunity Amount becomes read-only** once products are added (it's the line total). Changing the price book deletes line items. Each product needs a **standard price** before custom price book entries.
10. **Only one quote syncs** per opportunity, and **custom fields don't sync** without automation. Starting a sync overwrites the opportunity products.
11. **Big Deal Alert**: one per org, fires once per opportunity, compares the corporate-currency amount.
12. **Revenue splits must total 100%**; overlay splits don't. Splits require Team Selling.
13. **Forecast quotas aren't rolled up**. Managers need their own quota records. Adjustments can be lost when you change forecast settings (hierarchy, currency, period).
14. **Collaborative Forecasts use the role hierarchy** (or the territory hierarchy for territory types), not the manager field. Users need **Allow Forecasting**, and each role needs a forecast manager to roll up.
15. **ETM**: only one Active model. Archived models can't be reactivated. Opportunity territory isn't set automatically without the assignment filter (Apex). Rules run on demand or on account save only if configured.
16. **EAC data isn't normal Task/Event data** (historically). It isn't reportable in standard reports, doesn't fire triggers, and has a retention period. Don't promise SOQL access to EAC emails unless the newer in-Salesforce storage is enabled.
17. **Lightning Sync and Salesforce for Outlook are retired/retiring**. Use EAC + the Outlook/Gmail integration. The Inbox mobile app is retired, but Inbox features live on in the integrations.
18. **High Velocity Sales = Sales Engagement** (renamed). Lightning Dialer = Sales Dialer (renamed, verify).
19. **Einstein Copilot → Agentforce Assistant → Agentforce**. Einstein SDR/Coach → Agentforce SDR/Sales Coach. "Einstein 1 Sales" → "Agentforce 1 Sales".
20. **Einstein Relationship Insights is retired**. Don't recommend it.
21. **Campaign member statuses** must be created per campaign (default Sent/Responded). Campaigns created via API don't get custom statuses unless you add automation. The Marketing User checkbox is required to manage campaigns.
22. **Campaign influence only credits through opportunity contact roles**. If reps don't add contact roles, influence is empty. The Primary Campaign Source model is single-touch.
23. **Multicurrency and ACM are irreversible-ish**. ACM dated rates apply only to opportunity-related objects. Roll-up summaries and formulas use static rates.
24. **Merge limits**: 3 records in the UI, 2 duplicates + master via API. Person accounts merge only with person accounts.
25. **Edition gating**: Starter/Pro Suites lack full API and advanced automation. Pipeline Inspection, ETM, Splits, and custom forecast types need Enterprise+. Many AI features need add-on PSLs even in Unlimited. Always check the PSL.
26. **Pricing numbers** ($25/$100/$175/$350/$550) are list prices that change (the Aug 2025 increase). Quote them as list and "(verify)" for current deals. Negotiated pricing differs widely.
