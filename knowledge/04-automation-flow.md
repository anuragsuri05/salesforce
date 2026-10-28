# Salesforce Automation and Flow: Reference

**What this file covers:** Every Flow type, Flow Builder control, element, resource, global variable and screen component, plus how flows are triggered, ordered, bulkified, debugged, tested and launched.
**Also covers:** Flow Orchestration, classic Approval Processes and Flow Approval Processes, assignment/auto-response/escalation rules, retired Workflow Rules and Process Builder, email alerts, outbound messages, Platform Events, CDC, and scheduled Apex vs scheduled flows.
**Currency:** Written as of 2026-10-08, with Winter '27 current. Items marked "(verify)" are recent, in beta, or change from release to release.

---

## 1. Automation landscape at a glance

| Tool | Status (Oct 2026) | Use it for |
|---|---|---|
| **Flow (Flow Builder)** | Strategic, actively developed | Almost all declarative automation |
| **Flow Orchestration** | Standard flow type since early 2026. No add-on license needed (verify edition limits) | Multi-user, multi-step, long-running processes |
| **Flow Approval Processes (Approval Orchestration)** | GA since Spring '25 and improving each release | New approval processes |
| **Classic Approval Processes** | Still supported. No retirement announced (verify) | Existing approvals and simple single-object approvals |
| **Workflow Rules** | End of support 31 Dec 2025. Can't create new ones. Existing ones still run but get no bug fixes or support | Migrate to Flow |
| **Process Builder** | Same as Workflow Rules | Migrate to Flow |
| **Assignment / Auto-Response / Escalation rules** | Supported (Lead/Case features) | Routing, auto-reply emails, case escalation |
| **Apex triggers / Apex classes** | Supported | Complex logic, high volume, callouts, or anything Flow can't do |
| **Platform Events / Change Data Capture** | Supported | Event-driven and integration automation |

Rule of thumb: Flow first. Use Apex when you need complex logic, very high-volume bulk processing, tight performance control, or features Flow lacks. Use invocable Apex to fill gaps inside a flow.

---

## 2. Flow types

Create a flow in Setup → Process Automation → Flows → **New Flow**, or from the **Automation** Lightning app. The New Flow dialog groups types into categories: Frequently Used, Triggered, Screen, Autolaunched, Orchestration, Approval, AI/Agentforce, and "Templates".

### 2.1 Core types

| Flow type | How it starts | User interaction | Typical uses |
|---|---|---|---|
| **Screen Flow** | User launches it (page, button, action, utility bar, Experience Cloud, URL) | Yes (screens) | Guided wizards, data entry, call scripts |
| **Record-Triggered Flow** | A record is created, updated, or deleted | No | Replaces Workflow Rules, Process Builder and many triggers |
| **Schedule-Triggered Flow** | A date/time and frequency (Once, Daily, Weekly), optionally over a batch of records | No | Nightly cleanups, reminders |
| **Platform Event-Triggered Flow** | A platform event message is received | No | Integration and decoupled processing |
| **Autolaunched Flow (No Trigger)** | Called by Apex, REST, a subflow, a process, a button, Agentforce, or a custom invocable | No | Reusable logic, subflows, agent actions |
| **Record-Triggered Orchestration** / **Autolaunched Orchestration** | Record change, or invocation | Through work items | Multi-stage, multi-person processes |
| **Record-Triggered Approval Process** / **Autolaunched Approval Process** | Record change, or submission (Request Approval component, Apex, action) | Approve/reject work items | Flow-based approvals (Approval Orchestration) |
| **Data Cloud-Triggered Flow** | Changes to Data Cloud (Data 360) DMOs or Calculated Insights (verify naming) | No | Act on unified profile changes |
| **Template-Triggered Prompt Flow** | Called by a Prompt Builder template at resolution time | No | Grounds prompt templates with dynamic data (uses the **Add Prompt Instructions** element) |
| **Evaluation Flow** | Called by an orchestration stage/step to evaluate exit or entry criteria | No | Custom orchestration conditions |

### 2.2 Specialized and other types

- **Field Service Mobile Flow** and Field Service-specific screen flows.
- **Contact Request Flow**, **Checkout Flow** (Commerce), **User Provisioning Flow**.
- **Recommendation Strategy** and **Recommendation Assignment** flows for Einstein Next Best Action strategies.
- **Segment-Triggered Flow** and **Form-Triggered Flow**, Marketing Cloud Next / Data Cloud-based marketing (verify).
- **Multi-page Experience Flow**: new in Spring '26 for Experience Cloud (verify).
- **Automation Event-Triggered Flow**: event-based automation in some clouds (verify).
- Agentforce: the flow types above are not themselves "agent flows". An **Agent Action** can call any **Autolaunched Flow** (with input/output variables marked "Available for input/output"). Screen flows can also be agent actions in some surfaces (verify).

### 2.3 Record-Triggered Flow configuration (Start element)

| Setting | Options |
|---|---|
| Object | Any object that supports triggers. Since Spring '26 this includes **ContentDocument/ContentVersion** (verify). File-attachment triggers went GA in Winter '26 |
| Trigger | A record is **created** · **updated** · **created or updated** · **deleted** |
| Entry conditions | None · All conditions met (AND) · Any condition met (OR) · Custom condition logic (`1 AND (2 OR 3)`) · Formula evaluates to true |
| When to run (for updated) | **Every time a record is updated and meets the condition requirements**, or **Only when a record is updated to meet the condition requirements** (fires only on the transition from false to true) |
| Optimize the flow for | **Fast Field Updates** (before-save) or **Actions and Related Records** (after-save) |
| Include a Run Asynchronously path | After-save only. Checkbox under "Optimize for Actions and Related Records" |

#### Before-save ("Fast Field Updates")
- Runs **before** the record is saved to the database, so there is no extra DML. Salesforce cites it as up to about 10x faster than after-save for same-record updates.
- To change the triggering record, use **Assignment** to `$Record.Field` (the values are saved automatically) or **Update Records** on "the triggering record".
- Allowed elements: Assignment, Decision, Get Records, Loop, Collection Sort, Collection Filter, Update Records (triggering record only), Custom Error, Transform (verify), Formula resources. **Not allowed:** Create/Delete records, Update other records, Actions, Subflows, Screens, Wait elements, Roll Back.
- `$Record.Id` is null on create because the record isn't inserted yet.
- **Delete trigger:** a "record is deleted" flow always runs **before delete**. It can't use Fast Field Updates. It can do related-record DML and actions, but there is no async path or scheduled path.

#### After-save ("Actions and Related Records")
- Runs after the save but **before commit**. `$Record.Id` is available.
- Can create, update or delete any record, call actions, call subflows, and send email.
- Updating the triggering record here costs a DML and **re-fires** save-time automation (recursion). Avoid this, and prefer before-save for same-record field updates.
- **Run Asynchronously path:** runs after the transaction **commits**, in a separate transaction with its own fresh governor limits. Use it for callouts (HTTP Callout / External Services), Apex invocables that make callouts, and work that shouldn't roll back the original save.
- **Scheduled Paths:** run later, relative to the triggering time or a date/time field on the record.
  - Time source: "When Record Is Created/Updated" **or** a Date/DateTime field (for example `CloseDate`).
  - Offset: N **Minutes / Hours / Days / Months**, before or after (minutes only after the trigger time, verify).
  - Requires the trigger to be "created" only, or entry conditions using "Only when a record is updated to meet the condition requirements".
  - Before running, it re-checks entry conditions. If the record no longer meets them, the scheduled actions are canceled. Changing the time-source field reschedules the path.
  - Batch size can be configured per scheduled path (default 200, 1–200). It runs as the **Automated Process** user, or the triggering user (verify setting).
  - Monitor in Setup → **Time-Based Workflow** (legacy) and **Scheduled Jobs** / Paused and Failed Flow Interviews (verify which list shows them in your org).

