# Salesforce Setup, Administration and Security Model

**What this file covers:**
1. The Setup menu tree (Setup Home, Object Manager, Administration, Platform Tools, Settings): every major node and what it does.
2. The security model in depth: org, object, field, and record level access, plus profiles vs permission sets, licenses, and key system permissions.
3. Admin-relevant limits (storage, API), sandbox types and refresh intervals, and release management basics. Status as of October 2026; items marked "(verify)" may have changed.

---

## 1. Navigating Setup

### 1.1 Getting there
- Lightning Experience: gear icon (top right) > **Setup** (the platform). A separate gear entry, **Service Setup** or **Sales Setup**, opens guided setup apps that are not the full tree.
- Salesforce Classic: "Setup" link in the header. Classic Setup groups nodes under App Setup / Administration Setup / Personal Setup. Lightning uses the grouping below.
- **Quick Find** box (left pane): searches node names, not descriptions. Type "sharing" or "profiles" to jump. Most admins use it instead of browsing.
- Direct URLs: `/lightning/setup/<NodeName>/home`, for example `/lightning/setup/Profiles/home`, `/lightning/setup/SecurityHealthCheck/home`, `/lightning/setup/ObjectManager/home`.
- Setup opens in its own browser tab in Lightning Experience (by default).
- Anyone with **View Setup and Configuration** can see Setup. Most changes need **Customize Application**, **Manage Users**, or a more specific permission.

### 1.2 Top-level layout (Lightning)
| Area | Contents |
|---|---|
| **Home** tab | Setup Home: the left tree, plus tiles for Most Recently Used, release notes, Optimizer, Lightning Usage, and Mobile Publisher |
| **Object Manager** tab | Every standard and custom object: fields, relationships, page layouts, Lightning record pages, buttons, links, actions, compact layouts, field sets, record types, validation rules, triggers, flows triggered by the object, search layouts, list view button layout, limits, object access |
| Left tree: **Administration** | Users, Data, Email |
| Left tree: **Platform Tools** | Apps, Feature Settings, Einstein/Agentforce, Objects and Fields, Process Automation, User Interface, Custom Code, Development, Environments, Integrations, Notification Builder, Offline, User Engagement |
| Left tree: **Settings** | Company Settings, Data Classification, Identity, Privacy Center, Security |

### 1.3 Setup Home extras
- **Lightning Experience Transition Assistant**: three phases (Discover, Roll Out, Optimize). Provides the Readiness Check report, which finds Classic-only features such as JavaScript buttons, S-controls, and Visualforce that is not Lightning-ready. It also lets you turn Lightning on for users and set "Switch users to Lightning Experience" (hides the "Switch to Classic" link through the **Hide Option to Switch to Salesforce Classic** permission).
- **Salesforce Optimizer**: generates a report (now an in-app Optimizer app) on unused fields, too many fields on layouts, inactive users with licenses, hard-coded IDs, reports never run, rule and code complexity, and similar issues. You run it on demand. Some orgs can schedule it monthly.
- **Security Health Check**: compares the org's security settings (password policies, session settings, network access, certificates, and similar) against the **Salesforce Baseline Standard** or a custom baseline you import as XML. Produces a 0-100 score. "Fix Risks" changes many settings with one click. This is free. **Security Center** is the paid multi-org version.
- **Release Updates**: the list of upcoming enforced platform changes (formerly "Critical Updates"). Each shows an enforcement release and test steps, and many can be enabled early.
- **Salesforce Mobile App QuickStart**, **Mobile Publisher**, **Guidance Center**, and **Setup Assistant** in newer orgs.

---

## 2. Administration section

### 2.1 Users
| Node | Purpose |
|---|---|
| **Users** | Create, edit, deactivate, and freeze users. Reset passwords. Assign role, profile, license, permission sets, PS groups, PSLs, public groups, queues, and territories. View login history per user. Use "Login" (Login As). Add multiple users (up to 10 at a time in the UI). |
| **Profiles** | Baseline access. One profile per user (required). Controls license-bound defaults: object CRUD, FLS, app and tab visibility, record type defaults, page layout assignment, login hours, login IP ranges, session security level, password policies (profile-level), system permissions, Apex class / VF page / custom permission access. Two editing UIs: Enhanced Profile User Interface (toggle in User Management Settings) or the classic long-page UI. |
| **Permission Sets** | Additive access, many per user. The same permission categories as profiles except page layout assignment, login hours, and login IP ranges (record type *defaults* are also profile-only, though record type *access* can be in a perm set). Can be tied to one license or "--None--" (usable by any license that supports the permissions). Session-based permission sets activate only during a session that meets a condition (via Flow or the API). |
| **Permission Set Groups (PSG)** | Bundle perm sets by persona or job function. The group's access is the union of its perm sets. **Muting permission sets** inside a PSG remove specific permissions, so you can subtract from the group. A PSG has a status of Updated / Outdated / Updating / Failed and recalculates when its component perm sets change. |
| **User Access Policies** | Rule-based, automated assignment and removal of perm sets, PSGs, PSLs, public groups, queues, and managed package licenses, based on user criteria such as profile, role, department, or custom fields. Can run once (bulk) or be **Active** (triggers on user create/update). |
| **Permission Set License Assignments** | PSLs grant entitlement to features beyond the user license (for example, Sales Cloud Einstein, Field Service, CRM Analytics, Agentforce). Assign them on the user record or through a UAP. A PSL must be assigned before a perm set that needs it can be assigned. |
| **Roles** | Role hierarchy for record access (see §6.4). Also used in forecasting and report hierarchies. "Set Up Roles" tree view. Default limit 500 roles (can be raised) (verify). |
| **Public Groups** | Collections of users, roles, roles and subordinates, roles/internal/portal subordinates, territories, or other groups. Used in sharing rules, manual shares, list view, folder, and report sharing, and queue membership. Option "Grant Access Using Hierarchies" (on by default for public groups; cannot be turned off for personal groups). |
| **Queues** | Ownership containers for Leads, Cases, Custom Objects, Knowledge Article Versions, Orders, Service Contracts, Work Orders, Chat transcripts, and Messaging sessions. Members can take ownership. Optional queue email and "Send Email to Members". Used by Omni-Channel routing. |
| **User Management Settings** | Toggles: Enhanced Profile List Views, Enhanced Profile User Interface, Field-Level Security for Permission Sets during Field Creation (FLS is set via perm sets in the new-field wizard), User Self-Deactivate, Scramble Specific Users' Data (sandboxes), Hide Personal Information, User Access Policies, Permission Set Group Muting, and similar. |
| **Delegated Administration** | Delegated Admin Groups let non-admins manage users in specified roles and subordinates. They can create and edit users, reset passwords, unlock, freeze, assign specified profiles and perm sets, manage specified public groups, log in as those users (if login access is granted), and manage custom objects (only "Manage Custom Objects": create and edit, not delete). Delegated admins cannot assign profiles or perm sets that carry Modify All Data. |
| **Mass Transfer of user licenses / user records** | The User list view supports bulk deactivate in some UIs. Mass changes otherwise go through Data Loader. |

### 2.2 Data
| Node | Purpose / key facts |
|---|---|
| **Data Import Wizard** | Browser wizard. Up to **50,000 records** per import. Supports Accounts, Contacts, Leads, Solutions, Campaign Members, Person Accounts, and custom objects. Matching and duplicate handling (by Salesforce ID, name, email, or external ID). Can trigger workflow/automation (option). No Opportunities, Cases, or Products in many editions (use Data Loader). |
| **Data Loader** | Desktop client (Windows/macOS, needs Java/Zulu JDK) plus a CLI for scheduled jobs. Insert, update, upsert, delete, hard delete (needs "Bulk API Hard Delete"), export, and export all (includes soft-deleted and archived). Up to about 5 million records (official guidance). Choose SOAP API or Bulk API (v1/v2) and batch size (SOAP max 200; Bulk up to 10,000). Authenticates via OAuth or password+token. A web-based Data Loader also exists within Setup (Data Import / Export section) (verify for your org). |
| **Data Export / Data Export Service** | Weekly (every 7 days; EE/UE/PE) or every 29 days. Export Now or Schedule Export. Produces CSV zip files with an optional include of attachments, documents, Salesforce Files, and images. Files are kept for **48 hours** after the email notification. |
| **Mass Transfer Records** | Transfer ownership of Accounts (optionally with related opportunities, open cases, and so on), Leads, and custom objects from one user to another in bulk. Mass Transfer Approval Requests is a separate tool. |
| **Mass Delete Records** | Delete up to **250 records at a time** (repeat to delete more) for Accounts, Leads, Activities, Contacts, Cases, Solutions, Products, and Reports. Option to permanently delete (skip the Recycle Bin). |
| **Mass Update Addresses** | Standardize country/state values across Accounts, Contacts, and Leads. |
| **Mass Reassign Opportunity Teams / Account Teams** | Bulk add, remove, or replace team members. |
| **Storage Usage** | Data storage and file storage used vs. limit, broken down by object and by top users. See §8.1 for allocations. |
| **Duplicate Management** | Matching Rules (fuzzy/exact criteria) plus Duplicate Rules (alert or block on create/edit, report on duplicates). Standard rules exist for Account, Contact, Lead, and Person Account. |
| **State and Country/Territory Picklists** | Convert free-text address fields to picklists. Scan > Convert > Enable. Integration values vs. labels. |
| **Big Objects**, **External Data Sources / External Objects (Salesforce Connect)**, **Data Integration Rules** (geocodes, company info) | Appear in Data or Integrations depending on release. |
| **Recycle Bin** (App Launcher) | Records stay 15 days. Org recycle bin capacity is 25 times data storage in MB, counted as records (verify). |

### 2.3 Email
| Node | Purpose |
|---|---|
| **Deliverability** | Access level: **No access**, **System email only** (password resets and other system emails), or **All email**. New sandboxes default to System email only. Also: bounce management (Activate bounce management, show bounce alert next to bounced address), Email Security Compliance (Sender ID / "Enable compliance with standard email security mechanisms"), TLS settings (Preferred / Required, outbound), "Notify sender when email is from Salesforce". Enable Email Relay elsewhere. |
| **Classic Email Templates** / **Lightning Email Templates** | Classic types: Text, HTML (with letterhead), Custom HTML, Visualforce. Lightning templates are created from the Email Templates tab in the app, use folders, enhanced folders, and merge fields `{{{Recipient.Name}}}`, and can use Enhanced Letterheads. Email Template Builder (drag and drop) for Lightning templates. |
| **Letterheads** (Classic) / **Enhanced Letterheads** | Branded header and footer for HTML templates. Enhanced Letterheads work with Lightning templates. |
| **Email to Salesforce** | Users BCC or forward a personal address to log emails as activities on matching records. Settings choose what to match (Contacts, Leads, Opportunities) and whether to log as tasks or emails. |
| **Email-to-Case / On-Demand Email-to-Case** | Turns inbound email into Cases (in Service Setup / Feature Settings > Service). The On-Demand version uses Salesforce email services with no local agent. |
| **Organization-Wide Addresses** | Shared "From" addresses (support@, and so on). Must be verified. Can be allowed for all profiles or chosen profiles. Can be used in workflow/flow email alerts and as the default "no-reply" address for system emails. |
| **DKIM Keys** | Create a 1024-bit or 2048-bit key with a selector and alternate selector. Publish the CNAMEs in DNS. Activate. Required for good deliverability when sending as your domain (with SPF including `_spf.salesforce.com`). |
| **Email Relay / Email Domain Filters** | Route outbound email through your own mail server. |
| **Compliance BCC Email**, **Email Footers**, **Test Deliverability**, **Send through External Email Services** (Gmail/Office 365), **Enhanced Email** (emails as EmailMessage records), **Email Attachments** (as links) | Other email admin settings. |
| **Apex Exception Email** | Recipients of unhandled Apex exception emails (users plus external addresses). |
| **Mail Merge**, **Filter Email Tracking**, **My Email Settings** (personal) | Miscellaneous. |

