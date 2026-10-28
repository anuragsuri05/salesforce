# 10 — Other Clouds, Products & the Salesforce Ecosystem

**What this file covers:** Everything in the Salesforce portfolio outside core Sales/Service/Platform/Agentforce: Experience Cloud, the Marketing Cloud family, Loyalty, Commerce, Industries and OmniStudio, Net Zero, Slack, Tableau, MuleSoft, Heroku, Quip, Shield, Backup, Maps, Digital Engagement, Scheduler, and the SMB suites.
It also covers the ecosystem: AppExchange, Trailhead, the Trailblazer Community, certifications (with the 2025–2026 renames and retirements), release notes, the Trust site, acquisitions, and a glossary of acronyms.
Currency: verified against public sources as of **2026-10-08**. Items marked **(verify)** change often or could not be fully confirmed, so check them against current Salesforce docs before you state them as fact.

---

## 0. Naming status in 2026 (read first)

Salesforce has renamed products several times in 2025–2026. Users will mix old and new names.

| Period | What happened |
|---|---|
| Oct 2025 (Dreamforce '25) | "Agentforce 360" branding. About two dozen products got "Agentforce" in their names: Sales Cloud → **Agentforce Sales**, Service Cloud → **Agentforce Service**, Salesforce Platform → **Agentforce 360 Platform**, Marketing Cloud → **Agentforce Marketing**, Commerce → **Agentforce Commerce**, and so on. **Data Cloud → Data 360.** |
| Apr 15, 2026 (TDX '26) | **Salesforce Headless 360** was announced. It exposes platform capabilities as APIs, MCP tools, and CLI commands for agent-first use (60+ MCP tools, coding skills, and a "Headless Experience Layer"). It was expanded across clouds on Aug 19, 2026. |
| Sep 2026 (before Dreamforce '26) | Salesforce **quietly reverted most "Agentforce X" product names**. Sales Cloud is again "Sales Cloud", and the platform is again "Salesforce Platform". **Agentforce** (the agent platform, also called Agentforce 360) and **Data 360** kept their new names. Exactly which other clouds reverted (Service, Marketing, Commerce, Industries) is **(verify)**. |
| Jul 24, 2026 | Certification renames used the "Agentforce …" names, for example Sales Cloud Consultant → *Agentforce Sales Consultant*. Those **cert names stayed**, even though the product names were later reverted (verify). |

**Rule of thumb:** treat "Agentforce Sales" = Sales Cloud, "Agentforce Service" = Service Cloud, "Agentforce Marketing" ≈ Marketing Cloud (Next), "Agentforce Commerce" = Commerce Cloud, and "Agentforce 360 Platform" = Salesforce Platform. Data 360 = Data Cloud.

---

## 1. Experience Cloud (formerly Community Cloud)

### 1.1 Overview
- Lets you build branded **sites/portals** for external users (customers, partners, the public) and internal users on the same org and data. It was renamed from **Community Cloud** to Experience Cloud in 2021, and "communities" became "sites".
- Setup: **Setup → Digital Experiences → Settings** → Enable Digital Experiences (pick a domain, `*.my.site.com`; this cannot be undone) → **All Sites** → New.
- Each site has a **Network** record (API object `Network`), members (profiles/permission sets), a guest user, and a URL path prefix.
- Two frameworks:
  - **Aura** sites: older and widely deployed. Supports Aura and LWC components, audience targeting on components, and the Theme panel.
  - **LWR (Lightning Web Runtime)**: faster, LWC-only, and publish-time cached (static) pages. Uses **branding sets**, has stricter CSP, and expression-based binding (`{!Route.recordId}`). It is the strategic default for new builds.
- Visualforce + Salesforce Tabs template: legacy (classic Tabs). Still supported, but don't use it for new builds.

### 1.2 Templates (Setup → All Sites → New)

| Template | Framework | Use |
|---|---|---|
| **Build Your Own (LWR)** | LWR | Blank, fast, fully custom. Default for new custom sites. |
| **Build Your Own (Aura)** | Aura | Blank Aura site with basic pages (home, login, error). |
| **Microsite (LWR)** | LWR | Marketing/landing microsites, events, lead capture forms (often with Marketing Cloud / Data 360). |
| **Customer Service** (was "Napili") | Aura | Self-service help: Knowledge, cases, Q&A (Chatter Questions), Experts. |
| **Help Center** | Aura | Public (unauthenticated) Knowledge-only help site. Low-cost deflection. |
| **Partner Central** | Aura | PRM: lead distribution, deal registration, MDF, channel sales, partner onboarding. |
| **Customer Account Portal** | Aura | Authenticated self-service: account info, invoices, cases, billing. |
| **B2B Commerce (LWR / Aura)** | LWR/Aura | B2B storefront (Commerce on Lightning). |
| **D2C Commerce (LWR)** | LWR | B2C storefront on core (Commerce on Lightning). |
| **Aloha** | Aura | App-launcher style employee site (IdP/SSO). Rarely used (verify still offered). |
| **Salesforce Tabs + Visualforce** | Classic | Legacy portal-style UI using standard tabs. |
| Retired: Koa, Kokua (Knowledge-only), Kokua→Help Center | — | Retired templates. They may appear in very old orgs. |

Industry and partner templates also exist, such as the Financial Services / Health Cloud portals and the Enhanced LWR templates for Commerce (verify per release).

### 1.3 Experience Workspaces (the site's control center)
Open it from Setup → All Sites → **Workspaces**, or from the App Launcher ("Experience Workspaces"). Tiles:

| Tile | What it does |
|---|---|
| **Builder** | Opens Experience Builder, the drag-and-drop site designer. |
| **Administration** | Site configuration: **Settings** (name, URL, status: Preview/Live/Inactive, guest user profile link, template change), **Members** (profiles & permission sets with access), **Tabs** (Tabs-based sites), **Branding** (Tabs sites), **Login & Registration** (login page type, logo, external auth providers, self-registration, default profile/account), **Emails** (sender, Chatter email footer, templates for welcome/forgot password/change password), **Pages** (go to Builder, Force.com/Visualforce pages, override error pages), **Preferences** (public access to Chatter, nicknames, member visibility, file limits, guest file access, Experience Management, setting files/reputation), **Rich Publisher Apps**, **Reputation Levels/Points**, **Customer Service/Knowledge settings**. |
| **Moderation** | Criteria (keyword lists, member criteria), Rules (block/review/replace/flag; rate limits), flagged items queue, pending review, member moderation. Aimed at Chatter/feeds/Q&A. |
| **Dashboards** | Site analytics (Insights). Requires the **Salesforce Communities Management** (Experience Cloud management) AppExchange package to populate standard dashboards: adoption, activity, moderation, Q&A. You can map your own dashboards. |
| **Content Management** | **Salesforce CMS / Enhanced CMS workspaces**: content types (news, image, document, custom), channels, translation, publishing. Also **Topics** (navigational, featured, content topics) and **Recommendations** in Aura sites. |
| **Guided Setup** | Wizards for common setups (for example "Set up a customer service site", "Partner Central" tasks). |
| **Gamification / Recognition** (where enabled) | Recognition badges and missions (Aura/Chatter sites). |
| **Mobile Publisher** | Package the site as a branded iOS/Android app ("Mobile Publisher for Experience Cloud"). Separate license. |

### 1.4 Experience Builder UI, panel by panel
**Top toolbar:** site name / **Pages dropdown** (Aura) → page switcher; **device preview** (Desktop / Tablet / Mobile); **Undo/Redo**; **Settings gear**; **Help (?)**; **Preview** (opens in new tab as a chosen user/guest); **Publish** (pushes the current draft live and sends a confirmation email). LWR sites also have a **"Publish Status"** indicator. LWR content is cached at publish, so data-bound changes still show live, but layout/config changes need a republish.

**Left sidebar (icons):**

| Panel | Contents |
|---|---|
| **Components** (lightning bolt) | Draggable standard components (Rich Content Editor, HTML Editor, Record Detail/List/Related List, Tabs, Navigation Menu, Search, Case Deflection, Contact Support Form, Knowledge, Flow, Tile Menu, Banner, CMS Single/Collection, Grid/Columns in LWR, etc.), custom LWCs exposed with `lightning__CommunityPage` / `lightningCommunity__Page` targets, and AppExchange components. |
| **Pages** (page icon, LWR; dropdown in Aura) | Page list: Main pages, Object pages (Record/List/Related List per object), System pages (Login, Error, Check Password, Forgot Password, Register, Service Not Available). Actions: New Page (Standard / Object / Page Variation), **Page Properties** (name, URL, title, **Page Access**: public vs requires login, layout, head tags/SEO metadata, CSP override in Aura), set as Home, delete. |
| **Theme** (paintbrush; Aura) | Theme layouts (Default, Home, Login...), Colors, Fonts, Images (logo, header), Settings (theme layout per page type), **Edit CSS** (custom CSS), **Change Theme** (Customer Service, Jepson, Sales Cloud-style themes, or a custom theme from a Lightning Bolt). |
| **Branding sets** (LWR "Theme" panel) | Named sets of design tokens: colors, fonts, text styles (heading 1-6, paragraph), buttons, site spacing, header/footer. Apply a branding set per region/component. Uses **`--dxp-*` styling hooks**. Custom CSS via **Theme → Edit Code** / head markup. |
| **Content** (CMS, LWR/enhanced) | Browse/insert CMS content from Enhanced CMS workspaces. |
| **Navigation** | **Navigation Menu** is configured on the Navigation Menu component property ("Edit Navigation Menu"): items of type Salesforce Object (list view), Site Page, URL, Menu Label (parent), Event (Login/Logout), Global Action. Also "publicly available" toggles per item. LWR: **Navigation** menus are managed in the **Settings → Navigation** area (verify). Also **Workspaces → Administration → Navigation Menus** (verify per version). |
| **Audience targeting** (Aura; limited LWR) | **Audiences** created in Builder from criteria: Profile, Permission, Location (country/state/city), Domain, Record type, User/Account/Contact field values, Login status. Target **page variations**, **branding sets** (Aura themes), and **component visibility** (Aura component "Audiences" tab). LWR: page variations by audience (verify extent). |
| **Settings** (gear) | **General** (site name, title, guest user profile link, URL, template, Activity/members), **Theme** (Aura), **Languages** (default, multilingual sites, translation export/import), **Security & Privacy** (CSP level: Strict/Relaxed, Trusted Sites for scripts, clickjack protection, guest user access to features, LWR "Strict CSP"), **Advanced** (head markup for `<head>`, Google Analytics tracking ID, Data Cloud integration / Experience Cloud tracking), **Developer** (export as Lightning Bolt Solution, template changes), **Updates** (template/version updates), **SEO** (sitemap generation, robots.txt via Visualforce/ custom, page-level SEO in page properties, guest object visibility for SEO indexing). |

**Page properties for SEO:** title, description, `<meta>` head tags per page, canonical URLs. Object page SEO for guest-visible records, and sitemap.xml (auto-generated weekly; manual regeneration available).

**Bundles:** export a site as a **Lightning Bolt Solution** or as a template (`Experience Bundle` / `DigitalExperienceBundle` metadata). Deploy with `ExperienceBundle` (Aura) or `DigitalExperienceBundle`/`DigitalExperienceConfig` (LWR/enhanced) metadata.

### 1.5 External user licenses

| License | Key features | Typical use |
|---|---|---|
| **Customer Community** | High-volume (HVP) user. **No role** in the hierarchy, so it **can't use sharing rules or role-based sharing**. Access is via **sharing sets** (match user's Account/Contact to record lookup), **share groups** (share HVP-owned records to internal users), and object ownership. Accounts, contacts, cases, knowledge, custom objects (limit ~10 custom objects per license, verify). Cheapest. | B2C self-service at scale (millions of users). |
| **Customer Community Plus** | **Has roles** (account-based role hierarchy, up to 3 levels: Executive/Manager/User), so it **can use sharing rules** and manual sharing. **Reports & dashboards** (read/create in site, verify), **delegated external user admin**, Events/Tasks, more custom objects. | B2B customer portals with hierarchy, reporting. |
| **Partner Community** | Everything in Plus **plus** Sales objects: **Leads, Opportunities, Campaigns** (read), Quotes, deal registration, MDF/channel programs (with Channel Revenue Management), Lead distribution. Partner role hierarchy below the partner account owner's role. | PRM (Partner Central). |
| **Channel Account** | Partner licensing per partner *account* (unlimited users per account, verify) instead of per user. | High-count partner orgs. |
| **External Apps / External Apps Plus** (formerly "Lightning External Apps") | Custom-branded apps on custom objects/platform, without CRM standard objects like Cases/Opportunities. "Plus" adds roles/sharing and more objects. | Non-CRM external apps (vendors, franchise, B2B apps). |
| **Member-based vs Login-based** | Every license comes in **member** (named user/month) or **login** (pay per daily unique login; a user consumes one login per day). | Login-based suits infrequent users. |
| Legacy: High Volume Customer Portal, Authenticated Website, Customer Portal, Partner Portal | Pre-communities licenses (portal). Partner Portal and Customer Portal are retired. | — |

Notes:
- External users are **Users** linked to a **Contact** on an **Account** (person accounts or business accounts). You enable them via **Contact → Enable Customer/Partner User**.
- The account owner (an internal user) **must have a role** before external users can be created for that account (this matters for Plus/Partner role creation).
- **External OWD** (External Sharing Model): a separate default per object for external users. It can be more restrictive than internal, never less. Enable via Sharing Settings → "Manage External Sharing".
- **Super User Access** (Plus/Partner): lets external users see records owned by others in the same account below them in the role hierarchy (Setup → Digital Experiences → Settings).

### 1.6 Sharing sets, share groups, sharing for HVP
- **Sharing Set** (Setup → Digital Experiences → Settings → Sharing Sets): for an external profile, grant access to object X where **User.Contact / User.Account (or related field)** matches a lookup on X (for example Case.ContactId = User.ContactId, or Order.AccountId = User.AccountId). Access level: Read Only or Read/Write. It supports indirect lookups (Account → custom lookup). Originally HVP only. Now also available for Customer Community Plus / Partner users (verify).
- **Share Groups**: give internal users access to records **owned by** HVP users (HVP users can't be in groups/roles).
- HVP users **cannot be added to public groups, queues, or manual shares**, and are not in the role hierarchy.
- **Account Relationships / Account Relationship Data Sharing Rules (ARDSR)**: share data between partner accounts (for example distributor ↔ reseller).
- **External Account Hierarchy** (beta→GA, verify): share data up a hierarchy of external accounts.

### 1.7 Guest user security (critical)
- Every site has **one guest user** and a **guest user profile** (Builder → Settings → General → guest profile link).
- Hardened since 2020-21 (the "Secure Guest User Record Access" release update was enforced in Winter '21 and later):
  - Guest **OWD forced to Private** for all objects (Public Read for guest is disallowed). Guest access is granted only through **Guest User Sharing Rules** (criteria-based, **Read Only** only).
  - Records created by guests are **owned by a default internal owner** (set in site settings). Guests can't own records.
  - Guests **can't be added to queues/groups**, can't have **View All / Modify All** or **View All Users**, can't have **API access**, and can't edit records after creation (create/read only, verify for some objects).
  - **"Let guest users see other members of this site"** should be OFF. Turn off public access to Chatter and file/asset access unless needed.
  - Use **Guest User Access Report** / **Health Check** and the **Experience Cloud guest user security checklist**.
  - Apex `@AuraEnabled` methods: classes run in **with sharing** context but must enforce CRUD/FLS (`WITH USER_MODE`). Guest profiles need explicit Apex class access. Watch for **insecure `without sharing`** exposure; this is a top data-leak vector.
- Keep the site **Inactive** or **Preview** until you have reviewed it. `Site.com` pages with guest access are public.

### 1.8 Self-registration & login
- **Administration → Login & Registration**: login page type (Experience Builder page / Default / Visualforce), **Allow customers and partners to self-register**, Registration page type, **Profile** and **Account** for new users (if no account: Person Account or a default "bucket" account, but watch data skew; keep under 10k child records per account).
- Custom registration via Apex `Site.createExternalUser()` / the `CommunitiesSelfRegController` handler, or a **Configurable Self-Reg** handler (`Auth.ConfigurableSelfRegHandler`) with **passwordless login** (email/SMS verification code).
- **Social sign-on**: Auth. Providers (Google, Facebook, Apple, LinkedIn, OpenID Connect) with a Registration Handler class. **SAML/SSO** for partners.
- **Headless identity** APIs (headless registration/login/forgot password) for external front ends (verify current names).
- **Login Discovery** page: identifier-first login (email or phone).

### 1.9 Other Experience Cloud capabilities
- **Experience Cloud for Data 360 / personalization**: Personalization component, Data 360 web SDK tracking (verify).
- **Agentforce in sites**: the **Embedded Service / Agentforce Service Agent** chat deployment in LWR sites (Enhanced Chat / Messaging for In-App & Web).
- **CMS**: Enhanced CMS workspaces with Enhanced LWR sites. Content is shared across sites/channels.
- **Experience Cloud Sites search**: Search Manager, scoping objects.
- **Limits**: max ~100 sites per org (including inactive/preview; verify), custom domain via **Domains** + **Custom URLs**, CDN (Salesforce CDN enabled by default for new LWR sites).

---

## 2. Marketing Cloud family

The family has three distinct products, which are often confused:
1. **Marketing Cloud Engagement (MCE)**: the original ExactTarget-based B2C platform. Separate stack, separate login (`mc.exacttarget.com`), and separate tenant.
2. **Marketing Cloud Account Engagement (MCAE)**: formerly **Pardot**. B2B marketing automation, tightly synced with the Salesforce org.
3. **Marketing Cloud Next / Growth & Advanced editions / "Agentforce Marketing"**: the new, **native-on-core, Data 360-based** marketing app.

Related products: **Marketing Cloud Personalization** (formerly Interaction Studio / Evergage), **Marketing Cloud Intelligence** (formerly Datorama), **Loyalty Management**, **Data 360** (CDP), and **Audience Studio** (Krux DMP; being sunset, verify).

### 2.1 Marketing Cloud Engagement (MCE)

**Account structure:** Enterprise 2.0 accounts → **Business Units (BUs)** → Users/Roles. MID (Member ID) per BU. **Contact Key/Subscriber Key** = the unique ID (best practice: the Salesforce Contact/Lead ID). Contacts are billed by count.

| Studio / Builder | Purpose & key concepts |
|---|---|
| **Email Studio** | Email sends. Content and **Subscribers** (All Subscribers list, Lists, Groups, **Data Extensions**, publication lists, suppression lists, auto-suppression), **Sends**: user-initiated, **Triggered Sends** (API, real-time), Journey sends; **Send Classification** (Commercial vs Transactional + Sender Profile + Delivery Profile), **Send Logging**, **Tracking** (opens, clicks, bounces, unsubs), **A/B testing**, **Send Throttling**, **Sender Authentication Package (SAP)** = private domain + dedicated IP + branded links/images, **IP warming**. Profile Center & Subscription Center. |
| **Content Builder** | Central asset library: emails (templates, template-based, HTML paste, text), content blocks (text, image, HTML, dynamic content, **Einstein content selection**, code snippets, reference blocks), images, documents. Folders and sharing across BUs (Shared Content). Classic Content is legacy. |
| **Contact Builder** | Data model: **Data Extensions** (tables: sendable flag + send relationship to Subscriber Key; Primary Keys; retention policies; field types: Text, Number, Date, Boolean, Email, Phone, Decimal, Locale), **Attribute Groups / Data Designer** (relate DEs to Contact Key, 1:1 / 1:many), **Contacts** (All Contacts), **Data Sources**, **Imports**, **Synchronized Data Extensions** (from Salesforce via MC Connect), **Contact Deletion** (GDPR). |
| **Journey Builder** | Multi-step, multi-channel customer journeys. **Entry Sources**: Data Extension, Salesforce Data Event (object create/update via MC Connect), API Event, CloudPages Smart Capture, Audience (Audience Builder), Data Cloud/Data 360 segment, Event Definition. **Activities**: Messages (Email, SMS, Push, In-App, WhatsApp, LINE, Inbox), Advertising (Ad Audiences), **Flow controls** (Wait by duration/until date/until event, **Decision Split**, **Random Split**, **Engagement Split**, **Einstein Engagement/STO splits**, **Path Optimizer** (A/B/n with winner), **Join**, **Exit**), **Customer Updates** (Update Contact), **Sales & Service Cloud** activities (create/update Lead, Contact, Case, Task, Campaign Member, custom object), Custom Activities (REST). Settings: **Entry Mode** (no re-entry / re-entry anytime / re-entry after exit), **Goal**, **Exit Criteria**, Contact evaluation, versioning (stop/new version). **Transactional Journeys** (API-triggered, fast). Journey Analytics, Einstein STO (Send Time Optimization). |
| **Automation Studio** | Batch/ETL orchestration. **Starting sources**: **Schedule**, **File Drop** (SFTP folder), Triggered (API). **Activities**: **SQL Query** (T-SQL subset; target DE overwrite/append/update; 30 min timeout), **Import File**, **File Transfer** (unzip/decrypt, move), **Data Extract** (tracking extract, DE extract, convert XML), **Script Activity** (SSJS), **Filter Activity** (Data Filter on DE), **Send Email**, **Verification** (row count checks), **Wait**, **Refresh Group / Mobile lists**, **Data Factory Utility**. Steps run sequentially; activities in a step run in parallel. |
| **Mobile Studio** | **MobileConnect** (SMS/MMS short and long codes, keywords, opt-in/out), **MobilePush** (iOS/Android SDK, in-app messages, inbox, geofences, beacons), **GroupConnect** (LINE, Facebook Messenger), **WhatsApp** (via Marketing Cloud's "Chat Messaging"/MobileConnect, verify current packaging). |
| **Advertising Studio** | **Advertising Audiences** (sync DE/segments to Meta, Google, LinkedIn, X/Twitter, etc. for targeting/suppression/lookalikes), **Lead Capture** (Meta/LinkedIn lead ads → Salesforce/DE). Also Journey Builder Ad activities. |
| **Social Studio** | **Retired** (Nov 2024). Replacement: partner tools / Sprinklr etc. |
| **Interaction Studio → Marketing Cloud Personalization** | Real-time web/app personalization (Evergage, acquired 2020). Sitemap (JS beacon), catalog, Einstein recipes, campaigns/templates, segments, A/B. Being complemented/replaced by **Personalization on Data 360** ("Salesforce Personalization" in Marketing Cloud Next, verify). Accredited Professional cert retired (2027). |
| **Analytics Builder** | Reports (Email performance, Journey), **Datorama Reports for Marketing Cloud**, Intelligence Reports (premium), **Discover** (legacy), Web & Mobile Analytics, Einstein features (Engagement Scoring, Engagement Frequency, Content Tagging, Copy Insights, STO). |
| **Web Studio** | **CloudPages** (landing pages, microsites, Smart Capture forms, code resources: JSON/CSS/JS/text endpoints), Microsites. |
| **Audience Builder** | Legacy dimension-based segmentation (rare). |
| **Distributed Marketing** | Lets Salesforce CRM users (advisors/reps) send MCE-built personalized emails from Salesforce. Uses Journeys + Quick Send. |
| **Setup** | Users/roles, BUs, Sender Profiles, Delivery Profiles, Send Classifications, Reply Mail Management (RMM), **Installed Packages** (API integrations: Server-to-Server / Web / Public app components; client ID/secret; OAuth 2.0 with tenant-specific endpoints `https://<subdomain>.auth.marketingcloudapis.com`), FTP accounts, Data Retention, Key Management (encryption), Field-Level Encryption, IP allowlisting, SSO. |

**Data Views** (system tables queried in SQL): `_Sent`, `_Open`, `_Click`, `_Bounce`, `_Unsubscribe`, `_Complaint`, `_Job`, `_Subscribers`, `_ListSubscribers`, `_Journey`, `_JourneyActivity`, `_SMSMessageTracking`, `_MobileAddress`, `_PushAddress`, `_BusinessUnitUnsubscribes`. About 6 months of data are retained.

**AMPscript** (server-side scripting language for emails, SMS, CloudPages):
```ampscript
%%[
  SET @first = AttributeValue("FirstName")
  IF Empty(@first) THEN SET @first = "there" ENDIF
  SET @rows = LookupRows("Orders_DE", "SubscriberKey", _subscriberkey)
  FOR @i = 1 TO RowCount(@rows) DO
    SET @row = Row(@rows, @i)
    SET @sku = Field(@row, "SKU")
  NEXT @i
]%%
Hello %%=v(@first)=%%  %%=RedirectTo(@url)=%%
```
- Blocks `%%[ ... ]%%`, inline `%%= ... =%%`, personalization strings `%%FirstName%%`, `%%emailaddr%%`, `%%view_email_url%%`.
- Key functions: `Lookup`, `LookupRows`, `LookupOrderedRows`, `InsertDE`/`UpsertDE`/`UpdateDE` (in sends), `InsertData`/`UpsertData` (on CloudPages), `RetrieveSalesforceObjects`, `CreateSalesforceObject`, `UpdateSingleSalesforceObject`, `Format`, `DateAdd`, `DateDiff`, `Concat`, `IIF`, `RequestParameter`, `CloudPagesURL`, `ContentBlockByKey`, `TreatAsContent`, `HTTPGet`, `RaiseError` (skip a send).
- Case-insensitive. Variables `@var`. Comments `/* */`.

**SSJS** (Server-Side JavaScript, ECMAScript 3 based; no ES6):
```html
<script runat="server">
  Platform.Load("Core", "1.1.1");
  var de = DataExtension.Init("Orders_DE");
  var rows = de.Rows.Lookup(["Status"], ["Open"]);
  var prox = new Script.Util.WSProxy();   // SOAP API wrapper, preferred for bulk ops
  Write(Stringify(rows));
</script>
```
- Used in CloudPages, Script Activities, and code resources. Libraries: **Core** (DataExtension, Subscriber, Email, TriggeredSend objects), **Platform** functions (`Platform.Function.Lookup`, `Platform.Request.GetQueryStringParameter`), **WSProxy**, `HTTP.Get/Post`. Use `try/catch`. Can call AMPscript via `Platform.Function.TreatAsContent`.

**APIs:** REST (`/messaging/v1/`, `/interaction/v1/` Journey, `/data/v1/` DE async, `/hub/v1/`, `/asset/v1/` Content Builder, `/contacts/v1/`), SOAP (`*.soap.marketingcloudapis.com`; Retrieve, Create, Update, Perform), Transactional Messaging API, Event Notification Service (webhooks).

**Marketing Cloud Connect (MC Connect):**
- A managed package in the Salesforce org plus configuration in MC. Connects one MC account (enterprise/BU) to one Salesforce org (multi-org possible with restrictions).
- Setup steps: install the package, create a **Marketing Cloud API user** (a system-admin-like user in Salesforce with the integration permissions), configure the **Connected App / OAuth**, then in MC **Setup → Salesforce Integration → Connect Account** and **Scope by user**. Map users (each MC user links to a Salesforce user). Configure tracking and the **System User**.
- Features: **Synchronized Data Sources** (Contact Builder syncs Salesforce objects → read-only Synchronized DEs every 15 min minimum), **Salesforce Data Events** entry source & Sales/Service activities in Journeys, **sending to Reports/Campaigns** from Salesforce or MC, **Individual Email Results / tracking** written back to Salesforce, **Distributed Marketing**, triggered sends from Salesforce (legacy, being replaced by Journeys).
- Subscriber Key should be the 18-char Contact/Lead ID.
- Gotchas: Synchronized DEs are read-only. Person Accounts are synced as Contacts. Field-count/row-size limits (250 fields/object, verify). The API user's profile must have "Marketing Cloud" + "Modify All Data"-like access to the synced objects.

### 2.2 Marketing Cloud Account Engagement (MCAE, ex-Pardot)
- Acquired via ExactTarget (2013). Renamed **Account Engagement** in April 2022. Now a **Lightning app** in the Salesforce org. The Pardot classic UI (`pi.pardot.com`) is legacy.
- **Editions:** Growth, Plus, Advanced, Premium. **"+" editions** add Marketing Cloud Next/Agentforce features (verify packaging).
- **Business Units**: separate MCAE databases tied to one Salesforce org (Advanced+).

| Concept | Details |
|---|---|
| **Prospect** | An MCAE person record (email-based). It syncs with a Salesforce **Lead or Contact** via the connector. Anonymous web traffic = **Visitors** (cookie `visitor_id`), which become Prospects on form conversion. Prospects can be assigned (Salesforce owner). |
| **Salesforce Connector v2** | Native connector (since 2020). The **Connector user** is an integration user created by the system ("B2BMA Integration" user), not a named admin. Settings: sync objects (Lead, Contact, Account, Opportunity, Campaign, custom objects), **sync behavior** (which system wins for each field: Use Salesforce value / Use MCAE value / Use most recently updated), **Automatically create prospects in MCAE** when Leads/Contacts are created (optional), **Pause/Resume connector**, **Sync errors** queue, **Connected Campaigns** (Salesforce Campaigns are MCAE campaigns), Marketing Data Sharing rules (limit which Leads/Contacts sync). v1 is retired. |
| **Engagement Studio** | Visual drip/nurture program builder. Elements: **Actions** (send email, adjust score, add to list, assign to user, notify user, create Salesforce task, change field, add to Salesforce campaign, add tag, pause), **Triggers** (email open/click, form submit, landing page, link click, custom redirect, file, webinar; "Waiting up to X days"), **Rules** (prospect field/score/grade/list/tag criteria), **Waits**. Recipient lists, suppression lists, start/pause/schedule business hours, test mode, re-entry (allow prospects to re-enter after N days). |
| **Scoring** | **Behavioral/interest** number (unbounded). Default rules (+3 form submit, +1 page view, etc.) are adjustable under Scoring Settings. Score categories by Scoring Category folders (per product). Decay via automation rules. |
| **Grading** | **Fit** letter grade A+ to F (starts at D). **Profiles** with criteria raise/lower grade by thirds. Driven by prospect field data (industry, title, size). |
| **Forms** | MCAE-hosted forms (iframe-embedded or on MCAE landing pages): fields, progressive profiling, **completion actions**, layout templates, bot protection (reCAPTCHA / honeypot), Kiosk mode. |
| **Form Handlers** | Use your own HTML form and post to an MCAE endpoint. Supports completion actions, with less validation. |
| **Landing Pages** | MCAE-hosted pages (layout templates or drag-and-drop builder). Lightning Builder (Lightning Email/Landing Page builder) via **Salesforce CMS** "Account Engagement" content. |
| **Email** | List emails, autoresponders, operational emails, Lightning email builder with **Handlebars Merge Language (HML)** (`{{Recipient.FirstName}}`), dynamic content, A/B testing. Legacy PML (Pardot Merge Language) is replaced by HML. |
| **Automations** | **Automation Rules** (retroactive + repeating, criteria-based actions), **Completion Actions** (on form/link/file/email action), **Segmentation Rules** (one-time), **Dynamic Lists** (auto-updating criteria lists), **Page Actions** (on page view), **Dynamic Content** (field-based variants). |
| **Other** | Tracker domains (custom domain + HTTPS), first-party tracking, **Custom Redirects**, Files, Social posting (being retired, verify), **B2B Marketing Analytics (B2BMA)** = CRM Analytics app, Multi-Touch Attribution, **Campaign Influence**, Einstein Behavior Score, Einstein Lead Scoring, **Prospect Activity Lightning component**, **MCAE API** v5 (REST; uses Salesforce OAuth + `Pardot-Business-Unit-Id` header). |

### 2.3 Marketing Cloud Next / Growth & Advanced editions / "Agentforce Marketing"
- **Marketing Cloud Growth Edition** (GA in 2024) is native on the Salesforce core org and **built on Data Cloud / Data 360**. It targets SMB: email, forms, landing pages, segments, flows-as-journeys ("Marketing flows"), Einstein/Agentforce content generation, consent management.
- **Marketing Cloud Advanced Edition** (2025): adds SMS, WhatsApp, branching, more segmentation, and higher limits.
- **Marketing Cloud Next** was announced at **Connections, June 2025**. It is the umbrella for next-gen, **agentic marketing on Data 360**: "agency of agents" for campaign briefs, content, segmentation, journeys, optimization, and analytics. It consolidates capabilities from prior acquisitions (ExactTarget, Pardot, Evergage, Datorama, Krux, and others) into one app.
- **Packaging (2025-2026):** new customers buy **Growth** or **Advanced** edition. Existing MCE / MCAE / Personalization / Intelligence customers get next-gen features by renewing to a **"+" edition** (for example "Engagement+", "Account Engagement+"), which **runs alongside** existing tools without a forced migration.
- **Branding:** from Dreamforce 2025 the pricing pages say **"Agentforce Marketing"**. After Salesforce's Sep 2026 partial reversal of "Agentforce X" names, current product naming may be back to "Marketing Cloud" **(verify)**.
- **Winter '26 highlights:** Agentforce campaign creation (brief → multichannel campaign), in-app messaging, the Paid Media Optimization agent moving to a dedicated Agentforce Employee Agent (Marketing Intelligence), and Agentforce actions in MCAE (a Lead Management Agent, prospect updates from anywhere).
- **Key objects (core):** Campaign, Marketing Flow (Flow-based journey), Segment (Data 360), Content (CMS/Email Content), Consent (Contact Point Consent / Data Use Purpose), Marketing Form, Landing Page (CMS + Experience Cloud LWR microsite), Sender/Domain configuration.
- **MCE is not deprecated** (verify end-of-sale/roadmap). Large enterprise B2C still runs on MCE in 2026.

### 2.4 Loyalty Management
- Native on core (launched 2021). Industries-style data model. Used for **B2C/B2B loyalty programs**.
- Objects: **Loyalty Program**, **Loyalty Program Member** (individual or corporate), **Loyalty Program Currency** (qualifying points for tiers vs non-qualifying/redeemable points), **Loyalty Tier Group / Tier**, **Loyalty Program Partner**, **Transaction Journal** (activity: purchase, accrual, redemption), **Loyalty Ledger**, **Member Currency**, **Vouchers**, **Benefits**, **Promotions** (with Global Promotions Management; verify), **Badges**.
- Processing: **Loyalty Program Processes** (rule-based engine via Global Promotions Management / Decision Tables) or Flows. **Batch/realtime** processing of Transaction Journals. Tier assessment (batch), point expiration.
- Integrates with Experience Cloud (member portal), Marketing Cloud (journeys), Commerce, Data 360, and Partner Network. **Loyalty Management Accredited Professional is retiring** (Feb 1, 2027).

---

## 3. Commerce Cloud ("Agentforce Commerce" naming, verify)

### 3.1 B2C Commerce (SFCC, ex-Demandware)
- Acquired **Demandware in 2016 ($2.8B)**. It is a **separate multi-tenant SaaS stack**, not on core: Java-based servers and its own database. It uses **realms**, **instances** (Sandbox / Development / Staging / Production in a **Primary Instance Group**, PIG; plus on-demand sandboxes), and **sites**.
- **Business Manager (BM)**: admin UI. Merchant Tools (Products & Catalogs, Content (Content Assets, Slots, Page Designer), Marketing (Campaigns, Promotions, Coupons, Customer Groups, Source Codes, AB Tests), Search (Searchable attributes, Sorting rules, Synonyms, Einstein search), Customers, Ordering, Online Marketing, SEO (URL rules, aliases, sitemaps), Site Preferences) and **Administration** (Sites, Organization, Roles & Permissions, Business Manager users, Code Deployment (code versions), Data Replication (staging → production), Operations (jobs, Job Schedules), Global Preferences, Locales, Open Commerce API settings).
- **Cartridges**: code packages (`app_storefront_base`, `plugin_*`, `int_*`, `bm_*`) on a **cartridge path** that resolves left-to-right. Server-side **JavaScript (Rhino-based, ES5 + some ES6; `dw.*` API / Script API)**, **ISML** templates, **controllers** (`server.get/append/prepend/replace`), **hooks**, **jobs**, **Page Designer** (components/page types as meta JSON + scripts).
- **SFRA (Storefront Reference Architecture)**: the current reference storefront (2018+, MVC with Express-like controllers, Bootstrap). It replaced **SiteGenesis** (pipelines/JS controllers, legacy).
- **Composable Storefront** (= **PWA Kit + Managed Runtime**): headless React/Node storefront (Retail React App) deployed on **Managed Runtime (MRT)** and calling **SCAPI** (Salesforce Commerce API: Shopper APIs + Admin APIs, SLAS for shopper auth). OCAPI is legacy but still used. **Hybrid** deployments (some pages SFRA, some PWA Kit) are possible via "phased headless rollout".
- **Einstein for Commerce**: Product Recommendations, Predictive Sort, Commerce Insights, Search Dictionaries. **Agentforce Shopper Agent / Merchant Agent** (2025+, verify).
- **Developer tools**: VS Code Prophet Debugger, `sfcc-ci`, `b2c-tools`, WebDAV (code upload), uploading via `dw.json`.
- **Certs:** B2C Commerce Developer (renamed back from "B2C Commerce Cloud Developer" on Jul 24, 2026), B2C Commerce Architect (**retiring Feb 2027**).

### 3.2 B2B Commerce & D2C Commerce on Lightning (Commerce on core)
- **B2B Commerce (classic / "Aura"/CloudCraze)**: CloudCraze was acquired in 2018. It is the legacy managed package (`ccrz`) on Visualforce. Customers are migrating off it.
- **B2B Commerce on Lightning** (2020): native core. Experience Cloud store (**B2B Commerce (Aura)** → **B2B (LWR)** template). Objects: **WebStore**, BuyerGroup, BuyerAccount, Entitlement Policies (which products/prices buyer groups see), Pricebooks, **ProductCatalog/Category**, CartCheckoutSession, WebCart/CartItem, Order. Checkout via **Checkout Flow** (Aura) or **Checkout integrations** (LWR, Apex `CartExtension` / "Commerce Extensions" for pricing, inventory, shipping, tax). Search via the search index (rebuild after changes). **Commerce Setup** in the **Commerce app**.
- **D2C Commerce** (B2C Commerce on Lightning, 2021): the same platform for direct-to-consumer brands on core with an LWR storefront (guest browsing/checkout). It is lighter-weight than SFCC.
- **Salesforce Payments** (Stripe-backed native payments, verify regions).
- **Commerce for Agentforce / Agentforce Commerce**: shopping agents and merchant agents (verify naming).

### 3.3 Order Management (SOM)
- Native on core (2020). Post-checkout order lifecycle for B2C/B2B/D2C, including SFCC as the order source.
- Key objects: **Order** (original, immutable-ish) → **OrderSummary** (the "living" order; changes create **Change Orders**), **OrderItemSummary**, **OrderDeliveryGroupSummary**, **FulfillmentOrder** / FulfillmentOrderLineItem (per location), **OrderPaymentSummary**, **Invoice**, **CreditMemo**, **ReturnOrder**, **ProcessExceptionEvent/ProcessException**, **Location**, **Omnichannel Inventory** (OCI: availability across locations; reservations).
- Flows: **Create Order Summary**, **Routing (Allocation)**, **Fulfillment**, **Cancel / Return / Adjust (Ensure Funds / Ensure Refunds)** using **Order Management Apex actions / Invocable actions** and Connect APIs. Payment gateway adapters.
- Order Management Admin and Developer Accredited Professionals are **retiring Feb 2027**.

---

## 4. Industries Clouds & OmniStudio

### 4.1 General model
- **Industries** = vertical apps built on core (most are now **native "Industries" data models and features**, enabled via permission set licenses, plus some managed packages). Many came from the **Vlocity acquisition (2020, $1.33B)**.
- Common shared capabilities: **OmniStudio**, **Business Rules Engine** (Decision Matrices, Expression Sets), **Data Processing Engine (DPE)**, **Batch Management**, **Action Plans**, **Document Generation**, **Discovery Framework** (assessments), **Industries Interaction Summaries**, **Timeline**, **Actionable Relationship Center (ARC)**, **Actionable Segmentation**, **Intelligent Document Automation**, **Industries Einstein / Agentforce industry agents & topics**.
- 2026 branding: industry clouds were relabeled "Agentforce Financial Services", "Agentforce Health", and so on in Oct 2025. **Cert names now use "Agentforce …"** (Jul 2026). Product names may have reverted (Sep 2026) **(verify)**.

### 4.2 Cloud-by-cloud

| Cloud | Key data model / features | Notes |
|---|---|---|
| **Financial Services Cloud (FSC)** | Person Accounts, **Households** (Account record type) and **Relationship Groups**, **Financial Accounts** (FinancialAccount std object; earlier `FinServ__` managed package objects), Financial Holdings, Assets & Liabilities, Goals, **Contact-Contact / Account-Account relationships**, **ARC**, **Rollup-by-Lookup (RBL)**, Compliant Data Sharing (CDS), Referral management, Interaction Summaries, Deal Management, Retail Banking, Wealth, Insurance (policy/claims, merged "Insurance" in FSC), Mortgage (Digital Lending), Banking Service Agent (verify). | Managed package (`FinServ`) + core features. Migration to **standard objects** is ongoing. Cert renamed: *Agentforce Financial Services Professional* (Accredited). |
| **Health Cloud** | Patient (Person Account), **Care Plans** (Integrated Care Management), Care Teams, Clinical data model (FHIR R4-aligned: HealthCondition, Medication, CareObservation, Encounter), Utilization Management, Provider Network Management, Home Health, Patient/Member Services, Intelligent Appointment Management (Scheduler), Pharma CRM moved to Life Sciences Cloud. HIPAA BAA. | Cert: *Agentforce Health Professional*. |
| **Life Sciences Cloud** | GA 2024, built on Health Cloud foundations. **Pharma/MedTech commercial (CRM for field reps: call planning, visits, samples, HCP engagement)**, Customer Engagement (GA 2025), Clinical (trial site selection, patient recruitment), Patient Services, MedTech. Positioned as a replacement for Veeva CRM after the Veeva–Salesforce partnership ends (2025). | (verify feature names) |
| **Manufacturing Cloud** | **Sales Agreements** (run-rate business), **Account Forecasting** (via DPE), Rebate Management, Warranty Lifecycle Management, Partner Visit Management, Program-Based Business, Service Excellence (asset service). | Cert: *Agentforce Manufacturing Professional*. |
| **Consumer Goods Cloud** | Retail Execution: **Visits**, Retail Stores, Store Product, Assessment Tasks, Planogram/Audit, offline mobile app (Consumer Goods Cloud mobile, "Retail Execution" app), **Trade Promotion Management (TPM)** (being moved to new native TPM; TPM Accredited Professional cert **retiring**). | Cert: *Agentforce Consumer Goods Professional*. |
| **Public Sector Solutions (PSS)** | Licensing & Permitting, Inspections, Grants Management, Benefits Management (Social Services), Case Management, Emergency program management, Employee experience, Regulatory Code. FedRAMP High via **Government Cloud Plus**. | Cert: *Agentforce 360 for Public Sector Professional*. |
| **Nonprofit Cloud (NPC, new)** | **On-core** (2023+): Person Accounts, Fundraising (Gifts, Gift Commitments, Gift Transactions, Designations, Campaigns), Program & Case Management, Grantmaking, Outcome Management, Volunteer Management (2024-25), Actionable Relationship Center. **Replaces NPSP for new customers.** | Cert: *Agentforce Nonprofit Consultant* (formerly NPC Consultant). |
| **NPSP (Nonprofit Success Pack)** | Legacy **managed package** set (`npsp`, `npe01`, `npo02`, `npe03`, `npe4`, `npe5`): Household Account model, Opportunities as donations, Recurring Donations (Enhanced RD), GAU allocations, Payments, Relationships/Affiliations, Customizable Rollups, Engagement Plans, Levels, Batch Gift Entry, **Table-Driven Trigger Management (TDTM)**. Still supported, no new major features. | **NPSP Consultant cert retiring Feb 2027.** Nonprofit "Power of Us" program: 10 free Enterprise licenses (verify). |
| **Education Cloud** | **On-core** (2023+): learner/student model (Person Accounts, Learner Profile, Academic Term, Program/Course Offering, Program Enrollment), Recruitment & Admissions, Student Success, Advancement (Fundraising), K-12 Architecture Kit. Successor to **EDA (Education Data Architecture)** managed package (Administrative account model, Affiliations, Course Connections, `hed__` namespace). | **Education Cloud Consultant cert retiring Feb 2027.** |
| **Automotive Cloud** | (2022) Vehicle, Vehicle Definition, Driver, Dealer/Retail sales, Fleet, Warranty, Visit/Inventory, Connected-vehicle telemetry via Data 360. | — |
| **Energy & Utilities Cloud (E&U)** | Customer service for utilities: Service Points, Premises, Meters, Rate plans, Billing Accounts, Move-in/Move-out OmniScripts, Program Enrollment, integration with CIS (SAP IS-U / Oracle CC&B). | **E&U Accredited Professional retiring Feb 2027.** |
| **Media Cloud** | Advertising Sales Management (ad order management, media plans, proposals), Subscriber management (OTT/publishing subscriptions). | **Media Cloud Accredited Professional retiring Feb 2027.** |
| **Communications Cloud** | Telco CPQ/OM ("Industries CPQ" + **Industries Order Management**: decomposition, orchestration), Product Catalog (EPC: Enterprise Product Catalog), TM Forum ODA/Open APIs, B2B/B2C quoting, contract lifecycle, enterprise sales. | Cert: *Agentforce Communications Professional*. Industries CPQ Developer cert **retiring**. |
| **Net Zero Cloud** | (2019 as **Sustainability Cloud**, renamed **Net Zero Cloud** 2022). Carbon accounting (Scope 1/2/3; energy use records, emission factor sets, stationary/vehicle assets, supplier), waste/water, **ESG reporting** (CSRD, GRI, CDP, SASB/ISSB frameworks), Net Zero Marketplace (Carbon credits marketplace, mostly wound down, verify), DPE calculations, Tableau dashboards. | **Net Zero Cloud Accredited Professional retiring Feb 2027.** |
| Also | **Revenue Cloud (Revenue Lifecycle Management)** (separate file), **Field Service** (now "Agentforce Field Service and Operations", cert renamed), **Insurance** (folded into FSC), **Hospitality/Retail**, **Agentforce for Industries**. | — |

### 4.3 OmniStudio (Vlocity tooling, now native)
Two runtimes:
- **Managed package (Vlocity)**: namespaces `vlocity_cmt` (Comms/Media/Energy), `vlocity_ins` (Insurance/Health), `vlocity_ps` (Public Sector). Older **Vlocity designers**.
- **OmniStudio "Standard" (on-platform / core) runtime**: native metadata (`OmniScript`, `OmniUiCard`, `OmniIntegrationProcedure`, `OmniDataTransform`), standard designers, LWC-based runtime. It is the default for new orgs. Migration tooling (OmniStudio Migration Tool) converts packaged components → standard.

| Tool | Purpose | Key points |
|---|---|---|
| **OmniScripts** | Guided, multi-step UI processes (like screen flows, built for industries). | Elements: **Steps**, inputs (Text, Select, Radio, Lookup, Type Ahead, Date, File, Signature), **Blocks/Conditional Blocks/Edit Blocks** (repeatable), **Actions** (DataRaptor/Data Mapper Extract/Load/Turbo Extract, **Integration Procedure Action**, Remote Action (Apex `Callable`/`VlocityOpenInterface`), HTTP Action, Navigate, Email, DocuSign, **Set Values**, **Set Errors**), Messaging, Calculation Action. Identified by **Type / SubType / Language**. Versioned (only one active per Type/SubType/Language). LWC OmniScripts (compiled to LWC) are the current standard; Angular OmniScripts are legacy. JSON data model (`%Step:Field%` merge syntax). Save for later, Knowledge sidebar, ability to embed in Experience Cloud and Lightning pages. |
| **FlexCards** | Data-driven, contextual cards (summary UI) on record pages/consoles/sites. | Data source: Integration Procedure, Data Mapper, Apex, REST, SOQL/SOSL, Streaming. **States** (conditional layouts), **Actions** (launch OmniScript, navigate, update, event), **child cards**, flyouts, **session variables**, Card styling. Compiled to LWC. Replaced older "Vlocity Cards" (Angular). |
| **Integration Procedures (IPs)** | Server-side, declarative, multi-step orchestration of data calls (no UI). Run in a single server transaction and are fast. | Elements: **Data Mapper Extract/Load/Transform Actions**, **HTTP Action** (Named Credentials), **Remote Action** (Apex), **Set Values**, **Conditional Block**, **Loop Block**, **Try-Catch Block**, **Cache Block** (Platform Cache: session/org), **Response Action**, **Integration Procedure Action** (nested), Chainable settings (chain on CPU/heap limits), queueable/future execution. Type/SubType versioning. Callable from OmniScripts, FlexCards, Apex (`IntegrationProcedureService`), REST API (`/services/apexrest/vlocity_*/v1/integrationprocedure/Type_SubType` or standard Connect endpoint). |
| **DataRaptors → Data Mappers** | Declarative data read/write/transform (renamed **"Data Mappers"** in the standard runtime, ~2023). | Types: **Extract** (multi-object SOQL w/ relationships, filters, output JSON mapping), **Turbo Extract** (single object, fast, no formulas), **Load** (insert/upsert/update multiple objects with lookup keys), **Transform** (JSON↔JSON/XML reshaping, no DB). Formulas, default values, list handling. |
| **Others** | **Expression Sets / Decision Matrices** (Business Rules Engine, formerly Calculation Procedures/Matrices), **Document Generation** (DocGen: Word/PPT templates → PDF; client-side & server-side), **OmniStudio Tracking**, **Omni Analytics**, **Vlocity Build Tool / IDX Workbench** (legacy deploy tools for DataPacks) → now SFDX metadata deploy for standard components. |

Best practices: put data logic in IPs (not client-side in OmniScripts), cache with IP Cache Blocks, use Turbo Extract when possible, keep OmniScripts thin, and use Remote Actions sparingly.

---

## 5. Slack

- Acquired **July 2021 for ~$27.7B** (Salesforce's largest acquisition).
- **Plans:** Free, Pro, Business+, **Enterprise Grid** (multiple workspaces, org-level admin, EKM, DLP, data residency). Since 2025: AI included in paid plans, plus **Slack AI / Slackbot as an AI agent**, enterprise search across connected apps, and **Agentforce in Slack** (verify plan packaging after 2025 pricing changes).
- **Salesforce ↔ Slack integrations:**
  - **Salesforce for Slack** apps (the umbrella app is "Salesforce" in the Slack Marketplace): **Sales Cloud for Slack** (record previews, search, record updates, **Opportunity Deal Rooms**/channels, alerts), **Service Cloud for Slack** (**Swarming**: escalate a case to a swarm channel; **Expert Finder**), Salesforce **Record Alerts**, "Send to Slack" Flow action.
  - **Salesforce Channels** (2024-25): Slack channels linked to Salesforce records, with a record panel inside Slack (verify current name).
  - **Slack Sales Elevate** (2023): pipeline management, deal alerts, and bulk-editing of opportunities in Slack for sales leaders. Later folded into "Slack for Sales" / Sales Cloud-in-Slack features **(verify current status/end-of-sale)**.
  - **Slack as a CRM surface**: Salesforce positions Slack as the "conversational interface" for CRM and agents. In 2025, "**Slack CRM**"/"Salesforce in Slack" for small businesses was announced (a CRM built into Slack, powered by Salesforce Starter) **(verify)**.
  - **Flow Core Actions for Slack** (Send Message to Slack Channel, Create Slack Channel, Archive, Invite users, Check if User Is Connected) via the **Slack Flow Core Actions** setup.
  - **Agentforce in Slack**: deploy Agentforce agents as Slack apps. Employee agents. **Slack MCP server / Real-Time Search API** (2025-26) for third-party AI access (verify).
  - Data 360 ↔ Slack connector (zero-copy access to Slack data; verify).
- **Slack Workflow Builder**: no-code automation. Triggers (shortcut/link, new channel member, emoji reaction, schedule, webhook, message posted in channel), steps (send message, form, Salesforce steps such as "Create a record", "Update a record" via the Salesforce connector, third-party connectors), plus custom steps built with the **Slack platform (Deno SDK / Bolt)**. Workflows can be published as **links/shortcuts** or added to **channel bookmarks**.
- **Slack platform for developers**: **Bolt** (JS/Python/Java), **Block Kit** UI framework, Events API, Web API, Socket Mode, **Slack CLI + Deno SDK** ("next-gen platform", functions/workflows/datastores, verify continued investment), **Canvases** (docs in Slack, built on Quip tech), **Lists**, **Huddles**, **Clips**.
- **Apex SDK for Slack** (beta in 2023, then **retired before GA**, verify). Use Flow core actions or the Slack Web API via Named Credentials instead.
- Certs: Slack Administrator, Slack Consultant, Slack Developer (renamed with the "Salesforce Certified" prefix in Jul 2025).

---

## 6. Tableau & Analytics

- **Tableau** was acquired **Aug 2019 (~$15.7B)**.

| Product | What it is |
|---|---|
| **Tableau Desktop** | Authoring app (Windows/macOS). Connect, visualize, publish workbooks (`.twb`/`.twbx`), extracts (`.hyper`). |
| **Tableau Prep (Builder/Conductor)** | Visual data prep/flows. Conductor schedules flows on Cloud/Server (Data Management add-on). |
| **Tableau Cloud** (formerly **Tableau Online**, renamed 2022) | Salesforce-hosted SaaS for publishing/sharing. Sites, projects, permissions, Bridge (for on-prem data). |
| **Tableau Server** | Self-hosted (Windows/Linux) version of Cloud. |
| **Tableau Public** | Free public publishing. |
| **Tableau Pulse** | (2023-24) AI-powered **metrics layer** with automated insights delivered as digests (email/Slack/mobile). Metrics are defined on published data sources. Insights summaries use LLMs. **Pulse for Salesforce**: no longer sold to net-new since Aug 1, 2025 (replaced by Tableau Next). |
| **Tableau Next** | (GA ~Apr/Jun 2025, bundled in **Tableau+**) agentic analytics **natively on the Salesforce platform / Data 360**: semantic models (**Tableau Semantics**), visualizations, dashboards, metrics, and **Concierge/Tableau Agent** skills (Data Pro, Inspector). Lives in the Salesforce org. |
| **Tableau Agent** (formerly Einstein Copilot for Tableau) | NL-to-viz, calculation authoring, Pulse/Next Q&A. Gained dashboard capabilities in 2026. |
| **Tableau MCP** | MCP servers for Tableau Cloud/Server/Next. **GA May 2026** (verify). |
| **CRM Analytics** (formerly Einstein Analytics → Tableau CRM (2020) → CRM Analytics (2022)) | Native analytics on the platform: datasets, recipes/dataflows, lenses, dashboards, SAQL, Einstein Discovery. A separate product from Tableau proper. |
| **Tableau Embedded Analytics** / **Tableau Lightning Web Component** | Embed Tableau views in Lightning pages. |

- Pricing/roles: **Creator / Explorer / Viewer** licenses. Tableau+ = premium bundle with AI and Tableau Next.
- Certs: Tableau Desktop Foundations, Data Analyst, Consultant, Server Administrator, Architect (all "Salesforce Certified Tableau …" since Jul 2025).

---

## 7. MuleSoft

- Acquired **May 2018 (~$6.5B)**. The integration and API management platform. Core idea: **API-led connectivity** in three layers: **System APIs** (unlock systems of record), **Process APIs** (orchestrate/business logic), and **Experience APIs** (channel-specific). Concept of the **Center for Enablement (C4E)**.

| Component | Purpose |
|---|---|
| **Anypoint Platform** | The umbrella SaaS control plane (US/EU/Gov control planes). |
| **Anypoint Code Builder (ACB)** | VS Code-based IDE (cloud or desktop), replacing **Anypoint Studio** (Eclipse-based, still supported). |
| **Design Center** | API design (RAML / OAS specs; API Designer) and flow design. |
| **Anypoint Exchange** | Catalog/marketplace of APIs, connectors, templates, and assets (public + private). |
| **API Manager** | API governance: policies (rate limiting, client ID enforcement, OAuth, JWT, IP allowlist), SLA tiers, contracts, **Flex Gateway** (Envoy-based lightweight gateway for any API, including non-Mule), Mule Gateway. |
| **API Governance / Anypoint API Experience Hub** | Conformance rulesets; developer portals (API Experience Hub runs on Experience Cloud). |
| **Runtime Manager** | Deploy/manage Mule apps: **CloudHub** (1.0 legacy; workers/vCores), **CloudHub 2.0** (containerized, replicas, private spaces), **Runtime Fabric** (customer-managed Kubernetes), hybrid/on-prem standalone runtime. |
| **Anypoint Monitoring / Visualizer** | Dashboards, logs, alerts, app network topology. |
| **Anypoint MQ** | Cloud messaging (queues, exchanges). |
| **DataWeave** | Functional transformation language (`%dw 2.0`). Also usable in Apex (**DataWeave in Apex**, GA 2024). |
| **Connectors** | Salesforce Connector, Database, HTTP, SAP, Workday, etc. Mule 4 runtime (Java 17 support). |
| **MuleSoft Composer** | No-code integration **inside Salesforce** for admins (flows between Salesforce and NetSuite, Slack, Google Sheets, Workday, etc.). Priced per flows/tasks. |
| **MuleSoft RPA** | Robotic process automation (from **Servicetrace**, acquired 2021). RPA Builder/Recorder, Bot runners. Callable from Flow (**Flow Orchestration**). |
| **MuleSoft IDP** | Intelligent Document Processing (extract data from documents; Einstein/LLM-based). |
| **Hyperautomation** | Marketing umbrella (Composer + RPA + Flow + APIs). **Hyperautomation Developer cert retiring Feb 2027.** |
| **MuleSoft Agent Fabric** | (Launched **Sep 2025**; expanded Jan–Jun 2026.) Governs "**agent sprawl**": **Agent Registry** (catalog of agents & MCP servers; add MCP servers by URL; curated 3rd-party MCP servers, GA Jan 2026), **Agent Broker** (routing/orchestration across agents; deterministic orchestration beta Apr 2026, full GA Jun 2026 with visual authoring canvas), **Agent Visualizer** (map of the agent network), **Agent Scanners** (auto-discover agents across Agentforce, Amazon Bedrock, Google Vertex AI, etc.; GA Jan 2026), **AI Gateway**, **MCP Bridge** (turn APIs into MCP servers), **Trusted Agent Identity** (incl. mobile authorization for high-risk agent actions). Supports **A2A** and **MCP** protocols. |
| **MuleSoft for Agentforce** | Topic Center / API-to-agent action publishing; turn APIs into Agentforce actions (2024-25). |

- Certs: MuleSoft Integration Foundations, MuleSoft Developer (I), MuleSoft Developer II, MuleSoft Platform Architect, MuleSoft Platform Integration Architect. **MuleSoft Catalyst Consultant** and **Hyperautomation Developer** are **retiring**.

---

## 8. Heroku

- Acquired **2010 (~$212M)**. A PaaS: **dynos** (containers; Eco/Basic/Standard/Performance/Private/Shield types), **buildpacks** (Node, Python, Java, Ruby, Go, PHP, Scala, Clojure; Cloud Native Buildpacks on "Fir"), **Procfile**, `git push heroku main`, **add-ons** (Elements Marketplace), **Heroku Postgres** (with Data Clips, follower/forks), **Heroku Key-Value Store** (formerly Heroku Redis), **Apache Kafka on Heroku**, **Pipelines** (review apps, staging → production promotion), **Heroku CI**, **Private Spaces / Shield Private Spaces** (HIPAA/PCI), **Heroku Enterprise** (teams, SSO).
- **Salesforce integration:** **Heroku Connect** (bi-directional Postgres ↔ Salesforce object sync), **Heroku AppLink** (2025: expose Heroku apps as Apex/Flow/Agentforce actions), External Objects via Heroku Connect's OData, **Salesforce Functions** (Heroku-based; **retired Jan 2025**).
- **Fir** next-gen platform (Kubernetes/OCI-based; GA 2025), **Heroku Managed Inference and Agents** (2025).
- **2026 status:** On **Feb 6, 2026**, Heroku announced a move to a **"sustaining engineering" model**: no new features, **no new enterprise contracts for new customers**, and security/maintenance continues. Existing enterprise contracts are honored and renewable. Credit-card (self-serve) customers are unaffected. Heroku is a weak choice for new strategic builds. **Heroku Developer Accredited Professional cert retiring** (Feb 2027).

---

## 9. Quip
- Acquired **2016 (~$750M)**. Collaborative docs, spreadsheets, chat, and **Quip for Salesforce** (embedded docs/live apps on records, Quip templates via Flow).
- **Status:** **End of life announced.** Subscriptions **cannot be renewed after March 1, 2027**. After expiry: 90 days read-only → 90 days blocked logins → data deletion (verify exact dates for your contract). The official successor is **Slack Canvases** (built on Quip technology). A one-at-a-time Quip → Canvas converter exists; spreadsheets don't convert (only ~65% of docs are compatible). Quip use cases are also moving to Slack and Sales Cloud features.
- Don't recommend Quip for any new solution.

---

## 10. Security, data protection & trust add-ons

### 10.1 Salesforce Shield
Paid add-on bundle (about 30% of net spend, varies). Components:

| Component | Details |
|---|---|
| **Platform Encryption** | Encryption at rest for fields, files, attachments, and search index, using **tenant secrets** + master secret derived keys (probabilistic or **deterministic** encryption; deterministic allows filtering/matching). **BYOK** (Bring Your Own Key) and **Cache-Only Key Service** (keys held externally). Some features/functions are limited on encrypted fields (formula, SOQL ORDER BY, etc.). Do not confuse it with Classic Encrypted Text fields (masking, 175 chars). |
| **Event Monitoring** | Event Log Files (EventLogFile object; 50+ event types: Login, API, Report Export, URI, Lightning page view, etc.), **Real-Time Event Monitoring** (streaming events such as ReportEvent, ApiEvent, LoginEvent, plus **Transaction Security Policies** that block/2FA/notify), **Event Monitoring Analytics app** (CRM Analytics), Threat Detection (Session Hijacking, Credential Stuffing, Report Anomaly, API Anomaly). Free tier: limited log types with 1-day retention. |
| **Field Audit Trail** | Extends field history retention to **up to 10 years** and **60 fields/object** (vs 20 fields / 18-24 months standard). Data lives in `FieldHistoryArchive` (Big Object). Retention policy via Metadata API (`HistoryRetentionPolicy`). |
| **Data Detect** | Scans for sensitive data (PII patterns: emails, credit cards, SSNs, custom regex) and classifies it. Helps decide what to encrypt. |
| **Security Center** (separate add-on) | Multi-org security posture dashboard (health check, permissions, metrics). |
| **Privacy Center** (separate) | Data retention/deletion (RTBF) policies, consent, data subject requests. |

### 10.2 Backup & Recover / Own Company
- **Salesforce Backup** (native, launched ~2022): daily automated backups of data (and metadata in later versions), restore via a UI. It was branded **"Backup & Restore"** (verify current name).
- **Own Company** (formerly OwnBackup): acquisition agreement Sep 2024 for **~$1.9B cash**, **closed late 2024**. Products: **Own Recover** (backup & granular restore, comparisons, Smart Alerts), **Own Archiver** (data archiving), **Own Accelerate** (sandbox seeding), **Own Secure** (data security posture), **Own Discover** (time-series data access). Now offered as **"Own from Salesforce"** / **Salesforce Backup & Recover** (consolidated name, verify).
- Other ecosystem backup tools: Odaseva, Gearset Backup, Spanning (Kaseya), and others.
- Weekly Data Export (Setup → Data Export) is free but not a backup strategy. Salesforce's paid data-recovery service is a costly last resort that was reinstated in 2021.

### 10.3 Other security-related
- **Hyperforce**: Salesforce's public-cloud (AWS etc.) re-architecture with data residency (EU Operating Zone).
- **Government Cloud / Government Cloud Plus** (FedRAMP High, IL4/IL5 for DoD, verify).
- **Salesforce Trust site**: see §16.

---

## 11. Field, mobility, scheduling, engagement add-ons

### 11.1 Salesforce Maps
- From the **MapAnything acquisition (2019)**. Lightning app: **Maps** (plot records from saved queries by address/geocode), **Routing & Schedule optimization**, **Live Tracking** (mobile GPS), **Check-in/Check-out**, **Territory Planning** (balance territories by workload/data; **Maps Advanced**), **Maps Lite** (free with some editions, limited: plot near-me on record pages; verify), mobile app. Data layers, markers, shapes (radius, polygon, postal-code boundaries), **Base Objects** configuration, **Proximity** searches. It is separate from **Field Service** scheduling optimization.

### 11.2 Digital Engagement (messaging channels for Service)
- Add-on license for Service Cloud: **Messaging for In-App and Web** (**Enhanced Chat**; MIAW), **Enhanced SMS**, **WhatsApp**, **Facebook Messenger**, **Apple Messages for Business**, **LINE**, **Bring Your Own Channel** (BYOC, with CCaaS partners), **Enhanced Bots** / Agentforce Service Agent as first responder, routed via **Omni-Channel** (and **Omni-Channel Flows**).
- **Legacy Chat (Live Agent) and Standard Messaging retirement**: legacy Chat and standard (non-enhanced) messaging channels are **retiring Feb 2026**. Migrate to Enhanced Chat/MIAW **(verify exact date)**.
- Messaging Sessions (`MessagingSession`), Messaging End Users (`MessagingEndUser`), **Messaging Components** (rich messages, forms, time pickers), Conversation Intelligence, pre-chat forms via hidden parameters, **Embedded Service Deployments** (Setup → Embedded Service Deployments).
- **Service Cloud Voice** (Amazon Connect, or partner telephony) is separate. The **Contact Center Accredited Professional is retiring** (Feb 2027).

### 11.3 Salesforce Scheduler (formerly Lightning Scheduler)
- Appointment scheduling for branches, offices, and clinics (banking, healthcare, retail).
- Data model: **Service Territory** (location/branch), **Service Resource** (employee or asset), **Service Territory Member**, **Work Type** (appointment type with duration), **Work Type Group**, **Operating Hours** / **Time Slots**, **Service Appointment**, **Skills**, **Scheduling Policies**, **Appointment Assignment Policy** (load balancing/Optimization), **Appointment Topic Time Slots**.
- Flows: **Inbound New Appointment**, **Outbound New Appointment**, **Modify/Cancel Appointment**, Guest (unauthenticated) appointment booking in Experience Cloud, **Inbound flows for Leads/Contacts/PersonAccounts**. Integrates with Microsoft/Google calendar via Einstein Activity Capture (resource availability).
- Licenses: **Salesforce Scheduler** PSL per resource/user. Scheduler is separate from **Field Service** (mobile workforce dispatch with Dispatcher Console, Optimization engine, Enhanced Scheduling & Optimization). Shared objects (ServiceAppointment, ServiceResource) can confuse users.

### 11.4 Other worth knowing
- **Salesforce Feedback Management** (Surveys; premium tiers), **Salesforce Surveys**.
- **Sales Enablement (myTrailhead / Enablement)**: programs and Trailhead-style content for employees. **myTrailhead was retired** and replaced by **Enablement** (verify).
- **Workforce Engagement Management (WEM)**: forecasting and scheduling for contact centers.
- **Salesforce Contracts / CLM**, **Document Generation**.
- **Salesforce Spiff** (Spiff acquired Feb 2024; sales commissions, now "Salesforce Spiff").
- **Salesforce Mobile App** (Salesforce Mobile, Field Service Mobile, **Mobile Publisher**).

---

## 12. Customer 360, editions & SMB suites

### 12.1 Customer 360
- **Customer 360** (2019+) is the umbrella marketing name for the whole portfolio around "a single view of the customer". **Customer 360 Truth** (2019): **Salesforce Identity for Customers**, **Customer 360 Data Manager** (retired), Customer 360 Audiences (→ Salesforce CDP → Data Cloud → **Data 360**), Privacy & Data Governance.
- In 2025-26 marketing, "Customer 360" is used less; it has largely been superseded by **Agentforce 360**.

### 12.2 SMB suites (Starter / Pro Suite) & editions
| Offer | Notes |
|---|---|
| **Salesforce Starter** (Starter Suite) | Launched 2023, **replaced Essentials**. All-in-one CRM (Sales + Service + Marketing (email) + Commerce basics) for small teams. Max 10 users (historically 325 users for Essentials, verify). Simplified setup (guided onboarding, "Starter" UI). About $25/user/month. Free trial with no credit card. |
| **Salesforce Pro Suite** | 2024. A Starter upgrade with more customization (more automation, quoting/forecasting, API access (limited), AppExchange apps, up to 100 users, verify). About $100/user/month. |
| **Salesforce Foundations** | Announced Sep 2024 (GA Spring '25). Included at **no extra cost** for Enterprise/Unlimited Sales or Service Cloud customers. Adds cross-cloud basics: Sales features for Service customers (and vice versa), Marketing (Growth-ish email/segments), Commerce (basic storefront), **Data Cloud/Data 360 credits**, and **Agentforce** features with limited credits (verify specifics). |
| **Agentforce 1 Editions** (formerly "Einstein 1 Editions") | Top-tier editions bundling Agentforce, Data 360, and Unlimited-level features (e.g. "Agentforce 1 Sales"). Introduced 2024-25, verify current names after the Sep 2026 reversals. |
| Classic editions | Essentials (retired for new sales), Professional, Enterprise, Unlimited, Developer (free), Performance (retired, verify). Platform licenses: Salesforce Platform, Platform Starter/Plus, Lightning Platform. |

---

## 13. AppExchange

### 13.1 What it is
- Launched **2006**. Salesforce's marketplace for **apps (packages)**, **components** (Lightning components / Experience Builder components), **consultants (SI partners)**, **Bolt solutions/templates**, **Flow solutions**, **Data** (data providers), **Agentforce agents/actions** (**AgentExchange**, launched 2025, for agent templates, actions, and topics). Also **Tableau Exchange** and **Slack Marketplace** (separate).
- Partners: **ISV** (Independent Software Vendor, builds apps), **SI** (System Integrator / consulting partner; tiers: Summit, Crest, Ridge, Base; verify after 2024 Partner Program changes to Salesforce Partner Program with "Partner Navigator"), **OEM** (embedded apps with Salesforce licenses).

### 13.2 Package types
| Type | Key facts |
|---|---|
| **Managed package (1GP)** | Created in a Packaging org with a **namespace prefix** (`ns__Field__c`). Code is **obfuscated/hidden** (Apex not viewable), **upgradeable** (push upgrades possible), components locked (subscriber can't edit most), **License Management App (LMA)**, Feature Management App (FMA), **Security Review** required for public listing. Patch orgs for patches. |
| **Managed package (2GP)** | Source-driven (Salesforce DX, **Dev Hub** + namespace). Versions created via the CLI (`sf package version create`). Multiple packages can share a namespace. The modern recommendation for ISVs. Supports **package-ancestry** upgrades. |
| **Unlocked package** | 2GP without IP protection. For **internal** (enterprise) modular development. Upgradeable, and metadata is editable in the subscriber (changes overwritten on upgrade). Optional namespace. |
| **Unmanaged package** | Simple bundle of components. **Not upgradeable**. After install, the components belong to the org (fully editable, no namespace). Used for templates, samples, and one-time transfers. |
| **Org-dependent unlocked** | Unlocked package that depends on metadata present in the target org (for brownfield orgs). |

### 13.3 Evaluating an AppExchange listing (checklist)
1. **Publisher**: partner tier, years on AppExchange, number of installs, customer references.
2. **Reviews/ratings**: read the 1–3 star ones and the vendor's responses.
3. **"Security Reviewed"** (passed AppExchange Security Review). Free apps and components also go through review if listed publicly.
4. **Data residency and external callouts**: does the app send data off-platform? (Check "Data storage / Integrations" and the Remote Site Settings it adds.)
5. **Editions supported** (Professional edition often needs API add-on; Group/Essentials limits), **Lightning Ready**, **Mobile-ready**, Experience Cloud ready.
6. **License model**: per user/org, site license, free/freemium, paid via **AppExchange Checkout** or vendor contract.
7. **Package type** (managed = upgradable vendor support), **namespace collisions**, **limits impact** (managed packages have **separate** governor limit counters for some limits, like SOQL/DML per namespace; certified managed packages don't count against the org's app/object/tab limits; **custom objects in managed packages do count** towards org limits except for certified apps (verify)).
8. **Test drive** / free trial / demo videos. Install in a **sandbox** first.
9. **Permissions requested** and the required profile access. Review included permission sets.
10. **Exit plan**: uninstall behavior (uninstall deletes all package data; export first), data portability.

### 13.4 Installing
- From the listing → **Get It Now** → choose **Production or Sandbox** (or Trailhead Playground) → log in → agree to terms → **Install for: Admins Only / All Users / Specific Profiles** → approve third-party access (Remote Sites) → install (async; email on completion).
- Direct install link: `https://login.salesforce.com/packaging/installPackage.apexp?p0=04t...` (package version ID `04t` prefix). Use `test.salesforce.com` for sandboxes. CLI: `sf package install --package 04t... --target-org myOrg --wait 10`.
- After install: assign **permission sets / licenses** (Setup → Installed Packages → Manage Licenses for paid apps), configure, and add to page layouts and apps. Some packages have post-install scripts (`InstallHandler`).
- **Uninstall**: Setup → Installed Packages → Uninstall. You must remove references first (custom fields used in your formulas, flows, etc.). Package data is deleted and saved for 48 hours as an export (verify).
- **Upgrades**: push upgrades by the ISV (patch/major), or manual install of a newer version. You can't downgrade.

---

## 14. Trailhead & Trailblazer Community

### 14.1 Trailhead (free learning platform, launched 2014)
- **Modules** → **Units** (each with a quiz or a hands-on challenge verified in an org). **Projects** (step-by-step hands-on builds). **Trails** (curated sequences of modules/projects). **Trailmixes** (user-curated lists; can include external links). **Superbadges** (scenario-based, multi-challenge, real-world skill validation; e.g. Apex Specialist, Flow Fundamentals, Lightning Experience Reports & Dashboards; some are prerequisites for certifications such as Platform Developer II). Superbadges were restructured into "**Superbadge Units**" (smaller prerequisite units) in 2022.
- **Points & badges**: modules/projects give badges and points (quiz points decrease with wrong attempts).
- **Trailblazer ranks** (current thresholds, verify):

| Rank | Badges | Points |
|---|---|---|
| Scout | 0 | 0 |
| Hiker | 1 | 200 |
| Explorer | 5 | 3,000 |
| Adventurer | 10 | 9,000 |
| Mountaineer | 25 | 18,000 |
| Expeditioner | 50 | 35,000 |
| Ranger | 100 | 50,000 |
| Double Star Ranger | 200 | 75,000 |
| Triple Star Ranger | 300 | 100,000 |
| Four Star Ranger | 400 | 125,000 |
| All Star Ranger | 600 | 150,000 |

- **Agentblazer Status** (2025+): Agentforce learning tiers (**Champion → Innovator → Legend**), refreshed annually (verify).
- **Trailhead Playgrounds**: free Developer-Edition-like orgs connected to your Trailhead account for challenges (multiple per account; can install packages; expire if unused, verify). **Special hands-on orgs** are provisioned by specific modules (e.g. Data 360, Agentforce, Industries) and expire after a set period. **Developer Edition** orgs are separate (free, sign up at developer.salesforce.com).
- **Trailhead GO** (mobile app), **Trailhead Academy** (paid instructor-led training, exam vouchers), **Trailhead for Slack**, **Trailblazer profile** (merged from Trailblazer.me into **trailhead.com** profile in 2023), **Career paths**, **Trailhead Live** (streamed sessions).
- **Credential maintenance**: certifications require **annual maintenance modules** on Trailhead (moved from 3 releases/yr to **once per year** in 2024-25, verify). Missing maintenance → expired cert.
- **Exams**: proctored online or onsite. Delivered via **Pearson VUE** on the Trailhead Academy/Trailhead credentials site (migrated from Kryterion/Webassessor in 2025, verify). Typical fee: $200 (retake $100) for associate/admin-level, $400 for some advanced, CTA review board ~$6,000 (verify). 60-ish multiple-choice questions, ~105 min. **Accredited Professional** credentials are on Partner Learning Camp (partner-focused, cheaper, unproctored or lightly proctored).

### 14.2 Trailblazer Community
- **trailhead.salesforce.com/trailblazer-community**: Q&A forums, groups (user groups by location/role, product groups, **IdeaExchange** for feature ideas with votes, "Delivered" status).
- **Community Groups** (local Admin/Developer user groups, **Women in Tech**, **Dreamin' events** such as London's Calling, Midwest Dreamin', Texas Dreamin'), **Trailblazer Community MVPs** (Salesforce MVP program), **Golden Hoodie** (award), **Ohana** (company culture term).
- Events: **Dreamforce** (annual, San Francisco, Sep/Oct), **TrailblazerDX (TDX)** (developer conference), **Connections** (marketing/commerce), **World Tour** events, **Agentforce World Tour**.
- Other resources: **developer.salesforce.com** (docs, blogs, Code Samples, Sample Gallery), **help.salesforce.com** (docs + Known Issues), **Salesforce Stack Exchange**, **SalesforceBen**, **Salesforce Admins podcast**, **admin.salesforce.com**, Release Readiness Live.

---

## 15. Certifications (status as of Oct 2026)

### 15.1 Timeline of renames
- **Jul 21, 2025**: ~35 certifications renamed (mostly adding the "Platform" / "Salesforce Certified" prefix).
- **Jul 24, 2026**: **16 renamed** (many to "Agentforce …" names). **24 announced for retirement**: last day to register Jul 24, 2026; last day to test **Aug 31, 2026**; **retired Feb 1, 2027**. Retiring certs stay valid until then, with no maintenance due.

### 15.2 Current core certifications (names as of Oct 2026)

| Category | Current name | Former name(s) |
|---|---|---|
| Foundations | **Platform Foundations** | Salesforce Certified Associate |
| Foundations | **AI Associate** (verify still offered/renamed) | — |
| Admin | **Platform Administrator** | Administrator (ADM 201). New exam version live Dec 15, 2025 with AI/Agentforce content. |
| Admin | **Platform Administrator II** | Advanced Administrator |
| Admin | **Platform App Builder** | — |
| Admin | **Business Analyst** | — |
| Admin | **Marketing Cloud Engagement Administrator** | Marketing Cloud Administrator |
| Admin | **Slack Administrator**, **Tableau Server Administrator** | Slack Certified Admin, Tableau Server Certified Associate |
| Admin | **CPQ Administrator** | CPQ Specialist (**retiring Feb 2027**) |
| AI | **Agentforce Specialist** | **AI Specialist** (renamed Dec 2024 / early 2025) |
| Developer | **Platform Developer** | Platform Developer I |
| Developer | **Platform Developer II** | — (has the Apex Specialist etc. superbadge-unit prerequisites, verify) |
| Developer | **JavaScript Developer** | JavaScript Developer I (exam + Lightning Web Components Specialist superbadge) |
| Developer | **Industries CPQ Developer** | (**retiring**) |
| Developer | **OmniStudio Developer**, **OmniStudio Consultant** | — |
| Developer | **B2C Commerce Developer** | B2C Commerce Developer → B2C Commerce Cloud Developer (2025) → back to B2C Commerce Developer (Jul 2026) |
| Developer | **Marketing Cloud Engagement Developer** | Marketing Cloud Developer |
| Developer | **MuleSoft Developer**, MuleSoft Developer II | MuleSoft Developer I |
| Developer | **Slack Developer**, **Heroku Architecture Designer** (verify) | — |
| Consultant | **Agentforce Sales Consultant** | Sales Cloud Consultant |
| Consultant | **Agentforce Service Consultant** | Service Cloud Consultant |
| Consultant | **Agentforce Field Service and Operations Consultant** | Field Service Consultant |
| Consultant | **Agentforce Nonprofit Consultant** | Nonprofit Cloud Consultant (NPC) |
| Consultant | **Revenue Management Consultant** | Revenue Cloud Consultant |
| Consultant | **Data Cloud Consultant** → possibly **Data 360 Consultant** (verify) | — |
| Consultant | **Experience Cloud Consultant** | Community Cloud Consultant |
| Consultant | **Marketing Cloud Engagement Consultant** | Marketing Cloud Consultant |
| Consultant | **Marketing Cloud Engagement Specialist** | Marketing Cloud **Email Specialist** |
| Consultant | **Marketing Cloud Engagement Foundations** | Marketing Associate |
| Consultant | **Marketing Cloud Account Engagement Specialist** (verify still offered) | Pardot Specialist |
| Consultant | **Tableau Consultant**, **Slack Consultant**, **Field Service**, **Education Cloud** (**retiring**), **NPSP Consultant** (**retiring**), **MCAE Consultant** (**retiring**), **MuleSoft Catalyst Consultant** (**retiring**) | — |
| Sales | **Agentforce Sales Foundations** | Sales Foundations ← Sales Representative |
| Designer | **Platform User Experience Designer**, **Platform Strategy Designer** | UX Designer, Strategy Designer |
| Data Analyst | **Tableau Data Analyst**, **Tableau Desktop Foundations**, **CRM Analytics & Einstein Discovery Consultant** | Tableau Desktop Specialist |

### 15.3 Architect path
- **Domain architect credentials** (each a separate exam):
  - Platform Data Architect
  - Platform Sharing and Visibility Architect
  - Platform Identity and Access Management Architect
  - Platform Integration Architect
  - Platform Development Lifecycle and Deployment Architect
  - **B2C Solution Architect**, **B2B Solution Architect** (**retiring**), **B2C Commerce Architect** (**retiring**), **Heroku Architect** (verify)
  - MuleSoft Platform Architect, MuleSoft Platform Integration Architect
  - Tableau Architect
- **Salesforce Certified Application Architect** (designation): Platform Data Architect + Sharing & Visibility + Platform App Builder + Platform Developer.
- **System Architect** (designation): Integration + IAM + Dev Lifecycle & Deployment + Platform Developer.
- **Certified Technical Architect (CTA)**: requires Application + System Architect, then a **review board** (a hypothetical scenario: ~3 hours to prepare + 45-min presentation + Q&A). This is the pinnacle credential, with around 400-ish CTAs worldwide (verify). The CTA board format had changes in 2024-25 (verify).
- **Agentforce Architect / AI Architect** credentials: announced 2025-26 (verify names/availability).

### 15.4 Retiring Feb 1, 2027 (full list of 24)
Advanced Field Service AP · Contact Center AP · CPQ & Billing Consultant AP · Energy & Utilities Cloud AP · Heroku Developer AP · Loyalty Management AP · MC Advanced Cross Channel AP · MC Intelligence AP · MC Personalization AP · Media Cloud AP · Net Zero Cloud AP · Order Management Administrator AP · Order Management Developer AP · Process Automation AP · **B2B Solution Architect** · **B2C Commerce Architect** · Consumer Goods Cloud: TPM AP · **CPQ Administrator** · **Education Cloud Consultant** · **Industries CPQ Developer** · **Marketing Cloud Account Engagement Consultant** · **MuleSoft Catalyst Consultant** · **MuleSoft Hyperautomation Developer** · **Nonprofit Success Pack Consultant**. (AP = Accredited Professional.)

### 15.5 Accredited Professional renames (Jul 24, 2026)
B2B Commerce for Admins/Developers AP → *Salesforce Accredited B2B Commerce Administrator/Developer Professional*; Communications Cloud AP → *Agentforce Communications Professional*; Consumer Goods Cloud AP → *Agentforce Consumer Goods Professional*; Financial Services Cloud AP → *Agentforce Financial Services Professional*; Health Cloud AP → *Agentforce Health Professional*; Manufacturing Cloud AP → *Agentforce Manufacturing Professional*; Public Sector Solutions AP → *Agentforce 360 for Public Sector Professional*.

---

## 16. Release notes, Trust site & operational resources

### 16.1 Releases
- **Three major releases per year**: **Spring** (Feb), **Summer** (Jun), **Winter** (Oct; named for the *next* calendar year, so **Winter '27** ships ~Oct 2026). Release names use 'YY. API versions advance one per release (Winter '26 = v65.0, Spring '26 = v66.0, Summer '26 = v67.0, Winter '27 = v68.0, verify).
- **Sandbox Preview**: sandboxes on preview instances get the release ~4-6 weeks early (choose by refreshing on the right dates). There are **Pre-release Developer Edition orgs** too.
- **Release notes**: help.salesforce.com → Release Notes (filterable by cloud, feature impact: "Enabled for users", "Enabled for admins/developers", "Requires admin setup", "Contact Salesforce"). Use the **Release Updates** page (Setup → Release Updates; formerly Critical Updates) for enforced changes with test runs and enforcement dates.
- **Release Readiness Live**, **Release Readiness Trailblazers** community group, release "Learn MOAR" Trailhead modules (maintenance).
- **Feature retirements**: Help → "Product and Feature Retirements" page. Examples: Workflow Rules/Process Builder (end of support **Dec 31, 2025**), Salesforce Functions (retired Jan 2025), legacy Chat (Feb 2026), Quip (2027), Social Studio (2024).

### 16.2 Trust site (trust.salesforce.com)
- Real-time **status** per instance (`NA###`, `EU##`, `CS##` sandboxes, `USA###`/Hyperforce), Marketing Cloud stacks (S1–S13, S50+), Commerce Cloud realms, Heroku (status.heroku.com), Slack (status.slack.com), Tableau Cloud (trust.tableau.com), MuleSoft (status.mulesoft.com).
- **Incidents**, **Maintenance** schedules (planned maintenance windows, major release dates per instance), **Compliance** (SOC 1/2/3, ISO 27001/27017/27018, PCI DSS, HIPAA, FedRAMP, HITRUST, C5, IRAP), Security advisories, Privacy, Subprocessors list, "**Trust & Compliance documentation**" per service.
- Find your instance: Setup → Company Information → Instance (Hyperforce shows "Hyperforce" + instance name), or the `.../services/data` endpoint.
- **Subscribe** to instance notifications (email/RSS) from the status page (requires login, via the Trust app/"My Trust").

### 16.3 Other operational resources
- **Known Issues** site (issues.salesforce.com; vote "This issue affects me").
- **Salesforce Help & Support**: support cases via Help portal. Support plans: Standard, **Premier → Signature** (Success Plans: Standard, Premier, Signature; verify 2025 rename to "Salesforce Success Plans: Standard/Premier/Signature").
- **Salesforce Optimizer** (Setup), **Health Check**, **Org Check** (Salesforce Labs app), **Salesforce Labs** (free apps by Salesforce employees on AppExchange, unsupported).

---

## 17. Key acquisitions timeline

| Year | Company | ~Price | Became |
|---|---|---|---|
| 2006 | Sendia | small | Mobile (early) |
| 2008 | Instranet | $31M | Service Cloud knowledge base |
| 2010 | **Heroku** | $212M | Heroku PaaS |
| 2010 | Jigsaw | $142M | Data.com (retired 2020) |
| 2011 | Radian6 | $326M | Social Studio/Social listening (retired) |
| 2011 | Assistly | $80M | Desk.com (retired 2020) |
| 2012 | Buddy Media | $689M | Social marketing (MC) |
| 2013 | **ExactTarget** (incl. **Pardot**) | $2.5B | Marketing Cloud Engagement + Account Engagement |
| 2014 | RelateIQ | $390M | SalesforceIQ (retired) / Inbox → Einstein Activity Capture |
| 2016 | **Demandware** | $2.8B | Commerce Cloud B2C |
| 2016 | **Quip** | $750M | Quip (EOL 2027) / Slack Canvases tech |
| 2016 | Krux | $700M | Audience Studio (DMP) |
| 2016 | SteelBrick | $360M | Salesforce CPQ (Revenue Cloud) |
| 2016 | MetaMind | ~$33M | Einstein AI (Richard Socher) |
| 2018 | **MuleSoft** | $6.5B | Integration platform |
| 2018 | Datorama | $800M | Marketing Cloud Intelligence |
| 2018 | CloudCraze | undisclosed | B2B Commerce (classic) |
| 2019 | MapAnything | ~$213M | Salesforce Maps |
| 2019 | **Tableau** | $15.7B | Tableau |
| 2019 | ClickSoftware | $1.35B | Field Service (Enhanced Scheduling & Optimization) |
| 2020 | **Vlocity** | $1.33B | Industries / OmniStudio |
| 2020 | Evergage | undisclosed | Interaction Studio → MC Personalization |
| 2021 | **Slack** | $27.7B | Slack |
| 2021 | Servicetrace | undisclosed | MuleSoft RPA |
| 2022 | Troops.ai, Phennecs (Slack-related) | undisclosed | Slack sales features |
| 2023 | Airkit.ai | undisclosed | Agentforce/Service AI agent builder |
| 2023 | Spiff | ~$419M | Salesforce Spiff (commissions) |
| 2024 | **Own Company** | $1.9B | Backup & Recover / data protection |
| 2024 | Tenyx (voice AI), Zoomin (docs), PredictSpring (POS) | undisclosed | Agentforce Voice, Data 360 unstructured, Commerce POS |
| 2025 | Convergence.ai, Moonhub, Bluebirds, Waii, Regrello | undisclosed | Agentforce/AI talent & tech (verify each) |
| 2025 | **Informatica** | ~$8B (closed **Nov 18, 2025**) | Data catalog, governance, MDM, integration across Data 360, MuleSoft, Tableau |
| 2025-26 | Qualified (agentic marketing), Apromore (process mining), others | undisclosed | (verify) |

---

## 18. Glossary (acronyms & common terms)

| Term | Meaning |
|---|---|
| **AE / AP** | Account Executive / Accredited Professional (partner credential) |
| **API name** | Developer name of a field/object (e.g. `Custom__c`) |
| **AMPscript** | Marketing Cloud Engagement scripting language |
| **ARC** | Actionable Relationship Center (Industries) |
| **ARDSR** | Account Relationship Data Sharing Rules (Experience Cloud) |
| **B2B / B2C / D2C** | Business-to-business / -consumer / direct-to-consumer |
| **BM** | Business Manager (B2C Commerce) |
| **BU** | Business Unit (MCE / MCAE) |
| **BYOK** | Bring Your Own Key (Shield encryption) |
| **CDC** | Change Data Capture (streaming record-change events) |
| **CDP** | Customer Data Platform (Data Cloud → Data 360) |
| **CMS** | Content Management System (Salesforce CMS) |
| **CPQ** | Configure, Price, Quote |
| **CRUD** | Create, Read, Update, Delete (object permissions) |
| **CTA** | Certified Technical Architect |
| **C4E** | Center for Enablement (MuleSoft) |
| **DE** | Data Extension (MCE) |
| **DLRS** | Declarative Lookup Rollup Summaries (open-source package) |
| **DML** | Data Manipulation Language (insert/update/delete/upsert/merge/undelete in Apex) |
| **DMO / DLO / DSO** | Data Model Object / Data Lake Object / Data Stream Object (Data 360) |
| **DPE** | Data Processing Engine |
| **EAC** | Einstein Activity Capture |
| **FLS** | Field-Level Security |
| **FSC / FSL** | Financial Services Cloud / Field Service Lightning (now Field Service) |
| **HVP / HVCP** | High-Volume (Customer) Portal user (Customer Community license) |
| **IdP / SP** | Identity Provider / Service Provider (SSO) |
| **IP** | Integration Procedure (OmniStudio). Also IP address / intellectual property. |
| **ISV** | Independent Software Vendor (builds AppExchange apps) |
| **ISML** | Internet Store Markup Language (B2C Commerce templates) |
| **LDS** | Lightning Data Service (client-side record cache for LWC/Aura) |
| **LDV** | Large Data Volumes |
| **LMA / FMA** | License Management App / Feature Management App |
| **LWC / LWR** | Lightning Web Components / Lightning Web Runtime |
| **MC / MCE / MCAE / MCI / MCP** | Marketing Cloud / Engagement / Account Engagement / Intelligence / Personalization. Note that **MCP** is also **Model Context Protocol** (AI tool protocol); context decides. |
| **MDT / CMDT** | Custom Metadata Type |
| **MFA** | Multi-Factor Authentication (required for UI logins since 2022) |
| **MIAW** | Messaging for In-App and Web (Enhanced Chat) |
| **MRT** | Managed Runtime (Composable Storefront) |
| **NPC / NPSP** | Nonprofit Cloud (new) / Nonprofit Success Pack (legacy package) |
| **OCAPI / SCAPI / SLAS** | Open Commerce API / Salesforce Commerce API / Shopper Login and API Access Service |
| **OOTB** | Out Of The Box (standard functionality, no customization) |
| **OWD** | Organization-Wide Defaults (baseline record access) |
| **PB** | Process Builder (retired) |
| **PE** | Platform Events. Also Professional Edition. |
| **PLC** | Partner Learning Camp |
| **PRM** | Partner Relationship Management |
| **PSL / PSG** | Permission Set License / Permission Set Group |
| **RBL** | Rollup by Lookup (FSC) |
| **RLM / RCA** | Revenue Lifecycle Management / Revenue Cloud Advanced |
| **SAQL** | Salesforce Analytics Query Language (CRM Analytics) |
| **SFCC / SFRA** | Salesforce Commerce Cloud (B2C) / Storefront Reference Architecture |
| **SFDC** | Salesforce.com (old abbreviation, still common) |
| **SFDX / sf CLI** | Salesforce DX / Salesforce CLI |
| **SI** | System Integrator (consulting partner) |
| **SOM** | Salesforce Order Management |
| **SOQL / SOSL** | Salesforce Object Query Language / Object Search Language |
| **SSJS** | Server-Side JavaScript (MCE) |
| **SSO** | Single Sign-On |
| **STO** | Send Time Optimization (Einstein, MCE) |
| **TDTM** | Table-Driven Trigger Management (NPSP/EDA) |
| **TDX** | TrailblazerDX developer conference |
| **TPM** | Trade Promotion Management |
| **TSP** | Transaction Security Policy (Shield) |
| **UX / UI** | User Experience / User Interface |
| **VF** | Visualforce |
| **2GP / 1GP** | Second-/First-Generation Packaging |
| **Org** | A Salesforce tenant instance (production, sandbox, scratch, DE) |
| **Ohana** | Salesforce culture term ("family") |
| **Trailblazer** | A Salesforce community member/learner |
| **Agentblazer** | Agentforce learner status on Trailhead |
| **Hyperforce** | Salesforce on public cloud infrastructure |
| **Headless 360** | 2026 initiative exposing Salesforce capabilities as APIs/MCP tools/CLI for agents |

---

## Gotchas / common confusions

1. **"Marketing Cloud" is three products.** MCE (ExactTarget stack, separate login, Data Extensions, AMPscript), MCAE (Pardot, B2B, lives in the core org), and Marketing Cloud Next / Growth / Advanced (native on core + Data 360). Always ask which one. MCE data does *not* live in Salesforce objects.
2. **Account Engagement Prospects ≠ Leads.** They sync via Connector v2 (by email/CRM ID). Sync behavior is per field. Deleting in one system doesn't always delete in the other (the recycle bin syncs; verify the behavior for your settings).
3. **Scoring vs Grading.** The score is *interest/behavior* (a number). The grade is *fit* (a letter, from profile criteria). People routinely swap them.
4. **Synchronized Data Extensions are read-only.** Write back to Salesforce via Journey Builder Sales & Service activities or AMPscript/API, not by editing the DE.
5. **Customer Community users have no role**, so sharing rules don't apply to them. Use sharing sets, share groups, or upgrade to Customer Community Plus. Customer Community Plus/Partner **do** get roles, which counts against the role-hierarchy limits (portal roles; keep role levels at 1–2 per account where possible).
6. **Guest users can never get Public Read OWD.** Use guest user sharing rules (read-only). Records created by guests are reassigned to the default owner, and guests can't edit them afterward. Most site data leaks come from `without sharing` Apex exposed to guests.
7. **LWR sites need a Publish** for layout/config changes to show, because pages are cached at publish. Aura shows some changes more directly. LWR also has no per-component audience targeting the way Aura does (verify current state).
8. **External OWD can't be more permissive than internal OWD.**
9. **Partner licenses**: Partner Community users can see Leads/Opportunities. Customer Community Plus cannot. Pick the license by object access, not by price.
10. **Login-based licenses** count unique daily logins. Heavy daily users are cheaper on member-based licenses.
11. **B2C Commerce (SFCC) is not on the core platform.** No Apex, no SOQL, separate Business Manager. B2B/D2C Commerce on Lightning *is* core. "Commerce Cloud" can mean either.
12. **SiteGenesis vs SFRA vs PWA Kit/Composable Storefront**: three generations of SFCC storefront. Don't mix advice between them.
13. **OmniStudio managed package vs Standard (on-core) runtime**: namespaced objects (`vlocity_ins__…`) vs native metadata. Tools, deploy methods (Vlocity Build/IDX vs SFDX), and some features differ. "DataRaptor" = "Data Mapper".
14. **NPSP vs Nonprofit Cloud**, and **EDA vs Education Cloud**: legacy managed packages vs new on-core data models. There's no in-place upgrade; it's a migration. Both NPSP Consultant and Education Cloud Consultant certs retire Feb 2027.
15. **Tableau vs CRM Analytics vs Tableau Next**: different products. CRM Analytics (formerly Tableau CRM/Einstein Analytics) has nothing to do with Tableau Desktop. Tableau Next is on the Salesforce platform. Pulse for Salesforce is no longer sold.
16. **Tableau Online = Tableau Cloud** (renamed 2022).
17. **MuleSoft Composer vs Anypoint**: Composer is no-code inside Salesforce for simple app-to-app flows, while Anypoint is full enterprise integration. Composer flows are not Mule apps.
18. **Heroku is in sustaining-engineering mode** (Feb 2026), so don't recommend it for new enterprise builds without caveats. Salesforce Functions is retired.
19. **Quip is end-of-life** (no renewals after Mar 1, 2027). Canvases are the successor, but spreadsheets don't migrate.
20. **Product names in 2025-26 are unstable.** "Agentforce Sales/Service/360 Platform" (Oct 2025) were mostly reverted (Sep 2026). Data 360 and Agentforce kept their names. Certifications kept the "Agentforce …" names from Jul 2026. Users and docs will mix all versions.
21. **"MCP" is ambiguous**: Marketing Cloud Personalization vs Model Context Protocol.
22. **Shield Platform Encryption ≠ Classic Encrypted fields.** Field Audit Trail ≠ standard field history (FAT: 60 fields, up to 10 years). Event Monitoring's free tier is limited.
23. **Weekly Data Export is not a backup.** Use Salesforce Backup / Own (Backup & Recover) or a third party.
24. **Unmanaged packages aren't upgradeable**, and their components become yours. Managed package code is hidden and has a namespace. Uninstalling a managed package deletes its data.
25. **Salesforce Scheduler vs Field Service**: both use ServiceAppointment/ServiceResource but are separate products and licenses. Scheduler is for in-branch/virtual appointments, while Field Service is for mobile workforce dispatch.
26. **Legacy Chat and Standard Messaging are retired/retiring (2026)**. Use Enhanced Chat (MIAW) / Enhanced channels.
27. **Winter release naming**: Winter '27 ships in fall 2026. Don't assume the year label matches the calendar year.
28. **Retiring certs remain valid until Feb 1, 2027**, but can no longer be taken (last exam Aug 31, 2026). Renamed certs needed no action; the holder's profile updated automatically.
29. **Starter replaced Essentials.** Foundations is not a paid edition; it's a no-cost cross-cloud add-on for Enterprise+ customers.
30. **Superbadges are not certifications.** Some are prerequisites (e.g. for JavaScript Developer and Platform Developer II). Trailhead ranks have no professional standing beyond the community.
