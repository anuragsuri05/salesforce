# Salesforce Data Model & Declarative Customization

**What this file covers:** Standard and custom objects, Object Manager sections, every field type with its limits, relationships, formulas, and validation rules.
UI customization: page layouts, Lightning App Builder (Dynamic Forms, Actions, Related Lists), record types, compact layouts, quick actions, buttons, tabs, apps, and Path.
Data quality and data platform features: duplicate/matching rules, Big Objects, External Objects, Custom Metadata vs Custom Settings, data import tools, field history, and ownership/queues.

> Currency note: limits shown are typical Enterprise/Unlimited Edition defaults as of the Winter '27 (Oct 2026) timeframe. Items marked **(verify)** change between releases or depend on edition/support enablement. Always check Setup > Object Manager > [Object] > Object Limits for the actual org values.

---

## 1. Core concepts & vocabulary

| Term | Meaning |
|---|---|
| Object (sObject) | A database table. Standard objects ship with Salesforce; custom objects end in `__c`. |
| Record | A row. Each has an 18-char case-insensitive Id (15-char case-sensitive form also used in the UI). |
| Field | A column. Custom fields end in `__c`; relationship names end in `__r` (for traversal in formulas/SOQL). |
| Key prefix | First 3 chars of the Id identify the object (`001` Account, `003` Contact, `00Q` Lead, `006` Opportunity, `500` Case, `005` User, `701` Campaign, `01t` Product2, `01s` Pricebook2, `01u` PricebookEntry, `0Q0` Quote, `800` Contract, `801` Order, `02i` Asset, `00T` Task, `00U` Event, `069` ContentDocument, `068` ContentVersion, `00G` Group/Queue, `012` RecordType, `00e` Profile). |
| API name vs label | Label is shown to users and can be translated; API name is used in code, formulas, integrations and must be unique. Changing a label is safe; changing an API name can break references (Salesforce blocks it if referenced by Apex/VF in many cases). |
| Namespace prefix | Managed package components carry `ns__Field__c`. |
| Suffixes | `__c` custom, `__r` relationship, `__x` external object, `__b` big object, `__mdt` custom metadata type, `__e` platform event, `__Share` sharing table, `__History` history table, `__Feed` feed, `__ChangeEvent` CDC, `__pc` person-account contact field (on Account), `__kav` knowledge article version, `__latitude__s/__longitude__s` geolocation components. |
| Setup entry points | Object Manager (Setup gear > Object Manager or Setup > Objects and Fields); Schema Builder; App Manager; Lightning App Builder; Tabs; Picklist Value Sets; Duplicate Management; Data Import Wizard; Custom Metadata Types; Custom Settings. |

---

## 2. Standard objects (Sales & Service)

### 2.1 Key objects at a glance

| Object | API | Purpose | Key relationships / notes |
|---|---|---|---|
| Account | `Account` | Company (B2B) or individual (Person Account) | `ParentId` self-lookup (Account hierarchy); owner of Contacts, Opportunities, Cases, Contracts, Orders, Assets. |
| Contact | `Contact` | Person associated with an Account | `AccountId` (lookup with special behavior: a "private" contact has no Account and is visible only to owner/admins); `ReportsToId` self-lookup; Contacts to Multiple Accounts uses `AccountContactRelation` (junction). |
| Lead | `Lead` | Unqualified prospect | Converted via Lead Conversion into Account + Contact (+ optional Opportunity). After conversion, Lead is read-only (`IsConverted = true`, `ConvertedAccountId/ContactId/OpportunityId`). Custom lead fields map to Account/Contact/Opportunity fields via "Map Lead Fields". |
| Opportunity | `Opportunity` | Potential deal | `AccountId` lookup; `StageName` (driven by Sales Process) with `Probability`, `ForecastCategoryName`; `Pricebook2Id`; children `OpportunityLineItem` (products), `OpportunityContactRole`, `OpportunityTeamMember`, `OpportunityCompetitor`, `OpportunityHistory` (stage history). |
| Case | `Case` | Customer issue | `AccountId`, `ContactId`, `AssetId`, `ParentId` (case hierarchy), `EntitlementId`; `Status` driven by Support Process; children `CaseComment`, `EmailMessage`, `CaseTeamMember`; assignment/escalation/auto-response rules; Web-to-Case, Email-to-Case. |
| Campaign | `Campaign` | Marketing initiative | `ParentId` hierarchy (up to 5 levels); `CampaignMember` junction links Campaign to Lead or Contact (or Person Account); `CampaignInfluence`. Roll-up hierarchy stats (e.g., `NumberOfLeads`, `AmountAllOpportunities`). Users need "Marketing User" checkbox to create campaigns. |
| Product | `Product2` | Item/service sold | `IsActive`, `Family`, `ProductCode`; used by PricebookEntry, Asset, OpportunityLineItem, QuoteLineItem, OrderItem. |
| Price Book | `Pricebook2` | List of prices | Exactly one **Standard Price Book** (`IsStandard = true`); custom price books for segments/regions. |
| Price Book Entry | `PricebookEntry` | Junction Product2 × Pricebook2 (× currency) | `UnitPrice`, `UseStandardPrice`, `IsActive`. A product needs a standard price entry before it can be added to a custom price book. Unique per Product + Pricebook + CurrencyIsoCode. |
| Opportunity Product | `OpportunityLineItem` | Product line on an Opportunity | References `PricebookEntryId`; Opportunity `Amount` becomes read-only sum of line items once products exist. Product schedules (quantity/revenue) optional. |
| Quote | `Quote` | Formal price proposal | Child of Opportunity (master-detail-like); `QuoteLineItem`; one quote can be **synced** with its Opportunity at a time (line items sync both ways). Quote templates generate PDFs. Must be enabled. |
| Contract | `Contract` | Agreement with an Account | `AccountId` required; `Status` (Draft, In Approval Process, Activated); `StartDate`, `ContractTerm` (months). |
| Order | `Order` | Confirmed request for products | `AccountId` required; `ContractId` optional unless "Require contracts on orders" setting; `Pricebook2Id`; children `OrderItem`. Status categories Draft/Activated. Must be enabled. |
| Asset | `Asset` | Product a customer owns | `AccountId` and/or `ContactId`, `Product2Id`, `ParentId`/`RootAssetId` hierarchy; `AssetRelationship`. Linked to Cases, Entitlements, Work Orders. |
| Task | `Task` | To-do, call log, email log | Activity object. `WhoId` (Lead or Contact — polymorphic), `WhatId` (Account, Opportunity, Case, Campaign, custom objects with activities allowed, etc.), `Status`, `Priority`, `ActivityDate`, `TaskSubtype` (Call, Email, Task, ListEmail, Cadence). |
| Event | `Event` | Calendar meeting | Same Who/What model; `StartDateTime`, `EndDateTime`, `IsAllDayEvent`; invitees via `EventRelation`; recurring events. |
| Activity | (virtual) | Parent concept of Task + Event | Custom activity fields are created once under "Activity" and are shared by Task and Event. Read-only views: `OpenActivity`, `ActivityHistory`. **Shared Activities** lets one Task/Event relate to up to 50 Contacts (`TaskRelation`/`EventRelation`); once enabled, can't be disabled. |
| User | `User` | A login / license holder | `ProfileId`, `UserRoleId`, `ManagerId` (hierarchical relationship), `IsActive`; users can't be deleted, only deactivated/frozen. |
| ContentDocument | `ContentDocument` | A Salesforce File (logical) | Has one or more `ContentVersion` rows (actual binary + version); shared to records/users/libraries via `ContentDocumentLink` (`LinkedEntityId`, `ShareType` V/C/I, `Visibility`). Libraries = `ContentWorkspace`. Replaces legacy `Attachment` and Notes & Attachments; Enhanced Notes = `ContentNote`. |
| ContentVersion | `ContentVersion` | Binary version of a file | Insert a ContentVersion to create a new file (ContentDocument auto-created); set `ContentDocumentId` to add a new version. File size up to 2 GB via UI/API (verify for specific API). |
| Individual | `Individual` | Data privacy/consent record | Linked from Lead/Contact/Person Account (`IndividualId`). |
| Entitlement / ServiceContract | `Entitlement`, `ServiceContract`, `ContractLineItem` | Service Cloud support terms | Entitlement processes with milestones. |
| Solution / Knowledge | `Solution`, `Knowledge__kav` | Answers | Solutions are legacy; Lightning Knowledge uses record types on `Knowledge__kav`. |

### 2.2 Sales relationship map (text diagram)

```
Campaign --< CampaignMember >-- Lead / Contact
Lead --(convert)--> Account + Contact + [Opportunity]
Account --< Contact            (AccountContactRelation for many-to-many)
Account --< Opportunity --< OpportunityLineItem >-- PricebookEntry >-- Product2
                                                       PricebookEntry >-- Pricebook2
Opportunity --< OpportunityContactRole >-- Contact
Opportunity --< Quote --< QuoteLineItem >-- PricebookEntry
Account --< Contract --< Order --< OrderItem >-- PricebookEntry
Account --< Asset >-- Product2
Account --< Case >-- Contact / Asset
Any "activity-enabled" object --< Task / Event (WhatId); Lead/Contact (WhoId)
Any record --< ContentDocumentLink >-- ContentDocument --< ContentVersion
```

