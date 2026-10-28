# Service Cloud (Agentforce Service) — End to End

**What this file covers:** Cases and case automation, every service channel (email, web, messaging, voice, CTI, social), the Service Console, Omni-Channel routing, Knowledge, Entitlements/SLAs, Assets/Service Contracts/Work Orders, Field Service, and AI (Einstein/Agentforce for Service).
It also covers self-service (Experience Cloud Help Center), analytics, Incident Management, Swarming, Customer 360 and editions/pricing, with UI buttons and actions named as users see them.
Currency: verified against public sources as of Oct 2026. Items whose naming, retirement date or pricing could change are marked **(verify)**.

---

## 1. Naming and product landscape (2025–2026)

| Old name | Current name (2026) | Notes |
|---|---|---|
| Service Cloud | **Agentforce Service** | Rebrand announced at Dreamforce '25 (Oct 2025). Setup, objects and APIs are unchanged; docs and the price list use the new name. "Service Cloud" is still common in Trailhead, Setup labels and conversation. |
| Sales Cloud | Agentforce Sales | Mentioned only for context. |
| Salesforce Field Service (formerly Field Service Lightning, FSL) | **Agentforce Field Service** | Renamed in 2026 **(verify exact release)**. Objects (ServiceAppointment, ServiceResource …) and managed package namespace `FSL` are unchanged. |
| Data Cloud | Data 360 | Powers Customer 360/unified profiles and grounding for Agentforce. |
| Live Agent / Chat / Embedded Chat (Snap-ins) | **Retired 14 Feb 2026** → replaced by **Messaging for In-App and Web (MIAW)** | No new Chat deployments. Existing Chat stopped working after retirement. |
| Einstein Bots | Legacy. **Agentforce Service Agent** is the strategic replacement | No published hard EOL for Einstein Bots as of mid-2026 **(verify)**. "Article Answers" in bots ended earlier. Bots built for Chat stopped working with Chat. |
| Einstein for Service (Service Replies, Work Summaries, etc.) | Folded into **Agentforce for Service / Agentforce Assist** licensing | Feature names still appear in Setup as "Einstein …" in many orgs. |
| Salesforce Customer Service Incident Management | Incident Management (Service Cloud feature) | |
| Service Cloud Voice | Service Cloud Voice / "Agentforce Contact Center" bundles **(verify)** | |

In this document, "Service Cloud" and "Agentforce Service" mean the same thing.

---

## 2. Cases

### 2.1 The Case object: key standard fields

| Field (API) | Purpose / notes |
|---|---|
| Case Number (`CaseNumber`) | Auto-number. Display format can't be changed in Setup the way custom auto-numbers can **(verify)**. |
| Status (`Status`) | Picklist. Each value is flagged **Closed** or not (`IsClosed` derives from it). One value is the **Default**. |
| Priority (`Priority`) | High / Medium / Low by default. |
| Origin (`Origin`) | Phone, Email, Web by default. Add Chat, Messaging, Social, etc. Set automatically by Email-to-Case, Web-to-Case and messaging. |
| Type, Reason (`Type`, `Reason`) | Categorization picklists. Reason is often a closing field. |
| Subject, Description | Free text. Email-to-Case maps the email subject and body here. |
| Account, Contact (`AccountId`, `ContactId`) | Auto-matched by email for E2C and W2C. Contact lookup can drive Account. |
| Asset, Product, Entitlement (`AssetId`, `ProductId`, `EntitlementId`) | Service context. Entitlement drives the SLA process. |
| Parent Case (`ParentId`) | Case hierarchy. |
| Owner (`OwnerId`) | User or **Queue**. |
| Web Email/Name/Company/Phone (`SuppliedEmail`, `SuppliedName` …) | Raw values captured from Web-to-Case and Email-to-Case before contact matching. |
| Closed (`IsClosed`), Closed Date (`ClosedDate`) | Set by the system when the status maps to Closed. |
| Escalated (`IsEscalated`) | Set by escalation rules (or manually). |
| Milestone Status, Entitlement Process Start/End, SLA Exit Date, Stopped, Stopped Since (`IsStopped`) | Entitlement Management fields. |
| Business Hours (`BusinessHoursId`) | Used by escalation rules and milestones. |
| Internal Comments | Writes a Case Comment. |
| Contact Email/Phone/Mobile | Formula-like reference fields from the Contact. |
| Record Type | Ties to a **Support Process** (status values). |

Related objects: **CaseComment**, **EmailMessage**, **CaseHistory**, **CaseTeamMember**, **CaseSolution** (legacy), **CaseMilestone**, **CaseArticle** (Knowledge link), **CaseFeed / FeedItem**, **CaseContactRole**, **CaseRelatedIssue** (incident links), **MessagingSession**, **VoiceCall**, **WorkOrder**.

### 2.2 Statuses, record types and support processes

- **Support Process** (Setup → Support Processes) is a subset of Case **Status** values. It works the way a Sales Process does for Opportunity Stage.
- Each **Case Record Type** has to reference exactly one Support Process. Then you can further restrict the Status values per record type.
- Status values carry a **Closed** checkbox. The **Default** status is applied to new cases (including E2C and W2C).
- Typical pattern: separate record types for *Technical Support*, *Billing*, *Returns/RMA* and *Internal IT*, each with its own process, page layout and Lightning record page.
- Path on Case works per record type (Setup → Path Settings) and shows Status as a guided path with key fields and guidance.

### 2.3 Case origins

The default picklist values are **Phone, Email, Web**. Common additions are **Chat, Messaging, Social, Voice, Community/Portal and Agentforce**.
- E2C sets Origin to *Email* (configurable on the routing address under "Case Origin").
- W2C uses whatever value the form sends (hidden field `origin`).
- Messaging channels set Origin through the case created by the channel or flow (configurable).

### 2.4 Case Assignment Rules

- Setup → **Case Assignment Rules**. Only **one active** rule per org. A rule has ordered **rule entries** with criteria or a formula, and each entry assigns to a **User or Queue**. Optionally, an entry can **notify the assignee** using an email template and set **"Do Not Reassign Owner"**.
- First matching entry wins. If nothing matches, the case goes to the **Default Case Owner** (Support Settings).
- **When rules fire:** web, email and API creates fire them by default. For UI creates, the user sees the **"Assign using active assignment rule"** checkbox on the layout (Layout Properties: *Show on edit page* / *Default*). Apex uses `Database.DMLOptions.assignmentRuleHeader.useDefaultRule = true`, and the API uses the `AssignmentRuleHeader`.
- With Omni-Channel, assignment rules usually route to a **Queue**, then Omni pushes from that queue. Omni-Channel Flow can replace assignment rules entirely.

### 2.5 Auto-Response Rules

- Setup → **Case Auto-Response Rules**. Only one active rule. Entries are evaluated in order, the first match sends a template, and only **one** response is sent.
- Fires for **Web-to-Case and Email-to-Case** (and Web-to-Lead with its own lead rules). Does **not** fire for manually created cases.
- An entry specifies the From name/address (it can be an Org-Wide Email Address), Reply-To, an email template, and an optional "Replace Sender" option.
- Avoid replying to no-reply or auto-reply loops (see E2C loop protection).

### 2.6 Escalation Rules

- Setup → **Escalation Rules**. One active rule. Entries have criteria, **Business Hours** handling ("Ignore business hours", "Use business hours specified on the case", or "Set business hours") and **"How escalation times are set"** (when the case is created, when created *unless* modified, or based on the last modification time).
- Each entry has up to **5 escalation actions**, each with an "Age Over" time in hours plus 0 or 30 minutes. Actions can **Auto-reassign** to a user or queue, **Notify** the new or current owner, and notify others using an email template.
- Sets `IsEscalated = true`. Monitor them at Setup → **Case Escalations** (the escalation queue).
- Cases that are closed (or no longer match) drop out of escalation evaluation.
- Escalation rules are the older, simpler SLA tool. **Entitlement milestones** are the richer one (see §8). Many orgs use both.

### 2.7 Case Teams

- Enable in Support Settings ("Case Teams"). Define **Case Team Roles** (each role has a case access level of Read Only, Read/Write or Private, plus "Visible in Customer Portal").
- **Predefined Case Teams** are reusable groups of users, contacts and roles. They can be added by **assignment rule entries** (the "Predefined Case Teams" option) or by hand.
- The Case Teams related list ("Update Case Team" / "Add Member") supports **Users and Contacts** (portal users). Members get record access through the team's sharing.
- Teams don't change ownership. They grant access and identify collaborators. For live collaboration, see **Swarming** (§13).

### 2.8 Case hierarchy (parent cases)

- The `ParentId` lookup creates hierarchies. The **Related Cases** related list shows child cases, and **"View Case Hierarchy"** (Classic) or the hierarchy component shows the tree.
- Common uses: master incident or problem cases (now better served by **Incident Management**, §13), multi-part requests, and splitting a case into child cases with a quick action.
- Child closure does **not** automatically close the parent. Build a flow if you need roll-up behavior.

### 2.9 Case Merge