#### `$Record` and `$Record__Prior`
- `$Record`: the triggering record's new values. You can traverse lookups (`$Record.Account.Owner.Email`), which costs SOQL-style limits behind the scenes.
- `$Record__Prior`: values before the update. It is available only in update-capable after-save and before-save flows, and is null on create.
- Typical "changed" check: Decision with `{!$Record.Status}` **Is Changed** = True (operator available in record-triggered flows), or compare `$Record.Status` ≠ `$Record__Prior.Status`.
- The **ISCHANGED / PRIORVALUE / ISNEW** formula functions work in record-triggered flow formulas and entry-condition formulas.

### 2.4 Schedule-Triggered Flow
- Start: Start Date, Start Time, Frequency (**Once, Daily, Weekly**). It runs as the **Automated Process user**, and the time is in the org default time zone.
- Optional object plus filter conditions. The flow runs **one interview per record** returned (batched). Each batch of records is a transaction. A custom batch size of 1–200 was added in Summer '26.
- Limit: roughly 250,000 interviews per 24 hours, or user licenses × 200, whichever is greater (shared with other schedule-based processing) (verify).
- Without an object, it runs once per schedule, and you do the Get Records yourself.
- Monitor in Setup → **Scheduled Jobs** (Type = Flow).

### 2.5 Platform Event-Triggered Flow
- Choose the platform event object. `$Record` is the event message.
- It runs as the **Automated Process** user by default. You can configure it to run as a specific user (verify).
- It runs asynchronously, in batches of up to 2,000 events (verify). There is no rollback of the publisher.
- Persistent logging arrived in Winter '26 for record-triggered and PE-triggered flows (verify).

### 2.6 Autolaunched Flow (No Trigger)
- No Start trigger. Variables marked **Available for input** / **Available for output** form the flow's API.
- Callers: Subflow element, Apex (`Flow.Interview`), REST (`/actions/custom/flow/`), buttons via URL, Agentforce actions, orchestration background steps, Process Builder (legacy), custom invocable surfaces, and screen-flow **Action Button**.
- Can include **Wait** elements only when not invoked synchronously from a context that disallows pausing (verify per caller).

---

## 3. Flow Builder canvas and toolbar