### 2.3 Person Accounts
- Business-to-consumer model: a single record that is both an Account and a Contact. Behind the scenes, one `Account` row + one hidden `Contact` row (`Account.PersonContactId`).
- `Account.IsPersonAccount = true`; Person Account uses its own Account record type(s). Contact fields surface on Account with prefix `Person` (standard, e.g., `PersonEmail`, `PersonMobilePhone`) or suffix `__pc` (custom contact fields).
- Enabling: requires at least one Account record type, Contact OWD of "Controlled by Parent", and Account page layout readiness; enabled in Setup (Account Settings) in newer orgs, previously via Support. **Cannot be disabled once enabled.**
- Person Accounts can't have direct Contacts, can't be in an Account hierarchy as parent of business accounts in the usual way, and count toward both Account and Contact storage.
- Can be converted from Leads (leave Company blank on the Lead) and can be Campaign Members.

---

## 3. Custom objects

### 3.1 Creation options
Ways to create: Object Manager > Create > **Custom Object**; **Create from Spreadsheet** (Lightning Object Creator — infers fields from a CSV/XLSX/Google Sheet and imports rows); Schema Builder; Metadata API / SFDX (`objects/Foo__c/Foo__c.object-meta.xml`).

### 3.2 New Custom Object wizard fields

| Section | Setting | Notes |
|---|---|---|
| Custom Object Information | Label, Plural Label, "Starts with vowel sound", Object Name (API, without `__c`), Description | Article grammar for "an"/"a" in UI messages. |
| Context-Sensitive Help | Open standard Salesforce help or a Visualforce page | For the "Help for this Page" link. |
| Enter Record Name Label and Format | Record Name label + Data Type: **Text** (80 chars) or **Auto Number** (with Display Format like `INV-{00000}` and Starting Number) | Name field is the record identifier in lookups, search, and related lists. Can switch between Text and Auto Number later. |
| Optional Features | **Allow Reports** | Makes object available to custom report types. |
| | **Allow Activities** | Enables Tasks/Events related to the object (`WhatId`). Can only be turned off if no activity records reference the object (verify). |
| | **Track Field History** | Enables the History related list and field selection (up to 20 fields). |
| | Allow in Chatter Groups | Lets records be added to groups. |
| | Enable Divisions | Only if Divisions are enabled. |
| | Enable Licensing | For ISV/managed package license-gated objects. |
| Object Classification | **Allow Sharing**, **Allow Bulk API Access**, **Allow Streaming API Access** | These three are an "Enterprise Application object" set: enabling all three; disabling them makes it a "Light Application object" (no sharing, no Bulk/Streaming API). All three must be on or off together. |
| Deployment Status | **In Development** / **Deployed** | In Development: visible only to users with "Customize Application"; Deployed: available to users per permissions. |
| Search Status | **Allow Search** | Makes records appear in global search (requires a tab for most search UI). |
| Object Creation Options (new only) | Add Notes and Attachments related list to default page layout; Launch New Custom Tab Wizard after saving | |

### 3.3 Custom object limits (typical)

| Item | Limit |
|---|---|
| Custom objects per org | Professional 50, Enterprise 200, Unlimited/Performance 2,000, Developer 400; hard limit ~3,000 including managed package objects (verify) |
| Custom fields per object | Enterprise 500, Unlimited/Performance/Developer 800 (hard max 800) |
| Relationship fields (lookup + MD) per object | 40 (can be raised via Support) |
| Master-detail relationships per object | 2 |
| Roll-up summary fields per object | 25 by default (can be raised to 40 via Support) (verify) |
| Unique relationships referenced by formulas on an object (spanning) | 15 (verify, can be raised) |
| External ID fields per object | 25 (verify) |
| Unique fields | Counted with external IDs; same limit family |
| Field history tracked fields per object | 20 (60 with Field Audit Trail / Shield) |
| Active validation rules per object | 100 per object in EE/UE (lower in PE) (verify) |
| Record types per object | No hard cap widely documented; practical ~200 (verify) |
| Custom tabs | Edition-dependent; generous in EE/UE (verify in Setup) |