---

## 3. Platform Tools section

### 3.1 Apps
| Node | Purpose |
|---|---|
| **App Manager** | List of all Lightning and Classic apps, connected apps, and external client apps. "New Lightning App" wizard sets app details and branding (color, logo), navigation style (Standard / Console), utility bar, setup experience (Setup vs. Service Setup), navigation items, and user profile assignment. Classic apps can be "Upgraded" to Lightning. |
| **AppExchange Marketplace** | Link to AppExchange to install packages (managed or unmanaged), Lightning components, and Bolt solutions. |
| **Connected Apps** (Manage Connected Apps; OAuth Usage) | Legacy framework for OAuth/SAML integrations: OAuth scopes, callback URL, JWT certificate, IP relaxation, refresh token policy, "Admin approved users are pre-authorized" vs. "All users may self-authorize", Permitted Users, session policies, custom attributes, and mobile app settings. **Connected App OAuth Usage** shows apps users have authorized, including uninstalled ones (you can block them or install them to manage them). **As of Spring '26, creating new connected apps is disabled by default (UI and API).** A temporary exception is available via Support. Existing connected apps keep working. No hard retirement date has been announced (verify). |
| **External Client App Manager** (External Client Apps, ECA) | The replacement OAuth framework. Splits **settings** (developer-owned, packageable: scopes, callback, flows enabled) from **policies** (admin-owned, per-org: permitted users, IP, refresh token, session). Closed by default (not visible to other orgs unless packaged), secure-by-default PKCE, and supports second-generation packaging and metadata (`ExternalClientApplication`, `ExtlClntAppOauthSettings`, `ExtlClntAppGlobalOauthSettings`, `ExtlClntAppOauthConfigurablePolicies`, and so on). Use it for all new integrations. Some legacy features (for example, certain Canvas and some SAML/mobile features) may not yet be supported (verify). |
| **Lightning Bolt**, **Mobile Apps** (Salesforce mobile settings, Mobile Publisher) | Templates and mobile configuration. |
| **Packaging > Installed Packages** | Installed managed and unmanaged packages: version, namespace, licenses (Manage Licenses for managed packages to assign seats), uninstall (export data first; uninstall exports data for 48 hours), and "View Components". Push upgrades from the ISV. **Package Manager** (Classic packaging) in dev orgs. |

### 3.2 Feature Settings
Grouped by cloud. Common nodes:
- **Sales**: Opportunity Settings, Opportunity Teams / Account Teams (enable teams), Contact Roles, Forecasts Settings, Product Schedules, Quotes, Leads Settings (lead conversion, Lead Processes), Pipeline Inspection, Einstein Activity Capture, Collaborative Forecasts, Big Deal Alerts, Path Settings (for Opportunity it is found under Path), Sales Engagement.
- **Service**: Case Settings (Case Assignment Rules, Escalation Rules, Auto-Response Rules, Support Processes), Email-to-Case, Web-to-Case, Omni-Channel, Entitlements and Milestones, Knowledge Settings, Macros, Service Console, Messaging, Service Cloud Voice, Field Service.
- **Marketing**: Campaign Influence, Web-to-Lead, Campaign settings.
- **Digital Experiences**: Settings (enable Experience Cloud), All Sites, Pages.
- **Chatter / Feeds**: Chatter Settings, Feed Tracking, Publisher Layouts.
- **Surveys**, **Salesforce Files** (Files settings, Content Deliveries / Public Links), **Communications** (Activity settings, Calendar, Email), **Analytics** (Reports and Dashboards Settings: enable report subscription, Floating headers, Enhanced Folder Sharing), **Data.com / Einstein**.

### 3.3 Einstein / Agentforce
Einstein Setup (turn on generative AI, Einstein Trust Layer), Agentforce Agents, Agentforce Studio / Agent Builder, Prompt Builder, Einstein Bots, Einstein for Sales/Service, Data Cloud setup (Data 360), Model Builder, and Einstein Search. These carry per-feature PSLs and permission sets.

### 3.4 Objects and Fields
| Node | Purpose |
|---|---|
| **Object Manager** | See §1.2. Per-object "Object Limits" page shows usage vs. limits (custom fields, rollups, relationships, VR, and so on). |
| **Picklist Value Sets** | Global value sets shared across picklist fields. |
| **Schema Builder** | Drag-and-drop ERD view. You can create objects and fields there. |
| **Record Types** (per object) | Different picklist values, page layouts, and business processes (Sales / Support / Lead process). |
| **Field Accessibility** | Matrix of FLS × page layout by profile, field, and record type. |
| **External Objects** | Salesforce Connect (OData, cross-org, custom adapter). |
| **Platform Events**, **Change Data Capture** (select entities) | Event-driven integration. |

### 3.5 Process Automation
Flows (Flow Builder), Flow Trigger Explorer, Approval Processes, Process Automation Settings (default workflow user, flow error emails), Paused and Failed Flow Interviews, Workflow Rules and Process Builder (legacy; retired from creation, so migrate with the **Migrate to Flow** tool), Post Templates, Assignment Rules (Lead/Case), Escalation Rules, Auto-Response Rules, and Time-Based Workflow queue. See the automation knowledge file for depth.

### 3.6 User Interface
| Node | Purpose |
|---|---|
| **Tabs** | Custom Object Tabs, Web Tabs, Visualforce Tabs, Lightning Component Tabs, and Lightning Page Tabs. Tab visibility per profile/perm set: **Default On**, **Default Off**, **Tab Hidden** (perm sets use Visible / Available). |
| **Lightning App Builder** | Create App Pages, Home Pages, Record Pages. Dynamic Forms, Dynamic Actions, and component visibility filters. Activation (org default, app default, app+record type+profile, form factor). |
| **Themes and Branding** | Lightning themes: brand color, page background, header image, logo, and group/object icon sets. One active theme per org. Default themes include "Salesforce Cosmos" (SLDS 2), "Lightning Blue", and others. Custom themes need Customize Application. The SLDS 2 / Cosmos theme rollout was in progress across 2025-2026 (verify). |
| **Global Actions** | Actions not tied to an object: Create a Record, Log a Call, Send Email, Custom Visualforce/LWC/Lightning Component, and Flow. **Publisher Layouts** (Global Layouts) control which global actions appear in the global "+" menu, Chatter publisher, and mobile action bar. |
| **Path Settings** | Enable Path, then create paths per object + record type + picklist field (for example, Opportunity Stage). Key fields and Guidance for Success per step. Optional "Remember user's path preferences" and confetti celebrations. |
| **User Interface (settings page)** | Org-wide UI toggles: Enable Collapsible Sections, Hover Details, Related List Hover Links, Inline Editing, Enhanced Lists, Printable List Views, Custom Object Truncate, "Use custom address fields", Disable Lightning Experience Switch, and so on. |
| **Rename Tabs and Labels** | Rename standard objects/fields (for example, "Account" to "Client") per language. |
| **Custom Labels** | Translatable text values referenced in Apex (`System.Label.X`), VF (`$Label.X`), LWC (`@salesforce/label/c.X`), flows, and formulas. Limit: 5,000 labels per org; 1,000 chars each (verify). Packageable. |
| **Lightning Extension**, **Density Settings** (Comfy / Compact), **List View Settings**, **Search Layouts**, **Calendar Settings**, **Quick Text Settings**, **Message Templates** | Other UI settings. |
| **Notification Builder** | **Custom Notifications** (types for desktop/mobile channels). Sent via Flow "Send Custom Notification", Process Builder, the Apex `Messaging.CustomNotification`, or the REST API. **Notification Delivery Settings** turn standard notification types on or off per channel and app. |
| **Guidance Center / In-App Guidance** | Prompts (floating, docked) and Walkthroughs (walkthroughs need the "myTrailhead/Enablement" add-on beyond 3 free). Targeted by profile/perm, page, and frequency. |
| **Report Types** | Custom report types: primary object plus related objects, with/without relationships, and field layout. |

### 3.7 Custom Code
| Node | Purpose |
|---|---|
| **Apex Classes** | List, edit (not in production; there you deploy instead), "Compile all classes", Run Tests, Estimate Code Coverage, and Security (which profiles/perm sets can access). |
| **Apex Triggers** | List and view only. Created in the Object Manager or via the IDE. |
| **Apex Test Execution / Apex Test History** | Run tests asynchronously and view results and code coverage. Options: Disable Parallel Apex Testing, Store Only Aggregated Code Coverage. |
| **Apex Hammer Test Results** | Salesforce's pre-release regression runs on your tests (opt-out is available). |
| **Visualforce Pages / Components** | Classic UI. Security per profile/perm set. |
| **Lightning Components** (Aura/LWC listing), **Debug Mode** (per-user non-minified JS) | |
| **Static Resources** | Uploaded files (JS libs, CSS, images, zip archives) referenced via `$Resource` / `@salesforce/resourceUrl`. **5 MB per file**, **250 MB total per org**. Cache Control: Private / Public. |
| **Custom Settings** | Cached app data. **List** (static data set reusable across org) or **Hierarchy** (org default, then profile, then user override; resolved via `getInstance()`). Accessible in formulas and validation rules (Hierarchy only, `$Setup`). Visibility: Public / Protected (in managed packages). Limits: total cached data limited to the lesser of 10 MB or 1 MB × full-license count (verify). Records are **data**, not metadata (not deployable via change sets). The "Manage Custom Settings" / "View All Custom Settings" perms control access. Salesforce recommends Custom Metadata Types for most new configuration use. List custom settings are no longer recommended (creation hidden by the "Manage list custom settings type" toggle). |
| **Custom Metadata Types** | Configuration **records that are metadata**: deployable via change sets, packages, and Metadata API. Queryable via SOQL without counting against SOQL query limits (`getAll()`, `getInstance()`). Fields can be "Subscriber Controlled", "Upgradeable", or "Locked". Support metadata relationships, entity/field definition references, and formulas via `$CustomMetadata`. Usable in validation rules, formulas, flows, and default values. Org limit of about 10 million characters of CMT record data (verify). DML not allowed in Apex (deploy via `Metadata.Operations`). Name suffix `__mdt`. |
| **Custom Permissions** | Named flags checked in Apex (`FeatureManagement.checkPermission`), formulas (`$Permission`), validation rules, and flows. Assigned via profiles/perm sets. |
| **Platform Cache** | Org and session cache partitions (capacity by edition; some trial capacity free). |
| **Email Services** | Apex `InboundEmailHandler` with generated addresses. |
| **Canvas App Previewer**, **Sites** (Salesforce Sites/Force.com sites), **Remote Access** (legacy) | Other custom code nodes. |