### 3.1 Layout
- **Auto-Layout** (default): elements snap into a vertical tree, connectors draw themselves, branches merge automatically, and **Go To** connectors handle jumps. Branches and fault paths can be collapsed or expanded (collapsible fault paths since Summer '26).
- **Free-Form**: drag elements anywhere and draw connectors manually. You switch between the two from a dropdown on the canvas toolbar. Switching from free-form back to auto-layout only works if the flow structure is compatible.
- Winter '27 refreshed the UI with the Cosmos theme and tighter element cards. The **"+"** now opens a right-side **element panel**, grouped by type (for example Decision/Split, Manage Data, Flow Logic, Interaction) with frequent elements floated to the top. There's also a new **Group** element/container for organizing canvas regions, and builder preferences to hide API names and collapse labels and descriptions (verify UI details).

### 3.2 Left panel
- **Toolbox**: a **Manager** tab lists all resources and elements, with **New Resource**. In free-form there's also an **Elements** tab that you drag onto the canvas. Auto-layout adds elements through "+".
- Filter for **unused resources** or undocumented elements (Winter '27) (verify).

### 3.3 Toolbar buttons (left to right, approximately)

| Button | What it does |
|---|---|
| Back arrow | Exit to the Flows list or Automation app |
| Flow label / version / status | Shows Active/Inactive, version number, and unsaved state |
| **Undo / Redo** | Canvas edits within the session |
| **Auto-Layout / Free-Form** toggle | Switch layout mode |
| Zoom / Fit to view | Canvas navigation |
| **Search** (magnifier) | Find elements and resources on the canvas |
| **Einstein / Agentforce for Flow** (sparkle icon) | Natural-language flow creation and editing, formula help, element descriptions ("Explain this flow") (verify exact availability) |
| **Run** | Runs the latest **saved** version for real. Data changes **commit**. Screen flows open in a new tab |
| **Debug** | Opens debug options (see 3.4). Runs on the canvas with a debug panel |
| **View Tests** / **Test Mode** | Lists and creates Flow Tests. Winter '27 added a separate **Build / Test mode** toggle (beta, verify) |
| **Show Errors / Warnings** | Panel listing validation errors (block save/activation) and warnings |
| **Save** dropdown | **Save** (current version, if inactive), **Save As New Version**, **Save As New Flow** |
| **Activate / Deactivate** | Makes this version the active one. Only one version is active at a time |
| **View Properties** (gear) | Label, API name, description, type, API version, **interview label**, run-in mode (System Context With/Without Sharing, User Context), **Template** checkbox, "Override how the flow runs" / **How to Run the Flow**, Track history, Source template |
| **Version History** / **Compare Versions** | Version list with metadata and side-by-side comparison of two versions (Winter '26). Winter '27 adds per-version **edit history** with restore (verify) |
| **Flow Trigger Explorer** (record-triggered only) | Shows every record-triggered flow on that object grouped by trigger (create/update/delete) and phase (Fast Field Updates / Actions and Related Records / Async / Scheduled), with **Trigger Order** |
| Help / Keyboard shortcuts | — |

### 3.4 Debug options
- **Run flow as another user** (screen and autolaunched flows; you must enable "Let admins debug flows as other users" in Process Automation Settings). This switches the running user context, including sharing and FLS.
- **Run in rollback mode** (autolaunched and record-triggered): changes made during debug are rolled back. Record-triggered debug is **always rollback** (verify). For screen flows it is optional.
- **Show details of what's executed and render flow in Lightning Experience / Lightning runtime** (screen flows).
- **Set input variable values.** Spring '26 keeps the values you last entered in the browser cache.
- Record-triggered: choose the **triggering record**, whether it was **Created** or **Updated** (and edit its field values to simulate a change), and the **path** to test (Run Immediately, async, or a specific scheduled path). You can **skip the start conditions**.
- Schedule-triggered: choose a record to test one interview.
- Approvals and Orchestrations (Winter '26/Spring '26): you can debug them, set step output values manually, turn rollback off, and complete work items directly on the canvas.
- **Debug on canvas**: the executed path is highlighted, and the debug panel shows each element's inputs and outputs, governor limit consumption per transaction, DML and SOQL counts, and fault details. You can **convert a debug run into a Flow Test**.

### 3.5 Versions
- Up to **50 versions** per flow. Delete old inactive versions to make room.
- You can't overwrite the **active** version. Saving creates a new version, or you deactivate first (not recommended in production).
- Each version keeps its own API version. Deployment through metadata (`Flow`, `FlowDefinition`) deploys a version. In production, deployed flows can be set active through the `status` field if "Deploy processes and flows as active" is enabled. That requires test coverage of 75% for record-triggered and autolaunched flows (verify setting name).
- Interviews already running (paused, scheduled paths) keep using the version they started on.

### 3.6 Properties: run context
| Setting | Meaning |
|---|---|
| **User or System Context — Default** | Screen and autolaunched flows run in **user context** unless the caller elevates. Record-triggered and scheduled flows run in **system context without sharing** |
| **System Context With Sharing — Enforces Record-Level Access** | Ignores object permissions and FLS, but respects sharing |
| **System Context Without Sharing — Access All Data** | Ignores sharing too. Use carefully, especially in Experience Cloud screen flows |
| **User Context** | Respects the running user's CRUD, FLS and sharing |

Profile/permission set access to a flow: "Override default behavior and restrict access to enabled profiles or permission sets" is in flow detail **Edit Access**. Running a screen flow requires the **Run Flows** permission, or being granted access to that specific flow. (Winter '26 tightened enforcement here (verify).)

---

## 4. Elements

### 4.1 Interaction
| Element | Notes |
|---|---|
| **Screen** | Screen flows only, plus orchestration interactive steps and approval steps. Holds components (§7). Header/footer settings: show/hide header, **Previous / Pause / Next-Finish** buttons, custom button labels, help text. Spring '26 added screen styling (background, borders, button states) |
| **Action** | Invokes standard actions (Send Email, Post to Chatter, Submit for Approval, Send Custom Notification, Create Slack channel, Launch Flow, Quick Actions, Email Alerts, Show Toast and Open a Page (Summer '26), Prompt Template actions, External Services, HTTP Callout), **invocable Apex**, and LWC **local actions** (screen flows, Winter '26) |
| **Subflow** | Calls another autolaunched flow, or a screen flow from a screen flow, passing input/output variables. A subflow runs in the **same transaction** |

### 4.2 Logic
| Element | Notes |
|---|---|
| **Assignment** | Set, add, subtract, or modify collections: **Add**, **Add at Start**, **Remove All**, **Remove First**, **Remove After First**, **Remove Before First**, **Remove Position**, **Remove Uncommon**, **Equals Count** |
| **Decision** | Outcomes evaluated top-down, with a **Default Outcome**. Conditions: All / Any / Custom logic / formula. Operators: Equals, Does Not Equal, Contains, Starts/Ends With, Greater/Less (or equal), Is Null, **Is Changed** (record-triggered), **Was Set**, **Was Selected**/**Was Visited** (screen), **Is Blank**/**Is Empty** (verify). Summer '26 added about 20 date operators (Is Today, Is Tomorrow, Is On, between, Is Anniversary of Today…). Winter '26 lets you write AI-generated Decision outcomes ("Generative AI for Decisions", verify). Winter '27 lets you clone outcomes |
| **Split by Field Value** / **Split by Date** | New in Winter '27: simplified branching on a field's value or on date ranges (verify GA vs beta) |
| **Loop** | Iterates over a collection in First→Last or Last→First order. The **current item** variable is automatic since Spring '23 (or define your own). There's a **For Each** path and an **After Last** path. Nested loops work |
| **Collection Sort** | Sort a collection by up to 3 fields (asc/desc, nulls first/last), and optionally keep only the first N items |
| **Collection Filter** | Filter a collection by conditions or a formula (use `{!currentItem_FilterName}`). Outputs a new collection |
| **Transform** | Maps a source (variable, collection, Apex-defined type, JSON) to a target with drag-to-map, plus formulas and aggregates (Count, Sum…) per field. Use it in place of Loop + Assignment when mapping collections. Summer '26 added **Global Flow Resources** (reusable value mappings managed in the Automation app) for use in Transform (verify) |
| **Custom Error** | Record-triggered flows (before- and after-save) and screen flows (verify). It shows an error on a field or at the top of the page and **rolls back the record save**. This is how Flow does validation-rule-style blocking |
| **Recommendation Assignment** | Recommendation strategy flows: builds Recommendation output collections |
| **Add Prompt Instructions** | Template-triggered prompt flows: appends text to the prompt |
| **Group** | Winter '27 canvas container (organizational only, verify) |

### 4.3 Data
| Element | Notes |
|---|---|
| **Get Records** | Object, filter conditions (All / Any / custom logic), sort, **first record only** or **all records**, choose fields (automatic: Salesforce stores only the fields referenced; or manual). Can **store only the first N records** (verify). Returns null or an empty collection when nothing is found. Always null-check |
| **Create Records** | One record (from variable or values) or multiple (from a collection). Since Winter '26 a new record's Id is immediately available (verify detail) |
| **Update Records** | Triggering record (record-triggered), a record or collection variable, or filter-based ("Specify conditions to identify records, and set fields individually"), which acts as bulk update by criteria |
| **Delete Records** | Record or collection variable, or by conditions |
| **Roll Back Records** | Rolls back all changes in the **current transaction** that came from this interview. Use it in fault paths of screen flows |

Upsert is supported in Create Records in some contexts (verify). Otherwise use Get + Decision + Create/Update.

### 4.4 Wait elements (pause)
The old single **Pause** element was split into three (Spring/Summer '23 timeframe):
| Element | Behavior |
|---|---|
| **Wait for Amount of Time** | Resume after N minutes, hours, days, or months |
| **Wait Until Date** | Resume at a date/time from a resource or formula |
| **Wait for Conditions** | Multiple configurable paths, each resumable by time (alarm), platform event (with conditions), or both, plus a default/fault path. Also used to wait on a **Platform Event** message |

- Allowed in autolaunched flows (non-record-triggered), orchestrations and screen flows (verify screen). **Not** in record-triggered flows. Use scheduled paths there.
- A paused interview is serialized. It **resumes in a new transaction** as the user who started it (or Automated Process, verify).
- Paused interview limits: orgs can hold a large but finite number. Time-based resumes are processed in batches (approximately 1,000 interviews per batch, verify).
- Screen-flow users pause with the **Pause** button if "Let users pause flows" is on (Process Automation Settings). Paused screen flows appear in the **Paused Flow Interviews** Home-page component.

### 4.5 Connectors and paths
- **Fault path:** add one to any element that can fail (DML, actions, Get Records, subflows). Without it, the user sees an unhandled fault and an error email goes out. Use `{!$Flow.FaultMessage}` in the path. Common patterns: log to a custom Error_Log__c, notify, Roll Back Records, show an error screen.
- **Go To connector** (auto-layout): jump back to an earlier element, for example to loop back to a screen. Free-form simply draws the connector.
- **Immediate vs scheduled** paths on the Start element of record-triggered flows. Async path.
- **End** element: ends that path.

### 4.6 Orchestration elements
- **Stage**: a container of steps. It completes when all steps finish, or based on custom **exit criteria** (via an evaluation flow).
- **Interactive Step**: assigns a **screen flow** to a user, group or queue (or resource). The assignee gets a work item, an email, and the **Orchestration Work Guide** component on the record page.
- **Background Step**: runs an autolaunched flow.
- **MuleSoft / External step**: calls external systems (Winter '26 connectors, verify).
- **Decision** between stages. Step **entry conditions**: run when the stage starts, when another step completes, or on an evaluation flow.
- Approval Orchestration adds **Approval Step**, which is an interactive step specialized for approve/reject (see §11.2).

---

## 5. Resources (New Resource)

| Resource | Details |
|---|---|
| **Variable** | Data types: Text, Number (scale), Currency, Boolean, Date, Date/Time, Time (verify), Picklist, Multi-Select Picklist, **Record** (SObject), **Apex-Defined** (an Apex class with `@AuraEnabled` fields). **Allow multiple values (collection)**. **Available for input / output** (exposes it to callers) |
| **Constant** | A fixed Text, Number, Currency, Boolean, or Date value |
| **Formula** | Calculates at reference time. Same function library as formula fields (some exceptions, such as no `VLOOKUP`/`GETRECORDIDS`). Data types: Text, Number, Currency, Boolean, Date, DateTime, Time. In screen flows, formulas are **reactive** (they recalculate as users type) |
| **Text Template** | Rich text or plain text with merge fields. Used in email bodies, Display Text and Chatter posts. View as Rich Text or Plain Text. Winter '27 added a color picker |
| **Stage** | Legacy flow stage (not orchestration). Use `$Flow.CurrentStage` and `$Flow.ActiveStages` for path-style progress indicators in screen flows |
| **Choice** | A single static option (label + value) for choice components |
| **Collection Choice Set** | Choices generated from an existing record collection |
| **Record Choice Set** | Choices from a SOQL-like query on an object (filters, sort, limit, label/value fields, stored outputs) |
| **Picklist Choice Set** | Choices from a picklist field's values (respects record type when configured, verify), sort order, and "include null" |

**Global Flow Resources** (Summer '26): org-level reusable value mappings, managed in the Automation app (verify).

---

## 6. Global variables and system values

| Variable | Contents / notes |
|---|---|
| `$Record` | Triggering record (record-triggered), event message (platform event), or current record in a schedule-triggered flow with an object |
| `$Record__Prior` | Prior values on update (record-triggered) |
| `$Flow.CurrentDate`, `$Flow.CurrentDateTime` | Date and datetime when the value is referenced |
| `$Flow.InterviewStartTime` | When the interview started |
| `$Flow.InterviewGuid` | Unique interview identifier |
| `$Flow.FaultMessage` | Error text in fault paths |
| `$Flow.CurrentRecord` | Record Id context (verify availability by flow type) |
| `$Flow.CurrentStage`, `$Flow.ActiveStages` | Legacy Stage resources |
| `$User` | Running user's fields (Id, Email, ProfileId, UserRoleId, and others) |
| `$UserRole`, `$Profile` | Running user's role and profile fields |
| `$Organization` | Org fields (Id, Name, address, fiscal settings) |
| `$Permission` | Custom permissions: `{!$Permission.Bypass_Flow}` returns true if the user has it. This is the standard **bypass** pattern |
| `$Setup` | **Hierarchy custom settings**: `{!$Setup.Automation_Settings__c.Disable_Flows__c}` (resolves user → profile → org default) |
| `$Label` | Custom labels, which make text translatable |
| `$Api` | `Session_ID`, `Enterprise_Server_URL_xxx`, `Partner_Server_URL_xxx` |
| `$System.OriginDateTime` | 1900-01-01 00:00 (base date) |
| `$GlobalConstant` | `True`, `False`, `EmptyString` |
| `$Client` | Form factor (screen flows, verify) |
| `$Orchestration` | Orchestration context (stage/step outputs, verify) |
| `$CustomMetadata` | Read custom metadata type records directly in formulas and conditions (verify where this is supported; otherwise use Get Records on the `__mdt` object, which doesn't count toward SOQL limits) |

Note: `$Setup` gives custom setting values in formulas. **Get Records on Custom Metadata types does not count against the SOQL limit.**

---

## 7. Screen components

### 7.1 Standard components

| Category | Components |
|---|---|
| **Input** | Text, Long Text Area, Number, Currency, Date, Date & Time, **Time** (Winter '27, verify), Email, Phone, URL, Password, Checkbox, **Toggle**, **Slider**, Address, Name, Lookup, **Picklist**, **Multi-Select Picklist**, **Radio Buttons**, **Checkbox Group**, **Radio Button Group** (box-style, Summer '26), **Dependent Picklists**, **File Upload** |
| **Display** | Display Text (rich text, images; Summer '26 added static resource images), Display Image (verify), **Message** (Info/Warning/Error/Success, Spring '26), Section |
| **Data** | **Data Table** (select rows single/multi, column config, sort, search, inline edit (Spring '26), lookup display names as links (Summer '26)), **Repeater** (lets users add N sets of the same inputs and outputs a collection), **Kanban** (Spring '26, verify) |
| **Record fields** | Drag fields from a record variable onto the screen ("Dynamic Forms for Flow", "Fields" tab). Field metadata such as required/picklist values comes from the object |
| **Action** | **Action Button**: runs an autolaunched flow from the screen without navigating. Its outputs are reactive, so other components can use them, for example looking up data when a user picks an account (GA Summer '25/Winter '26, verify) |
| **Custom** | **LWC** with `lightning__FlowScreen` target. Properties are exposed via `@api` and targetConfig. Use `FlowAttributeChangeEvent` for reactivity and `FlowNavigationNextEvent`/`FinishEvent` for navigation. Validation goes through `@api validate()`. Aura components also work (legacy) |
| **AppExchange / UnofficialSF** | Datatable+, Quick Choice, and others |

### 7.2 Screen behaviors
- **Sections and columns:** Section component with up to 4 columns, collapsible with a header. On small form factors the columns stack.
- **Conditional visibility** ("Set Component Visibility"): show a component when conditions are true. Since Winter '27 the conditions can reference reactive formulas (verify).
- **Reactivity:** components can reference other components' outputs on the same screen (for example `{!AccountLookup.recordId}`), along with formulas, and Data Table selected rows. Not every component is reactive, so check the docs list.
- **Validate input:** per-component formula plus error message (Boolean formula, true = valid).
- **Required**, **default value**, **help text**, **Read only** / **Disabled** (on some components).
- **Manually assign variables (advanced)** vs automatic output (the component API name becomes the resource).
- **Revisited screen values:** "Use values from when the user last visited this screen" vs "Refresh inputs to incorporate changes elsewhere in the flow".
- Footer button labels can be customized. Hide Previous for one-way flows. **Pause** is disabled by default.
- Screen flows can show a **progress indicator** (Stage resources) in the Lightning Flow component config.

### 7.3 LWC flow screen component skeleton
```js
import { LightningElement, api } from 'lwc';
import { FlowAttributeChangeEvent, FlowNavigationNextEvent } from 'lightning/flowSupport';
export default class Picker extends LightningElement {
  @api selectedId;           // exposed in js-meta.xml targetConfig (role="outputOnly" optional)
  @api availableActions = [];
  handleChange(e) {
    this.selectedId = e.detail.value;
    this.dispatchEvent(new FlowAttributeChangeEvent('selectedId', this.selectedId));
  }
  @api validate() { return this.selectedId ? { isValid: true } : { isValid: false, errorMessage: 'Pick one' }; }
  next() { if (this.availableActions.includes('NEXT')) this.dispatchEvent(new FlowNavigationNextEvent()); }
}
```
`js-meta.xml` needs `<isExposed>true</isExposed>`, `<target>lightning__FlowScreen</target>`, and `<property name="selectedId" type="String" />` inside `targetConfig`.

---

## 8. Trigger order, order of execution, recursion

### 8.1 Flow Trigger Order
- Each record-triggered flow has a **Trigger Order** (1–2000) in Advanced settings or in Flow Trigger Explorer.
- Within the same object, context (before-save / after-save) and trigger event, flows run in ascending order. Flows **without** a value run after flows with values 1–1000 and before 1001–2000, ordered by created date (verify). Ties are broken by API name, then created date (verify).
- Order applies **within a phase**. All before-save flows run before any after-save flows.
- Async and scheduled paths don't follow trigger order the same way.

### 8.2 Save order of execution (simplified, on insert/update)
1. Load the original record (update) and set new values. System validation (for UI edits: layout-required fields, field formats, max length).
2. **Before-save record-triggered flows**.
3. **Before Apex triggers**.
4. System validation again, plus **custom validation rules**.
5. **Duplicate rules**.
6. Record saved to the database (not committed).
7. **After Apex triggers**.
8. **Assignment rules** → **Auto-response rules**.
9. **Workflow rules** (legacy). A workflow field update re-runs before/after update triggers **once more** (plus before-save flows? No. Before-save flows do *not* re-run; standard validation runs again (verify)).
10. **Escalation rules**.
11. **Process Builder processes** and flows launched by workflow (legacy).
12. **After-save record-triggered flows**.
13. **Entitlement rules**.
14. **Roll-up summary** fields recalculated on the parent. The parent then goes through its own save procedure.
15. Criteria-based sharing evaluation.
16. **Commit**.
17. Post-commit: emails sent, **Run Asynchronously paths**, async Apex enqueued (future/queueable), outbound messages, platform events "publish after commit".

### 8.3 Recursion
- An after-save flow updating `$Record` causes another save. Before-save flows and triggers re-run for that second save. Record-triggered flows are protected: a flow won't re-trigger itself for the same record more than once in a recursive save (the platform's flow recursion control allows **up to 5 recursive saves** per record per transaction (verify)).
- Prevent it with before-save for same-record updates, strict entry conditions ("only when updated to meet"), `Is Changed` checks, and custom-permission bypass.

---

## 9. Bulkification and governor limits

### 9.1 How Flow bulkifies
- In a single transaction with 200 records (for example a Data Loader batch), the platform runs **one interview per record**. It batches compatible DML and Get Records elements **across interviews at the same element**: 200 interviews reaching the same Get Records become 1 SOQL query where possible.
- Bulkification **breaks inside loops**. A Get Records or DML inside a Loop runs once per iteration, per interview.

### 9.2 Key limits (per transaction unless noted; Flow shares Apex limits)

| Limit | Value |
|---|---|
| SOQL queries | 100 (sync) / 200 (async) |
| Records retrieved by SOQL | 50,000 |
| DML statements | 150 |
| Records processed by DML | 10,000 |
| CPU time | 10,000 ms sync / 60,000 ms async |
| Heap | 6 MB sync / 12 MB async |
| Executed elements per interview | **No limit** since API v57.0 (Spring '23). Older versions are limited to 2,000 |
| Versions per flow | 50 |
| Active flows / total flows per org | Large edition-based limits (approximately 2,000 active per type and 4,000 total, verify) |
| Schedule-triggered interviews per 24 h | 250,000 or licenses × 200 (greater) |
| Callouts | 100 per transaction. **Not allowed after DML in the same transaction** unless it's in an async path or separate transaction |
| Flow error emails | One per failed interview |

### 9.3 Best practices
- **No DML or Get Records inside loops.** Instead, Loop → Assignment (modify the current item, then add it to a collection), then one Update/Create after the loop. Better still, use **Transform** or **Collection Filter** in place of manual loops.
- Prefer **before-save** for same-record field updates.
- Use **entry conditions** so the flow doesn't run unnecessarily, and use "only when updated to meet" for one-time actions.
- Get only the fields you need, filter in Get Records rather than with Decisions, and sort and limit in the query.
- **Null-check** Get Records results before using them.
- Add **fault paths** to every DML, action and Get element, with logging.
- Use **subflows** for reusable logic (an autolaunched flow called from a record-triggered flow is a common pattern, verify support of subflows in after-save record-triggered flows, which is GA).
- **Bypass mechanism:** check `$Permission.Bypass_Automation` or a `$Setup` custom setting in entry conditions or the first Decision.
- Hard-code nothing: use Custom Metadata, Custom Labels and `$Label`, and don't hard-code record type or queue Ids (Get them by DeveloperName).
- Name elements clearly and write descriptions. Use Einstein "explain" or the description generator.
- Use the async path for callouts and heavy non-critical work.

### 9.4 One flow per object vs many
| Approach | Pros | Cons |
|---|---|---|
| **One flow per object per phase** (e.g. `Account_BeforeSave`, `Account_AfterSave`) with Decisions routing to subflows | Predictable order, a single place to look, fits the older Process Builder mindset | Big flows that are hard to version, merge conflicts on teams, every change redeploys everything |
| **Many small flows** with tight entry conditions plus **Trigger Order** | Salesforce's current recommendation. Entry conditions keep them cheap, they're easy to own and deploy individually, and the Flow Trigger Explorer gives visibility | Need governance (naming, trigger order numbers, documentation) |
Current guidance: many focused flows with entry conditions and explicit trigger order, organized by Flow Trigger Explorer. **Don't mix a record-triggered flow and an Apex trigger on the same object/event without clear ownership.**

---

## 10. Launching flows

| Where | How |
|---|---|
| **Lightning record/app/home page** | Lightning App Builder **Flow** component. Pass `recordId` to a text input variable named `recordId` (or map it). Options to pass the record into a record variable and to show it on certain form factors. Also **Dynamic Actions** |
| **Quick Action** | Object → Buttons, Links, and Actions → New Action → Action Type **Flow** (screen flows). Auto-passes `recordId` if the flow has an input variable `recordId` |
| **Utility bar** | App Manager → Utility Items → **Flow** |
| **List view / related list mass action** | Screen flows in mass actions (Winter '27). Selected Ids go into an `ids` text collection input. From a related list it also passes the parent Id (verify) |
| **Custom button / link (URL)** | `/flow/Flow_API_Name?recordId={!Account.Id}&retURL=/{!Account.Id}`. For Lightning runtime use `/flow/...` (the old `/lightning/flow` path should not be used, verify) |
| **Experience Cloud** | Flow component in Experience Builder. Guest users need flow access via profile, and the flow often runs as System Context With Sharing. Multi-page Experience Flow (Spring '26, verify) |
| **Apex** | `Flow.Interview f = Flow.Interview.createInterview('My_Flow', new Map<String,Object>{'recordId'=>id}); f.start(); Object out = f.getVariableValue('outVar');`. Or the typed form `new Flow.Interview.My_Flow(params)` |
| **REST API** | `POST /services/data/vXX.0/actions/custom/flow/My_Flow` with body `{"inputs":[{"recordId":"001..."}]}` (autolaunched only) |
| **LWC / Aura / Visualforce** | `<lightning-flow flow-api-name="My_Flow" flow-input-variables={inputs} onstatuschange={h}>` · Aura `lightning:flow` · VF `<flow:interview name="My_Flow">` |
| **Subflow** | From another flow |
| **Process Builder / Workflow** (legacy) | Flow actions in processes. Workflow "flow trigger" was a pilot |
| **Email** | No native "email launches flow". Use Email-to-Case or an Email Service (Apex) → record → record-triggered flow, or send a link to a screen flow URL in an email |
| **Slack** | Slack-enabled screen flows and Slack actions (verify) |
| **Agentforce** | Autolaunched flow as an agent action, flows referenced from Prompt templates (template-triggered) |
| **Orchestration / Approvals** | Interactive/approval steps assign screen flows, and background steps run autolaunched flows |
| **Einstein Bots / Omni-Channel** | Bots call autolaunched flows. Omni-Channel routing flows (special type) route work items |

`retURL` / finish behavior: in Lightning, set the destination with a URL in the button, with the **Open a Page** action (Summer '26), or with LWC navigation.

---

## 11. Approvals

### 11.1 Classic Approval Processes (Setup → Process Automation → Approval Processes)
Wizards: **Jump Start Wizard** (simple defaults) or **Standard Setup Wizard**.

**Setup steps (Standard wizard):**
1. **Name and description** (+ unique name).
2. **Entry criteria**: criteria are met (field filters) or a formula evaluates to true. Records that don't match can't be submitted.
3. **Approver field and record editability**: "Next Automated Approver Determined By" (a hierarchical user field such as Manager, or a custom hierarchy lookup). "Administrators ONLY can edit records during the approval process" vs "Administrators OR the currently assigned approver can edit". While pending, the record is **locked**.
4. **Notification email template** for approval requests.
5. **Approval page layout fields** and whether to show approval history there, plus **security settings** (allow approvers to use the mobile/email response page).
6. **Initial submitters**: who may submit (Record Owner, creator, roles, groups, users…), and whether submitters can **recall**.

**Approval steps** (step 1..n):
- Step name, step number, **step criteria** (all records enter, or criteria/formula; else **approve** or **reject** the record, or skip to the next step).
- **Assign approver**: "Let the submitter choose the approver manually", "Automatically assign using the field selected earlier" (Manager), or "Automatically assign to approver(s)": users, queues, or related user fields, with **"Approve or reject based on the FIRST response"** or **"Require UNANIMOUS approval"**.
- **Delegated approvers**: if allowed, a user's **Delegated Approver** (set on the User record) can also approve.
- **Reject behavior** for steps after the first: "Perform ONLY the rejection actions for this step and send the approval request back to the most recent approver" vs "Perform all rejection actions for this step AND all final rejection actions (Final Rejection)".

**Actions** (each can be Field Update, Email Alert, Task, Outbound Message):
| Stage | Default action |
|---|---|
| **Initial Submission Actions** | **Record Lock** (locked) |
| Step Approval / Step Rejection Actions | Per step |
| **Final Approval Actions** | Record Lock (stays locked, can be changed to unlock) |
| **Final Rejection Actions** | Record **Unlock** |
| **Recall Actions** | Record **Unlock** |

**Activation and usage:**
- You must **activate** an approval process. Once active, you can't add or remove steps (clone it instead). **Process Order** decides which process a record enters first (the first match wins).
- Submit with a **Submit for Approval** button on the layout or from the **Approval History** related list, the Flow "Submit for Approval" core action, Apex `Approval.ProcessSubmitRequest`, or automatically from a flow or (legacy) process.
- Approvers act through **Items to Approve** (Home component / list), the **Approval History** related list (Approve/Reject/Reassign), Chatter approval posts, email approval response (reply APPROVE/REJECT, needs "Enable email approval response"), or the mobile app.
- Objects: `ProcessInstance`, `ProcessInstanceStep`, `ProcessInstanceWorkitem`, `ProcessInstanceHistory`, `ProcessDefinition`. Unlock or lock with Apex `Approval.lock()/unlock()`. "Allow Lock/Unlock via Apex" lives in Process Automation Settings.
- Limits: approval processes per object (~300 total/1,000 per org, verify), 30 steps per process, 25 approvers per step.

### 11.2 Flow Approval Processes ("Approval Orchestration")
- GA **Spring '25**, enhanced in Summer '25, Winter '26, Spring '26 and Summer '26. It's built on Flow Orchestration. Orchestration became standard (no add-on) in 2026, and approval orchestrations don't consume orchestration runs (verify).
- **Types:** **Record-Triggered Approval Process** (starts on create/update with criteria) and **Autolaunched Approval Process** (submitted by the **Request Approval** Lightning component (on record pages since Spring '26), a flow action, Apex, or REST).
- **Structure:** Stages → **Approval Steps** (approve/reject screen work items) and **Background Steps** (autolaunched flows for field updates, emails, locking). Decisions between stages. Supports **parallel** approvals (multiple steps in a stage) and **sequential** ones.
- **Approvers:** user, queue, group, or a **resource** (for example a variable from a Get Records, Winter '26 "Resource" assignee type). Dynamic approvers come from flow logic. Approval by first response is supported (verify unanimous options).
- **Submission objects:** `ApprovalSubmission`, `ApprovalSubmissionDetail`, `ApprovalWorkItem` (verify names), plus the **Approval Trace** component on the record page to show progress and history. Users work items in the **Approvals** Lightning app / "My Approvals" list (verify) and get email/bell notifications.
- **Recall**, **reassign**, comments, and **record locking** are available through standard actions in background steps ("Lock Record"/"Unlock Record" actions, verify).
- **Debugging:** in Flow Builder since Winter '26 (set step outputs, disable rollback). Since Spring '26 you can complete work items on the canvas.
- **When to choose which:** use Flow Approvals for multi-object, dynamic approvers, parallel steps, complex branching, and integration with other flows. Classic is still fine for simple, stable, single-object approvals with no migration need. There's **no automatic migration tool** for classic approvals to Flow Approvals (verify).

---

## 12. Other declarative automation

### 12.1 Assignment rules (Lead, Case)
- Setup → Lead Assignment Rules / Case Assignment Rules. **Only one rule can be active** per object. Each rule has ordered **rule entries** (criteria or formula → assign to a user or queue, optional email template, and for Case "Do Not Reassign Owner").
- They fire on: Web-to-Lead/Web-to-Case, Email-to-Case, the "Assign using active assignment rule" checkbox on the edit page (can be default-checked on the layout), Data Import Wizard/Data Loader (option), and Apex/API through `Database.DMLOptions.assignmentRuleHeader.useDefaultRule = true` (or the `AssignmentRuleHeader` SOAP header). **Records created in Flow don't use assignment rules by default.** You need an invocable action or Apex that sets DMLOptions (verify whether there's a native Flow option).

### 12.2 Auto-response rules (Lead, Case)
- Sends an email template to the submitter from Web-to-Lead, Web-to-Case, or Email-to-Case. One active rule per object. Entries are criteria → template + from address. **The first matching entry wins.**

### 12.3 Escalation rules (Case only)
- One active rule. Entries have criteria plus **Business Hours** handling plus "How escalation times are set" (case created / created unless modified / most recent modification).
- Each entry has **escalation actions** at an age (hours): auto-reassign to a user or queue, notify a user, notify the case owner, using an email template.
- Monitor in Setup → **Case Escalations** queue (time-based).

### 12.4 Workflow Rules (retired)
- **End of support: 31 Dec 2025.** You can't create new rules (creation was disabled earlier, around Winter '23). Existing active rules **still execute**, but Salesforce provides no bug fixes or support. You can still edit or deactivate existing ones (verify edit ability).
- Components: evaluation criteria (created; created and every time edited; created and any time edited to subsequently meet criteria), rule criteria, **immediate actions** and **time-dependent actions** (time triggers, monitored in Time-Based Workflow).
- Actions: **Field Update**, **Email Alert**, **Task**, **Outbound Message** (Flow trigger was a pilot).

### 12.5 Process Builder (retired)
- Same end-of-support date. You can't create new processes (create was blocked around Winter '23 or Summer '23). Existing processes run.
- Each process compiled to a flow (process type "Workflow" / `InvocableProcess`), with criteria nodes, immediate and scheduled actions. Well known for poor bulk performance and recursion, which is why one process per object was the old best practice.

### 12.6 Migrate to Flow tool
- Setup → **Migrate to Flow**. Lists Workflow Rules and Process Builder processes. Select one → **Migrate to Flow** → it creates an **inactive** record-triggered flow → **Test in Flow Builder** → **Switch Activations** (deactivates the old rule or process and activates the flow in one step).
- Supports Workflow Rules (field updates, email alerts, outbound messages, time-dependent actions → scheduled paths) and **Process Builder** (Summer '23+), including multiple criteria nodes. Some actions aren't supported (for example certain formula patterns or actions such as Quip, which need manual rework).
- It doesn't consolidate several rules into one flow. You decide whether to merge. Re-check trigger order afterwards.
- Workflow field updates that triggered re-evaluation ("Re-evaluate workflow rules after field change") don't have an exact Flow equivalent.

### 12.7 Reusable action types (shared by Workflow, Approvals, Flow)
| Action | Notes |
|---|---|
| **Email Alert** | Setup → Email Alerts: object, **email template**, recipients (users, roles, groups, owner, related contacts/users, email fields, up to 5 additional addresses), from address (current user or org-wide). Callable from Flow as an Action. Daily limit is about 2,000,000 alerts per org, and external recipient limits apply (verify) |
| **Field Update** | Workflow and approval actions only: set a value, formula, or picklist next/previous. "Re-evaluate workflow rules" option. In Flow, use Assignment/Update instead |
| **Task** | Creates a task (workflow/approval) |
| **Outbound Message** | SOAP message to an endpoint URL with selected fields and the session Id option. It retries for up to 24 h with exponential backoff, is monitored in **Outbound Messages** delivery status, and the endpoint must ACK. Not available as a native Flow action. From Flow, use HTTP Callout, External Services, or Platform Events. You can't send one from a record-triggered flow except through an approval or legacy workflow (verify any new support) |
| **Send Email** (Flow core action) | Ad-hoc email from Flow. Can use templates (Summer '26 references templates by name, not Id, so they survive deployment), set recipients, and log to activity. Counts toward single email limits |

---

## 13. Platform Events and Change Data Capture

### 13.1 Platform Events
- Custom event objects end in `__e`. Fields only, no records stored in a queryable table (retention is 72 h for high-volume events in the event bus).
- **Publish behavior:** **Publish After Commit** (only published if the transaction commits, which suits most cases) or **Publish Immediately** (published even if the transaction rolls back, which suits logging).
- **Publish from:** Flow Create Records on the `__e` object, Apex `EventBus.publish()`, APIs, Process Builder (legacy).
- **Subscribe with:** **Platform Event-Triggered Flows**, Apex triggers (`after insert`), the **Wait for Conditions** element in flows (resume on event), LWC `lightning/empApi`, CometD / Pub/Sub API (external), event relays to AWS EventBridge.
- **Limits:** hourly publish and daily delivery allocations depend on edition and add-ons. Standard volume vs high volume (all new events are high volume).
- Standard events exist too, for example `BatchApexErrorEvent`, `FlowExecutionErrorEvent` (flow error events, verify), and Real-Time Event Monitoring events.

### 13.2 Change Data Capture (CDC)
- Setup → **Change Data Capture**: select standard or custom objects. It publishes **change events** (`AccountChangeEvent`, `MyObj__ChangeEvent`) on create, update, delete, and undelete. The `ChangeEventHeader` holds changeType, changedFields, recordIds, commitUser and transactionKey.
- Subscribe with **Apex change event triggers** (`trigger X on AccountChangeEvent (after insert)`), Pub/Sub API, CometD, or Data Cloud. Record-triggered flows can't subscribe to CDC. Use platform-event flows or Apex (verify whether CDC events are selectable in PE-triggered flows; they generally aren't).
- Default allocation: 5 entities selected without an add-on (verify). Events retained 72 h.
- **Use CDC for** syncing record changes to external systems. **Use custom Platform Events for** business events with custom payloads.

---

## 14. Scheduled automation options

| Option | Scheduling | Strengths | Limits / notes |
|---|---|---|---|
| **Schedule-Triggered Flow** | Once/Daily/Weekly at a time | Declarative. Batches records with a filter. Custom batch size (Summer '26) | No monthly or cron schedule (workaround: daily plus a Decision on the day). Daily interview cap. Runs as Automated Process user |
| **Scheduled Path** (record-triggered) | Relative to a record event or date field | Per-record timing. Cancels if criteria are no longer met | Needs the right entry condition config |
| **Wait elements** | Interview pauses | Mid-process waits | Not in record-triggered flows |
| **Scheduled Apex** (`Schedulable`) | Cron expression (`System.schedule('Job','0 0 2 * * ?', new MyJob())`) or UI (Weekly/Monthly) | Full control. Can chain Batch Apex for millions of records | Max **100** scheduled Apex jobs. Needs code and tests (75% coverage) |
| **Batch Apex** | Started by schedule or code | Up to 50M records via QueryLocator, scope of 1–2,000 | 5 concurrent batch jobs (plus flex queue of 100) |
| **Time-based Workflow** (legacy) | Time triggers | — | Retired |

---

## 15. Flow testing

### 15.1 Flow Tests (declarative)
- Supported for **record-triggered flows** (originally), plus support for autolaunched and schedule-triggered flows in recent releases (verify current list).
- Create from Flow Builder → **View Tests → New Test** (or convert a debug run). Define the **trigger** (created/updated/deleted, path: immediate/scheduled), the **initial triggering record** (pick a record or set field values), the **updated triggering record** values (for update tests), and **assertions** (conditions on `$Record` or resources, plus a custom failure message).
- Run from Flow Builder, Setup → **Flows → (Flow Tests)**, or CLI `sf flow run test` / `sf project deploy ... --test-level` (Flow tests can count for flow coverage, verify). Metadata type: `FlowTest`.
- Winter '27 adds **Flow Test Mode (beta)**: a separate Build/Test mode with **mock outputs** (mock Get Records/actions), test scenarios, assertions, and **coverage tracking** (enable in Process Automation Settings) (verify).
- Limitation (historic): Flow tests can't test flows with certain elements, and data must exist in the org (tests use real records but roll back).

### 15.2 Apex tests for flows
- Insert or update records in `@isTest` methods to fire record-triggered flows, then assert the results. `Test.startTest()/stopTest()` forces async paths to complete (verify for async paths; scheduled paths aren't executed by tests).
- **Flow test coverage for deployment:** if "Deploy processes and flows as active" is on, active autolaunched and record-triggered flows need **75%** coverage via Apex tests (and Flow tests, verify). Query `FlowTestCoverage` and `FlowElementTestCoverage` in the Tooling API.

---

## 16. Monitoring, errors, interviews

### 16.1 Flow error emails
- Unhandled faults send a "Flow Error: An unhandled fault has occurred" email with interview details (an element-by-element trace).
- Setup → **Process Automation Settings** → "Send Process or Flow Error Email to": **User who last modified the flow or process** (default) or **Apex exception email recipients** (Setup → Apex Exception Email).
- Screen users see "An unhandled fault has occurred in this flow" unless there's a fault path. Customize it with a fault screen.

### 16.2 Paused and failed interviews
- Setup → **Paused and Failed Flow Interviews**: list paused interviews (Wait elements, user-paused screen flows) and failed interviews (verify which failures are kept). You can **Resume** (for some types) or **Delete** them.
- Waiting interviews from scheduled paths and Waits can be deleted here, for example after a logic change.
- Process Automation Settings: "Let users pause flows", "Show details of what's executed…", "Enable Flow Run logging / persistent logging" (Winter '26 for record-triggered and PE flows, verify), and "Use Flow Run reports" (`FlowRun`, `FlowElementRun` report types, Winter '26, verify).

### 16.3 Other monitoring
- **Debug logs** (category Workflow at FINER/FINEST shows flow element execution).
- **Flow error rate** and **element error rate** columns in Flow list views (Summer '26).
- **Automation app → Automation Home / Lightning Usage:** run counts, errors, an analytics dashboard (Tableau Next integration Winter '26, verify).
- **Event Monitoring:** Flow execution event types (Shield).
- `FlowInterview`, `FlowInterviewLog`, `FlowInterviewLogEntry` objects (Flow Interview Log via persistent logging, verify).

---

## 17. Automation Lightning App / Automation Home

- **Automation** app (App Launcher → Automation) is the modern home for flows. It has a **Flows** list (Lightning list views with filters such as Type, Active, Triggering Object, Last Modified, error rate, and Tags (Winter '27)), plus **New Flow**, folders/collections (verify), and templates.
- **Automation Home** (Setup → Process Automation → Automation Home, or the app home): org automation overview, error trends, **flow usage and analytics**, quick links to Migrate to Flow, Flow Trigger Explorer, and Paused/Failed interviews (verify layout).
- **Flow Templates:** prebuilt flows by industry or cloud. Set "Template" in properties to make your own.
- **Global Flow Resources** (value mappings) managed here (Summer '26, verify).

---

## 18. Flow Orchestration (details)

- **What:** a "flow of flows". It coordinates **stages** and **steps** across users, groups, queues and systems over days or weeks, with work items and history.
- **Types:** Record-Triggered Orchestration, Autolaunched Orchestration. The approval types (§11.2) are specialized orchestrations.
- **Licensing:** previously a paid add-on (with 600 free runs/year). Orchestration became a **standard flow type in early 2026** (around Feb 2026 / Summer '26) and no longer sits behind an add-on (verify edition limits).
- **Work items:** `FlowOrchestrationWorkItem`. Assignees see them on the record page through the **Orchestration Work Guide** Lightning component, and in the work item lists in the Automation app. They're notified by email.
- **Monitoring:** Orchestration Runs (`FlowOrchestrationInstance`, `FlowOrchestrationStageInstance`, `FlowOrchestrationStepInstance`) in the Automation app or Setup, where you can cancel runs and reassign work items.
- **Evaluation flows** for custom stage/step entry and exit criteria.
- **Debug:** Winter '26 brought debug support. Spring '26 lets you complete interactive steps on the canvas.
- **Use cases:** onboarding, quote-to-cash handoffs, multi-department approvals, case resolution with parallel tasks.

---

## 19. Einstein / Agentforce in Flow

- **Agentforce for Flow** / Einstein for Flow (Flow Builder sparkle icon): describe a flow in natural language to generate a draft (record-triggered, screen flows), **edit an existing flow by prompt** (verify), generate **formulas** from a description, **explain** a flow, and summarize changes for **descriptions**. Requires Einstein generative AI enabled and the right permissions (Data Cloud may be needed, verify).
- **Prompt Template actions:** invoke Prompt Builder templates as Flow actions (for example to summarize or draft an email). Outputs are text or JSON.
- **Template-Triggered Prompt Flow:** provides grounding data to templates.
- **Agent Actions:** autolaunched flows (and invocable Apex) become actions in Agentforce Builder. Good descriptions on the flow, the variables, and "Available for input/output" are critical because the agent uses them to choose and fill the action.
- **Generative AI in Decision elements** (Winter '26): AI-evaluated outcome conditions (verify).

---

## 20. Common recipes

**A. Set a field before save**
Record-Triggered (Opportunity, created or updated, Fast Field Updates) → Decision `StageName = Closed Won` → Assignment `$Record.Closed_Date__c = {!$Flow.CurrentDate}`. There's no Update element and no DML.

**B. Update child records (bulk-safe)**
After-save Account, entry: `Industry` Is Changed → Get Records Contacts where AccountId = `$Record.Id` → (Transform or Loop+Assignment) set `Industry__c` → **Update Records (collection)** after the loop.

**C. Validation from flow**
Before-save → Decision (Discount > 30% and no approval) → **Custom Error** "Discount over 30% needs approval" on the field `Discount__c`.

**D. Reminder 3 days before close**
After-save Opportunity → Scheduled Path: 3 **Days Before** `CloseDate` → Send Email / Custom Notification. Entry: created, or updated to meet `IsClosed = false`.

**E. Callout after save**
After-save → **Run Asynchronously** path → HTTP Callout action (named credential) or External Services action.

**F. Screen flow with lookup-driven defaults**
Screen: Lookup (Account) → **Action Button** calling an autolaunched "Get Account Details" flow → other fields default reactively to `{!ActionButton.Results.Phone}` (verify output syntax).

---

## 21. Metadata, deployment and DevOps notes

- Metadata types: `Flow` (a version, keyed by API name plus `-N` in older retrieves), `FlowDefinition` (active version, legacy), `FlowTest`, `FlowCategory`/Tags (verify), and `ApprovalProcess` (classic: `Object.ApprovalName`), `AssignmentRules`, `AutoResponseRules`, `EscalationRules`, `Workflow` (rules, alerts, field updates, outbound messages), `PlatformEventChannel`, `PlatformEventChannelMember` (CDC selection).
- The `<status>` element in Flow metadata is Active / Draft / Obsolete / InvalidDraft.
- Deploying an active flow to production creates a **new version** and activates it if allowed. Paused interviews keep their version.
- Change sets include flows (the latest version). Use the **Dependencies** view first.
- Package flows: protected vs unprotected templates in managed packages (subscribers can't edit protected flows).

---

## 22. Process Automation Settings (Setup → Process Automation Settings)

| Setting | Effect |
|---|---|
| Default Workflow User | The user who runs time-based workflow and scheduled actions when the original user is inactive |
| Send Process or Flow Error Email to | Last modifier of the flow, or Apex exception email recipients |
| Let users pause flows | Shows the Pause button in screen flows |
| Let admins debug flows as other users | Enables "Run flow as another user" in Debug |
| Show details of what's executed (debug) | Debug detail rendering |
| Deploy processes and flows as active | Allows active deployment to production (requires coverage) |
| Use Lightning runtime for flows | Legacy toggle for classic orgs |
| Enable Flow Test Mode (beta, Winter '27) | Build/Test mode in Flow Builder (verify) |
| Persistent flow logging / Flow run tracking | Stores run logs for reporting (verify name) |
| Allow Lock/Unlock via Apex (approvals) | `Approval.lock()` / `Approval.unlock()` |

## 23. Useful flow formula and condition snippets

```
/* Opportunity aging (Number) */
TODAY() - DATEVALUE({!$Record.CreatedDate})

/* Changed and now Closed Won (record-triggered entry formula) */
AND(ISCHANGED({!$Record.StageName}), TEXT({!$Record.StageName}) = "Closed Won")

/* Bypass check (Boolean) */
OR({!$Permission.Bypass_Automation}, {!$Setup.Automation_Settings__c.Disable_Flows__c})

/* Next business-ish day (Date) */
CASE(WEEKDAY({!$Flow.CurrentDate}), 6, {!$Flow.CurrentDate} + 3, 7, {!$Flow.CurrentDate} + 2, {!$Flow.CurrentDate} + 1)

/* Record URL for emails (Text) */
LEFT({!$Api.Partner_Server_URL_580}, FIND('/services', {!$Api.Partner_Server_URL_580})) & {!$Record.Id}
```

Notes:
- Picklists in formulas need `TEXT()`, or `ISPICKVAL()`.
- Entry-condition formulas reference fields as `{!$Record.Field}`, with `ISNEW()`, `ISCHANGED()` and `PRIORVALUE()` available.
- Collection checks: use `Is Empty` in Decisions, or the Assignment "Equals Count" operation into a Number variable.

## 24. Apex ↔ Flow interop

```apex
public with sharing class AccountScorer {
  public class Req { @InvocableVariable(required=true) public Id accountId; }
  public class Res { @InvocableVariable public Integer score; }
  @InvocableMethod(label='Score Account' description='Returns a score' category='Scoring')
  public static List<Res> run(List<Req> reqs) {   // one call per batch of interviews: bulkify!
    List<Res> out = new List<Res>();
    for (Req r : reqs) { Res x = new Res(); x.score = 42; out.add(x); }
    return out;                                    // same size and order as input
  }
}
```
- One `@InvocableMethod` per class. Input is a `List<T>`, and the output list must match the input's size and order.
- Flow batches interviews into one invocable call, so the method **must be bulk-safe**.
- `callout=true` on the annotation tells Flow that the action makes callouts. This affects transaction handling in screen flows.
- Apex-defined variable types: a class with `@AuraEnabled` public fields, usable as a Flow variable (for example a parsed JSON response).
- Starting a flow from Apex: `Flow.Interview.createInterview(apiName, inputs).start()`. This runs synchronously in the same transaction (only autolaunched flows).

---

## Gotchas / common confusions

- **Run vs Debug:** **Run** commits real data. Use **Debug** (rollback) when testing in shared sandboxes or production.
- **Before-save can't do DML or actions.** If you need related records, an email, or a subflow, you need after-save. Updating `$Record` in after-save costs DML and causes recursion.
- **"Only when a record is updated to meet the condition requirements"** fires only on the false→true transition. It's required for scheduled paths (unless the trigger is create-only), and it's the cure for repeat emails.
- **`$Record__Prior` is null on create**, so guard comparisons. `Is Changed` exists only in record-triggered flows.
- **Get Records returns null**, not an error, when nothing matches, so always check with a Decision (`Is Null` = False). With "All records" you get an empty collection, which is not null in some contexts (check with `Is Empty`, verify).
- **DML or Get inside a Loop** is the #1 cause of `Too many SOQL queries: 101` / `Too many DML statements: 151`.
- **Callouts after DML in the same transaction fail** ("You have uncommitted work pending"). Use the async path or a separate screen transaction.
- **Scheduled paths and async paths run as a different user/context**, and the record may have changed by then. Re-query when needed.
- **Schedule-triggered flows with an object run one interview per record**. Don't put another Get Records for all records inside them, or you'll process N² records.
- **Trigger order only orders flows within a phase.** It can't put an after-save flow before a before-save flow, and it doesn't order Apex triggers relative to flows. Before-save flows always run before before-triggers.
- **Workflow and Process Builder still run after 31 Dec 2025.** "End of support" doesn't mean they're shut off, but you get no bug fixes, and you can't create new ones. Migrate with **Migrate to Flow**, then **Switch Activations**.
- **The Migrate to Flow tool creates one flow per rule/process.** Consolidation and trigger order are up to you.
- **Assignment rules don't fire for records created by Flow** unless you set DMLOptions via Apex or an invocable action (verify any new native option).
- **Outbound Messages aren't a native Flow action.** Use HTTP Callout, External Services, or Platform Events instead.
- **The active version is read-only.** "Save" on an active flow forces Save As New Version. You can have max 50 versions per flow.
- **Paused interviews pin to their version.** Deleting a version isn't possible while interviews use it, and you have to delete waiting interviews first.
- **Screen flow run context:** screen flows default to user context. System Context Without Sharing in Experience Cloud guest flows can expose data. Prefer "With Sharing".
- **A `recordId` variable must be named exactly `recordId`** (case-sensitive, Text, Available for input) for auto-passing from Lightning pages and quick actions.
- **Classic approval processes:** once active, you can't add or remove steps (clone instead). Records are locked during approval, and only admins (or approvers, if set) can edit them.
- **Flow Approvals ≠ Classic Approvals.** They use different objects (ApprovalSubmission/ApprovalWorkItem vs ProcessInstance), different UIs (Approval Trace vs Approval History), and there's no auto-migration. "Items to Approve" shows classic approvals.
- **Orchestration** is no longer a paid add-on as of 2026 (verify your edition). Older docs mention a 600 runs/year limit that is now obsolete.
- **Wait elements can't go in record-triggered flows.** Use scheduled paths, or launch an autolaunched subflow from the async path (verify whether pausing in async subflows is allowed; generally no).
- **CDC events can't trigger record-triggered flows.** Use Apex change-event triggers (or PE-triggered flows for custom platform events).
- **Platform event "Publish Immediately"** survives rollback, which is good for logging. "Publish After Commit" doesn't publish if the transaction fails.
- **Custom Error rolls back the whole save.** In after-save flows any DML already done in that transaction is rolled back too.
- **Flow formulas recalculate every time they're referenced.** `$Flow.CurrentDateTime` in a loop returns different values.
- **The 2,000-element limit is gone** for API v57+ flows, but CPU time (10 s) still applies, and big loops hit it.
- **Debug "run as another user"** must be enabled in Process Automation Settings. You also can't run as users without the Run Flows / flow access.
- **New 2026 features** (Split by Field Value/Date, Group, Test Mode, Time component, Kanban, Message, Radio Button Group, Multi-page Experience Flow, Global Flow Resources) may be beta or limited by edition. Check the release notes for your org's release (verify).