### 3.4 Deleting objects/fields
- Deleted custom objects/fields go to "Deleted Objects"/"Deleted Fields" for 15 days (restorable), still counting against limits until erased (hard delete).
- Can't delete objects/fields referenced by Apex, Flows, formulas, report types, etc. ("Where Is This Used?" button on field detail shows references).
- Undeleting a field restores data but not all references (e.g., it's removed from page layouts and profiles/permission sets get reset; formula references must be re-added).

---

## 4. Object Manager — every section of an object

| Section | What it does | Key notes |
|---|---|---|
| **Details** | Label, plural, API name, description, record name format, optional features, sharing/Bulk/Streaming, deployment & search status; "Edit" and "Delete" (custom) | Standard objects expose limited settings. Shows "Enable Field History" toggles for standard objects. |
| **Fields & Relationships** | Create/edit fields; Set History Tracking; Field Dependencies; view field-level security per field ("Set Field-Level Security"), "View Field Accessibility" | Standard fields can't be deleted; some standard field properties editable (help text, picklist values, formula default). |
| **Page Layouts** | Classic-style layouts used by both Classic and Lightning record detail (the "Record Detail" component), related lists, actions, mobile | Assigned per Profile × Record Type via "Page Layout Assignment". |
| **Lightning Record Pages** | List Lightning pages for this object; open in Lightning App Builder | Activation determines who sees which page. |
| **Buttons, Links, and Actions** | Standard buttons (overridable), custom buttons/links, object-specific quick actions | Override New/Edit/View/Delete/Clone/Tab/List with Visualforce, Lightning component, or Lightning page (View only for Lightning page). |
| **Compact Layouts** | Fields in the highlights panel, hover cards, mobile record header | Assign per record type; set Primary. |
| **Field Sets** | Named group of fields used by Visualforce, LWC (via Apex `Schema.FieldSet`), managed packages | "In the Field Set" vs "Available for the Field Set". |
| **Object Limits** | Shows usage vs. limits: custom fields, roll-ups, relationship fields, unique relationships, active validation rules, rules, VLOOKUP, sharing rules, etc. | Best place to check real org limits. |
| **Record Types** | Create record types, assign picklist values and business process, page layout assignment | Profile record type visibility/defaults set on profile or permission set. |
| **Related Lookup Filters** | Lists lookup filters on *other* objects' fields that reference this object | Lookup filters themselves are set on the lookup field. |
| **Search Layouts** | Fields shown in search results, lookup dialogs, recent records list, lookup filter fields; in Lightning one "Search Results" layout per profile | Classic had separate Search Results, Lookup Dialogs, Lookup Phone Dialogs, Tab, List View, Search Filter Fields. |
| **List View Button Layout** | Which standard/custom list buttons show on list views | E.g., mass-action buttons; Lightning list views also use this (classic "Search Layouts > List View"). |
| **Restriction Rules** | Further restrict record access *below* sharing — users see only records matching criteria | Available for custom objects, contracts, events, tasks, time sheets, external objects, and an expanding list (verify). Limited active rules per object (2 in EE/UE historically; now higher—verify). |
| **Scoping Rules** | Set a default filter scope (what users see by default, e.g., "My territory's") — doesn't restrict access | Used with `USING SCOPE scopingRule` in SOQL and list views. |
| **Triggers** | Lists Apex triggers on the object (created in Dev Console/VS Code; can't create in production UI) | Also shows "Status" Active/Inactive. |
| **Flow Triggers** | Lists record-triggered flows on the object (newer) | Includes Flow Trigger Explorer link to see ordering (Before-save/After-save). |
| **Validation Rules** | Create rules that block saves when formula evaluates TRUE | Error location: Top of Page or a field. |
| **Hierarchy Columns** | Columns shown in the hierarchy view (e.g., Account Hierarchy, Case/Asset/Work Order hierarchies) | Up to 15 columns (verify). |
| Others that may appear | Expanded Lookups, Conditional Field Formatting (Dynamic Forms), Partner/Customer Portal, Field Sets, Related Record Lookups, Matching Rules link, Big Object index | Varies by object/feature. |

---

## 5. Field data types

### 5.1 Master table

| Type | Storage / limits | Behaviors & gotchas |
|---|---|---|
| **Auto Number** | Display format up to 30 chars, e.g. `CASE-{YYYY}-{0000}`; tokens `{0}` (number), `{YY}`, `{YYYY}`, `{MM}`, `{DD}` | System-generated, read-only, unique per object (not guaranteed gap-free — sandbox refresh, failed inserts, and Bulk can skip). Can be used as External ID. Can't be edited; changing format doesn't renumber existing records (unless "Generate Auto Number for existing records" when converting a text field). |
| **Formula** | Return types: Checkbox, Currency, Date, Date/Time, Number, Percent, Text, Time | Read-only, calculated on read (not stored, unless used in index-skinny scenarios); 3,900 chars formula text; 5,000-byte compile size; can't be required/unique/indexed by default (deterministic formulas can be custom-indexed via Support). Cross-object up to 10 relationships deep. Text formula result max 3,900 chars (verify). |
| **Roll-Up Summary** | COUNT, SUM, MIN, MAX of detail records | Only on master in master-detail (plus a few standard pairs: Account→Opportunity, Opportunity→OpportunityLineItem, Campaign→CampaignMember, Quote→QuoteLineItem, Order→OrderItem (verify list)). Optional filter criteria. Recalculates asynchronously in mass changes. Can't reference formula fields that reference cross-object or volatile functions (NOW/TODAY). A roll-up recalculation saves the master, which runs the master's triggers/flows/validation in the save order ("roll-up summary updates parent" step). |
| **Lookup Relationship** | Id field to another object | Loose coupling; optional unless marked required; own owner & sharing; deletion option: Clear the value (default), Don't allow deletion of the lookup record, Delete this record also (cascade — requires Support to enable for custom lookups, not for User lookup). Lookup filters (required or optional). Can relate to same object (self). |
| **Master-Detail Relationship** | Id field to master; always required | Detail inherits sharing & ownership (no Owner field); cascade delete; undelete restores; roll-ups available; max 2 per object; up to 3 levels deep (master → detail → subdetail); standard objects can't be detail of custom objects (Standard objects can't be on detail side); User can't be master. "Allow reparenting" checkbox. Sharing setting: Read Only or Read/Write access on master required to create/edit/delete detail. |
| **External Lookup** | Links a child (standard, custom or external) to a parent **external object** | Matches child field values to the parent external object's External ID (`ExternalId`) standard field. |
| **Indirect Lookup** | Links a child **external object** to a parent standard/custom object | Matches on a custom unique + External ID field on the parent. |
| **Hierarchical** | Lookup from User to User only | E.g., custom "Approver__c" or standard `ManagerId`; used in approval routing. |
| **Checkbox** | Boolean, default Checked/Unchecked | Never null (false). Can be a controlling field for dependent picklists. |
| **Currency** | 18 digits total (length + decimals); decimal places typically 2 | Multi-currency: each record has `CurrencyIsoCode`; conversion uses dated/static rates; Advanced Currency Management affects Opportunity and roll-ups. |
| **Date** | Date only | No time zone. Range 1700–4000 (verify). |
| **Date/Time** | Stored in UTC; displayed in user's time zone | Formula `DATEVALUE()` uses GMT date — off-by-one-day gotcha. |
| **Time** | Time of day (no date), ms precision | Format HH:MM:SS.mmm; no time zone. |
| **Email** | 80 chars, validated format | Click-to-email. Can be unique/External ID. |
| **Geolocation** | Compound: latitude + longitude (decimal or degrees/min/sec display), decimal places configurable | Counts as **3** custom fields toward limits. Components `Field__latitude__s`, `Field__longitude__s`. Use `DISTANCE()` / `GEOLOCATION()` in formulas and SOQL. Can't be used in roll-ups, or as compound in some list views; in reports, components shown. |
| **Number** | 18 digits total; decimal places 0–17 | Can be External ID / Unique. Stored as double internally. |
| **Percent** | 18 digits total; entered as 10 means 10% | In formulas, percent value is a decimal (10% = 0.10). |
| **Phone** | 40 chars | Free format; auto-format for US numbers in Classic; click-to-dial with CTI/Voice. |
| **Picklist** | Single select; up to 1,000 total values (active + inactive) for restricted; values up to 255 chars | Restricted picklist (only defined values via API) is default for new picklists. Use `ISPICKVAL()` or `TEXT()` in formulas. Can use local values or a Global Value Set. Can be controlling or dependent. |
| **Picklist (Multi-Select)** | Up to 500 values (verify); visible lines 3–10; stored as semicolon-delimited string | Use `INCLUDES()` in formulas; SOQL `INCLUDES`/`EXCLUDES`. Can't be a controlling field; can be dependent. Poor for reporting — prefer junctions. |
| **Text** | 1–255 chars | Can be Unique (case sensitive or insensitive), External ID, required. |
| **Text Area** | 255 chars, multi-line | Not filterable in some contexts; line breaks allowed. |
| **Text Area (Long)** | Up to 131,072 chars (default 32,768); visible lines | Can't be filtered in SOQL `WHERE`, can't be used in formulas (except limited?), sort, or most criteria; only the first 255 chars appear in reports/list views (verify). Doesn't change per-record storage (most records count ~2 KB). |
| **Text Area (Rich)** | Up to 131,072 chars incl. HTML; images up to 1 MB each (verify) | Same restrictions as long text area; stored as HTML. Can't be converted to plain text without HTML tags carrying over. |
| **Text (Encrypted)** | 175 chars, Classic Encryption (AES-128), mask type/character | Visible only to users with "View Encrypted Data" (that permission is legacy). Can't be unique, External ID, used in filters/criteria, formulas (mostly), or have default values. Different from **Shield Platform Encryption**, which encrypts standard/custom fields at rest with AES-256. |
| **URL** | 255 chars | Clickable, opens new window; `http://` prefixed if absent. |
| **Lookup (Polymorphic)** | Standard only: `WhoId`, `WhatId`, `OwnerId` (User or Queue), `ParentId` on some objects | Can't create custom polymorphic lookups declaratively (verify). |

### 5.2 Changing field types — common restrictions
- Can't change type of a field referenced by Apex, formulas, roll-ups, or used as an External ID in some cases; data loss warnings when narrowing (e.g., Text → Number, Text Area → Text truncates).
- Can't change Auto Number ↔ other except Text → Auto Number (with option to generate numbers for existing records).
- Can't change to/from Formula and Roll-Up Summary (delete and recreate).
- Multi-select ↔ picklist changes lose data.
- Lookup → Master-Detail only if all records have a value and no detail is "orphaned"; Master-Detail → Lookup only if no roll-up summaries exist on master.
- Can't convert a field to/from Encrypted Text.

---

## 6. Field properties

| Property | Details |
|---|---|
| **Required** | Universally required (enforced at API/DB level) vs required on page layout only (UI only). Universally required fields are always on layouts and can't be removed. Not available on Checkbox (always false), formula, roll-up, auto number. |
| **Unique** | Text, Number, Email, Auto Number (inherently). Case sensitive or insensitive (Text). Creates a custom index. |
| **External ID** | Text, Number, Email, Auto Number. Indexed; enables **upsert** matching and relationship resolution by external key in Data Loader/API. Up to 25 per object (verify). Searchable in global search for Text/Email. |
| **Default Value** | Formula-based default (static or e.g. `TODAY()+30`, `$User.Id`), set at record creation (UI and API when value not supplied). Picklists use "Use first value as default" or a specific default value. |
| **Help Text** | Up to 510 chars; shows as an (i) tooltip in Lightning/Classic. Also "Description" (admin-only). |
| **Field-Level Security (FLS)** | Visible / Read-Only per profile and permission set. Set during field creation wizard step 3 and in profile/perm set. Page layout read-only is UI-only; FLS is enforced everywhere (reports, API, search). |
| **Add to page layouts** | Wizard step 4. |
| **Dependent picklists** | Controlling field: standard or custom picklist (max 300 values) or checkbox; Dependent field: custom picklist or multi-select (standard picklists generally can't be dependent — verify for specific objects). Configure in Fields & Relationships > Field Dependencies; matrix of include/exclude. A dependent field can also be controlling another (chained). Must place both on the layout for UI filtering to work (in Lightning, controlling must be on the layout). Not enforced via API. |
| **Global Value Set** | Reusable restricted picklist value list (Setup > Picklist Value Sets). Up to 500 global value sets and 1,000 values each (verify). Fields using one are always restricted. Values can't be edited per field — edit in the set. Replacing values updates records. |
| **Picklist value sets per record type** | Each record type selects a subset of the field's values and its default. |
| **Picklist value API name vs label** | Value has a Label and API Name; formulas and ISPICKVAL use API name. Inactive values remain on old records. "Replace" mass-updates. |
| **Encrypted / Shield** | Platform Encryption options per field (probabilistic vs deterministic schemes). |
| **Data Owner, Field Usage, Data Sensitivity Level, Compliance Categorization** | Metadata classification attributes (Data Classification). |
| **Track history** | Per field via "Set History Tracking". |
| **Indexing** | Standard indexes: Id, Name, OwnerId, CreatedDate, SystemModstamp, RecordTypeId, lookups/MD, Email (Contact/Lead), External ID/unique. Custom indexes by Support. Skinny tables by Support. |

---

## 7. Relationships

### 7.1 Lookup vs Master-Detail vs Junction

| Aspect | Lookup | Master-Detail |
|---|---|---|
| Required? | Optional (can be made required) | Always required |
| Ownership | Child has its own Owner | No Owner; inherits from master |
| Sharing | Independent (child OWD) | Inherited — "Controlled by Parent" |
| Delete parent | Clear value (default) / restrict / cascade (if enabled) | Cascades — detail records deleted (and undeleted together) |
| Roll-up summary | No (use Flow/Apex or DLRS) | Yes |
| Count per object | Up to 40 total relationship fields | Max 2 MD |
| Standard object as child | Yes | No — standard objects can't be the detail |
| Levels | Unlimited chains | Up to 3 levels of MD |
| Reparenting | Always | Only if "Allow reparenting" checked |
| Report types | Optional "with or without" | Natural parent-child report types |
| Converting existing | Lookup → MD requires all records populated | MD → Lookup requires no roll-ups |
| Self-relationship | Allowed | Not allowed (object can't be MD to itself) |
| Locking | Child DML may lock parent | Child DML locks parent (more contention) |

### 7.2 Many-to-many (junction object)
- Custom object with **two master-detail** fields (e.g., `JobApplication__c` between `Position__c` and `Candidate__c`).
- **Primary master** = first MD created: junction inherits its look and feel (tab color/icon), and the junction appears as the detail in primary report types. Deleting the primary MD field makes the secondary the primary.
- Sharing: user needs read access to **both** masters (or Read/Write per MD sharing setting) to see the junction record.
- Report types: "Primary master with junction and secondary master" and vice versa.
- Deleting either master deletes junction records.
- Roll-ups available on both masters.
- Standard junctions: `OpportunityContactRole`, `CampaignMember`, `AccountContactRelation`, `PricebookEntry`, `CaseContactRole` (not all are MD technically).

### 7.3 Self & hierarchical
- **Self relationship**: lookup to the same object (Account.ParentId, Case.ParentId, custom `Parent_Project__c`). A record can't look up to itself (enforced in some standard cases; custom need validation).
- **Hierarchical**: special lookup type only on User → User.
- Hierarchy views (Account Hierarchy) configured via Hierarchy Columns.

### 7.4 Lookup filters
- Restrict valid lookup values by criteria (`Account.Type = 'Customer'`, `$User.ProfileId`, current record's fields, source/target fields).
- **Required** (blocks save; custom error message) vs **Optional** (lists filtered but user can remove filter).
- Max active lookup filters per object: 5 (verify). Not supported on all standard lookups (e.g., some polymorphic).
- Enforced on API for required filters.

### 7.5 Relationship names
- Child relationship name (e.g., `Line_Items__r`) used in parent-to-child SOQL subqueries; lookup field `Account__c` traverses as `Account__r.Name`.
- Standard: `Contact.Account.Name`; parent→child `SELECT (SELECT Id FROM Contacts) FROM Account`.

---

## 8. Schema Builder
- Setup > Schema Builder. Drag-and-drop view of objects, fields, relationships (lines show lookups vs MD).
- Can **create** custom objects and fields (most types) directly; changes save immediately (no undo).
- Filters: select objects, show standard/custom/system objects, hide/show relationships, Auto-Layout.
- Limitations: a few field types/options aren't available in Schema Builder (verify per type). Fields created there are **not** added to page layouts automatically; review FLS afterward (default FLS behavior: verify).
- Useful for ERD screenshots; for large orgs, it gets slow.

---

## 9. Formulas

### 9.1 Where formulas appear
Formula fields, default values, validation rules, workflow/process criteria (legacy), Flow formula resources and entry criteria (Flow formula syntax is similar but not identical), approval entry criteria, assignment/escalation criteria, report row-level and summary formulas, field updates, custom buttons/links (merge fields), roll-up filter criteria (not formula), lookup filters (criteria builder).

### 9.2 Limits

| Limit | Value |
|---|---|
| Formula text length | 3,900 characters (incl. spaces/comments) |
| Stored formula size | 4,000 bytes |
| Compiled size | 5,000 bytes (per formula; includes referenced formula fields expanded inline) (verify — Salesforce has raised to 15,000 bytes in some contexts) |
| Cross-object reference depth | Up to 10 relationships away |
| Unique relationships per object | 15 (verify) |
| Text formula output | Up to 3,900 chars (verify) |
| Validation rule error message | 255 chars |

Tips to beat compile size: replace nested `IF` with `CASE`, avoid repeating a large formula field reference (it's inlined each time), use `BLANKVALUE`, move logic into a helper formula only when it reduces size (it usually doesn't), or use Flow/Apex to store values.

### 9.3 Operators
`+ - * / ^ ()`, `&` (concatenate text), `= ==`, `<> !=`, `< > <= >=`, `&&` (AND), `||` (OR), `NOT()`/`!`. Comments: `/* ... */`.

### 9.4 Function catalog by category

**Date & Time**
| Function | Notes |
|---|---|
| `TODAY()`, `NOW()`, `TIMENOW()` | Volatile; formula fields using them recalc on view; can't be used in roll-up criteria. |
| `DATE(y,m,d)`, `DATEVALUE(expr)`, `DATETIMEVALUE(expr)`, `TIMEVALUE(expr)` | DATEVALUE on Date/Time uses GMT. |
| `DAY()`, `MONTH()`, `YEAR()`, `WEEKDAY()` (1=Sunday), `DAYOFYEAR()`, `ISOWEEK()`, `ISOYEAR()` | |
| `HOUR()`, `MINUTE()`, `SECOND()`, `MILLISECOND()` | On Time values. |
| `ADDMONTHS(date, n)` | Handles end-of-month. |
| `UNIXTIMESTAMP()`, `FROMUNIXTIME()` | |
| `FORMATDURATION()` (verify) | Duration formatting. |
| Date math | `Date + n` days; `DateTime + n` days (fraction = hours, e.g. +1/24); `Date - Date` = number of days. |

**Logical**
| Function | Notes |
|---|---|
| `IF(test, t, f)`, `CASE(expr, v1, r1, ..., else)`, `AND()`, `OR()`, `NOT()` | CASE can't test `ISPICKVAL`; use `CASE(Picklist__c, 'A', 1, 0)` directly (CASE works on picklists). |
| `ISBLANK()`, `BLANKVALUE()` | Preferred over `ISNULL()`/`NULLVALUE()` (which treat empty text differently). |
| `ISNULL()`, `NULLVALUE()` | Legacy; text fields are never null. |
| `ISNUMBER()` | Text is numeric. |
| `ISNEW()`, `ISCHANGED(field)`, `PRIORVALUE(field)`, `ISCLONE()` | Only in validation rules, default/assignment criteria, workflow/process/flow contexts — **not** in formula fields. |
| `ISPICKVAL(picklist, 'Value')` | Required for picklist comparisons (or `TEXT(picklist) = 'x'`). |
| `IFS()` (verify) | Newer multi-condition. |

**Math**
`ABS`, `CEILING`, `FLOOR`, `MCEILING`, `MFLOOR`, `ROUND(n, digits)`, `MOD`, `EXP`, `LN`, `LOG`, `SQRT`, `MAX(...)`, `MIN(...)`, `DISTANCE(loc1, loc2, 'mi'|'km')`, `GEOLOCATION(lat, lon)`.

**Text**
| Function | Notes |
|---|---|
| `BEGINS(text, compare)`, `CONTAINS(text, compare)`, `FIND(search, text, start)` | Case-sensitive. |
| `LEFT`, `RIGHT`, `MID(text, start, len)`, `LEN`, `TRIM`, `LOWER`, `UPPER`, `LPAD`, `RPAD`, `SUBSTITUTE(text, old, new)` | |
| `TEXT(value)` | Converts number/date/picklist to text. |
| `VALUE(text)` | Text to number. |
| `INCLUDES(multipicklist, 'Value')` | Multi-select picklists. |
| `HYPERLINK(url, friendly, target)`, `IMAGE(url, alt, h, w)` | Text formulas render clickable links/images (e.g., traffic lights). |
| `BR()` | Line break in text formulas. |
| `CASESAFEID(id)` | 15 → 18 char Id. |
| `REGEX(text, regex)` | Validation rules primarily (Java regex). |
| `INITCAP()` (verify) | Title case. |
| `GETSESSIONID()` | Avoid; security risk. |
| `HTMLENCODE`, `JSENCODE`, `JSINHTMLENCODE`, `URLENCODE` | Encoding for buttons/links. |

**Advanced**
| Function | Notes |
|---|---|
| `VLOOKUP(field_to_return, field_on_lookup_object, lookup_value)` | Validation rules only; lookup against a custom object's Name field. |
| `CURRENCYRATE('ISO')` | Conversion rate. |
| `GETRECORDIDS()`, `LINKTO()`, `URLFOR()`, `REQUIRESCRIPT()` | Buttons/Visualforce. |
| `IMAGEPROXYURL()` | |
| `PREDICT()` | Einstein (limited/legacy, verify). |
| `$` global merge fields | See below. |

**Summary (report formulas only)**: `PARENTGROUPVAL()`, `PREVGROUPVAL()`, plus `RowCount`, summary references like `AMOUNT:SUM`.

### 9.5 Global variables
`$User` (current user fields), `$Profile`, `$UserRole`, `$Organization`, `$Setup.CustomSetting__c.Field__c` (hierarchy custom settings), `$CustomMetadata.Type__mdt.Record.Field__c`, `$Label.Name` (custom labels), `$Permission.CustomPermission` (custom permissions — great for validation bypass), `$RecordType` (validation/flow), `$Api` (session/URLs), `$System.OriginDateTime` (1900-01-01 epoch), `$Action`, `$ObjectType`, `$Resource` (VF), `$UserRole`.

### 9.6 Cross-object formulas
- Reference parent fields via relationship names: `Account.Owner.Manager.Email`, `Opportunity__r.Account.Industry`.
- Only **child → parent** (up the tree); can't reference child records (use roll-ups).
- Up to 10 relationships deep; each unique relationship path counts toward the object's 15 unique-relationship limit.
- Can't span to some objects (e.g., can't traverse `Owner` when owner can be a Queue except for limited fields: `Owner:User.Name`, `Owner:Queue.QueueName` syntax).
- Polymorphic `What`/`Who` can't be traversed in formulas (mostly).
- User doesn't need access to the parent record to see the cross-object formula value (formula ignores sharing, but respects FLS of the formula field itself).

### 9.7 Common formula examples
```text
/* Days open */
IF(ISBLANK(ClosedDate), TODAY() - DATEVALUE(CreatedDate), DATEVALUE(ClosedDate) - DATEVALUE(CreatedDate))

/* Traffic light image */
IMAGE(CASE(Status__c, 'Green', '/img/samples/light_green.gif', 'Yellow', '/img/samples/light_yellow.gif', '/img/samples/light_red.gif'), Status__c, 15, 60)

/* Picklist to number */
CASE(Rating, 'Hot', 3, 'Warm', 2, 'Cold', 1, 0)

/* Full name with blanks handled */
TRIM(BLANKVALUE(FirstName, '') & ' ' & LastName)

/* Weekday count-based age (excludes weekends - approximate) */
(5 * FLOOR((TODAY() - DATE(1900,1,8)) / 7) + MIN(5, MOD(TODAY() - DATE(1900,1,8), 7)))
- (5 * FLOOR((DATEVALUE(CreatedDate) - DATE(1900,1,8)) / 7) + MIN(5, MOD(DATEVALUE(CreatedDate) - DATE(1900,1,8), 7)))

/* Hyperlink to record */
HYPERLINK('/' & Id, Name, '_self')
```

---

## 10. Validation rules

### 10.1 Mechanics
- Formula that returns **TRUE when data is invalid** → save blocked with error message.
- Fields: Rule Name, Active, Description, Error Condition Formula, Error Message (≤255), Error Location (Top of Page or Field).
- Run on create and edit, through UI, API, Data Loader, Apex DML, Flow (record updates). Not run on: lead conversion (unless "Require Validation for Converted Leads" is enabled), deletes, and some system processes. They do run on the master when a roll-up recalculation saves it (verify edge cases).
- Order of execution: system validation → before-save flows → before triggers → system + **custom validation rules** → duplicate rules → save → after triggers → assignment rules → auto-response → workflow → escalation → after-save flows → roll-up/cross-object → commit. (Custom validation rules are **not** re-evaluated after workflow field updates; only system validation re-runs.)
- Max active rules per object: 100 (verify; varies by edition).
- Bypass pattern: `AND(NOT($Permission.Bypass_Validation), <condition>)` or hierarchy custom setting `$Setup.Bypass__c.Disable_VR__c`.

### 10.2 Examples
```text
/* Close date can't be in past for open opps */
AND(NOT(IsClosed), CloseDate < TODAY())

/* Require Loss Reason when Closed Lost */
AND(ISPICKVAL(StageName, 'Closed Lost'), ISBLANK(Loss_Reason__c))

/* Discount over 20% needs approval checkbox */
AND(Discount__c > 0.20, NOT(Manager_Approved__c))

/* US ZIP format */
AND(BillingCountry = 'US', NOT(REGEX(BillingPostalCode, '\\d{5}(-\\d{4})?')))

/* Prevent changing Stage backwards from Closed Won (except admins) */
AND(ISCHANGED(StageName), ISPICKVAL(PRIORVALUE(StageName), 'Closed Won'), $Profile.Name <> 'System Administrator')

/* Lock record once Approved */
AND(NOT(ISNEW()), ISPICKVAL(PRIORVALUE(Status__c), 'Approved'), NOT($Permission.Edit_Approved))

/* Email or phone required */
AND(ISBLANK(Email), ISBLANK(Phone))

/* Multi-select must include value */
AND(ISPICKVAL(Type, 'Partner'), NOT(INCLUDES(Regions__c, 'EMEA')))

/* Valid state code using VLOOKUP against custom object */
VLOOKUP($ObjectType.State_Code__c.Fields.Name, $ObjectType.State_Code__c.Fields.Name, BillingState) <> BillingState

/* Owner can't be changed by non-managers */
AND(ISCHANGED(OwnerId), $UserRole.Name <> 'Sales Manager')

/* Record type-specific */
AND($RecordType.DeveloperName = 'Enterprise', ISBLANK(Parent_Account__c))
```

---

## 11. Page layouts (classic layout editor)

### 11.1 Editor anatomy
- **Palette** (top): categories Fields, Buttons, Quick Actions, Mobile & Lightning Actions, Expanded Lookups, Related Lists, Report Charts, Components, Visualforce Pages, Canvas Apps. Plus Quick Find box.
- **Layout canvas**:
  - **Highlights Panel** (Classic/Console only) — Lightning uses compact layouts instead.
  - **Quick Actions in the Salesforce Classic Publisher** section.
  - **Salesforce Mobile and Lightning Experience Actions** section — controls action bar in Lightning when Dynamic Actions are not used. If not overridden, it inherits from global publisher layout.
  - **Standard and custom buttons** (detail page buttons area).
  - **Sections** — drag "Section" element: name, display on detail/edit, 1 or 2 columns, tab-key order (left-right or top-down). Blank Spaces for alignment.
  - **Fields** — double-click/wrench properties: Read-Only, Required (layout-level).
  - **Custom Links** section.
  - **Mobile Cards** (Salesforce mobile: expanded lookups, components, Visualforce).
  - **Related Lists** — order; wrench to choose columns (up to 10 fields), sort, buttons; "Overwrite users' customized related lists" option.
- **Layout Properties**: layout name, enable feed-based layout (Classic), highlights panel/interaction log (Console).
- **Mini Page Layout** (Classic): fields/related lists shown in hover pop-ups and Console mini views (subset of the layout).
- **Video Tutorial / Preview As** (by profile).
- Undo/Redo, Save, Quick Save.

### 11.2 Behaviors
- Assignment: Page Layout Assignment matrix — **Profile × Record Type** → layout. (Permission sets can't assign layouts; profiles do. Lightning pages can be assigned by app/record type/profile.)
- Page layouts in Lightning feed the **Record Detail** component (and related lists in the Related Lists component) unless Dynamic Forms/Dynamic Related Lists replace them.
- Page layouts control field visibility on the UI only; FLS is the true security.
- Max ~ fields per layout no strict limit; recommended to keep small for performance.
- Layout-level required doesn't apply to API inserts.
- Search layouts, compact layouts, and list views are separate.

---

## 12. Lightning App Builder

### 12.1 Page types
| Page | Use |
|---|---|
| **Record Page** | Per-object record detail pages. |
| **App Page** | One-page app/home for an app (can be a tab or utility). |
| **Home Page** | Lightning Experience Home, assignable by app and profile. |
| Email Application Pane | Outlook/Gmail integration. |
| Embedded Service / Community (Experience Builder is separate) | |
| Utility Bar pages / Voice | |

### 12.2 Templates
Header + one region, Header and Two Equal Regions, Header and Right Sidebar, Header and Left Sidebar, Three Regions, Header + Subheader + Three Columns, Pinned Header & Left Sidebar (Console pinned regions), Pinned Header and Right Sidebar, etc. Template can be changed after creation (components map to regions). Custom templates via Aura (`lightning:template`) / LWC (verify for LWC templates).

### 12.3 Standard components (common)
- **Record-oriented**: Highlights Panel, Record Detail (page layout), Record Detail - Mobile, Related Lists, Related List – Single, Dynamic Related List – Single, Related List Quick Links, Related Record, Path, Activities, Chatter Feed / Publisher, Feed, Tabs, Accordion, Field Section and individual **Fields** (Dynamic Forms), Report Chart, List View, Rich Text, Visualforce, Flow, Recent Items, Trending Topics, Knowledge, Einstein Next Best Action, Einstein Insights, News, Topics, Quip, Twitter (legacy), Launchpad, Lightning Web/Aura custom components, AppExchange components, Report, Dashboard, Approval history, Files, Kanban, Visit/Field Service components, Agentforce/Einstein Copilot panel (verify).
- Components can be dragged into regions/tabs; each has properties panel; **Set Component Visibility** (filters).

### 12.4 Dynamic Forms
- Migrate fields/sections from the page layout into the Lightning page ("Upgrade Now" on the Record Detail component or "Migrate" wizard) → **Field Section** and **Field** components placed anywhere, each with visibility rules.
- Removes the need for multiple page layouts/record types just to show/hide fields.
- Supported on **custom objects** and the majority of standard objects on desktop (Account, Contact, Lead, Opportunity, Case, Product, etc.) — as of late 2025 a few objects (e.g., Campaign, Task, Event and some industry objects) had limited/no support. **(verify current list in release notes)** Supported on mobile (Salesforce mobile app) for custom and supported standard objects since ~Winter '24/Summer '24 (verify).
- Field-level properties: UI behavior (None / Read-only / Required), visibility rules, conditional field formatting (icons/colors based on conditions — newer, verify).
- Doesn't replace FLS; universally required fields still enforced.
- Page layout is still used for: related lists (unless dynamic), Classic, some APIs, Quick action layouts, and as fallback for unsupported contexts.

### 12.5 Dynamic Actions
- Actions defined on the **Highlights Panel** component (desktop) and on mobile action bar, with per-action visibility filters (field values, device, user/permission, record type).
- Replaces "Salesforce Mobile and Lightning Experience Actions" section of the page layout.
- Available for custom objects and most standard objects on desktop; mobile support added for custom/standard objects (verify).

### 12.6 Dynamic Related Lists
- **Dynamic Related List – Single**: choose related list, fields (up to 10), sort, filters (field criteria), number of records, list/tile view, actions; visibility rules. No page layout dependency.
- **Related List – Single** (older) uses page layout columns.
- **Related List Quick Links**: hover links to all related lists.
- Enhanced related lists (inline edit, sorting, column resizing) available in Related Lists component setting (verify).

### 12.7 Component visibility rules
- Filters: **Record field** (e.g., `Stage = Closed Won`), **Device** (form factor), **Permission** (custom/standard permission), **User** (profile, role, user fields), **Record type** (via record field), **Advanced** (custom logic, `$Permission`, `$User`, `$Record`).
- Logic: All/Any/Custom (`1 AND (2 OR 3)`).
- Visibility only hides UI — not security.

### 12.8 Activation
- **Org Default** (for that object, all users).
- **App Default** (for a given Lightning app).
- **App, Record Type, and Profile** (most granular; assign per combination).
- Priority: App+RecordType+Profile > App default > Org default > system default.
- **Form factor**: assign separately for Desktop and/or Phone (desktop-only pages show desktop; mobile uses "Phone" assignment; tablet follows phone for some). Templates must support phone.
- Pages created from scratch or cloned from system default; "Save as" new version.
- Page **performance analysis** tool in App Builder ("Analyze") and "Page Performance" tab.

---

## 13. Record types & business processes

### 13.1 Record types
- Let different users/processes have different **page layouts**, **picklist values**, and **business processes** for the same object.
- Assigned to profiles (and permission sets) with a **default** record type per profile; users with multiple record types choose at create (unless "Skip Record Type Selection Page" per user personal setting).
- Fields: Label, Record Type Name (DeveloperName — use in code/formulas, not Id), Description, Active, "Make available" per profile, "Make default".
- Picklist values per record type: each picklist field, choose subset and default.
- `RecordTypeId` field on record; Master record type = no specific type (records created before record types exist have null/master).
- Lead conversion: Account/Contact/Opportunity record types chosen by converting user's default (or selectable).
- Person Account record types are Account record types with `IsPersonType`.
- Can't delete a record type in use; deactivate.
- Changing a record's record type doesn't reset existing field values that are no longer valid picklist values.

### 13.2 Business processes
| Process | Object | Field controlled |
|---|---|---|
| **Sales Process** | Opportunity | `StageName` values (each stage maps to Probability, Forecast Category, Type: Open/Closed Won/Closed Lost) |
| **Support Process** | Case | `Status` values (each Closed or not) |
| **Lead Process** | Lead | `Status` values (one marked "Converted") |
| **Solution Process** | Solution | `Status` |
- A record type for these objects **must** reference a business process.
- Values in a process are a subset of the master picklist (defined in Fields & Relationships).

---

## 14. Compact layouts
- Define key fields shown in: Lightning **Highlights Panel** (record header), hover-over **cards** on lookups, **Salesforce mobile** record header and related-record cards, Lightning Console, Outlook/Gmail integration.
- Up to **10 fields**; first field is typically the name; the highlights panel shows the first ~7 on desktop (verify; mobile shows first ~4-5 in header).
- Assignment: "Compact Layout Assignment" sets **Primary** compact layout (org-wide) and per-record-type overrides. Not per profile.
- Fields user can't see (FLS) are hidden.
- Not supported: Text Area (Long/Rich), multi-select picklists (verify), some compound fields.

---

## 15. Quick actions

### 15.1 Object-specific vs global
| | Object-specific | Global |
|---|---|---|
| Created in | Object Manager > Object > Buttons, Links, and Actions | Setup > Global Actions |
| Context | Tied to a record; can auto-relate new records (e.g., new Contact from Account auto-fills AccountId) | Anywhere (Home, Chatter, utility, global actions menu "+" in header) — no relationship to a parent |
| Types | Create a Record, Update a Record, Log a Call, Send Email (Case/Lead/Contact etc.), Lightning Component (Aura), Lightning Web Component (screen or headless), Flow (screen flow), Visualforce, Canvas, Custom (Aura) | Create a Record, Log a Call, Custom Visualforce, Canvas, Lightning Component, Flow (verify), Post/Poll/Question (Chatter) |
| Appear on | Record page action bar (via page layout or Dynamic Actions) | Global publisher layout; global actions menu |

### 15.2 Configuration
- **Action layout**: fields shown in the action dialog (separate mini layout; universally required fields auto-added).
- **Predefined field values**: set default values for fields on the target record (formula-capable, e.g., `Status = 'New'`, `Due Date = TODAY()+7`, `AccountId = Account.Id`). Applied even if field isn't on the action layout.
- Success message, Icon, Standard label type (e.g., "New Task", "Log a Call").
- Target object & standard label; record type selection for Create actions.
- **Default Actions / Standard actions**: Edit, Delete, Clone, Change Owner, Change Record Type, Submit for Approval, Sharing, Printable View, Follow, Email (with Enhanced Email), Log a Call, New Task, New Event — some are predefined quick actions created automatically.
- Mobile Smart Actions (legacy) — expand to a set of create actions.
- **Global publisher layout**: Setup > Publisher Layouts — controls global actions in Chatter/mobile/home.
- **Update a Record** action: only on object-specific; edits current record in a dialog.
- LWC quick actions: `lightning__RecordAction` target with `actionType` ScreenAction or Action (headless).

---

## 16. Custom buttons & links

| Display type | Where shown |
|---|---|
| **Detail Page Link** | Custom Links section of the page layout |
| **Detail Page Button** | Record detail button bar / Lightning action menu |
| **List Button** | List views, related lists (option "Display Checkboxes (for Multi-Record Selection)") |

| Behavior / Content source | Notes |
|---|---|
| URL | Supports merge fields `{!Account.Id}`, `URLFOR`, relative URLs `/lightning/o/Contact/new?defaultFieldValues=AccountId={!Account.Id}` (URL-based default values in Lightning). |
| Visualforce Page | Page must use the object's standard controller (or standard set controller for list buttons). |
| OnClick JavaScript | **Not supported in Lightning Experience** (Classic only). Lightning Experience Readiness Check flags them; replace with quick actions/LWC/flows. |
| Open in | New window, Sidebar (Classic), Existing window with/without sidebar/header, Display in popup window. |

- Custom buttons appear in Lightning via page layout "Salesforce Mobile and Lightning Experience Actions" or Dynamic Actions.
- Standard button **overrides**: New, Edit, View, Delete, Clone, Accept, List, Tab — override with Visualforce, Lightning component (Aura implementing `lightning:actionOverride`), or Lightning Record Page (View only, via activation); overrides can differ for Classic/LEX/mobile.

---

## 17. Custom tabs

| Tab type | Purpose |
|---|---|
| **Custom Object Tab** | List/home page for a custom object; choose tab style (icon/color). Required for object to show in App Launcher/navigation and for global search results UI. |
| **Web Tab** | Embed external URL (iframe) or open; can pass merge fields. |
| **Visualforce Tab** | Display a VF page. |
| **Lightning Component Tab** | Aura component implementing `force:appHostable` or LWC with `lightning__Tab` target. |
| **Lightning Page Tab** | Display a Lightning App Page. |
- Tab visibility per profile: **Default On**, **Default Off**, **Tab Hidden** (permission sets: Visible/Available). Hiding a tab doesn't remove object access.
- Splash page (Classic custom link).
- Standard object tabs (Accounts, Contacts…) exist automatically.

---

## 18. Lightning apps (App Manager)

### 18.1 New Lightning App wizard
1. **App Details & Branding**: App Name, Developer Name, Description, Image (logo, ≤5 MB? 128×128 recommended), Primary Color Hex, "Use the app's image and color instead of the org's theme".
2. **App Options**: Navigation Style — **Standard navigation** or **Console navigation** (workspace tabs/subtabs); Supported Form Factors — Desktop and Phone / Desktop / Phone; Setup Experience — Setup (Full Setup) or Service Setup; App Personalization — **Disable end user personalization of nav items**, **Disable temporary tabs for items outside of this app**; Use omni-channel sidebar (console, verify).
3. **Utility Items** (Desktop only): utility bar components (History, Notes, Recent Items, Macros, Open CTI Softphone, Omni-Channel, Flow, LWC/Aura utilities, Rich Text, Report Chart, List View, Einstein/Agentforce panel); properties: label, icon, panel width/height, start automatically, load in background.
4. **Navigation Items**: object tabs, Home, Chatter, Reports, Dashboards, Lightning page tabs, VF/web tabs; order. Users can personalize (add/reorder) unless disabled.
5. **Navigation Rules** (console apps): open records as workspace tab or as subtab of a parent.
6. **User Profiles**: assign profiles (app visibility). Permission sets can also grant app access ("Assigned Apps").

### 18.2 Notes
- Classic apps can be "Upgraded" to Lightning apps (creates a copy).
- **Connected Apps** are different (OAuth integrations), not navigation apps.
- App default home and record pages are set via App Builder activation.
- App Launcher ordering and visibility: Setup > App Menu.

---

## 19. Path
- Visual stage guide on record pages for a picklist field (Opportunity Stage, Lead Status, Case Status, Quote Status, Contract Status, Order Status, custom object picklists, etc.).
- Setup > Path Settings > **Enable**, then **New Path**: name, object, record type, picklist field.
- Per step: **Key Fields** (up to 5 fields, verify) shown with inline edit; **Guidance for Success** (rich text up to 1,000 chars, links, images/video).
- Options: Celebration (confetti) on specific step with frequency; "Remember user's Path preferences" (collapsed/expanded).
- Path component placed on Lightning record pages (Path component or "Path" for Sales).
- One path per object + record type combination.
- Kanban view of list views pairs well with Path.

---

## 20. Duplicate management (Matching & Duplicate rules)

### 20.1 Matching rules
- Define how records are compared: object, match criteria (field, matching method **Exact** or **Fuzzy** with algorithms — fuzzy name, company, phone, street, ZIP, city etc.), "Match Blank Fields", filter logic.
- **Standard matching rules**: Account, Contact, Lead, Person Account (Standard Person Account Matching Rule), active by default.
- Limits: up to 5 active matching rules per object (verify), 25 active total, max ~10 fields per rule (verify).
- Activation builds match keys in background (can take time for large data).
- Can compare across objects (e.g., Lead vs Contact).

### 20.2 Duplicate rules
- Define what happens when a matching rule fires: action on **Create** and **Edit** — **Allow** (with alert and/or report) or **Block**; alert text; "Bypass sharing rules / Enforce sharing rules" (Record-Level Security option).
- Conditions (rule criteria, e.g., only run for certain record types/users).
- Up to 3 matching rules per duplicate rule; up to 5 active duplicate rules per object (verify).
- **Duplicate Record Sets** and **Duplicate Record Items** store reported duplicates (report type "Duplicate Record Sets").
- Standard rules exist for Account, Contact, Lead, Person Account.
- Runs on UI, API (honors `DuplicateRuleHeader` / `Database.DMLOptions.DuplicateRuleHeader.allowSave`), Data Import Wizard (option to trigger); Data Loader/API: Block rules fail the record; Allow rules let it save (verify alert handling).
- **Duplicate Jobs** (Performance/Unlimited, verify) scan existing data org-wide.
- **Merge**: Accounts, Contacts, Leads (up to 3 at once), Person Accounts; Cases merge (Lightning; up to 3); custom objects can't be merged natively (verify).
- Potential Duplicates component on Lightning record pages.

---

## 21. Big Objects
- Store/manage massive data (billions of records) on platform; consistent performance; not in data storage quota in the same way.
- **Standard big objects**: `FieldHistoryArchive` (Field Audit Trail), `EventLogFile` (verify), etc.
- **Custom big objects**: suffix `__b`; defined via **Metadata API** (or Setup UI in newer orgs, verify); fields types: Date/Time, Lookup, Number, Text, Long Text Area; require an **index** (primary key) of up to 5 fields, total text length ≤ 100 chars (verify).
- Querying: SOQL only on index fields in order (no gaps, last field can use range); no sharing, no triggers/flows, no standard UI (use custom LWC), no reports.
- Insert via `Database.insertImmediate()`, Bulk API, or API; insert with same index = upsert (idempotent).
- Async SOQL was retired (verify); use Batch Apex/Bulk API for processing.
- Free allotment ~1 million records; additional capacity licensed.

---

## 22. External Objects (Salesforce Connect)
- Map to data **stored outside** Salesforce, accessed real-time (no copy); suffix `__x`; key fields `ExternalId`, `DisplayUrl`.
- **External Data Source** (Setup > External Data Sources) types/adapters:
  - **OData 2.0, OData 4.0, OData 4.01** (verify 4.01)
  - **Cross-org** (another Salesforce org)
  - **Custom adapter** (Apex Connector Framework)
  - **Amazon DynamoDB**, **Amazon Athena**, **SQL/Snowflake via Salesforce Connect adapter** (verify newer adapters)
  - Simple URL / Files Connect (SharePoint, Google Drive, Box) for files
- "Validate and Sync" creates external objects from remote tables.
- Relationships: Lookup (external → external/standard by Id), **External Lookup** (child → external parent via ExternalId), **Indirect Lookup** (external child → standard/custom parent via unique external ID field).
- Features: search, reports (limited), Lightning pages, writable external objects (OData/custom/cross-org), no Change Data Capture (verify), sharing not supported (access via object permissions; restriction rules supported).
- Limits: ~100 external objects per org (verify); callout-based limits per hour (e.g., 20,000 OData callouts per hour for EE/UE) (verify).
- Licensed add-on (Salesforce Connect) except some free usage in Developer orgs.
- **Data Cloud / Data 360** zero-copy federation is a separate (newer) mechanism (verify naming).

---

## 23. Custom Metadata Types vs Custom Settings

| Aspect | Custom Metadata Types (`__mdt`) | Custom Settings (List / Hierarchy) |
|---|---|---|
| What's deployed | **Records are metadata** — deploy via change sets, packages, SFDX | Definition deploys; **data does not** (records must be loaded per org) |
| Types | One kind; fields incl. Metadata Relationship (to other CMDT, EntityDefinition, FieldDefinition) | **List** (static data, accessed by name, like a cached table) and **Hierarchy** (org → profile → user override; `$Setup` in formulas) |
| Access in Apex | `Type__mdt.getInstance('Name')`, `getAll()`, SOQL (doesn't count toward SOQL query limits for most cases) | `Setting__c.getInstance()`, `getOrgDefaults()`, `getValues()`; cached |
| In formulas/validation/flows | `$CustomMetadata.Type__mdt.Record.Field__c` (formulas, validation rules, default values, flows) | `$Setup` for Hierarchy only |
| Editable by | Admin/Customize Application; Apex can only change via Metadata API (async deploy) | Admin or any user via Apex DML (it's data) |
| Protection | Public/Protected (managed package) and field manageability (upgradeable/subscriber-editable/locked) | Visibility Public/Protected |
| Limits | 10 million characters per org total (verify); ~200 CMDT types per org (verify); 100 fields per type | 10 MB org cache or 1 MB × licenses (whichever less); 300 fields per setting |
| Best for | App config that moves between orgs: mappings, rules, feature switches, routing tables | User/profile-specific toggles (e.g., bypass flags), frequently updated values |
- List custom settings are discouraged for new work (Salesforce recommends CMDT); "Manage list custom setting type" setting historically needed to create new list settings.
- **Custom Labels** (translatable text) and **Custom Permissions** complement these.

---

## 24. Data management tools

### 24.1 Comparison

| | **Data Import Wizard** | **Data Loader** (desktop / CLI) | **dataloader.io** (MuleSoft) |
|---|---|---|---|
| Where | Setup > Data Import Wizard (browser) | Installed client app (Windows/macOS) + command-line (Windows batch; process-conf.xml) | Web (SaaS), free & paid tiers |
| Record volume | Up to **50,000** per import | Up to **5 million** recommended (larger possible with Bulk API) | Limited by plan (free tier ~10k records/month, verify) |
| Objects | Accounts & Contacts, Leads, Solutions, Campaign Members, Person Accounts, custom objects (and some others) | All objects supported by API (standard & custom) | All API objects |
| Operations | Insert, update, upsert (add new and update existing) | Insert, Update, Upsert, Delete, Hard Delete (Bulk), Export, Export All (incl. deleted/archived) | Import, export, delete; scheduling |
| Dedup/matching | Matches by Name, Email, Salesforce ID, or External ID (Accounts/Contacts/Leads options) | Id or External ID (upsert) | Id/External ID/lookup by field |
| Workflow/automation | Option to trigger workflow rules & processes (checkbox) | Always fires automation (triggers, flows, validation) | Always fires |
| Scheduling | No | Yes, via CLI + OS scheduler | Yes |
| Mapping | Auto-mapping + manual; can't save mapping | Save/load `.sdl` mapping files | Saved tasks |
| Export | No | Yes | Yes |
| Auth | Session | OAuth (browser-based; password+token login being phased out in newer versions — verify), Connected App / External Client App | OAuth |

- Data Loader versions track API versions (e.g., v64/v65 in 2025–26); requires a supported **Java runtime (JDK/JRE 17+, verify)**; Bulk API 2.0 support added (setting "Use Bulk API 2.0" alongside "Use Bulk API"); batch size default 200 (SOAP) / 2,000 (Bulk V1) / automatic (Bulk 2.0).
- Settings to know: Batch size, Insert null values, Assignment rule Id, Use Bulk API, Enable serial mode for Bulk API (avoid lock contention), Time zone, Read/write UTF-8, Start at row, Allow field truncation, Hide welcome screen.
- Output: `success*.csv` (includes new Ids) and `error*.csv` per run.

### 24.2 Upsert & External IDs
- **Upsert** = insert if no match, update if match; match key is `Id` or an External ID field. Multiple matches → error.
- Relationship resolution by external ID: in a CSV for Contacts, map `Account` via Account's External ID (`Account.External_Id__c` / Data Loader "Choose your related objects" step) — no need to look up Salesforce Ids.
- Auto Number, Text, Number, Email External IDs supported.
- Order loads parent → child (Accounts, then Contacts, then Opportunities, etc.); Users before ownership-dependent data.

### 24.3 Bulk API
- **Bulk API 2.0**: REST-based, job-centric; Salesforce auto-chunks; daily limit **150 million records** processed / 15,000 batches shared with Bulk V1 (verify); max file 150 MB per job upload (100 MB after base64? verify); query jobs with PK chunking automatic.
- **Bulk API (1.0)**: XML/CSV/JSON batches up to 10,000 records / 10 MB; parallel or serial mode; PK chunking header for queries.
- Use for >~2,000 records; parallel mode can cause record lock errors (`UNABLE_TO_LOCK_ROW`) on shared parents — use serial or sort by parent.
- Hard delete only via Bulk API and requires "Bulk API Hard Delete" permission.

### 24.4 Other tools
- **Data Export Service** (Setup > Data Export): weekly (or monthly in lower editions) full CSV backup; Export Now.
- **Backup & Recover / Own** — paid backup products (verify branding).
- **Mass Transfer Records**, **Mass Delete Records** (Accounts, Leads, Contacts, Activities, Cases, Solutions, Products, Reports), **Mass Update Addresses**, **Mass Transfer Approvals**.
- **Recycle Bin**: 15 days, 25 × storage MB records cap; Hard delete bypasses.
- **Storage**: Data storage ~ 2 KB per record for most objects (some exceptions: Person Accounts 4 KB, Campaigns 8 KB, Articles 4 KB, Email messages actual size); File storage for files/attachments.
- Workbench (unofficial/legacy), Salesforce CLI `sf data import/export/upsert bulk`, Inspector extension.

---

## 25. Field history tracking
- Enable per object (custom: "Track Field History" checkbox; standard: "Set History Tracking"), then select up to **20 fields** per object.
- Data in `ObjectHistory` / `Object__History` (`Field`, `OldValue`, `NewValue`, `CreatedById`, `CreatedDate`).
- Retention: **18 months** in UI/reports, **24 months** accessible via API (orgs created after June 2011); older data deleted (Salesforce enforces retention since 2019 (verify)).
- **Field Audit Trail** (Shield add-on): up to **60 fields** per object, retention up to **10 years**, stored in `FieldHistoryArchive` big object, define History Retention Policy.
- Long text area changes are tracked as "changed" without old/new values; values > 255 chars truncated.
- Not tracked: formula, roll-up, auto number, some system fields; changes made by cascading or via automated processes are tracked (User = automated user/the running user).
- Opportunity also has **Stage History** (`OpportunityFieldHistory` + `OpportunityHistory` — amount/stage/close date snapshots) independent of the 20-field limit; Case has Case History.
- Reports: "[Object] History" report types.

---

## 26. Record ownership & queues

### 26.1 Ownership
- Most standard and custom objects with Allow Sharing have an `OwnerId` (User or Queue for supported objects). Detail records in MD don't have owners.
- Owner gets full access (read/edit/delete/transfer/share) regardless of OWD; role hierarchy grants managers access.
- **Change Owner**: requires "Transfer Record" / "Transfer Leads"/"Transfer Cases" permission plus edit access; options to transfer related open activities, notes, open opportunities (for Accounts) etc.
- Ownership changes delete manual shares (and Apex-managed shares with row cause "Manual").
- Account owner change transfers related Contacts owned by previous owner, open Opportunities (optional), notes/attachments, open activities.
- **Ownership skew**: >10,000 records owned by one user → performance issues in sharing recalculation; avoid assigning to users in roles (use a no-role integration user).
- **Data skew/Account skew**: >10,000 child records under one parent → locking issues.

### 26.2 Queues
- Setup > Queues: Label, Queue Name, Queue Email, "Send Email to Members", **Supported Objects** (Lead, Case, custom objects, Order, Knowledge Article Version, Service Contract, Contact Request, Work Order, Messaging Session, Chat Transcript, Voice Call, etc.), **Queue Members** (users, public groups, roles, roles & subordinates, partner users).
- Records owned by a queue: any member can **take ownership** (accept); queue list views auto-created.
- Used by assignment rules (Lead, Case), Omni-Channel routing, Flows, Apex.
- Queue members and users above them in role hierarchy (depends on sharing) can access queue-owned records.
- Activities (Tasks) can be assigned to queues (Task queues supported — verify for Event: not supported).
- **Public groups** differ: used for sharing rules, not ownership.

### 26.3 Assignment-related
- **Lead/Case assignment rules**: one active per object; rule entries evaluated in order; assign to user or queue; "Assign using active assignment rule" checkbox on layouts; Web-to-Lead/Case use them.
- **Escalation rules** (Case), **Auto-response rules** (Lead/Case).
- Default Lead/Case owner in Lead Settings / Support Settings.

---

## 27. Gotchas / common confusions

1. **Page layout read-only/required ≠ security.** FLS (profile/permission set) is enforced everywhere; layout settings only affect the UI. API inserts ignore layout-required fields.
2. **Formula fields can't use `ISCHANGED`, `PRIORVALUE`, `ISNEW`, `VLOOKUP`** — those are validation-rule/automation-only.
3. **`DATEVALUE(DateTimeField)` is in GMT**, so records created late evening in US time zones show the next day. Use `DATEVALUE(CreatedDate - offset)` or compare as Date/Time.
4. **Text fields are never null** — `ISNULL(TextField)` is always FALSE; use `ISBLANK()`.
5. **Picklists need `ISPICKVAL()` or `TEXT()`** — `Status__c = 'Open'` won't compile. `CASE()` works directly on picklists.
6. **Roll-ups need master-detail.** For lookups use record-triggered Flow, Apex, or DLRS (Declarative Lookup Rollup Summaries, AppExchange). Roll-ups can't summarize formula fields that are cross-object or use NOW/TODAY.
7. **Master-detail can't be created on an object with existing records** unless you first create a lookup, populate every record, then convert. Converting MD → lookup requires deleting roll-up summaries first.
8. **Standard objects can't be the detail** in a master-detail relationship; User can't be a master.
9. **Junction object sharing** requires access to both masters; the first MD created is the primary.
10. **Cascade delete on lookups** is not on by default — must be enabled by Salesforce Support for custom lookups ("Delete this record also").
11. **Compact layout ≠ page layout.** Compact layouts drive the Lightning highlights panel; Classic highlights panel is configured on the page layout.
12. **Record types are not security.** They control layouts/picklists/process, not record access. Assigning a record type to a profile doesn't grant object access.
13. **Opportunity/Case/Lead record types require a business process**, and stage/status values must first exist in the master picklist.
14. **Global value sets are always restricted**; you can't add a value from the field — edit the set.
15. **Dependent picklists aren't enforced by the API** (Data Loader can save invalid combos unless a validation rule blocks it). Multi-select picklists can't be controlling fields.
16. **Lightning page activation precedence:** App+Record Type+Profile > App default > Org default. If a user sees the "wrong" page, check this matrix and form factor assignment.
17. **Dynamic Forms coverage** — not every standard object supports it (historically Campaign/Task/Event lagged). Check release notes (verify). Dynamic Forms visibility rules are UI-only.
18. **OnClick JavaScript buttons don't work in Lightning** — replace with quick actions, flows, LWC.
19. **Quick action predefined values apply even if the field isn't on the action layout;** universally required fields are forced onto action layouts.
20. **Global actions don't relate to a record**; object-specific "Create a Record" actions auto-populate the parent relationship.
21. **Auto Number isn't gap-free and resets on nothing** — failed inserts, sandboxes, and deleted records consume numbers. Sandboxes copy the counter at refresh time.
22. **Long/Rich Text Area can't be filtered in SOQL WHERE**, used in most formulas, or used as criteria in list views/roll-ups.
23. **Geolocation counts as 3 fields** toward the custom field limit.
24. **Encrypted Text (Classic encryption) ≠ Shield Platform Encryption.** Classic is 175 chars and heavily restricted; Shield encrypts existing fields at rest.
25. **Field history is retained 18 months (UI) / 24 months (API)**; for longer, use Field Audit Trail. Only 20 fields per object.
26. **Data Import Wizard caps at 50,000 records** and only some standard objects; Data Loader handles everything API-accessible and up to millions. Both fire validation rules and triggers (Import Wizard can optionally skip workflow/processes, **not** triggers/validation).
27. **Upsert requires a unique match key** — duplicate External ID values in the target cause errors; External ID fields that aren't marked Unique can match multiple records.
28. **Custom Settings data doesn't deploy** with change sets; Custom Metadata records do. Use CMDT for config that moves between environments.
29. **Hierarchy custom settings** resolve user → profile → org default; `$Setup` works in formulas only for hierarchy type.
30. **Person Accounts are irreversible** once enabled and change data model assumptions (Account has both business and person records; reports and integrations must handle `IsPersonAccount`).
31. **Activities:** custom fields are created on "Activity" and shared by Task and Event; Task/Event can't be roll-up details; `WhoId` only accepts Lead or Contact.
32. **Shared Activities is one-way** — can't be disabled once turned on.
33. **Queues own records; public groups don't.** Not every object supports queues (e.g., Account and Opportunity do **not**).
34. **Deleting a field** sends it to Deleted Fields for 15 days and it still counts toward limits until permanently erased.
35. **Lookup filters** (required) are enforced on API; optional filters only guide UI selection.
36. **Ownership/data skew** (>10,000 children or owned records) causes locking and sharing-recalc slowness — design around it.
37. **Formula compile size** includes the full expansion of referenced formula fields — a short formula referencing a large formula field can still exceed 5,000 bytes.
38. **Validation rules don't run during lead conversion by default** (enable "Require Validation for Converted Leads" in Lead Settings) and are not re-run after workflow field updates.
39. **Restriction rules restrict; scoping rules only filter defaults.** Neither replaces sharing; restriction rules can reduce access granted by sharing.
40. **Changing a field's API name** can silently break integrations, reports' saved filters, and external mappings even when Salesforce allows the change.