### 3.8 Development
- **Dev Hub** (enable in production/Dev Edition for scratch orgs and 2GP packages), **Unlocked Packages / Second-Generation Packages**, **Source Tracking in sandboxes** (Developer and Developer Pro), **Scratch org definition**, **Enable Unlocked and Second-Generation Managed Packaging**.
- **Developer Console** (from the gear menu): logs, query editor, execute anonymous, checkpoints. Salesforce has been steering users to VS Code with Salesforce Extensions and **Agentforce for Developers / Agentforce Vibes** (verify).
- **Code Builder** (web-based VS Code) (verify availability).
- **DevOps Center**: work items and pipelines over GitHub/Bitbucket, a declarative alternative to change sets.

### 3.9 Environments
| Node | Purpose |
|---|---|
| **Sandboxes** | Create, refresh, clone (sandbox-to-sandbox), activate, delete, and set Sandbox Templates (for Partial Copy / Full: which objects to copy). The SandboxPostCopy Apex class runs after create/refresh. See §9. |
| **Deploy > Outbound Change Sets** | Build in the source org: add components, "Add Dependencies", upload to a target org (requires a Deployment Connection that allows inbound changes in the target). Cannot delete components; profile settings are only deployed for included components; no rollback mid-deploy. |
| **Deploy > Inbound Change Sets** | Received in the target. **Validate** (runs tests; Quick Deploy is available for 10 days after a successful validation with tests), **Deploy** (test options: Default, Run Local Tests, Run All Tests, Run Specified Tests). Uploaded change sets expire after 6 months. Max 10,000 files per change set (verify). |
| **Deploy > Deployment Settings** | Deployment connections (authorize inbound changes per org pair, only between orgs linked to the same production). "Allow deployments of components when corresponding Apex jobs are pending or in progress". |
| **Deploy > Deployment Status** | Monitor all deployments (change sets, Metadata API, CLI): Validation, Deploy, Quick Deploy, Cancel. |
| **Jobs > Apex Jobs** | Async Apex queue: Batch, Queueable, Future, Scheduled run instances, and status. Abort. |
| **Jobs > Scheduled Jobs** | All scheduled jobs: Scheduled Apex, report subscriptions, dashboard refresh, Data Export, scheduled flows, Analytic Snapshots. Delete or pause (manage). Max 100 scheduled Apex jobs. |
| **Jobs > Background Jobs**, **Bulk Data Load Jobs** (Bulk API jobs, 7-day retention), **Mass Email Queue**, **Apex Flex Queue** (up to 100 holding batch jobs, reorder), **Parallel Recalculation**, **Sharing recalculation** | |
| **Logs > Debug Logs** | Trace flags (user, Apex class/trigger, Automated Process, Platform Integration, guest user) with debug levels per category (Apex Code, Apex Profiling, Callout, Database, NBA, System, Validation, Visualforce, Wave, Workflow). Trace flags last up to 24 hours. Each log max 20 MB (truncated beyond that). Org log storage max 1,000 MB. Logs auto-deleted after 24 hours (sandbox/prod) (verify). |
| **Logs > Email Log Files** | Request email logs up to 30 days back (each request covers up to 7 days). |
| **Monitoring** | API Usage Notifications, Case Escalations, Email Log Files, Outbound Messages, Time-Based Workflow, Paused Flows, Apex Flex Queue, Bulk Data Load Jobs, Asynchronous Processes, Event Log File Browser, Security Center/Health. **Company Information > API Requests, Last 24 Hours** shows API consumption. **System Overview** (Setup Home or Quick Find) shows usage vs. limits for data/file storage, API requests, custom objects, Apex code chars, business logic, and portal roles. |
| **Critical/Release Updates**, **Release Updates Assistant** | |
| **Hyperforce Assistant** | Migration readiness checks (hard-coded instance URLs, IP allowlists) for moving to Hyperforce (public cloud infrastructure). |

### 3.10 Integrations
| Node | Purpose |
|---|---|
| **Named Credentials** | Endpoint URL plus authentication for callouts (Apex `callout:MyNC/path`, External Services, Flow HTTP Callout, External Data Sources). The **newer model** splits a Named Credential (URL, callout options such as "Generate Authorization Header" and "Allow Formulas in HTTP Header/Body") from an **External Credential** (auth protocol: No Auth, Basic, OAuth 2.0 browser/client credentials/JWT bearer, AWS Signature V4, Custom with custom headers). External Credential **Principals** (Named Principal = shared identity; Per-User Principal = each user authenticates) are granted to users through **permission sets** ("External Credential Principal Access"). Legacy Named Credentials (auth inline) are deprecated for new use (verify). A Named Credential callout bypasses Remote Site Settings. |
| **External Credentials** | See above. User External Credentials (`UserExternalCredential`) store per-user tokens. |
| **Remote Site Settings** | Allowlist of base URLs that Apex/VF/S-control callouts may reach **without** a Named Credential. Option "Disable Protocol Security" (allows HTTP from HTTPS). |
| **CORS** | Allowlist of origins whose browser JavaScript may call Salesforce REST/Bulk/Chatter/UI API endpoints (XHR/fetch from external web apps). Wildcards allowed in subdomains (for example `https://*.example.com`). Option to enable CORS for OAuth endpoints. |
| **CSP Trusted Sites** | Allowlist of external domains that **Lightning pages/components and LWC** can load resources from or connect to (connect-src, font-src, frame-src, img-src, media-src, style-src, script-src flags). Context: All, LEX, Experience Builder sites, Visualforce. Without it, the browser's Content Security Policy blocks the request. |
| **Trusted URLs** (renamed CSP Trusted Sites in newer releases) | In recent releases the node is labeled "Trusted URLs" (verify). |
| **External Services** | Register an OpenAPI 2/3 spec, then get invocable actions for Flow and Apex. |
| **Platform Events**, **Change Data Capture**, **Event Relays** (to AWS EventBridge), **Pub/Sub API** | Event integration. |
| **Auth. Providers** (see §4.2), **Outbound Messages** (workflow), **API** (download WSDLs, Enterprise/Partner/Metadata/Apex/Tooling), **Salesforce Connect / External Data Sources**, **MuleSoft / Data Cloud connectors** | |

### 3.11 Offline / User Engagement / Mobile
Briefcase Builder (offline record sets for mobile), Mobile Application settings (session timeouts, PIN), Salesforce Mobile App (navigation menu, offline), In-App Guidance, Adoption Insights (verify).

---

## 4. Settings section

### 4.1 Company Settings
| Node | Purpose / key facts |
|---|---|
| **Company Information** | Org ID (15-char 00D...), org name, edition, instance (pod), primary contact, default locale/language/time zone, **Corporate Currency** (non-multicurrency: org currency), fiscal year start month, newsletter flags, **API Requests, Last 24 Hours**, **Streaming API events**, **User Licenses**, **Permission Set Licenses**, **Feature Licenses** (Marketing User, Offline User, Knowledge User, Service Cloud User, Flow User legacy, and so on), **Usage-based Entitlements**. "Activate Multiple Currencies" checkbox is here after Support enables the feature (verify). |
| **Fiscal Year** | **Standard** (Gregorian, start month, name by start or end year) or **Custom** (4-4-5, 5-4-4, 4-5-4, 13 periods, custom). **Enabling custom fiscal years cannot be undone** and affects forecasts, reports, and quotas. Custom fiscal years must be defined year by year. |
| **Business Hours** | One default plus additional sets (time zone, per-day hours, 24-hour options). Used by case escalation rules, entitlement milestones, Omni-Channel, and the `BusinessHours` Apex class (`add`, `diff`, `isWithin`). |
| **Holidays** | Dates (single or recurring) associated with Business Hours. Escalation and milestone timers pause during holidays. |
| **Language Settings** | Enable end-user languages and platform-only languages. Turn on "Enable End User Languages" and "Enable Platform-Only Languages". |
| **Currency Management** (after Multi-currency is enabled) | Active currencies, conversion rates. **Advanced Currency Management (ACM)** adds **dated exchange rates** (used by Opportunities, Opportunity Products, Opportunity Splits, and custom currency fields on Opps) vs. static rates elsewhere. **Multi-currency cannot be disabled once enabled.** Enable in **Company Information > Edit > Activate Multiple Currencies** (may require a Support case in some editions) (verify). Adds `CurrencyIsoCode` to every record. Users have a personal currency. Reports convert to the user's currency. Roll-up summaries under ACM use static rates (dated rates are not applied to roll-ups). |
| **Data Protection and Privacy / Privacy Center** | Individual object (consent tracking), Consent Management objects, data deletion/portability policies (Privacy Center add-on). |
| **My Domain** | Org-specific subdomain `<name>.my.salesforce.com`. **Mandatory** (required for all orgs since Winter '22/'23) with **enhanced domains** enforced (Summer/Winter '23-'24). Used by SSO, Lightning components, and Experience Cloud. Formats: `<mydomain>.lightning.force.com`, `<mydomain>--c.vf.force.com`, `<mydomain>.my.site.com` (Experience sites), `<mydomain>--<sandbox>.sandbox.my.salesforce.com`. Settings: redirect policy, login page branding (logo, background, right-frame URL), authentication services shown on the login page (username/password, SAML IdPs, Auth Providers), "Prevent login from https://login.salesforce.com" (forces My Domain login). A rename requires deploy plus redirect handling and breaks hard-coded URLs. |
| **Translation Workbench** | Enable, then **Translation Language Settings** (assign translators per language, activate), **Translate** (UI to translate labels: custom fields, picklist values, record types, layouts sections, validation error messages, custom labels, flows, and so on), **Override** (override translations from managed packages), **Export** (Source, Untranslated, Bilingual .xlf/.stf) and **Import**. Data translation for records requires separate features (for example Knowledge multilingual). |

### 4.2 Identity
| Node | Purpose |
|---|---|
| **Single Sign-On Settings** | Configure Salesforce as a **SAML Service Provider**: SAML enabled, SSO configurations (Issuer, IdP certificate, Entity ID, SAML Identity Type: username / Federation ID / user ID, Identity location: Subject NameID or attribute, request signing certificate, binding: HTTP POST/Redirect, IdP login URL, logout URL, **Just-in-Time (JIT) provisioning** standard or custom via Apex `Auth.SamlJitHandler`). "Delegated Authentication" (legacy SOAP callout to your endpoint for password validation, needs Support to enable, with the "Is Single Sign-On Enabled" user permission). |
| **Identity Provider** | Enable Salesforce as a **SAML IdP** (choose a certificate), then service providers are defined as connected apps / ECAs with SAML settings. Also provides OpenID Connect via connected apps. |
| **Auth. Providers** | Social and OIDC sign-in plus API auth: Salesforce, Google, Facebook, Microsoft (Azure AD / Entra), Apple, GitHub, LinkedIn, Twitter, Janrain, **OpenID Connect** (generic), Custom (Apex `Auth.AuthProviderPluginClass`). Registration Handler Apex class (`Auth.RegistrationHandler`) creates/updates users. Used for login (on the My Domain login page or Experience site) and for Named Credential OAuth (legacy) / External Credentials. Provides Test-Only Initialization URL, Single Sign-On Initialization URL, Callback URL. |
| **Identity Verification** | MFA settings: allowed verification methods (Salesforce Authenticator, TOTP authenticator apps, security keys (U2F/WebAuthn), built-in authenticators (Touch ID / Windows Hello / passkeys), email, SMS for verification-only flows), "Require MFA for all direct UI logins to your Salesforce org" (see §5.3), "Let users verify their identity with a physical security key / built-in authenticator", and "Show all methods" for registration. **Identity Verification History** shows events. |
| **Login Discovery / Login Flows** | Login Flows (a Flow or VF page run after authentication, assigned per profile). Login Discovery for Experience Cloud / passwordless sign-in. |
| **OAuth and OpenID Connect Settings** | Allow OAuth Username-Password flows (**blocked by default** in newer orgs), Allow OAuth User-Agent flows, Allow Authorization Code and Credentials flows (headless), Device Flow. |
| **Connected App / ECA policies** | See §3.1. |
| **Identity Connect**, **User Provisioning** (SCIM-like outbound provisioning to connected apps), **Salesforce Identity** licenses (Identity, External Identity) | |