- Enable "Merge Cases" in Support Settings (it's on by default in newer orgs **(verify)**). Merge works from the **Cases list view (select up to 3 cases → Merge Cases)** or from **"Merge Cases"** on a record / the "Duplicate" flow.
- Choose a **master** record and pick field values. Related emails, comments, attachments, feed, case teams and child records are reparented to the master. Non-master cases are **soft-deleted** (to the Recycle Bin) or, with "Retain merged cases" enabled, kept with Status = **Merged** and a link to the master.
- Requires the **Delete** permission on Case (or the "Merge Cases" permission set behavior) **(verify)**.
- Merged cases can't be unmerged.

### 2.10 Case Close page

- Support Settings → "Show Closed Statuses in Case Status Field" lets agents close directly by setting Status in the edit page. When it's **off**, closing happens only through the **Close Case** button and its **Close Case Layout**.
- The **Close Case Layout** (Page Layouts → Close Case Layouts) controls which fields appear when closing. Typical fields are Status (closed values only), Reason, Internal Comments and "Submit to Public Solutions/Knowledge".
- In Lightning, the usual pattern is a **"Close Case" quick action** (Update a Record action with Status preset to Closed and required Reason/Resolution fields) on the Case feed, or a Path closing stage.

### 2.11 Case Feed and actions

The Lightning Case record page usually uses the **Activity / Feed (Chatter)** composer with publisher actions:

| Action | Type | What it does |
|---|---|---|
| **Email** | Send Email (global/standard) | Sends an outbound email from the case. It threads to the case (Lightning threading token), creates an `EmailMessage`, supports templates, quick text, Knowledge insert and **Enhanced Email**. Default From can use an Org-Wide Address. |
| **Log a Call** | Log a Call (Task) | Creates a completed Task with Type = Call. |
| **Change Status** | Update Record (Case) | Status/Priority update. Can hold required fields. |
| **Post** | Chatter Post | Internal post. Can be made visible to the customer ("Customer access" toggle in Experience Cloud contexts). |
| **New Case Comment / Internal Comment** | Create Record | Adds a `CaseComment` (public or internal). |
| **New Task / New Event** | Create Record | Activities. |
| **Question** | Chatter | |
| **Social Post** | Social action | Replies via Social Customer Service. |
| **Portal/Community answer** | | Publishes an answer to the customer in the help center. |
| **Close Case** | Update Record | Uses the Close layout or preset fields. |
| **Merge / Clone / Edit / Delete / Change Owner / Change Record Type / Sharing / Printable View** | Standard buttons | On the record's action menu (highlights panel). |
| **Create Child Case** | Create Record with `ParentId` predefined | Custom quick action pattern. |
| **Knowledge (attach/insert)** | Knowledge component | See §7. |

- Feed filters: All Updates, Emails, Call Logs, Text Posts, Status Changes, etc. **Feed tracking** on Case (Setup → Feed Tracking) controls which field changes post to the feed.
- Actions are configured on the **Salesforce Mobile and Lightning Experience Actions** section of the page layout, or via **Dynamic Actions** on the Lightning page.
- **Email defaults**: the Case "Email" action's predefined values (To = Contact, From = support address, Subject = `{!Case.Subject}`). Use a **Default Email Templates** Apex class (`QuickAction.QuickActionDefaultsHandler`) or **Email Template defaults via Flow** **(verify)** for dynamic templates.
- **Case Feed vs Related list layout**: in Lightning, the "Activity" tab shows the activity timeline, and the "Feed" tab or Case Feed component shows the Chatter-style feed. Agents often prefer the **Conversation/Case Feed** component in the Console.

---

## 3. Channels

### 3.1 Email-to-Case (E2C)

**Two flavors**

| Flavor | How it works | Limits / notes |
|---|---|---|
| **On-Demand Email-to-Case** (standard) | Salesforce generates a long **service address** (`…@….case.salesforce.com`). Customers email your public address (support@acme.com), which you **forward** to the service address. No software sits behind the firewall. | Email size limit ~25 MB **(verify)**. Daily limit is the number of user licenses × 1,000, up to 1,000,000. Overflow emails queue for 24h. |
| **Email-to-Case Agent** (legacy, on-prem Java) | A Java app polls IMAP behind the firewall. | Legacy. Avoid for new builds. |

**Setup steps (On-Demand)**
1. Setup → **Email-to-Case** → Enable (also turn on **On-Demand Service**).
2. **Routing Addresses** → New: Email Address, Routing Name, Case Owner (queue), **Case Origin**, Case Priority, Create Task from Email, Save Email Headers, "Accept Email From" (domain allowlist).
3. Verify the routing address (a verification email is sent), then copy the generated **Email Services Address**.
4. Configure **forwarding** on your mail server (Gmail/Exchange/M365) from support@ to the service address.
5. Optional: **Email Relay** / an Org-Wide Email Address with **DKIM** and SPF for outbound, so replies come from support@ with good deliverability.
6. Add the **Email** action to the Case page layout or feed.

**Settings (Email-to-Case settings page)**: Insert Thread ID in subject/body (legacy ref ID), **Enable Lightning Threading**, Notify Case Owners on New Email, Enable HTML Email, Over Email Rate Limit Action (bounce, discard, requeue), Unknown Sender action, Save Email Headers, Enable **Email-to-Case Loop Protection** (rate-limits repeated identical messages), Place User Email Signatures Before Quoted Text, Enable **Enhanced Email** (EmailMessage becomes a full sObject with custom fields, layouts and triggers).

**Threading (how replies find the existing case)**
- **Lightning threading token** (Spring '21+): an encrypted token `thread::xxxxxxxx::` placed in the **subject and/or body**. It replaced the old `ref:_00D…._500….:ref` thread ID.
- **Header-based threading** (In-Reply-To / References headers matching a previous `EmailMessage.MessageIdentifier`). It's the most reliable method and is used **first** in newer orgs. Token matching is a fallback.
- The **legacy Ref ID** was retired. Orgs had to move to Lightning threading **(retirement enforced ~2023–2024; verify)**.
- Apex: `Cases.getCaseIdFromEmailHeaders(headers)` and `EmailMessages.getRecordIdFromEmail(subject, textBody, htmlBody)` support custom E2C handlers.
- A reply on a **closed** case reopens it or creates a new case depending on automation. Out of the box, the email attaches to the closed case and the owner is notified. Use a flow or trigger on `EmailMessage` to reopen it or create a new case.

**Common E2C automation**: `EmailMessage` record-triggered flows (Incoming = true) to reopen or update Status ("New Email Received"), assignment and auto-response rules (they fire for E2C), and Omni routing from the owner queue.

### 3.2 Web-to-Case (W2C)

- Setup → **Web-to-Case**: enable it, set the default Response Template and Default Case Origin, require reCAPTCHA ("Require reCAPTCHA Verification", recommended), and generate the HTML form.
- Generated HTML posts to `https://webto.salesforce.com/servlet/servlet.WebToCase?encoding=UTF-8&orgId=…` with hidden `orgid`, `retURL`, and fields like `name`, `email`, `phone`, `subject`, `description`, `priority`, `type`, `reason`, plus custom field IDs.
- Limit: **5,000 cases per 24 hours** (overflow is queued, and the default admin is notified).
- Auto-response and assignment rules fire.
- Modern alternatives: an **Experience Cloud "Contact Support" form** (Case form component), an **Agentforce Service Agent** or MIAW pre-chat, or Apex REST / Flow-based forms.
- Spam: use reCAPTCHA plus "Accept Email From" domain logic. W2C has no auth.

### 3.3 Messaging for In-App and Web (MIAW)

- The replacement for legacy Chat (**Chat retired 14 Feb 2026**). It's built on the **Messaging** platform (MessagingSession, MessagingEndUser, Conversation entries) and runs on **Hyperforce**.
- **Asynchronous and persistent**: customers can leave and return to the same conversation. It also supports synchronous use. Agents work in the Console via **Omni-Channel** (`MessagingSession` work items).
- **Setup flow**: Setup → **Messaging Settings** → New Channel → *Messaging for In-App and Web* → Omni-Channel routing (choose **Omni-Channel Flow** with a routing type, or a queue) → **Embedded Service Deployment** (type: *Messaging for In-App and Web*, Web or Mobile) → publish and copy the **code snippet** for the website (or use the iOS/Android SDKs) → configure **Pre-Chat** forms (hidden and visible fields passed to the flow), **branding**, **business hours**, **auto-responses** (start, end, inactivity, queue position), file attachments, rich messaging components (forms, lists, time selectors, links), typing indicators, read receipts, **conversation end** and **estimated wait time** (verify availability).
- **Routing**: an **Omni-Channel Flow** gets `recordId` (MessagingSession). Typical steps: Get Records on pre-chat data → Create/Update Case, Contact matching → **Route Work** action (to a Queue, Skills, Agent, or Agentforce Service Agent / bot).
- **User verification**: authenticated messaging via JWT (Messaging User Verification) to securely identify logged-in users.
- **Enhanced Conversations** / **Enhanced Chat v2** UI options **(verify current names)**. "Enhanced Web Chat" is the newer client.
- Agents use **Messaging Components**, **Quick Text**, Knowledge insertion, **Conversation transfer** (to queue, agent or flow) and **Conference/Consult** (verify per channel).
- **Licensing**: Digital Engagement add-on (or bundled in some editions, verify). It's metered by conversations or messages.

### 3.4 Enhanced Messaging channels

| Channel | Notes |
|---|---|
| **WhatsApp** (Enhanced) | WhatsApp Business via Meta. Needs a Meta Business account and an approved phone number. **Message templates** must be approved by Meta for outbound and after the 24-hour customer care window closes. Supports rich media, list and quick reply buttons. |
| **SMS** (Enhanced, long code, short code, toll-free) | Numbers are bought via Salesforce (Digital Engagement). Keyword opt-in/opt-out (STOP/HELP). US **10DLC/toll-free registration** is required. Outbound via Flow "Send Conversation Messages" action. |
| **Facebook Messenger** (Enhanced) | Connect a Facebook Page. The 24-hour window rules apply. |
| **Apple Messages for Business** | Requires Apple Business Register approval. Supports list pickers, time pickers, Apple Pay, authentication. Entry points from Maps, Safari, Siri. |
| **LINE** (Enhanced) | Popular in Japan, Thailand and Taiwan. |
| **Bring Your Own Channel (BYOC)** / BYOC for CCaaS | Connects 3rd-party messaging providers through the Interaction Service APIs and route through Omni. |

- "Standard" (non-enhanced) WhatsApp, Facebook and SMS channels exist in older orgs. Salesforce has pushed migration to **Enhanced** channels, which are required for Omni-Channel Flow, rich components and Agentforce **(verify standard channel retirement dates)**.
- Enhanced channels share MIAW's architecture: Messaging Settings → channel → Omni-Channel Flow routing, `MessagingSession`, `MessagingEndUser`, consent via **Messaging consent** settings (Implicit, Explicit, Double opt-in).
- **Outbound / proactive messaging**: Flow action "Send Notification" / "Send Conversation Messages" (Messaging Notifications with templates). Also via Marketing Cloud.

### 3.5 Service Cloud Voice (SCV)

- A native telephony **integrated into the console**: softphone in the **utility bar**, the `VoiceCall` record, **real-time transcription**, Einstein Conversation Insights / next best action, **after-conversation work**, supervisor monitoring/barge-in (verify by vendor), and voice routed **through Omni-Channel** (unified capacity with digital work).
- **Flavors**:
  - **SCV with Amazon Connect** (Salesforce-provisioned or **Bring Your Own Amazon Connect**). Contact flows live in AWS. Salesforce bills or you bill via AWS.
  - **SCV with Partner Telephony**: Genesys, NICE CXone, Five9, Avaya, Vonage, Twilio Flex, 8x8, etc. via the **Partner Telephony** connector (they implement the Service Cloud Voice Connector API, "BYOT").
  - **Voice / CCaaS integrations via BYOC** **(verify)**.
- Setup: Setup → **Contact Centers** (create contact center), **Voice** setup, phone numbers, presence statuses with the **Phone** service channel, and the **Omni-Channel utility** plus the phone utility.
- Licensing: the **Service Cloud Voice** add-on (per user, plus usage) **(verify current SKUs)**. Agentforce Contact Center / "Agentforce Voice" bundles appeared in 2025–26 **(verify)**.
- **Agentforce Voice**: an Agentforce Service Agent answering calls (voice self-service) via SCV **(verify GA scope)**.

### 3.6 Open CTI

- The JavaScript API (`opencti_min.js` / Lightning `opencti.js`) that lets **any 3rd-party telephony** embed a softphone in Salesforce through a **Call Center** definition (an XML file imported in Setup → Call Centers, which assigns users).
- Capabilities: click-to-dial (`onClickToDial`), screen pops (`screenPop`, `searchAndScreenPop`), save call logs (`saveLog`), get page info, run Apex, softphone panel visibility/height.
- Appears in the **utility bar** ("Open CTI Softphone" item).
- Open CTI vs Service Cloud Voice: Open CTI = vendor-built UI, minimal native data (Task logs). SCV = native VoiceCall object, transcription, Omni routing and AI.

### 3.7 Social Customer Service

- Connects **Facebook, Instagram, X/Twitter, YouTube** etc. via **Social Studio / Social Customer Service starter pack** (Social Studio was retired in 2024 **(verify)**). Now it's **Social Customer Service with direct connections** or partner tools.
- Inbound posts are created as `SocialPost` records plus `SocialPersona` and Case (via the Apex **Social Customer Service default handler** `Social.InboundSocialPostHandlerImpl`). Agents reply with the **Social action** in the feed.
- Facebook Messenger DMs are better handled by **Enhanced Messaging**.
- X/Twitter API changes in 2023 disrupted many integrations **(verify current support)**.

---

## 4. Service Console

### 4.1 Setup

- In Lightning: **App Manager → New Lightning App** → App Options: **Navigation Style = Console navigation**. Optionally add **Utility Items**, Navigation Items (Cases, Contacts, Accounts, Knowledge, Omni Supervisor, Reports …), **User Profiles**, and **Setup & Experience → Personalization, Disable end-user nav personalization**.
- The standard **Service Console** app ships pre-configured. Users need a **Service Cloud User** feature license (or the Service Cloud license) for console use **(the license checkbox mostly matters for Classic; Lightning console is allowed with Service Cloud licenses)**.
- Lightning Console Apps can't be used on mobile. The mobile app uses standard navigation.

### 4.2 Workspace tabs, subtabs, history

- **Workspace tabs**: the main records (for example a Case). **Subtabs**: related records opened in the context of a workspace tab (Contact, Account from the Case).
- **Workspace Tab and Subtab behavior** (App Manager → *Navigation Rules*): choose whether a record type opens as a workspace tab or as a subtab of its parent (for example, Contact opens as a subtab of Account).
- **Pinned tabs**, tab **refresh**, **"Open in a new browser window"**, **max number of tabs** (warning configurable) and **tab limit** (verify), plus tab **color/icons**.
- The **History** utility item shows recently opened tabs/records (Utility Bar → History).
- The **Console Navigation Item menu** (left dropdown) switches object home pages.
- Developers use the **Workspace API** (`lightning:workspaceAPI` in Aura / `lightning/platformWorkspaceApi` in LWC): `openTab`, `openSubtab`, `focusTab`, `closeTab`, `setTabLabel`, `setTabIcon`, `refreshTab`, `getFocusedTabInfo`.

### 4.3 Split view

- A collapsible **list view pane** on the left of the console. Agents work through a list without leaving the workspace. Toggle via the **split view** icon or keyboard shortcut. Enabled per app in App Manager settings **(verify location)**.

### 4.4 Utility bar items (common)

| Utility item | Purpose |
|---|---|
| **Omni-Channel** | Agent presence status and incoming work (Accept/Decline). |
| **History** | Recent tabs. |
| **Macros** | Run macros. |
| **Notes** | Enhanced Notes. |
| **Recent Items** | |
| **Open CTI Softphone** / **Phone** (SCV) | Telephony. |
| **Knowledge** | Search articles. |
| **Rich Text Editor / Quick Text** | |
| **Einstein / Agentforce (Copilot) panel** | Agent assistant for Service Replies, summaries and actions. |
| **Visualforce / Lightning Component / Flow** | Custom utilities. |
| **Report Chart, List View, Chatter Feed** | |
| **Service Cloud Voice Transcripts** / **Swarm** | |

Properties: label, icon, panel width/height, **"Load in background when app opens"** (needed for Omni and the softphone so they're always on), pop-out (Omni can be popped out).

### 4.5 Macros

- Automate repetitive multi-step console actions: select an action (Email, Log a Call, Update Status), insert a template, set fields, submit. Recorded through the **Macro Builder** (instructions UI).
- **Bulk macros**: run on multiple records from a list view. They can't include actions that need user input, like sending emails. **Irreversible macros** (those that submit actions) show a lightning icon.
- Users need **Read** on the Macro object and the "Manage Macros Users Can't Undo" permission for irreversible ones. Share macros through sharing settings or folders **(verify Macro folders GA)**.
- Macros work on the publisher actions present on the page and on Case, Contact, Lead, and custom objects with feed **(verify)**.

### 4.6 Quick Text

- Reusable snippets inserted with **`;;`** (Lightning keyboard trigger) or the Quick Text button in Email, Chat/Messaging, Tasks, Events and Case Comments **(verify contexts)**.
- Supports **merge fields** (`{!Case.CaseNumber}`, `{!Contact.FirstName}`), Category, Channel (Email, Messaging, Phone, Portal, Internal, Event, Task) and folders for sharing (Quick Text folders).
- Enable in Setup → **Quick Text Settings**. Users need Read on Quick Text.

### 4.7 Keyboard shortcuts

- Lightning Console: **Ctrl+/** (Windows) or **Cmd+/** (Mac) shows the shortcut list. Defaults include: open/close tabs, **Shift+R** refresh (verify), go to next/previous tab (`Ctrl+Alt+…`), focus utility bar, open split view, Edit (`e`), Save (`Ctrl+S`), Search (`/`).
- Customize them in **Setup → Keyboard Shortcuts** (Lightning Console) **(verify path)**. Custom shortcuts can be built with the `lightning:workspaceAPI` / `lightning:utilityBarAPI`.

### 4.8 Highlights panel

- The **Compact Layout** drives the highlights panel on Lightning record pages (first 7 fields; the first field becomes the title). Assign the compact layout per record type (Case "Priority, Status, Contact, Case Owner").
- The highlights panel also hosts the **action buttons** (from the layout or Dynamic Actions) and, in Lightning, the Path above or below.
- Classic console: the highlights panel was configured separately in the "Mini page layout / Highlights Panel" settings.

### 4.9 Other console features

- **Interaction log** (Classic) became **Notes / Log a Call** utility in Lightning.
- **Related Record component** (shows Contact details on the Case page with inline edit), **Lightning Record Page** templates (Console: Pinned header + 3 columns), **Pinned regions**, **Conversation component** (the messaging/voice transcript), **Actions & Recommendations** (Next Best Action, Flow-based guided actions via **Actions & Recommendations** component with **Action Launcher**), **Timeline** (Customer 360 / Industries Timeline), **Einstein/Agentforce panel**.
- **Flow guided steps** in the Actions & Recommendations component can be paused and resumed, and they're tracked in `FlowOrchestration`/`FlowRecordRelation`.

---

## 5. Omni-Channel

### 5.1 Core concepts

| Concept | Description |
|---|---|
| **Service Channel** | Makes an object routable: Case, Lead, custom object, `MessagingSession`, `VoiceCall`, `SocialPost`, `ContactRequest`, legacy `LiveChatTranscript`. Defines **Secondary Routing Priority** field, **Capacity model** for the channel, and **Status field** for status-based capacity. |
| **Routing Configuration** | Routing **priority** (relative to other queues), **routing model** (**Least Active** or **Most Available**), **push timeout** (seconds before work goes to the next agent), **units of capacity** or **percentage of capacity** per work item, and **External Routing** option. Attached to a **Queue**. |
| **Queue** | Holds work. A queue with a routing configuration becomes an Omni queue. Members are the users eligible to receive the work. |
| **Presence Status** | Online or Busy statuses (for example *Available – Cases*, *Available – Messaging*, *Busy*, *Break*). Each Online status is tied to one or more **Service Channels**. |
| **Presence Configuration** | Per user or profile: **capacity** (for example 10), **Automatically accept work requests**, **Allow agents to decline requests** (with optional **decline reasons**), **Update status on decline**, **Update status on push timeout**, **Allow agents to choose their own status on login**, **Enable Secondary Routing Priority**, **Enable Agent Sound Notifications**, **Request wait time**. |
| **Presence Status Access** | Profile/permission set setting giving users access to statuses ("Service Presence Statuses Access"). |
| **Work Item** (`AgentWork`) | Each assignment record (status: Assigned, Opened, Closed, Declined, Canceled, Transferred). Basis of reporting. |
| **PendingServiceRouting** (PSR) | The pending routing request. Used with skills and attribute routing (Apex/Flow) and with `SkillRequirement` children. |
| **UserServicePresence** | Logs agent presence durations. |

### 5.2 Routing types

1. **Queue-based routing**: the item is placed in a queue (assignment rule, flow or owner change) and pushed to an available member per the routing configuration.
2. **Skills-based routing**: define **Skills** (Setup → Skills), assign **Service Resources** (users) with skill **levels** (0–10), and route work requiring skills via:
   - **Skills-Based Routing Rules** (declarative, by Case field mapping, in Setup → Routing Configuration / "Skills-Based Routing Rules") **(verify name)**,
   - **Omni-Channel Flow** *Route Work* with "Skills-based" routing type,
   - Apex creating `PendingServiceRouting` plus `SkillRequirement` (`IsReadyForRouting = true`).
   Supports **Additional skills** (optional skills, with **skill priority** and a **drop additional skills timeout**), **skill levels**, and **Skills Backlog** in Omni Supervisor.
3. **Attribute-based routing**: route on attributes beyond skills (**Language, Product, Location, Expertise …**) using the **Service Resource Skills + Attribute definitions** in Omni-Channel Flow ("Route Work" → attribute-based) **(verify GA state; was Beta '23, GA later)**.
4. **Direct-to-agent routing**: Route Work action with "Agent" (for example, return the work to the case owner or last agent) and a **fallback queue** after a timeout.
5. **External Routing**: a 3rd-party router decides, and Omni handles presence and work.
6. **Bot / Agentforce routing**: Route Work to an Einstein Bot or **Agentforce Service Agent** first, which escalates to a human queue.

### 5.3 Omni-Channel Flows

- Flow type **Omni-Channel Flow** (triggered from the channel's routing, from a **Route Work** action in other flows, or by "Omni-Channel Flow" routing on Messaging and Voice).
- Inputs: `recordId` (MessagingSession, VoiceCall, Case, or custom). Common actions: **Route Work** (Queue, Skills, Agent, Bot, Agentforce Agent, with routing configuration override, fallback queue, priority, capacity), **Check Availability for Routing** (agents online, estimated wait time), **Add Skill Requirements** (for skills routing in flows), **Get Records**, **Create Records**.
- Can be launched from a **record-triggered flow** for Case (create a Case → "Route Work" via an autolaunched subflow) **(verify current recommended pattern)**.
- Replaces many uses of **Case Assignment Rules plus Queue push** and of the legacy **Chat Routing**.

### 5.4 Capacity models: tab-based vs status-based

| Model | How capacity is consumed / freed | Best for |
|---|---|---|
| **Tab-based** (default) | Work consumes capacity when the agent accepts it, and frees capacity when the agent **closes the tab** in the console. | Short interactions; chat and messaging. |
| **Status-based** | Capacity consumed while the record's **status field** (for example Case Status) is in specified "in progress" values. It frees when the status changes to a configured "completed" value, regardless of tabs. Configured on the **Service Channel** (status field plus values). | Long-running cases. Agents can close tabs without freeing capacity. Supported for Case and custom objects **(verify object support)**. |

- **Interruptible capacity** **(verify)**: Messaging work can be configured as interruptible so it doesn't block high-priority work.
- **Enhanced Omni-Channel** (Spring '24+ default for new orgs) is a re-architected service backed by the Omni-Channel Flow, unified routing, **Skills with attributes** and better performance. Some legacy features (Omni Supervisor classic views, legacy Chat) are unsupported in enhanced mode **(verify specifics)**.

### 5.5 Omni-Channel widget (agent side)

- In the utility bar: a **presence status dropdown** (Online statuses, Busy, Offline), a **New** tab with incoming requests (**Accept** / **Decline** buttons, decline reason picker if enabled), **My Work** tab (in-progress items with quick switch), **Conversations** tab (messaging transcripts), and in some setups a **Backlog** count **(verify)**.
- **Auto-accept** removes the Accept step. **Push timeout** expires the request and moves to the next agent. Agents may be set to Away on timeout.
- Sound notifications and browser notifications (desktop).
- **Transfers**: messaging and voice can transfer to a queue, agent, skill or flow from the conversation header.

### 5.6 Omni Supervisor

Add the **Omni Supervisor** tab to the console. Supervisor configuration (Setup → **Omni Supervisor Configurations**) assigns which queues and agents each supervisor sees.

| Tab | Shows |
|---|---|
| **Agents Summary** | Agent presence status, time in status, capacity used, work items, assigned/open work, queues, **Change Status / Assign work / Raise Flag** actions. |
| **Queues Backlog** | Waiting items per queue, longest wait, average wait. |
| **Skills Backlog** | Items waiting for skills (skills-based). |
| **Assigned Work** / **Work Summary** | Work items with status, duration, agent. |
| **Wallboard** | Real-time aggregate KPIs (configurable) **(verify)**. |
| Agent drill-in | Live **conversation monitoring** (whisper/whisper coach for messaging; listen/barge for voice depending on vendor), **raised flags** (agents raise a flag to ask for help), **sentiment** (with Einstein). |

Supervisors can **reassign work** from the backlog **(verify)**, change an agent's status, and see real-time sentiment.

### 5.7 Reporting

- Report types: **Agent Work**, **Agent Work with Skills**, **User Presence (Service Presence)**, **Pending Service Routing** **(verify)**, Messaging Sessions, Voice Calls.
- Typical metrics: Speed to Answer (`SpeedToAnswer` on AgentWork), Active Time, Handle Time, Accept/Decline rates, Capacity utilization, Time in Online status.

---

## 6. Customer self-service (Experience Cloud Help Center)

- **Experience Cloud** sites built on the **Customer Service** template (Aura) or **Build Your Own (LWR)** / Microsite templates. The **Help Center** template is a public, unauthenticated Knowledge site.
- Components: **Contact Support Form** (creates a Case; can deflect with **Case Deflection** that shows articles while typing), **Case List / Case Detail** for logged-in users, **Article Content / Article List / Knowledge Search**, **Topics** (map data categories to topics), **Questions/Answers** (Chatter Answers successor), **Messaging for In-App and Web** embedded, **Agentforce Service Agent / Embedded Messaging** component, **Experience Cloud Guest User** profile settings.
- Licenses: **Customer Community** (high volume, no roles, sharing sets), **Customer Community Plus** (roles, sharing rules, reports), **Partner Community**, or **External Apps**. Login-based vs member-based pricing.
- Access: **sharing sets** give HVU (high-volume users) access to cases where Case.ContactId = User.ContactId, or by Account.
- Customer-visible case items: **Case Comments marked Public**, Chatter posts with customer visibility toggled on ("Share with customer").
- **Case Deflection metrics** components, plus **Self-Service Analytics** **(verify)**.
- Guest users can't own records and have reduced sharing (secure guest user settings since 2020–21).
- **Knowledge on the site**: articles need the **channel checkbox** "Visible in Public Knowledge Base" / "Customer" / "Partner" and data category visibility for the site's profile / guest profile.

---

## 7. Knowledge (Lightning Knowledge)

### 7.1 Setup

1. Setup → **Knowledge Settings** → **Enable Lightning Knowledge** (irreversible). Assign a **Knowledge User** feature license (the "Knowledge User" checkbox on the User record) to authors.
2. Article object: **Knowledge (`Knowledge__kav`)**. It's a single object with **record types** (replaces Classic article types). Choose the API name at enablement (default `Knowledge`).
3. Create **record types** (FAQ, How-To, Troubleshooting, Release Note) with page layouts and fields (rich text answer, steps …).
4. **Data Categories** (Setup → Data Category Setup): up to **5 category groups active** (verify; Classic was 3 active / 5 total historically), **5 levels** of hierarchy, **100 categories per group**. Map visibility via **role, permission set, profile** (Data Category Visibility) to All / None / Custom.
5. **Channels** per article (checkboxes): *Internal App*, *Customer* (Customer Community sites), *Partner*, *Public Knowledge Base* (public sites, help center, guest).
6. Permissions (Knowledge permission sets, Lightning): **Allow View Knowledge**, **Create/Edit/Delete** on the article object, plus Lightning Knowledge **user permissions**: *Manage Articles*, *Publish Articles*, *Archive Articles*, *Edit Archived Articles*, *Create/Edit/Delete/Restore* (verify), *Manage Article Translations*, *Submit for Approval* (with approval processes) **(verify exact permission names)**.
7. Add the **Knowledge component** to the Case page (sidebar) and the **Knowledge** tab to the console.

### 7.2 Article lifecycle and versions

| Publication state (`PublishStatus`) | Meaning |
|---|---|
| **Draft** | Being written. Not visible to readers. |
| **Online (Published)** | Live version. Readers see it via channels. |
| **Archived** | Retired. Old versions stay in history. |

- Each article (`KnowledgeArticle`, the master) has **versions** (`Knowledge__kav` rows, `VersionNumber`, `IsLatestVersion`). Only **one Online** version and at most **one Draft** per language at a time.
- **Edit** on a published article creates a **new draft version** (option to "edit the published version" directly for minor fixes, or "unpublish"). **Publish** makes the draft the Online version, and the prior one becomes archived history. You can publish **now** or **schedule** a publish date.
- **Article version history** is viewable (enable "Allow users to view article version history"). Restore an old version as a draft.
- **Validation status** picklist (Not Validated / Validated). Common in KCS (Knowledge-Centered Service).
- **Approval processes** on Knowledge drafts (Submit for Approval button).
- Archive: **Archive** button. You can **schedule** archiving, and delete archived versions **(verify)**.
- **Article Number** auto-number is stable across versions. **URL Name** is unique per language.
- Apex/API: `KbManagement.PublishingService` (publishArticle, editOnlineArticle, archiveOnlineArticle, submitForTranslation …).

### 7.3 Translations

- Setup → **Knowledge Settings → Multiple languages**: pick supported languages, default assignee/queue per language, **translation status** workflow.
- **Submit for Translation** creates translation draft versions (`Language` field). Translation publishes independently. Export and import translations via XLIFF/zip (**Export Articles for Translation / Import Article Translations**).
- Master article must be published before translations can be published **(verify)**.

### 7.4 Using Knowledge on cases

- **Knowledge component / Knowledge sidebar** on the Case page: **auto-suggests** articles based on the case **Subject** (configurable fields via "Suggested Articles" search settings), plus manual search.
- Actions on a suggested article: **Attach to Case** (creates `CaseArticle` link), **Insert into Email / Share link** ("Email article" — inserts the URL or content, controlled by "Allow agents to share Knowledge article links" and channel visibility), **Copy link**, **Open**.
- **Attached Articles** related list (Case Articles). Detaching is possible.
- "Create article from case" (when closing) via **Knowledge action** or **Case Close** "Submit as article" option (Classic **Article from case**) **(verify Lightning parity)**.
- **Einstein / Agentforce Article Recommendations** replace keyword suggestions with ML recommendations (§11).
- **Knowledge search**: promoted search terms, synonyms, **Einstein Search for Knowledge** **(verify)**.
- **Knowledge for Agentforce**: articles indexed into Data 360 (retriever / search index) to ground Agentforce answers (**Answer Questions with Knowledge** action).

---

## 8. Entitlement Management (SLAs)

### 8.1 Objects

| Object | Purpose |
|---|---|
| **Entitlement** | The customer's right to support (for example "Gold Phone Support"). Links to Account (required), optionally Asset, Service Contract, Contract Line Item. Has **Start/End dates**, **Business Hours**, **Entitlement Process**, **Per Incident** (remaining cases) and **Status** (Active/Expired/Inactive — calculated). |
| **Entitlement Template** | Predefined entitlements attached to **Products**. When a contract line item for that product is created, the entitlement can be auto-created. |
| **Service Contract** | Agreement covering a period of service (account, dates, terms, totals). |
| **Contract Line Item** | Product/asset coverage lines under a service contract (requires price book products). |
| **Entitlement Contact** | Restricts which contacts can use the entitlement. |
| **Entitlement Process** | The SLA timeline: **milestones** with time triggers and actions. Versioned. |
| **Milestone** (`MilestoneType`) | A required step (First Response, Resolution Time …). |
| **Case Milestone** (`CaseMilestone`) | Runtime instance on a case: Target Date, Completion Date, **IsCompleted**, **IsViolated**, Time Remaining, Elapsed Time, Stopped Time. |
| **Business Hours** / **Holidays** | Setup → Business Hours (multiple, time zones). Holidays are linked to business hours. Used in milestone and escalation timing. Apex `BusinessHours.add()/diff()`. |

### 8.2 Setup sequence

1. Setup → **Entitlement Settings** → Enable Entitlement Management. Options: **Enable Entitlement Versioning**, **Enable Service Contracts** (create/edit), **Enable contract line items on service contracts**, **Auto-populate Entitlement on Case** (lookup filter "Entitlements matching account/contact/asset"), **Milestone Tracker settings**, **Default entitlement when creating case** (verify), and **Enable Milestone Feed Items** (milestone completions or violations post to the case feed).
2. Create **Milestones** (Setup → Milestones). Recurrence types: **No Recurrence**, **Independent** (recurs whenever criteria match again), **Sequential** (recurs each time criteria re-met after completion).
3. Create the **Entitlement Process** (type Case or **Work Order**), with **Entry criteria** and **Exit criteria** (for example IsClosed = true). Add milestones with **criteria** (for example Priority = High), **Minutes to complete** (or dynamic time via Apex `Support.MilestoneTriggerTimeCalculator`), and **Business Hours** (inherit from case or entitlement, or specified).
4. Add **milestone actions** (time-dependent, relative to the milestone target):

| Action type | When it fires | Typical actions |
|---|---|---|
| **Success actions** | When the milestone is **completed** before violation. | Field update, email alert, task, outbound message. |
| **Warning actions** | X minutes **before** target date (for example 30 min before). | Notify owner, raise priority. |
| **Violation actions** | At or after the **target date** passes uncompleted. | Escalate (reassign to queue), notify manager, set Escalated flag. |

   Actions are **workflow-style** (field update, email alert, task, outbound message). Flows can be invoked via process automation in newer releases **(verify "Flow in milestone actions")**.
5. Activate the process. Create **Entitlements** (on Account, Asset, Service Contract) referencing the process. Add **Entitlements** related lists and the **Entitlement lookup** to Case.
6. Add the **Milestone Tracker** component to the Case Lightning page (shows countdowns, green/yellow/red, completed/violated). Add the **Case Milestones** related list.
7. **Complete milestones** automatically: milestones aren't completed by the system on their own. Use a **flow/Apex** that sets `CaseMilestone.CompletionDate` when the condition is met (for example First Response: when an outbound EmailMessage is sent), or rely on the **exit criteria** of the process. Common source of confusion.
8. **Pausing**: Case `IsStopped` (**Stopped** checkbox) pauses milestone timers. Support Settings / Entitlement Settings: **"Stop milestones when case status is …"** **(verify)**. Status values can be configured to stop the clock (for example "Waiting on Customer").

### 8.3 Notes

- Entitlement processes can apply to **Work Orders** too (field service SLAs).
- Changing the **Entitlement** on an open case restarts or recalculates milestones per settings **(verify)**.
- Versioning: new process versions apply to new cases. Existing cases can be updated to the new version manually or via the API `SlaProcessId`.
- **Entitlement Status** is calculated from dates. Expired entitlements don't start a process.
- **Per Incident** support: "Cases Per Entitlement" and "Remaining Cases" decrement on case creation.

---

## 9. Assets, Service Contracts, Work Orders

### 9.1 Assets

- The **Asset** object: a product a customer owns (serial number, install date, status, quantity, price, `AccountId`, `ContactId`, `Product2Id`, `ParentId` for **asset hierarchy**, `RootAssetId`, Location).
- **Asset Relationships** (replaced/upgraded assets), **Asset Warranty / Warranty Terms** (Field Service), **Asset Attributes** **(verify)**, **Asset State Periods** and **Asset Action** (Subscription Management / Revenue Cloud lifecycle).
- Cases link to assets. Entitlements can be per asset.
- Asset sharing: Assets can be **controlled by parent** (Account) or have their own OWD.

### 9.2 Service Contracts

- `ServiceContract` with line items (`ContractLineItem`), price book, terms, status (calculated: Active/Expired/Inactive), parent/child service contracts (hierarchy), **renewal** via **"Renew"** (clone) **(verify)**.
- Entitlements on service contracts or line items cover the case SLA.

### 9.3 Work Orders

- `WorkOrder` and `WorkOrderLineItem` (WOLI): tasks performed on assets (can be used **without Field Service**). Fields: Subject, Status (New, In Progress, On Hold, Completed, Cannot Complete, Closed, Canceled), Priority, Asset, Case, Account, Contact, Location, Entitlement, Service Contract, **Work Type**, Duration, Address, Pricebook, Parent Work Order.
- **Work Types**: templates (estimated duration, **skill requirements**, **auto-create Service Appointment**, required products, linked article). **Work Plans / Work Steps** (guided field work).
- Work orders support **entitlement processes** and milestones, Chatter feed and **Product Required / Product Consumed**.
- **Create Work Order** action on Case.

---

## 10. Field Service (Agentforce Field Service)

### 10.1 Architecture

- Core objects in the platform, plus the **Field Service managed package** (`FSL` namespace) that provides the scheduling engine, **Dispatcher Console**, scheduling policies and optimization. Field Service must be enabled (Setup → **Field Service Settings**), and then install the managed package and run the **Field Service Admin** app setup ("Permission Set" creation via **Field Service Settings → Permission Sets** tab).
- Licenses: **Field Service Dispatcher**, **Field Service Mobile** (technician), **Field Service Scheduling**, **Field Service Contractor / Contractor Plus** (for contractors), plus Field Service admin/agent permission sets. The "Field Service Starter" variants and naming changed with Feb 2026 plan changes **(verify)**.

### 10.2 Key objects

| Object | Role |
|---|---|
| **Service Territory** | A region where work happens (hierarchy). Has **Operating Hours**, address, **Service Territory Members** (resources: Primary, Secondary, **Relocation** with dates). |
| **Operating Hours / Time Slots** | Availability windows for territories, resources and accounts (customer availability). |
| **Service Resource** | The tech (user), **crew**, or **asset** resource. Type: Technician / Dispatcher / Crew. Has **Skills** (with levels), **Capacity** (for contractors), **Efficiency**, **Travel speed**, **home base**. |
| **Resource Absence** | Non-availability (Vacation, Training, Break). |
| **Service Crew / Crew Members** | Group resources. |
| **Service Appointment (SA)** | The scheduled visit. Parent: Work Order, WOLI, Account, Asset, Opportunity, Lead **(verify)**. Fields: **Earliest Start Permitted**, **Due Date**, **Arrival Window Start/End**, **Scheduled Start/End**, Actual Start/End, Duration, Status (None, Scheduled, Dispatched, In Progress, Completed, Cannot Complete, Canceled), **Pinned**, ServiceTerritory. |
| **Assigned Resource** | Links SA to Service Resource (the assignment). |
| **Skill Requirement** | Needed skills on Work Type/WO/WOLI. |
| **Resource Preference** | Preferred / Required / Excluded resource for an account or WO. |
| **Time Sheet / Time Sheet Entry** | Tech time capture. |
| **Shift** | Shift-based scheduling (Shift Management). |
| **Product Item, Product Request, Product Transfer, Product Consumed, Return Order, Shipment, Location** | Inventory. |
| **Maintenance Plan / Maintenance Asset / Maintenance Work Rule** | Preventive maintenance, auto-generating work orders on a schedule (frequency, **generation timeframe**, batch generation). **Recordset Filter Criteria** for usage-based / condition-based maintenance **(verify)**. |
| **Service Report / Service Report Template** | PDF report with signatures (DigitalSignature). |
| **Work Plan / Work Step / Work Plan Template** | Guided steps for techs. |

### 10.3 Scheduling and optimization

- **Scheduling policies** (records of `FSL__Scheduling_Policy__c`) combine **Work Rules** (hard constraints: Match Skills, Match Territory, Service Resource Availability, **Maximum Travel From Home**, Excluded Resources, Required Resources, Working Territories, Match Boolean/Fields, Count Rule) and **Service Objectives** (weighted soft goals: **ASAP**, **Minimize Travel**, **Minimize Overtime**, **Preferred Service Resource**, **Resource Priority**, **Skill Level**, **Same Site**). Out-of-the-box policies: **Customer First**, **High Intensity**, **Soft Boundaries**, **Emergency**.
- **Book Appointment / Candidates (Get Candidates)**: offers slots or resources ranked by policy (also exposed via `FSL.AppointmentBookingService` and `FSL.GradeSlotsService`).
- **Schedule** (automatic best-slot schedule) / **Global Actions**.
- **Optimization**: **Global optimization** (territory and horizon, runs in background on Salesforce optimization service; can be scheduled), **Resource Schedule Optimization** (one tech's day), **In-Day optimization**, and **Enhanced Scheduling and Optimization (ES&O)**, the newer engine with better travel and street-level routing (**point-to-point predictive travel**) **(verify default status)**.
- **Travel**: aerial vs street-level routing (SLR). **Predictive travel** uses traffic.
- **Scheduling Recipes** (automatic rescheduling on events like cancellation, shortening, emergency) **(verify)**.
- **Appointment Assistant**: customer-facing real-time tech location, self-scheduling, confirmation. **Agentforce for Field Service**: Agentforce scheduling agent and dispatcher assistant (gaps, troubleshooting, job summaries) **(verify GA features)**.

### 10.4 Dispatcher Console (Gantt)

- A Visualforce/LWC console tab (**Field Service** app → **Field Service** tab). Left: **appointment list** (filters: Unscheduled, Scheduled, Dispatched, In Progress, **Rule Violating**, **Jeopardy**, Today, Emergency). Center: **Gantt** (resources as rows, with day/week/month resolution, drag-and-drop, utilization, absences, break). Map panel (resource/route locations), plus a **policy picker**.
- Gantt actions: **Schedule**, **Unschedule**, **Dispatch**, **Optimize**, **Fix Overlaps**, **Group Nearby Appointments**, **Get Candidates**, **Emergency wizard**, **Reshuffle** **(verify)**, bulk actions, custom Gantt actions (Apex/VF), color-coding by status, **rule violation** icons, **Jeopardy** flag.
- **Gantt Filters / Gantt palettes**. The **Gantt Lightning (LWC) Dispatcher Console** replaced the Visualforce one in 2024–25 **(verify)**.
- Dispatcher permission set plus the **Dispatcher license**.

### 10.5 Field Service Mobile app

- Separate native iOS/Android app (**Field Service mobile app**). Offline-first via **briefcase/priming**: it primes SAs, WOs, WOLIs, assets, articles, products, etc. Features include schedule (day/list/map), **status transitions** via the mobile status picker (Status Transitions in Field Service Settings), **flows** (mobile flows / **App Extensions** and **Lightning Web Components** supported offline in newer releases), **Service Report** with signature capture, **Barcode scanner**, **Inventory** (consume/transfer), **Time sheets**, **Knowledge articles**, **Work Plans**, **Visual Remote Assistant** (separate product), **geolocation tracking**, **Push notifications**, **Agentforce for Field Service mobile** (summaries, knowledge Q&A) **(verify)**.
- Newer approach: Field Service experience inside the **Salesforce mobile app** with offline (**Salesforce Mobile Offline / Briefcase**) **(verify convergence plans)**.

### 10.6 Inventory management

- **Locations** (warehouse, van, site), **Product Items** (stock at a location with quantity on hand), **Product Item Transactions** (auditing), **Product Requests / Request Line Items**, **Product Transfers**, **Shipments**, **Return Orders / Return Order Line Items** (RMAs), **Product Required** (on Work Type/WO), **Product Consumed** (decrements Product Item), **Serialized Products** (`SerializedProduct`) **(verify)**.

### 10.7 Maintenance plans

- `MaintenancePlan` (Start/End, Frequency, Frequency Type, Generation Timeframe, **Work Order Generation Method** = one WO per asset or one WO with WOLIs per asset, **Generate New Work Orders** auto, **Date of first work order**, **Maintenance Window** start/end days). Holds `MaintenanceAsset` and **Maintenance Work Rules** (multiple recurrence patterns via iCal RRULE). Button: **Generate Work Orders**.

---

## 11. Einstein and Agentforce for Service

| Feature | What it does | Status / notes |
|---|---|---|
| **Agentforce Service Agent** (formerly Einstein Service Agent) | Autonomous customer-facing AI agent built in **Agentforce Builder** (Agent Builder). It uses **Topics, Instructions, Actions** (flows, Apex, prompt templates, standard actions like *Answer Questions with Knowledge*, *Identify Record by Name*, *Create Case*, *Escalate*) and connects to **Messaging (MIAW, enhanced channels)**, **Voice** **(verify)**, Experience Cloud, API, and Slack. Escalation goes to Omni-Channel **(Route Work / Outbound Omni-Channel Flow)**. Grounded on Knowledge via **Data 360** (search index / retriever). The **Einstein Trust Layer** handles data masking and zero retention. | GA Oct 2024 (Agentforce 1.0). Pricing evolved: $2/conversation → **Flex Credits** (~$0.10/action) → per-user Agentforce add-ons (2025) **(verify current)**. |
| **Agentforce Assistant / Einstein Copilot for Service (employee-facing)** | Agent assistant in the console panel. Q&A, summarization, actions. | Now "Agentforce (Default) / Agentforce Employee Agent" **(verify)**. |
| **Service Replies** (Einstein Reply Recommendations successor) | Generative AI drafts **email and messaging replies** grounded on case, conversation and Knowledge. Available in the conversation pane (Messaging) and the **Email Composer** ("Draft with Einstein"). | Part of Einstein for Service / Agentforce for Service add-on. Prompt Builder template types: "Service Replies" / **Email (Service)** **(verify)**. |
| **Work Summaries** | Generative summary of a messaging or voice conversation at wrap-up: **Summary, Issue, Resolution** fields, written to the case or MessagingSession. | GA 2024. Works with Enhanced Messaging and Voice. |
| **Case Summaries** | Generative summary of the whole case (feed, emails). | Lightning component / prompt template. |
| **Knowledge Creation (Einstein Knowledge Creation)** | Generates draft article from a case or conversation. | GA 2024 **(verify)**. |
| **Case Classification** | Predictive ML (Einstein, non-generative). It suggests or auto-populates case fields (Type, Reason, Priority, picklists, checkboxes) based on closed-case history. Modes: **Suggest** in the Einstein Field Recommendations component, or **Auto-populate** / **Auto-route** on creation (**Case Routing**). Requires ≥ 400 closed cases in the past 6 months **(verify thresholds)**. | Legacy-predictive, still supported. |
| **Case Wrap-Up** | Predicts closing fields for chat/messaging transcripts. | |
| **Article Recommendations** | ML recommends Knowledge articles in the Knowledge component based on case text and history of attached articles. | Requires article-attachment history. |
| **Reply Recommendations** | ML suggests chat/messaging replies from transcripts. | Being superseded by Service Replies **(verify)**. |
| **Einstein Next Best Action** | Recommendations (Recommendation object + strategies in Flow) in the Actions & Recommendations / Einstein NBA component. | |
| **Einstein Conversation Insights (ECI)** for Service | Call/voice insights (keywords, sentiment, coaching). | |
| **Einstein Bots** (Standard / Enhanced Bots) | Rule and NLP dialog bots built in **Bot Builder** (dialogs, intents, entities, variables). **Enhanced bots** work on Enhanced Messaging and MIAW. | **Legacy**. No hard EOL announced as of mid-2026 **(verify)**. Legacy Chat bots died with Chat (Feb 2026). "Article Answers" ended. No migration tool to Agentforce; it's a rebuild. Salesforce recommends Agentforce for new builds. |
| **Einstein Service Planner / Service Assistant** | Agentforce **Service Assistant** gives guided step-by-step resolution plans for agents (2025) **(verify name)**. | |
| **Agentforce for Field Service** | Scheduling agent, mobile summaries, pre-work briefs. | 2025–26 **(verify)**. |
| **Prompt Builder** | Custom prompt templates (Field Generation, Sales/Service Email, Flex, Record Summary) grounded with merge fields, flows and Apex. | Needs Einstein generative AI license. |

**Prerequisites**: Einstein generative AI enabled, Einstein Trust Layer, Data 360 (provisioned with Agentforce), permission sets (for example *Agentforce Service Agent Configuration*, *Einstein for Service*, *Prompt Template User*), plus an **Agent user** (Agentforce Service Agent runs as a dedicated integration-style user, the **Einstein Agent User**).

---

## 12. Service Cloud analytics

- **Standard reports/dashboards**: Cases (Cases, Cases with Emails, Case History, **Case Lifecycle**, Cases with Milestones), Agent Work, User Presence, Messaging Sessions, Voice Calls, Knowledge (article views, votes), **Service Console Dashboard** packages from AppExchange (Salesforce Labs "Service Cloud Dashboards").
- **Case Lifecycle** report: time in each status/owner.
- **CRM Analytics: Service Analytics app** (templated): Service Manager / Agent dashboards, case trends, **CSAT**, backlog, first-contact resolution. Requires the CRM Analytics (Service Analytics) license.
- **Tableau Next / Tableau** dashboards (bundled with Agentforce 1 Service edition, verify).
- **Omni Supervisor** real-time plus **Omni-Channel reports**.
- **Service Intelligence** (2024+): out-of-the-box dashboards on Data 360 for service KPIs with Einstein/Agentforce insights **(verify GA & licensing)**.
- **Agentforce analytics / Agentforce Command Center**: agent performance, sessions, deflection **(verify)**.
- **Customer feedback**: **Salesforce Feedback Management** (Surveys) for CSAT/NPS, triggered by flows when a case closes.
- Typical KPIs: First Response Time, Average Handle Time (AHT), First Contact Resolution (FCR), SLA compliance (milestones violated %), Backlog, CSAT, Deflection rate, Agent Utilization, Escalation rate.

---

## 13. Incident Management, Swarming, Customer 360

### 13.1 Incident Management

- Objects: **Incident**, **Problem**, **Change Request**, **Case Related Issue** (links cases to incidents/problems), **Incident Related Item / Problem Incident**, plus Asset/Service links.
- Use case: a major outage. Create an Incident (manually, or from monitoring tools via the API or **Integrations** like Datadog/PagerDuty), link many customer cases, **bulk-communicate** to affected customers (from the Incident with case-related emails), track status, root-cause the **Problem**, and plan the **Change Request**.
- ITIL-aligned. Comes with the Service Cloud **Incident Management** feature (Enterprise+). Configured via Setup → **Incident Management** **(verify)**. Related products: **Agentforce IT Service** (Salesforce's ITSM offering, launched 2025) **(verify)**.
- Customer-facing status updates can be published in **Experience Cloud (Incident status component)** **(verify)**.

### 13.2 Swarming (Slack Swarming)

- **Swarming**: collaborate on complex cases by assembling experts. Setup → **Swarming** settings. It requires the **Slack** integration (Service Cloud for Slack). From a case, choose **Start a Swarm**, which creates a **Slack channel** (or a Chatter-based swarm in older versions), invites members (suggested by **Expert Finder**, based on skills, case history and availability), and logs **Swarm** and **Swarm Member** records. **Expert Finder** suggests users based on skills **(verify)**.
- **Slack**: Service Cloud for Slack (case, incident and knowledge actions in Slack), **Slack-first swarming**, plus Agentforce in Slack.

### 13.3 Customer 360 / unified view

- Lightning record page composition: **Related records** (Account, Contact, Assets, Entitlements), Cases history, **Timeline**, Orders (Commerce integration), Marketing interactions, plus **Data 360 Profile** components (Unified Individual, Calculated Insights, **Data 360 Related List**, Copy Fields).
- **Service Cloud with Data 360** (Unified Profile in Service Console) **(verify component names)**.
- Mulesoft / integration patterns for ERP/order data (External Objects via Salesforce Connect).

---

## 14. Editions and pricing (list prices, USD, per user per month billed annually)

| Edition / suite | List price (2026) | Notable service features |
|---|---|---|
| **Free Suite** (introduced 2025) | $0 (limited users) **(verify)** | Basic case management. |
| **Starter Suite** | ~$25 | Simple case management, email-to-case, basic web forms. Multi-cloud starter. |
| **Pro Suite** | ~$100 | More automation, more customization, contact center basics **(verify)**. |
| **Enterprise** | ~$175 | Full Service Cloud: Omni-Channel, Knowledge (verify included vs add-on), Entitlements, Service Console, Assets, Work Orders, Macros, Flows, APIs. Minimum edition for most Einstein/Agentforce add-ons. |
| **Unlimited** | ~$350 | Enterprise + Knowledge, Premier Success, sandboxes, higher limits, more AI features included (verify). |
| **Agentforce 1 Service** (formerly Einstein 1 Service / Unlimited+) | ~$550 | Unlimited + Agentforce (employee agents unmetered), Data 360 credits, Tableau Next, Slack Enterprise+, Flex Credits **(verify bundle specifics)**. |

**Common add-ons** **(verify current prices)**: Digital Engagement (Messaging, SMS, WhatsApp; usage based), Service Cloud Voice, Knowledge (if not included), Field Service (Dispatcher, Technician, Contractor licenses), Feedback Management, CRM Analytics Service Analytics, Agentforce for Service (per user, ~$125 add-on, or via Flex Credits per conversation/action), Experience Cloud licenses, Shield, Premier/Signature Success.

- Salesforce raised list prices ~6% on Enterprise and Unlimited editions in Aug 2025 **(verify)**.
- Field Service plans were renamed in Feb 2026 **(verify)**.

---

## 15. Admin quick reference: where things live in Setup

| Thing | Setup path |
|---|---|
| Support Settings (default owner, close statuses, case merge, notifications) | Setup → Feature Settings → Service → **Support Settings** |
| Case assignment / auto-response / escalation rules | Setup → Service → Case Assignment Rules / Case Auto-Response Rules / Escalation Rules |
| Support Processes | Setup → Service → Support Processes |
| Email-to-Case & Routing Addresses | Setup → Service → Email-to-Case |
| Web-to-Case | Setup → Service → Web-to-Case |
| Omni-Channel Settings, Service Channels, Routing Configs, Presence Statuses/Configs, Skills | Setup → Omni-Channel → … |
| Messaging Settings, Embedded Service Deployments | Setup → Messaging Settings / Embedded Service Deployments |
| Contact Centers / Voice | Setup → Contact Centers, Service Cloud Voice |
| Call Centers (Open CTI) | Setup → Call Centers |
| Knowledge Settings, Data Category Setup | Setup → Knowledge Settings / Data Categories |
| Entitlement Settings, Milestones, Entitlement Processes | Setup → Entitlement Management → … |
| Business Hours / Holidays | Setup → Company Settings → Business Hours / Holidays |
| Macros, Quick Text Settings | Setup → Macro Settings, Quick Text Settings; records via App Launcher |
| Field Service Settings | Setup → Field Service Settings; Field Service Admin app for the managed package |
| Einstein / Agentforce | Setup → Einstein Setup, Agentforce Agents, Prompt Builder, Einstein for Service |
| Service Setup Assistant | Setup → **Service Setup** (guided "Service Cloud setup" home with recommended setup flows for E2C, Omni, Knowledge, Messaging) |

---

## 16. Typical end-to-end flows

**Email support with SLA**
1. Customer emails support@acme.com, which forwards to the E2C service address. A Case is created (Origin = Email, Contact matched by email).
2. The auto-response rule sends an acknowledgment. The assignment rule assigns the case to the "Tier 1" queue.
3. Omni pushes it to an available agent (skills: Product X, Language EN). The entitlement is auto-populated, and the process starts **First Response** (1h) and **Resolution** (8h business hours) milestones.
4. The agent uses Service Replies to draft the email with an attached Knowledge article. A flow marks First Response complete when the outbound email is sent.
5. The customer replies, and the thread token or header threads it to the case. A flow sets Status to "Customer Responded".
6. The agent closes the case via the Close Case action (Reason, Resolution). Resolution is completed, and a survey is sent.

**Messaging with an AI agent**
1. A web visitor opens MIAW. The Omni-Channel Flow routes to the Agentforce Service Agent.
2. The agent answers from Knowledge or creates a case. On "talk to human", it escalates via Route Work to the Messaging queue.
3. A human agent accepts in the Omni widget. A Work Summary is generated at wrap-up.

**Field visit**
1. Case → Create Work Order (Work Type "Repair", auto-creates an SA). The dispatcher clicks Schedule (Customer First policy) or global optimization assigns it.
2. The SA is dispatched. The tech works in the mobile app: status In Progress → Product Consumed → Service Report signed → Completed.

---

## Gotchas / common confusions

- **Chat is gone.** Legacy Chat / Live Agent / Embedded Chat was retired **14 Feb 2026**. Any new "chat" answer should point to **Messaging for In-App and Web**. `LiveChatTranscript` data remains for history only.
- **Einstein Bots ≠ Agentforce.** No automated migration. Einstein Bots have no announced hard EOL (verify), but all new investment goes to Agentforce Service Agent.
- **"Service Cloud" vs "Agentforce Service"** are the same product. Setup labels and Trailhead often still say Service Cloud. Don't treat them as different products.
- **Only one active** case assignment rule, auto-response rule and escalation rule at a time (each can have many entries). First matching entry wins.
- **Assignment rules don't fire on UI-created cases** unless the "Assign using active assignment rule" checkbox is checked (or defaulted on the layout). Apex inserts need DMLOptions.
- **Auto-response rules** fire only for Web-to-Case and Email-to-Case (and the API with the header), not for manual case creation.
- **Milestones don't auto-complete.** You must complete `CaseMilestone` via flow or Apex, or via the process exit criteria. Otherwise they go to violation.
- **Escalation rules vs milestones**: escalation rules are case-age-based with one active rule. Milestones are per entitlement process with success, warning and violation actions. They're independent, and both can run.
- **Business hours** must be set on both the process/milestone and the case or entitlement consistently, or timers will be wrong. Holidays must be linked to the business hours record.
- **Support Process** is required for every Case record type. Status values not in the process aren't selectable.
- **Closing cases**: if "Show Closed Statuses in Case Status Field" is off, agents can't pick Closed in the Status field and must use the Close Case action or button.
- **Case merge** is limited to 3 at a time, and the merged (non-master) cases are deleted unless retention is enabled. It can't be undone.
- **E2C threading**: the old `ref:_…:ref` thread IDs are retired. Use **Lightning threading** (token plus headers). Customers who strip subjects and headers will still create new cases. Build dedup or merge logic.
- **E2C routing address must be verified**, and forwarding must preserve headers. Loops (auto-reply to auto-reply) are mitigated by loop protection plus auto-response "Accept from" logic.
- **Web-to-Case** is capped at 5,000/day and is unauthenticated. Always enable reCAPTCHA.
- **Tab-based capacity** frees capacity when the tab closes, which isn't the same as the case closing. Use **status-based** capacity for cases that stay open for days.
- **Omni push timeout** + "Update status on push timeout" can silently set agents to Away. Check the presence config when agents complain about "disappearing" work.
- **Queue membership alone doesn't route.** The queue needs a **routing configuration**, the agent must be **Online** in a status tied to the right **service channel**, and the agent must have **capacity**.
- **Skills-based routing** requires the user to be a **Service Resource** with skills. Users who aren't service resources never get skills-routed work.
- **Enhanced vs standard messaging channels**: rich features, Omni-Channel Flow and Agentforce need **Enhanced** channels. WhatsApp outbound outside the 24-hour window needs **approved templates**.
- **Open CTI ≠ Service Cloud Voice.** Open CTI is just an API for embedding a vendor softphone. SCV is native (VoiceCall, transcription, Omni). SCV can still use partner telephony.
- **Lightning Knowledge is irreversible** and uses **record types** instead of article types. **Data category groups** limit visibility, and channel checkboxes limit which audiences see articles. Both must align for a site user to see an article.
- **Editing a published article** creates a new draft version. The live version stays until you republish. Only one draft per language.
- **Knowledge User license** (a user feature checkbox) is needed to author articles. Readers just need Read on the Knowledge object (plus channel and category access).
- **Case Classification requires closed-case history** (hundreds of closed cases with populated fields). It's predictive, not generative, and is distinct from generative Service Replies and Work Summaries.
- **Field Service** core objects exist without the managed package, but the **scheduling engine, Gantt and optimization come from the FSL managed package**. Scheduling policies are records of `FSL__Scheduling_Policy__c`, not metadata. Deploy them with data tools.
- **Service Appointment ≠ Work Order.** SAs are the scheduled visits (with an Assigned Resource). A WO can have several SAs. Entitlement milestones run on WOs, not SAs.
- **Service territory membership type** matters: Primary vs Secondary vs Relocation affects scheduling and home base.
- **Macros can't be undone** if they contain submit actions (the lightning-bolt icon). Bulk macros can't send email.
- **Quick Text shortcut** is `;;` in Lightning. Macros vs Quick Text: macros run actions, Quick Text inserts text.
- **Console apps don't work in the mobile app.** Utility items like Omni and the softphone need "Load in background" or they won't receive work until opened.
- **Experience Cloud high-volume users** (Customer Community) don't use roles. Grant case access via **sharing sets**. Case comments are only visible if they're marked Public.
- **Editions**: Omni-Channel, Entitlements and the console need Enterprise or higher for full functionality. Einstein/Agentforce add-ons require Enterprise+. Prices and bundles shift often, so treat all numbers as **(verify)**.
- **Naming drift**: Field Service → Agentforce Field Service, Data Cloud → Data 360, Einstein Copilot → Agentforce Assistant/Agent. Map old names to new ones when users or docs use either.