### 4.3 Security
| Node | Purpose / key facts |
|---|---|
| **Health Check** | See §1.3. |
| **Sharing Settings** | Organization-Wide Defaults (internal and external), "Grant Access Using Hierarchies" per custom object (cannot be turned off for standard objects), sharing rules per object, Manual User Record Sharing, Manager Groups (enable), Standard Report Visibility, Secure guest user record access (enforced), "Require permission to view record names in lookup fields", Default External Access, and **Defer Sharing Calculations** (permission needed; suspend group membership and sharing rule recalc during big changes). |
| **Field Accessibility** | View FLS by field or by profile. |
| **Password Policies** | Org-wide (profile overrides possible): User passwords expire in (30/60/90 days/180 days/1 year/Never; **default 90 days**), Enforce password history (default 3), Minimum password length (default 8; configurable 5-50), Password complexity requirement (default "must mix alpha and numeric"; options up to upper+lower+numbers+special), Password question requirement, **Maximum invalid login attempts** (default 10; 3/5/10/no limit), **Lockout effective period** (default 15 minutes; 30 min, 60 min, Forever (admin reset)), Obscure secret answer, Require a minimum 1 day password lifetime, Allow use of setPassword() API for self-registered users, forgot-password message, API-only user redirect. Changes apply at the next password change. |
| **Session Settings** | **Timeout value**: 15 min, 30 min, 1/2/4/8/12/24 hours (**default 2 hours**). Disable session timeout warning popup; Force logout on session timeout. **Lock sessions to the IP address from which they originated**, **Lock sessions to the domain in which they were first used**, Require secure connections (HTTPS) (always on now), Force relogin after Login-As-User, Require HttpOnly attribute, Use POST requests for cross-domain sessions, Enforce login IP ranges on every request, **Enable clickjack protection** (setup pages, non-setup pages, VF with/without standard headers, Experience sites), CSRF protection, CSP and XSS protections, **Session Security Levels** (Standard vs. High Assurance; which methods count as high assurance: MFA, delegated, SAML), Logout URL, Cache/autocomplete, cookie consent, Permanent session cookies, and "Enable the SMS method of identity confirmation". Profiles can override session timeout and require a **Session Security Level at login** (High Assurance). Reports/dashboards and connected apps can require High Assurance (step-up). |
| **Network Access** | Org-level **Trusted IP Ranges**: users logging in from these IPs **skip identity verification (email/SMS device activation)** but still get MFA challenges if enforced. **They do not restrict login** (that is profile Login IP Ranges). |
| **Login IP Ranges (profile)** | Profile-level allowlist: logins **outside** the range are **denied** (UI and API, unless the connected app has IP Relaxation). With "Enforce login IP ranges on every request" (Session Settings), the check applies to every request, not just login. |
| **Login Hours (profile)** | Per-day allowed time windows (in the org default time zone). Users are logged out when the window ends (they can't save in-progress work). |
| **Certificate and Key Management** | Self-signed certs (valid 1 year by default) or CA-signed certs (CSR, upload signed). Used for SAML signing, JWT bearer flow, mutual TLS (outbound client cert, inbound **Mutual Authentication** certificate), DKIM is separate. **Export to Keystore / Import from Keystore** (JKS). The org's default API client certificate for outbound messages. Master encryption key management (Classic encrypted fields). Expiring certs cause SSO/JWT outages, so watch expiry. |
| **Platform Encryption** (Shield or add-on) | **Encryption at rest** using tenant secrets: Key Management (generate, rotate, export, destroy, BYOK, Cache-Only Key Service), Encryption Policy (choose fields, files, attachments, search indexes, Chatter, Event Bus, Einstein, and similar). Schemes: **Probabilistic** (default, strongest, fields can't be filtered/sorted much) vs. **Deterministic** (case-sensitive or case-insensitive; allows filtering, unique/external ID matching, and some SOQL WHERE use). Limitations: affects formula fields, sorting, criteria-based sharing on encrypted fields, report filters, and some apps. Different from **Classic Encryption** (the Encrypted Text field type, 175 chars, masked, "View Encrypted Data" permission) that is free. |
| **Event Monitoring** (Shield or add-on) | **Event Log Files** (hourly/daily CSV logs of ~70 event types: Login, Logout, API, REST API, Bulk API, Report, ReportExport, URI, Lightning page views, Apex execution, VF requests, and so on) via the API or the **Event Log File Browser** (in Setup). **Real-Time Event Monitoring** (streaming/stored events such as LoginEventStream, ApiEventStream, ReportEvent) and **Transaction Security Policies** (Condition Builder or Apex `TxnSecurity.EventCondition` to block, require MFA, or notify on e.g. large report exports). Free tier: Login, Logout, Total API Usage, and Insecure External Assets event log files with 1-day retention (verify). Paid: 30-day retention (1-year with longer retention add-on). **Event Monitoring Analytics app** (CRM Analytics) for dashboards. |
| **Field Audit Trail** (Shield or add-on) | Extends **field history retention** up to **10 years** (default standard field history: 18 months in UI, 24 months via API). Track **up to 60 fields per object** (vs. 20 standard). Retention policy is defined per object via the Metadata API (`HistoryRetentionPolicy`). Archived data is in `FieldHistoryArchive` (Big Object). |
| **Data Detect** (Shield) | Scans data for sensitive info (PII patterns), and suggests classification. |
| **Security Center** | Multi-org security posture dashboard (paid). |
| **Remote Site Settings / CSP Trusted Sites / CORS** | Also listed under Security in some Quick Find results (see §3.10). |
| **File Upload and Download Security** | Per file type: download (as attachment), execute in browser, or hybrid. "Don't allow HTML uploads as attachments or document records". |
| **Login Access Policies** | **"Administrators Can Log in as Any User"** (org-wide). Without it, users must **Grant Login Access** (My Settings > Grant Account Login Access) for a period of time (1 day to 1 year) to admins or to Salesforce support / package publishers. Also controls whether specific packages' support can request access. |
| **Transaction Security** | See Event Monitoring. Starting 2026, Salesforce enforced a **default policy requiring MFA for large report exports** (more than 10,000 records) and step-up auth for exports (verify exact configuration). |
| **Guest User / Public Access Settings** | For Sites/Experience Cloud (guest profile, secure guest access). |
| **Expire All Passwords** | Forces every user (except those with "Password Never Expires") to reset at next login. |
| **Activations** | List of activated browsers/devices (identity verification) with "Remove". |
| **Session Management** | View and end active sessions (yours or others', depending on permission "Manage Users"). |
| **Login Flows**, **Trusted URLs for Redirects**, **Named Credentials** | |

### 4.4 Audit and monitoring (spread across Setup)
| Feature | Where | Retention / notes |
|---|---|---|
| **Login History** | Setup > Login History; per user on User detail | **6 months**. UI shows the last 20,000 records. Download as CSV/GZIP up to 6 months. Columns: login time, username, source IP, login type (Application, SAML, OAuth, Remote Access 2.0), status (Success, Invalid Password, Restricted IP, and so on), browser, platform, application, client version, API type/version, login URL, TLS. Also the `LoginHistory` object via SOQL. |
| **Identity Verification History** | Setup | MFA and device activation events, 6 months. |
| **Setup Audit Trail** | Setup > View Setup Audit Trail | The last **20 changes** are shown on screen. **Download the last 180 days** as CSV. Records who changed what in Setup (including delegated admins and Login-As actions: "Logged in using Login-As access"). `SetupAuditTrail` object via SOQL for 180 days. Longer retention needs Field Audit Trail/Event Monitoring exports (verify). |
| **Field History Tracking** | Object Manager > Fields > Set History Tracking | **20 fields per object** (60 with FAT). **18 months** visible, data up to 24 months via the API before deletion. Long text area changes are tracked without values. |
| **Debug Logs** | §3.9 | 24 hours. |
| **Event Monitoring** | §4.3 | 1 / 30 / 365 days. |
| **Apex Exception emails**, **Flow error emails** | Process Automation Settings | |
| **Proactive monitoring** (Salesforce Signature) | Paid | |

---

## 5. Authentication and identity in more depth

### 5.1 Login flow overview
1. User goes to My Domain login (or login.salesforce.com / test.salesforce.com).
2. Checks: user is active and not frozen, the password/SSO is valid, Login Hours, profile Login IP Ranges (deny if outside), org Trusted IP ranges (skip device activation).
3. Identity verification / MFA (if required, or a new device or browser outside trusted IP ranges).
4. Login Flow (if assigned to the profile).
5. Session established with a security level (Standard or High Assurance).

### 5.2 Login methods
- Username + password (UI). API with password + **security token** (needed when the IP is not in trusted ranges or the profile ranges; reset it via My Settings > Reset My Security Token). The **OAuth Username-Password flow is blocked by default** for new orgs (verify).
- SAML SSO (SP-initiated through My Domain, or IdP-initiated).
- OpenID Connect / social login via Auth Providers.
- OAuth flows for apps: Web Server (Authorization Code, with PKCE), User-Agent, JWT Bearer, Client Credentials (with run-as user), Device, Refresh Token, Asset Token, SAML Bearer, Token Exchange, and Headless flows (Experience Cloud).
- **Passwordless login** for external users (Experience Cloud).
- **Delegated authentication** (legacy).
- API-only users: profile/perm set permission **"API Only User"** (cannot log into the UI). The **Salesforce Integration** user license plus the **Salesforce API Integration** PSL are intended for integration users (5 free in Enterprise/Unlimited/Performance (verify)).

### 5.3 MFA requirements (2026 state)
- Salesforce contractually required MFA for all UI logins from February 1, 2022. It was auto-enabled for direct logins through 2023-2024 releases.
- **2026 enforcement (Summer '26)** (verify exact dates for your org):
  - **MFA enforced for all internal/employee users** (Salesforce and Salesforce Platform licenses, among others). The "Require MFA for all direct UI logins" setting is force-enabled and greyed out. Reported dates: sandboxes from **June 22, 2026**, production from **July 20, 2026**. Extensions are by request only.
  - **Phishing-resistant MFA (PRMFA)** required for **privileged users**: System Administrators and users with **Modify All Data, View All Data, Customize Application, or Author Apex**. Accepted: **passkeys / built-in authenticators** (Touch ID, Face ID, Windows Hello) and **physical security keys** (FIDO2/WebAuthn). TOTP apps and Salesforce Authenticator push **do not qualify** for PRMFA. Reported production enforcement **July 1, 2026**. A temporary "PRMFA (Passkeys) Extension" defers only the passkey requirement.
  - **Step-up authentication for report exports** (re-auth window default 120 minutes) and a **default Transaction Security Policy** prompting MFA for report exports over 10,000 records.
  - **Blocking of anonymizing VPN/proxy/high-risk IP logins** (reported April 2026), plus **login anomaly detection** that can freeze users and revoke tokens.
- **SSO logins**: MFA satisfied at the IdP counts. Salesforce requires MFA to be enforced at the IdP for SSO users.
- **Exempt**: API logins (integrations), Experience Cloud external users (MFA optional but recommended), automated test users (can get the "Waive Multi-Factor Authentication for Exempt Users" permission, used sparingly; Salesforce has narrowed exemptions (verify)).
- Admin tools: MFA Assistant (Setup), "Multi-Factor Authentication for User Interface Logins" permission (legacy, per-user), Identity Verification Methods report, and "Disconnect Salesforce Authenticator" / "Remove" on the user detail page to reset methods.
- **Device activation / identity verification (email codes)** is separate from MFA. It happens when logging in from an unrecognized browser outside Trusted IP Ranges. Salesforce removed SMS as a primary method in some contexts (verify).

### 5.4 SSO / identity checklist
- My Domain deployed (required).
- Choose Federation ID mapping (common: Federation ID = corporate email/UPN).
- Upload the IdP certificate and keep track of expiry.
- Consider JIT provisioning vs. SCIM provisioning from the IdP (Okta, Entra ID).
- Disable "Login form" on the My Domain login page only after confirming break-glass admin access (keep 1-2 admins with password + MFA).
- Enable "Prevent login from login.salesforce.com" for stricter control.

---

## 6. Security model in depth

### 6.1 Layers (outermost to innermost)
| Layer | Mechanism | Question answered |
|---|---|---|
| **Org access** | Users and licenses, password policies, MFA, SSO, Login Hours, Login IP ranges, Trusted IPs, session settings, My Domain, connected app policies | Can this person get into the org at all, from where and when? |
| **Object-level** | Object permissions (CRUD + View All / Modify All) on profiles and perm sets | Can the user read, create, edit, or delete *any* records of this object? |
| **Field-level (FLS)** | Read / Edit per field on profiles and perm sets | Which fields can the user see or edit? |
| **Record-level** | OWD, role hierarchy, sharing rules, teams, territories, manual sharing, implicit sharing, Apex managed sharing, restriction and scoping rules | Which specific records can the user see and edit? |

Effective access = **Object permission AND record access AND field access**. Object permissions are the ceiling: record sharing can never give more than the object permission allows (for example, Read/Write sharing on a record does not allow Edit if the user lacks the Edit object permission). Page layouts only affect UI presentation; they are **not security** (fields hidden on a layout are still accessible via API, reports, and list views if FLS allows).

### 6.2 Object-level permissions
| Permission | Meaning |
|---|---|
| **Read** | View records the user has record-level access to |
| **Create** | Create records (needs Read) |
| **Edit** | Edit records the user has record-level write access to (needs Read) |
| **Delete** | Delete records the user owns or has Full Access to (needs Read + Edit) |
| **View All** (object) | Read all records of the object regardless of sharing (bypasses OWD/sharing for Read) |
| **Modify All** (object) | Read, edit, delete, transfer, and approve all records of the object regardless of sharing. Implies View All. |
| **View All Fields** (object) | Read access to all fields on the object regardless of FLS (newer permission) (verify scope) |

- **Org-wide equivalents**: **View All Data** (read all records of all objects) and **Modify All Data** (read/edit/delete all records, plus many admin powers). **View All Data and Modify All Data do not override FLS**. Field visibility still follows FLS (although Modify All Data users typically have the System Administrator profile with all FLS).
- Detail objects in master-detail inherit sharing from the master. The user needs Read on the master to see detail records. Object permissions are still separate for the detail object.
- "View All Records" and "Modify All Records" on an object (perm set) are useful for, for example, support managers on Case without granting View All Data.

### 6.3 Field-level security (FLS)
- Per field: **Read Access** (visible) and **Edit Access** (editable). No read means the field is hidden everywhere: UI, reports, list views, search, API, and **Apex running `WITH USER_MODE` / `WITH SECURITY_ENFORCED` / `Security.stripInaccessible`**. Apex in system mode ignores FLS unless enforced.
- Set during field creation (the wizard step "Establish field-level security" by profile, or by perm set when that toggle is on), in Object Manager > Field > "Set Field-Level Security", per profile/perm set (Field Permissions), or with **Field Accessibility** (Setup).
- Universally required fields (required at the field definition) and master-detail fields can't have FLS removed. They are always visible and editable for users with Create.
- Formula, roll-up summary, and auto-number fields are read-only by nature.
- Encrypted (Classic) fields additionally need "View Encrypted Data" to see unmasked values.
- Best practice: grant FLS in **permission sets**, leave profiles minimal ("Minimum Access - Salesforce" profile as the base).

### 6.4 Record-level access

#### 6.4.1 Organization-Wide Defaults (OWD)
Baseline record access for users who are not the owner. Set the most restrictive level needed, then open up with sharing.

| OWD value | Meaning | Objects |
|---|---|---|
| **Private** | Only owner and those above in the role hierarchy (if Grant Access Using Hierarchies) plus shared users | Most objects |
| **Public Read Only** | All internal users can view, only the owner (and sharing) can edit | Most |
| **Public Read/Write** | All internal users can view and edit (not delete or transfer unless Full Access) | Most |
| **Public Read/Write/Transfer** | Plus transfer ownership | **Leads, Cases** (and some service objects) |
| **Public Full Access** | View, edit, transfer, delete | **Campaigns** |
| **Controlled by Parent** | Access follows the parent record | Contacts (when Account is Private, Contact can be Controlled by Parent), detail objects in master-detail (always), Activities, Order (Controlled by Parent of Account) |
| **Use / View Only / No Access** | Price Books: Use (can add to opps), View Only, No Access | **Price Book** |
| **Hide Details / Show Details / Hide Details and Add Events / Show Details and Add Events / Full Access** | Calendar sharing | **Calendar** |

- **External OWD** (for Experience Cloud/portal users, guest users) must be **equal to or more restrictive** than the internal OWD. External defaults are always enabled now.
- **Grant Access Using Hierarchies**: on for all standard objects (can't disable). Can be unchecked for custom objects (then managers do not inherit their subordinates' record access).
- Changing an OWD triggers a sharing recalculation (can take time; locks). Use **Defer Sharing Calculations** for large orgs.
- Related standard object coupling: when Account OWD is Private, Contact is usually Controlled by Parent (or Private). Contacts, Opportunities, and Cases can't be set more open than Account in ways that conflict (Setup enforces valid combinations). Implicit parent sharing grants Read on the Account to anyone with access to a child Opp/Case/Contact.
- Activities: Private or Controlled by Parent.
- Users object: the OWD for User can be Private or Public Read Only (for internal users).

#### 6.4.2 Role hierarchy
- Users get access to records **owned by or shared with** users below them in the hierarchy (for objects with Grant Access Using Hierarchies). The access level is the same as the subordinate's (read or edit).
- Role settings per role for **Opportunity**, **Case**, and **Contact** access: "Users in this role can view/edit all opportunities/cases/contacts associated with accounts they own" (Account owners' access to child records).
- Role hierarchy is not an org chart. Design it for data access. Keep it shallow (limit roughly 10 levels for performance (verify)).
- Portal/Experience roles: Partner (up to 3 levels: Executive, Manager, User; default 1) and Customer Community Plus roles under the account owner's role.
- **Manager Groups**: share with a user's management chain (based on the User.Manager field, not roles). Usable in manual and sharing rules.
- **Role hierarchy does not apply** to users without a role. A user without a role can still own records, but nobody inherits access to those records through the hierarchy. Experience Cloud account owners must have a role.

#### 6.4.3 Sharing rules
| Type | Basis | Notes |
|---|---|---|
| **Owner-based** | Records owned by members of a group/role/roles+subordinates/territory | Share with group/role/roles+subs/territory. Read Only or Read/Write. |
| **Criteria-based** | Field values on the record (not formula fields in most cases, no multi-select picklists, certain field types only, owner field unavailable on some objects) | Same targets. For Account rules you can also set access to child Opps, Cases, and Contacts. |
| **Guest user sharing rules** | Criteria-based only, for unauthenticated site users | Read Only only. |

- Sharing rules **only open up** access (they can't restrict below OWD).
- Limits: **300 sharing rules per object** total, of which **50 criteria-based** (verify; may be higher with Support).
- Objects with Public Read/Write OWD can't have sharing rules (nothing to open).
- Recalculation happens automatically. The "Recalculate" button exists per object.
- **Account sharing rules** can grant Contact/Opportunity/Case access (child access levels).
- Sharing rule targets: Public Groups, Roles, Roles and Subordinates, Roles/Internal and Portal Subordinates, Territories, Territories and Subordinates, and Manager Groups (for manual).

#### 6.4.4 Manual sharing
- The record owner, users above the owner in the role hierarchy, users with Full Access to the record, or admins can click **Sharing** (Lightning: the "Sharing" button/action, "Sharing Hierarchy" to see who has access and why).
- Shares are removed when record ownership changes (manual shares are deleted on owner change, unless "Keep sharing" options exist for some objects in newer releases (verify)).
- Stored in the object's `__Share` / `XxxShare` table with `RowCause = 'Manual'`.

#### 6.4.5 Teams
- **Account Teams**, **Opportunity Teams**, **Case Teams** (predefined teams with Case Team Roles). Team members get specified access (Read Only / Read/Write) to the record and, for Account Teams, to related Opps/Cases/Contacts.
- Enable in Feature Settings. Default teams on user records (default Account Team / Opportunity Team auto-added on create).
- Team shares have RowCause `Team`.

#### 6.4.6 Enterprise Territory Management (ETM)
- Territory models (Planning, Active, Archived; only one active at a time), territory types with priority, territory hierarchy, **assignment rules** (auto-assign Accounts based on criteria), users assigned to territories with roles in territory, and access levels per territory for Account, Opportunity, Case, and Contact.
- Grants access through the territory hierarchy (users in parent territories gain access).
- Opportunity territory assignment via the Apex filter class (`TerritoryMgmt.OpportunityTerritory2AssignmentFilter`).
- Used for forecasting by territory. Original (legacy) Territory Management is retired.

#### 6.4.7 Implicit sharing (built-in, non-configurable)
| Type | Effect |
|---|---|
| **Parent implicit** | Read-only access to the parent **Account** for users with access to a child Opportunity, Case, or Contact |
| **Child implicit** | Account owners get access to child Opps/Cases/Contacts per role settings |
| **Portal implicit** | Portal/Experience users get access to their own Account/Contact |
| **High-volume portal** (Customer Community) | Uses sharing sets / share groups instead of roles. **Sharing Sets** grant access to records whose lookup matches the user's Account or Contact. **Share Groups** give internal users access to records owned by high-volume users. |

#### 6.4.8 Apex managed sharing
- Programmatic sharing by inserting `<Object>__Share` (custom objects) or `AccountShare`, `OpportunityShare`, and similar records with a **custom Apex Sharing Reason** (custom objects only; RowCause = reason name). Shares with custom reasons **persist through owner changes**. Shares with `RowCause = Manual` do not.
- Requires the code to run in system context. Users need "Modify All Data" to edit those shares in the UI.
- Recalculation: an "Apex Sharing Recalculation" batch class per custom object (Setup > Object > Apex Sharing Recalculation).
- Fields: `ParentId`, `UserOrGroupId`, `AccessLevel` ('Read' / 'Edit'; 'All' not insertable), `RowCause`.

#### 6.4.9 Restriction rules and scoping rules
| Feature | What it does | Notes |
|---|---|---|
| **Restriction Rules** | **Reduce** which records a set of users can see, *filtering* records they would otherwise have access to (applies after sharing). Criteria on the user (User Criteria) and the record (Record Criteria). Applies to list views, lookups, related lists, reports, search, SOQL, and the API. | Supported: custom objects, Contracts, Events, Tasks, Time Sheets, Time Sheet Entries, external objects, and more objects added over releases (verify list). Limited to a small number of active rules per object (was 2; reportedly increased) (verify). The only way to restrict below OWD/sharing for some users without redesigning the model. Not a substitute for proper sharing. Interaction with View All / Modify All Data varies by context (verify). |
| **Scoping Rules** | Sets the **default scope** of records shown (for example, "My team's records") in list views, reports, search, and lookups. It is a convenience filter, **not security**: users can still access other records. Uses `USING SCOPE scopingRule` in SOQL. | Supports Account, Case, Contact, Event, Lead, Opportunity, Task, and custom objects. |

#### 6.4.10 Other record-access mechanisms
- **Record ownership** (owner always has full access; queue members on queue-owned records).
- **Delegated External User Admin** (partner admins).
- **Sharing Sets / Share Groups** (Experience Cloud).
- **Folder sharing** for reports, dashboards, and email templates (Viewer / Editor / Manager).
- **Approval process** record locking (locked records are editable only by admins or the approver if allowed).
- **"With sharing" / "without sharing" / "inherited sharing"** in Apex: whether record sharing is enforced in code. Use `WITH USER_MODE` for CRUD/FLS + sharing.
- **Sharing Hierarchy / "View All" users in Sharing** button: explains why a user has access (Lightning: "Sharing Hierarchy" action).
- **Data categories** (Knowledge) and **Experience Cloud audience** visibility.
- **Record type access** does not restrict viewing records of that type. It only controls which record types a user can assign on create/edit.

### 6.5 Profiles vs permission sets

#### 6.5.1 Comparison
| Capability | Profile | Permission Set / PSG |
|---|---|---|
| Per user | Exactly one (required) | Many (up to 1,000 assignments per user? limits apply (verify)) |
| Object CRUD, View/Modify All | Yes | Yes |
| FLS | Yes | Yes |
| System permissions | Yes | Yes |
| App/tab visibility | Yes (Default On/Off/Hidden) | Yes (Visible/Available) |
| Apex class, VF page, custom permission, flow, external credential principal access | Yes | Yes |
| Record type *access* | Yes | Yes |
| **Default record type** | Yes | No |
| **Page layout assignment** | Yes | No (Dynamic Forms / Lightning page activation by profile are separate) |
| **Login hours / Login IP ranges** | Yes | No |
| **Session settings / password policy overrides** | Yes | No |
| **Default app** | Yes | No |
| Tied to license | Always | Optional (or "--None--") |
| Remove permissions | n/a | Via muting perm sets in a PSG only |
| Deployable | Yes (profile metadata is notoriously messy) | Yes (clean) |

#### 6.5.2 Profile permission retirement (status in 2026)
- In 2023 Salesforce announced an end of life for **permissions on profiles** (object, field, user permissions, and so on). Profiles would keep only login hours, IP ranges, default record types, page layouts, default apps, and session/password settings. The target was **Spring '26**.
- **That retirement has been cancelled.** As reported in mid-2026 (around June 2026), Salesforce cancelled the forced end of life. Profiles **continue to support permissions** with no enforced date (verify if a new timeline is announced).
- **Direction is unchanged**: a permission set-led model. Use the **"Minimum Access - Salesforce"** (or "Minimum Access - API Only Integrations") profile as the base. Grant access via perm sets bundled into PSGs by persona, and automate with **User Access Policies**. New feature investments land in perm sets.
- Supporting features: Enhanced profile views, "User Access Summary" (shows a user's effective permissions and their sources; from the user record "View Summary") (verify), **Permission Set "Object Permissions summary"**, "Assigned Users" related list, and Permission Set Group "View Summary".

#### 6.5.3 Standard profiles
System Administrator, Standard User, Minimum Access - Salesforce, Minimum Access - API Only Integrations, Read Only, Marketing User, Contract Manager, Solution Manager, Standard Platform User, Chatter Free User, Chatter External User, Chatter Moderator User, Customer Community / Partner Community / Customer Community Plus (and Login variants), Authenticated Website, High Volume Customer Portal, Guest (site-specific), Identity User, Salesforce API Only System Integrations, Analytics Cloud Integration User. Standard profiles: permissions **cannot be edited** (except some settings such as page layouts, tabs, apps, login hours, IP ranges, password policies, and session settings); clone to customize.

#### 6.5.4 Permission set licenses (PSL) and feature licenses
- **User license**: base entitlement (one per user). Determines which profiles and features are possible.
- **Permission Set License**: incremental entitlement (for example, "Sales Cloud Einstein", "CRM Analytics Plus", "Field Service Mobile", "Salesforce CPQ", "Agentforce", "Data Cloud", "Identity Connect", "Company Community for Force.com"). Assign the PSL to the user, then a perm set using it.
- **Feature License**: per-user flag on the user record: Marketing User (create campaigns), Offline User, Knowledge User, Service Cloud User (console), Flow User (legacy, no longer needed for running flows), Sales Anywhere, CRM Content User, Chatter Answers, Site.com Contributor/Publisher, WDC.
- **Managed package licenses**: Installed Packages > Manage Licenses (seat assignment). Site-wide licenses need no assignment.

### 6.6 Key system (user) permissions
| Permission | What it grants / why it matters |
|---|---|
| **Modify All Data** | Full CRUD on all records of all objects, ignoring sharing. Implies View All Data. Also bulk delete, mass transfer, edit any Apex sharing. Required for many admin actions. **Privileged** (PRMFA required in 2026). |
| **View All Data** | Read all records of all objects regardless of sharing (not FLS). Privileged (PRMFA). |
| **View All Users** | See all user records regardless of User OWD. |
| **View Setup and Configuration** | Read-only access to Setup pages (needed for many dev/test users). |
| **Customize Application** | Create and edit custom objects, fields, layouts, record types, validation rules, workflow, apps, tabs, themes, and many settings. Implies View Setup. Privileged (PRMFA). |
| **Author Apex** | Create, edit, and deploy Apex classes and triggers (in sandbox/dev; in production via deployment). Requires API Enabled and View Setup. Effectively admin-level because Apex runs in system mode and can bypass sharing/CRUD/FLS. Privileged (PRMFA). |
| **Modify Metadata Through Metadata API Functions** | Deploy/retrieve metadata via the API without Customize Application (granular dev-ops permission). |
| **Manage Users** | Create/edit/deactivate users, assign profiles/perm sets, reset passwords, manage roles/groups/queues, Login As (if allowed). Effectively near-admin. |
| **Assign Permission Sets** | Assign perm sets (but not create them). |
| **Manage Profiles and Permission Sets** | Create and edit profiles/perm sets. |
| **Manage Roles**, **Manage Internal Users**, **Reset User Passwords and Unlock Users**, **Freeze Users** (verify name) | Granular user admin. |
| **Manage Sharing** | Edit OWD and sharing rules. |
| **Manage Data Integrations** | Data Integration Rules, Data Loader-ish. |
| **API Enabled** | Access any Salesforce API (needed for Data Loader, integrations, Workbench, CLI). |
| **API Only User** | Login via API only (no UI). |
| **Bulk API Hard Delete** | Delete records without the Recycle Bin. |
| **Transfer Record**, **Import Personal Contacts**, **Weekly Data Export**, **Export Reports**, **Run Reports**, **Create and Customize Reports**, **Manage Public Reports/Dashboards/List Views/Templates** | Data and report permissions. "Export Reports" is a common exfiltration risk. |
| **Manage Dashboards**, **View Dashboards in Public Folders**, **Schedule Reports**, **Subscribe to Reports** | |
| **Run Flows** | Execute flows (screen flows in the UI). Combined with flow-level access overrides. |
| **Manage Flow** | Create, edit, and activate flows. |
| **View Encrypted Data** | See Classic encrypted field values unmasked. |
| **Password Never Expires**, **Two-Factor/Multi-Factor Authentication for User Interface Logins / API Logins** (legacy) | |
| **Manage Connected Apps**, **Manage External Client Apps** (verify name), **Customize Application** for named credentials, **Manage Named Credentials** | Integration admin. |
| **Manage Translation**, **Manage Custom Permissions**, **Manage Certificates**, **Manage Encryption Keys**, **Customize Encryption Policy**, **View Event Log Files**, **Manage Transaction Security Policies** | Specialist admin. |
| **Edit Read Only Fields**, **Edit Events/Tasks**, **Mass Edits from Lists**, **Mass Email**, **Send Email**, **Convert Leads**, **Manage Cases**, **Transfer Cases/Leads** | Common business permissions. |
| **Manage Package Licenses**, **Download AppExchange Packages** (install) | |
| **Lightning Experience User** | Use LEX (vs. Classic). |
| **Hide Option to Switch to Salesforce Classic** | |
| **Bypass MFA for Exempt Users / "Waive Multi-Factor Authentication for Exempt Users"** | Use only for genuine exemptions (verify current availability). |
| **View All Data / Manage Users** (for Debug Logs) | Viewing and setting trace flags for other users needs View All Data or Manage Users (verify) |

### 6.7 Login As
- Admin goes to Setup > Users > "Login" link next to a user. In LEX, open the user detail page in Setup and click "Login".
- Requires **Login Access Policies > "Administrators Can Log in as Any User"** enabled (org-wide). Otherwise the user must have granted access (Grant Account Login Access). Cannot log in as a user with higher privilege in some cases (for example, delegated admins only for users in their groups).
- Lands as that user (sees exactly their access). Actions are recorded in the **Setup Audit Trail** ("Logged in as user X"). Records created show the impersonated user as CreatedBy. Setup changes made while logged in as another user show the admin in the audit trail's "Delegate User" column.
- Session setting **"Force relogin after Login-As-User"** (on by default): ends the session back to the admin's login page instead of returning.
- Cannot use Login As to access another user's **personal** settings like their email integration. You can't Login As into Experience sites without an "Log in to Experience as User" option on the Contact.
- Requires the "Manage Users" + "Modify All Data" (or delegated admin) permissions.

### 6.8 User licenses
| License | Typical use | Notes |
|---|---|---|
| **Salesforce** (full CRM) | Sales/Service users | Full standard objects (Leads, Opps, Cases, Forecasts, and so on). Editions: Starter, Pro Suite, Enterprise, Unlimited, Agentforce 1 (Einstein 1) editions (verify naming). |
| **Salesforce Platform** / **Lightning Platform Plus/Starter** | Custom app users | Accounts, Contacts, custom objects, and so on. **No Leads, Opportunities, Cases, Campaigns, Forecasts, Products, Quotes**. Platform Starter: up to 10 custom objects per user (verify). Platform Plus: 110. |
| **Salesforce Integration** | System-to-system API users | API-only, paired with the "Salesforce API Integration" PSL. Some free per org (5 in EE/UE (verify)). Profile: "Minimum Access - API Only Integrations". |
| **Identity** / **External Identity** | SSO-only users | Identity: internal users who need only SSO and the App Launcher. External Identity: customers (CIAM). |
| **Customer Community** | High-volume external customers | No roles; sharing via sharing sets. Login-based variant available. |
| **Customer Community Plus** | External customers needing roles/sharing and reports | Roles, sharing rules, reports/dashboards (read), delegated admin. |
| **Partner Community** (Partner Relationship Management) | Channel partners | Leads, Opps, Campaigns (read), roles, deal registration. |
| **Lightning External Apps / Plus** | External users of custom apps | |
| **Chatter Free** | Collaboration only | Chatter, people, groups, files. **No CRM records.** Free (allotment varies by edition) (verify). A Chatter Free user can be upgraded to a Salesforce license, but not the reverse. |
| **Chatter External** | Customers in Chatter groups | Invite-only. |
| **Chatter Only** (Chatter Plus) | Chatter plus limited records (accounts, contacts, 10 custom objects) | |
| **Guest User License** | Unauthenticated site visitors | One per site. Secured by guest sharing rules. |
| **Work.com / Analytics / CRM Analytics / Service Cloud Voice**, and so on | Add-ons (usually PSLs) | |

- License changes: a user's license can only change along with the profile, and not all transitions are allowed (for example, a Salesforce user can't be converted to an external Community license; external users are tied to Contacts).
- Counts: Setup > Company Information shows Total, Used, and Remaining licenses.

### 6.9 Freezing vs. deactivating users
| Action | Effect | When to use |
|---|---|---|
| **Freeze** | Blocks login immediately. **Does not free the license**. Everything stays assigned (roles, ownership, team memberships, approvals). Reversible with Unfreeze. | Immediate lockout (security incident, termination in progress) while you reassign items. Available when the user can't be deactivated yet (for example, default lead owner, workflow recipient, custom hierarchy field, sole recipient of an alert). |
| **Deactivate** | User can't log in. **License is freed**. Records keep the user as owner. **Cannot delete users**, ever. On deactivation, Salesforce removes the user from teams/sharing in some cases and keeps group membership in others (verify current behavior). Some blocking references prevent deactivation: default case/lead owner, Web-to-Lead/Case default creator, workflow email recipients, assignment rules, Customer Portal admins, delegated approvers, and so on. | Permanent offboarding. Before deactivating: transfer records, reassign queues, approvals, scheduled reports/dashboards (running user), flows' running user, integration credentials, and Named Credential per-user tokens. |
| **"Unlock"** | Clear lockout after too many failed logins | |
| **Reset password** | Emails a reset link (time-limited) (verify expiry) | |
| **Self-deactivation** (Experience users) | Optional setting | |

- **Scrambling user data** (sandbox: "Scramble Specific Users' Data") for GDPR right-to-be-forgotten requests.
- Users can't be deleted, but usernames can be changed to free them up (usernames are globally unique across all Salesforce orgs, in email format).
- **Inactive users can still own records** and be record owners in reports. Records owned by inactive users can be transferred via Mass Transfer or Data Loader. Updating records owned by an inactive user may need "Update Records with Inactive Owners" permission (verify).

---

## 7. Data management tools comparison
| Tool | Max records | Objects | Interface | Notes |
|---|---|---|---|---|
| Data Import Wizard | 50,000 | Standard (Accounts, Contacts, Leads, Solutions, Campaign Members, Person Accounts) + custom | Browser | Dedupe options, can disable automation |
| Data Loader | ~5,000,000 (guidance) | All API-accessible | Desktop/CLI | Bulk API, hard delete, export all |
| Dataloader.io (MuleSoft) | Plan-based | All | Web | Third-party (Salesforce-owned) |
| Workbench | Moderate | All | Web (community tool) | SOQL, REST explorer, deploy/retrieve; not officially supported |
| Salesforce CLI (`sf data`) | Bulk API | All | CLI | `sf data import/export/upsert bulk`, tree import |
| Data Export Service | All data | All | Setup | Weekly/monthly backups (not a true backup solution) |
| **Backup & Recover / Own** | All | All | Add-on | Paid backup/restore product (Own Company acquisition) |
| Mass Delete / Transfer | 250 (delete) | Limited | Setup | |

---

## 8. Limits relevant to admins

### 8.1 Storage
| Item | Allocation (Enterprise / Performance / Unlimited / Professional) |
|---|---|
| **Data storage** | **10 GB** per org + **20 MB per user license** (Lightning Platform Starter 20 MB; Contact Manager/Group/Professional also 20 MB). Developer Edition 5 MB; Essentials/Starter: 10 GB base (verify) |
| **File storage** | **10 GB** per org + **2 GB per user license** (EE/UE/Performance); 612 MB per user license for Contact Manager, Group, Professional (verify) |
| **Big Objects** | 1 million records free per org; more with an add-on |
| **Record size** | Most records count as **2 KB** each regardless of fields. Exceptions: Person Accounts 4 KB (Account + Contact), Knowledge articles 4 KB, Campaigns 8 KB, Email messages count actual size, Tags 0 (verify), Group/Chatter feeds, and some others |
| What counts as file storage | Attachments, Files (ContentVersion), Documents, Chatter files, Asset library. Static resources do not count (they are metadata) |
| Over-limit | Salesforce warns; past the limit, users can't create records (hard stop at around 110% in some cases). Buy additional storage, delete/archive (Big Objects, external archive). |

### 8.2 API limits
| Item | Value |
|---|---|
| **Daily API request limit** (rolling 24 hours) | **Enterprise**: 100,000 + **1,000 per Salesforce/Platform license** (+ 200 per Customer Community Plus etc.). **Unlimited / Performance**: 100,000 + 5,000 per Salesforce license. **Developer Edition**: 15,000. Sandbox: 5,000,000 (verify). Additional calls purchasable. Not a hard cap in many orgs (soft limit with overages allowed briefly); Salesforce may block once exceeded. |
| What counts | SOAP, REST, Bulk API (v1 batches; Bulk 2.0 counts differently), Connect REST, Metadata API calls. **Not counted**: UI usage, Apex callouts from Salesforce (outbound), Streaming events (separate allocation). |
| **Concurrent long-running requests** | **25** synchronous requests running longer than 20 seconds (production). Dev Edition/trials: 5. |
| **Bulk API** | 15,000 batches per 24 hours (shared Bulk v1/v2 ingest); Bulk 2.0: 150 million records per 24 hours (verify) |
| **Streaming / Platform events** | Event delivery allocation by edition (for example, 50,000 per 24 hours for CometD clients in EE) (verify), high-volume event publishing limits per hour |
| **API Usage Notifications** | Setup > API Usage Notifications: email when usage exceeds a % over an interval |
| **Monitoring** | Company Information ("API Requests, Last 24 Hours"), System Overview, `/services/data/vXX.X/limits` REST resource, `Sforce-Limit-Info` response header, "API Usage last 7 days" report (Administrative Reports) |

### 8.3 Other common admin limits (Enterprise; verify for edition)
| Limit | Value |
|---|---|
| Custom objects | 200 (EE), 2,000 (UE/Performance) (hard cap includes managed packages up to 3,000) |
| Custom fields per object | 500 (EE), 800 (UE/Performance) |
| Roll-up summary fields per object | 25 (can raise to 40 (verify)) |
| Master-detail relationships per object | 2 |
| Total relationship fields per object | 40 (lookups + master-detail) |
| Validation rules per object | 100 (EE), 500 (UE) |
| Record types per object | 200 |
| Field history tracked fields | 20 per object (60 with FAT) |
| Active lookup filters per object | 5 |
| Sharing rules per object | 300 (50 criteria-based) |
| Roles | 500 default (raisable to ~10,000) |
| Public groups | No small hard limit; performance concerns |
| Users per queue | No hard limit |
| Custom settings cached data | 10 MB or 1 MB × full licenses (lesser) |
| Static resources | 5 MB each; 250 MB org |
| Apex code characters | 6 MB (excludes tests and managed packages) |
| Custom labels | 5,000 |
| Scheduled Apex jobs | 100 |
| Flex queue | 100 batch jobs |
| Concurrent batch jobs | 5 active (queued/processing) |
| Reports | Run up to 2,000 rows in UI (Lightning shows 2,000; export for more); dashboards refresh limits per hour |
| Login history | 6 months |
| Setup Audit Trail | 180 days (download) |
| Recycle Bin | 15 days |
| Data Import Wizard | 50,000 records |

---

## 9. Sandboxes

### 9.1 Types
| Type | Data copied | Data storage | File storage | Refresh interval | Typical use |
|---|---|---|---|---|---|
| **Developer** | Metadata only (no data) | **200 MB** | 200 MB | **1 day** | Individual development, unit testing |
| **Developer Pro** | Metadata only | **1 GB** | 1 GB | **1 day** | Larger dev/test, integration testing with more seeded data |
| **Partial Copy** | Metadata + **sample data** per **sandbox template** (up to **10,000 records per object** selected) | **5 GB** | Same as production | **5 days** | QA, UAT, training with realistic data |
| **Full** | Metadata + **all data** (template optional to exclude objects; field history and Chatter optional) | Same as production | Same as production | **29 days** | Performance/load testing, staging, UAT, pre-prod |

- Sandbox allotment per edition: Enterprise includes 25 Developer + 1 Partial Copy (verify); Unlimited/Performance include 100 Developer, 5 Developer Pro, 1 Partial, 1 Full (verify). Additional sandboxes are purchasable.
- **Sandbox names** are max 10 alphanumeric characters. Usernames get `.sandboxname` appended (`user@company.com.dev1`). Emails get `.invalid` appended (so sandboxes don't email real users) since Spring '18 (verify), and deliverability defaults to System email only.
- **Refresh** replaces all metadata and data from production (or from the source sandbox for clones). Work not in source control is lost. **Activate** step after the refresh copy completes (you can delay activation; the old sandbox remains usable until activation).
- **Sandbox cloning**: create a sandbox from another sandbox (same type rules: the target type must match the source's storage needs).
- **SandboxPostCopy** interface: Apex class run automatically after create/refresh (for example, to scrub data, reset custom settings, create test users).
- **Data Mask** (paid add-on, and the newer "Data Mask and Seed") anonymizes data in sandboxes (random, pattern, picklist, deletion). Salesforce Data Seed populates sandboxes with subsets.
- **Sandbox Preview**: around 4-6 weeks before each major release, sandboxes on preview instances get the new release early. The **Sandbox Preview Guide** says which instances to refresh by a cutoff date to be on the preview or non-preview cycle.
- **Hyperforce**: sandboxes may sit on different instances from production. Avoid hard-coded instance URLs (use My Domain).
- Sandbox license types can't convert a dev sandbox into a full one; delete and create. A deleted sandbox's license may not be reusable immediately (verify).
- **Scratch orgs** (Salesforce DX): ephemeral (1-30 days, default 7), created from a Dev Hub with a definition file. Not sandboxes. Daily and active scratch org limits per edition.

---

## 10. Release management basics

### 10.1 Salesforce release cadence
- **Three major releases a year**: **Spring** (Feb), **Summer** (June), **Winter** (Oct; named for the following year, for example Winter '27 arrives around Oct 2026). Release names map to API versions (Spring '26 = API v66.0, Summer '26 = v67.0, Winter '27 = v68.0 (verify)).
- Each release: **Release Notes** (pre-release published around 4-6 weeks prior), **pre-release Developer Edition orgs**, **Sandbox Preview** window, and production upgrades on scheduled weekend maintenance windows by instance (check **Salesforce Trust** status site `status.salesforce.com` for your instance's upgrade date).
- **Release Updates** (formerly Critical Updates): behavior changes with an auto-enable date. Test them in sandbox first.
- **Patch releases** and hotfixes occur in between.
- **Retirements**: tracked in the "Product and Feature Retirements" help pages (for example, Workflow Rules and Process Builder end of support from Dec 31, 2025; legacy API versions 21.0-30.0 retired in Summer '25; Connected app creation off by default in Spring '26) (verify specifics).

### 10.2 Org release management (your changes)
| Approach | Description | Pros / cons |
|---|---|---|
| **Change Sets** | Point-and-click deployment between connected orgs (same production lineage) | Simple, no tooling. Manual, no version control, no deletions, can't include some components (e.g., some settings), slow to rebuild |
| **DevOps Center** | Salesforce-built UI over Git (GitHub/Bitbucket) with work items, pipelines, promotion stages | Declarative-friendly source control. Pipeline promotion |
| **Salesforce CLI + Metadata API / source format** | `sf project deploy start`, `sf project retrieve start`, manifests (`package.xml`), destructive changes | Scriptable, CI/CD (GitHub Actions, GitLab, Jenkins). Requires dev skills |
| **Unlocked / 2GP packages** | Modular package development (versioned, dependency-aware) | Best for large teams. Steeper learning |
| **Third-party** | Gearset, Copado, Flosum, AutoRABIT, Blue Canvas, Opsera | Comparison, rollback, data seeding, compliance |
| **Ant Migration Tool** | Legacy (retired; use the CLI) | |

- **Typical environment pipeline**: Developer sandboxes, then Integration/QA (Developer Pro or Partial), then UAT/Staging (Partial or Full), then Production. Plus a hotfix path.
- **Production deployments of Apex** require **75% org-wide code coverage** and every trigger must have some coverage. All tests must pass for the test level used. Default test level in production runs local tests when Apex is in the package.
- **Quick Deploy**: deploy a validated (with tests) package within **10 days** without re-running tests.
- **Profile deployments**: profiles only deploy settings for components included in the same deployment. Use perm sets for cleaner deploys.
- **What change sets can't do**: delete components (use destructive changes via the API), deploy some settings (org-wide email addresses, some security and sharing settings), standard picklist values partially, or move data (records, including custom settings data). **Custom Metadata Type records** *can* be deployed (they're metadata).
- **Freeze windows**: avoid deployments during the Salesforce release weekend for your instance.
- **Backups before deploy/refresh**: export metadata via CLI/Git, data via Data Export or Backup & Recover.

---

## 11. Admin task quick reference
| Task | Where / how |
|---|---|
| Create a user | Setup > Users > New User: license, profile, role, username (unique globally, email format), email, nickname, alias, locale, time zone, Federation ID, manager. Then assign perm sets / PSGs / PSLs. "Generate new password and notify user" |
| Offboard a user | Freeze, then transfer records and reassign queues/teams/approvals/scheduled jobs/flows' running user, then deactivate. Rotate shared integration credentials |
| Grant access to one field to a subset of users | New perm set with Field Permissions Read/Edit, then assign (or add to a PSG) |
| Give a team read access to private records | Public group, then a criteria-based or owner-based sharing rule |
| Hide records from some users who'd otherwise see them | Restriction rule (supported objects) or redesign OWD/sharing |
| Let support managers see all cases | Perm set with Case "View All" (object), not View All Data |
| Restrict login to office IPs | Profile > Login IP Ranges (plus Session Settings: Enforce login IP ranges on every request) |
| Skip email verification at office | Network Access > Trusted IP Ranges |
| Find who changed a setting | View Setup Audit Trail |
| Find why a user can see a record | Record > Sharing Hierarchy / "View Sharing"; or check OWD, role, sharing rules, teams, and object View All |
| Find a user's effective permissions | User detail > "View Summary" (User Access Summary) (verify) / perm set assignments related list |
| Debug an automation error for a user | Debug Logs > New trace flag on the user, reproduce, view the log |
| Check API consumption | Company Information > API Requests (Last 24 Hours), System Overview, or the `/limits` endpoint |
| Allow an external domain in an LWC | CSP Trusted Sites / Trusted URLs |
| Let a JS web app call the REST API | CORS allowlist + OAuth (ECA) |
| Apex callout to a new API | Named Credential + External Credential (+ principal access via perm set) rather than Remote Site Setting |
| New OAuth integration | External Client App (connected app creation is off by default since Spring '26) |
| Enable multiple currencies | Company Information > Activate Multiple Currencies (irreversible) |
| Translate UI | Language Settings, then Translation Workbench (Translation Language Settings, Translate / Export-Import) |
| Make a sandbox | Setup > Sandboxes > New Sandbox: type, template (Partial/Full), SandboxPostCopy class, then Activate |
| Deploy declarative changes | Outbound Change Set (source), then Inbound Change Set (target): Validate, Deploy (or DevOps Center / CLI) |

---

## 12. Gotchas / common confusions
- **Trusted IP Ranges (Network Access) vs. Login IP Ranges (profile)**: Network Access *skips identity verification*. It does **not** block anyone. Profile Login IP Ranges *block* logins from outside. Mixing these up is the most common IP confusion.
- **View All Data / Modify All Data don't bypass FLS.** They bypass sharing, not field-level security. Object "View All Fields" is the FLS bypass for one object (verify).
- **Page layouts are not security.** Removing a field from a layout doesn't hide it from reports, list views, the API, or search. Use FLS.
- **Sharing rules can only grant, never restrict.** To restrict below what sharing grants, use Restriction Rules (supported objects) or redesign OWD. Scoping Rules are **not** security.
- **Object permissions cap record access.** Read/Write sharing doesn't let someone edit without the Edit object permission. Conversely, the Edit object permission doesn't let someone edit records they can't access through sharing (unless they have Modify All).
- **Grant Access Using Hierarchies can't be disabled for standard objects.** Only custom objects allow unchecking it.
- **External OWD must be equal to or more restrictive than internal OWD.**
- **Manual shares disappear on owner change**. Apex shares with custom sharing reasons persist. Team shares also persist with the record but are tied to team membership.
- **Freeze doesn't free a license; deactivate does.** Users can never be deleted. Usernames are unique across *all* Salesforce orgs (including sandboxes with the suffix).
- **Profile permission retirement was cancelled (mid-2026).** Profiles still hold permissions. Don't tell users their profile permissions will stop working in Spring '26. But the recommended model is still Minimum Access profile + perm sets/PSGs + User Access Policies (verify for any new announcement).
- **Connected Apps are not "deprecated", but you can't create new ones by default since Spring '26.** Existing ones keep working. New integrations should use External Client Apps. Some packaged/ISV scenarios and Support exceptions differ (verify).
- **MFA for SSO users** is satisfied at the IdP, not Salesforce. The PRMFA (2026) requirement for privileged users means TOTP apps / Salesforce Authenticator **don't count**. Plan passkeys or security keys for every admin, and keep a break-glass admin.
- **API logins aren't subject to UI MFA**, which is why integration users should use the Salesforce Integration license, API Only User, an ECA with JWT/Client Credentials, and least-privilege perm sets. Never use a named admin's password + token for integrations.
- **The security token** is needed for API password logins from untrusted IPs. It resets whenever the password changes. Setting a Trusted IP or profile IP range removes the need.
- **Multi-currency and custom fiscal years are irreversible.** Test in a sandbox first. Advanced Currency Management's dated rates don't apply to roll-up summary fields.
- **Data storage counts records (about 2 KB each), not actual bytes.** Many small records can exhaust storage quickly. File storage is separate.
- **Sandbox refresh intervals**: Developer/Developer Pro 1 day, Partial Copy 5 days, Full 29 days. A refresh wipes everything in the sandbox. Sandboxes append `.invalid` to emails and default to System email only. Remember to fix deliverability and integration endpoints (Named Credentials) after refresh.
- **Change sets can't delete** and don't move data (including Custom Settings records). Custom Metadata Type records *are* deployable. Use CMTs for config that should move between orgs.
- **Custom Settings vs. Custom Metadata vs. Custom Labels**: settings are data (per-org/profile/user overrides via Hierarchy), CMTs are deployable metadata records, and labels are translatable strings.
- **Remote Site Settings vs. Named Credentials vs. CSP Trusted Sites vs. CORS**: Remote Site = server-side Apex callout allowlist (outbound). Named Credential = endpoint + auth for callouts (implicitly allowlisted). CSP Trusted Sites = browser-side loads from Lightning pages/LWC (outbound from the browser). CORS = external browser origins calling *into* Salesforce APIs (inbound).
- **Setup Audit Trail UI shows only the last 20 entries.** Download for 180 days. Login History keeps 6 months. Debug logs last 24 hours. Field history is 18 months in the UI (24 via API) unless you use Field Audit Trail.
- **"Login As" requires the org-wide "Administrators Can Log in as Any User" setting** (otherwise the user must grant access) and is logged in the Setup Audit Trail. With "Force relogin after Login-As-User" on, you get logged out instead of returning.
- **Delegated admins** can't assign profiles/perm sets with Modify All Data and can only manage users in their assigned roles.
- **The Health Check score** reflects only settings compared against a baseline. A score of 100 doesn't mean the sharing model or perm assignments are secure.
- **Session timeout set on the profile overrides the org setting**. Login hours use the org's default time zone, not the user's.
- **Standard profiles can't have their permissions edited.** Clone them. And "System Administrator" can't lose some permissions.
- **Activities (Tasks/Events)**: OWD Private vs. Controlled by Parent behave differently. Users with access to the related record can see activities when Controlled by Parent.
- **Record type access is not record visibility**. Users can view records of any record type if sharing allows. Record types only govern what users can create/assign.
- **Platform license users can't access Leads, Opps, Cases, Campaigns, Forecasts, or Products**, even with perm sets granting those objects.
- **Implicit sharing is invisible in Sharing Settings.** It explains "why can this user see the Account?" (because they own a child Opportunity/Case/Contact).
- **2026 security changes**: anonymizing VPN/proxy blocking, step-up auth for large report exports, and login anomaly auto-freeze can surprise users and test automation. Check Identity Verification History and Login History first when users report login or export problems (verify current settings in your org).
