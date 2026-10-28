# Salesforce Lightning Experience UI: Navigation and Buttons

**What this file covers**
Editions, org types, release cycle, and Lightning vs Classic, followed by a button-by-button tour of the Lightning Experience UI: global header, App Launcher, nav bar, Home, list views, Kanban, Split View, record pages, activities, Chatter, utility bar, console apps, mobile, and keyboard shortcuts.
It also covers Personal Settings, the Recycle Bin, Notes, Files, Calendar, Groups, Topics, and short notes on the Reports and Dashboards tabs (another file covers them in detail). Naming is as of Winter '27 (October 2026). Items marked "(verify)" may have changed.

---

## 1. Editions, Org Types, Releases

### 1.1 Editions (production licensing tiers)

| Edition | Notes |
|---|---|
| Starter / Starter Suite | Small business, simplified setup and onboarding UI. Replaced Essentials for new buyers. |
| Pro Suite | Step up from Starter, with more customization (verify current packaging). |
| Professional | Limited API (add-on), limited automation. No custom profiles in older contracts (verify). |
| Enterprise | The most common edition. Full API, Flow, sandboxes, custom profiles, record types. |
| Unlimited | Enterprise plus more sandboxes, Premier Success, and higher limits. |
| Agentforce 1 / Einstein 1 editions | Bundles that include Agentforce, Data 360, and more. Names change often (verify). |
| Developer Edition (DE) | Free and single-org. Limited data storage (about 5 MB data, 20 MB files) and 2 full licenses (verify). Since March 2025, new DE sign-ups include Agentforce and Data Cloud (now **Data 360**). Inactive orgs can be deleted (Salesforce cites about 45 days of inactivity, verify). Sign up at developer.salesforce.com/signup. |
| Partner Developer Edition | For ISVs. More licenses and storage. Obtained through the Partner Community. |

- 2025-26 rebrand: **Data Cloud became "Data 360"** and the AI platform is marketed as **"Agentforce 360"** (Dreamforce, October 2025). Cloud names are also marketed as "Agentforce Sales", "Agentforce Service", and so on (verify which names appear in-app). UI labels in Setup may lag behind marketing names.

### 1.2 Org types

| Org type | Purpose | Key facts |
|---|---|---|
| Production | Live business org | Login at `login.salesforce.com` or the org's My Domain. |
| **Developer sandbox** | Dev and test | Copies metadata only. 200 MB data, 200 MB files. Refresh interval 1 day. |
| **Developer Pro sandbox** | Larger dev and test | Copies metadata only. 1 GB data. Refresh interval 1 day. |
| **Partial Copy sandbox** | QA and UAT with sample data | Copies metadata plus sampled data from a **sandbox template** (up to 10,000 records per object). 5 GB. Refresh interval 5 days. |
| **Full sandbox** | Staging, performance testing, training | Copies all metadata and all data (templates are optional). Same storage as production. Refresh interval 29 days. |
| **Scratch org** | Source-driven, disposable dev (Salesforce DX) | Created from a **Dev Hub** with `sf org create scratch` and a definition file. Default lifespan 7 days, max 30. No sandbox-style data copy. |
| **Trailhead Playground (TP)** | Hands-on Trailhead challenges | A Developer Edition-type org linked to your Trailhead account. Launch it from a Trailhead hands-on challenge with "Launch". Get the password from the **Playground Starter** app or through Setup > Users > Reset Password. Special TPs exist for some badges (for example, Agentforce-enabled playgrounds). |
| Trial org | 30-day evaluation | Can include sample data and the Guidance Center. |
| Sandbox login | All sandboxes | `test.salesforce.com`, or the My Domain URL with `--<sandboxname>.sandbox.my.salesforce.com`. Usernames get `.<sandboxname>` appended. |

- Sandboxes are created and refreshed in **Setup > Sandboxes** (production only).
- Sandbox user emails get `.invalid` appended after creation or refresh, so emails don't reach real users.

### 1.3 Release cycle

- **3 major releases per year**: **Spring** (about January to February), **Summer** (about May to June), **Winter** (about September to October). Winter is named for the *following* calendar year: Winter '27 rolled out around September to October 2026.
- Each release follows the same sequence: **pre-release DE signup**, then **sandbox preview** (sandboxes on preview instances upgrade about 4 to 6 weeks early), then **production waves** over 3 weekends.
- Spring '26 production weekends were January 10, February 14, and February 21, 2026. Summer '26 rolled out May 15 and June 5, 12, and 13, 2026.
- API version increments by 1 each release (for example, Spring '26 = v66.0, Summer '26 = v67.0, Winter '27 = v68.0) (verify).
- Release notes are at help.salesforce.com > Release Notes. Instance upgrade dates are on **trust.salesforce.com** (Status and Maintenance Calendar).
- **Release Updates** (Setup > Release Updates), formerly "Critical Updates", list enforced changes with due dates.

### 1.4 Lightning Experience vs Salesforce Classic

| Aspect | Lightning Experience (LEX) | Classic |
|---|---|---|
| Status | Current UI. All new features ship here. | Legacy. No new features. Still accessible if the user has permission. |
| URL pattern | `/lightning/r/Account/<Id>/view`, `/lightning/o/Account/list`, `/lightning/setup/...` | `/<Id>`, `/001/o`, `/setup/...` |
| Page building | Lightning App Builder (drag-and-drop components) | Page layouts only, plus Visualforce |
| Navigation | App Launcher, nav bar, utility bar, console | Tab bar, sidebar |
| Switching | Avatar > **Switch to Salesforce Classic** | Header link **Switch to Lightning Experience** |
| Permission | Needs the "Lightning Experience User" permission. Grant "Hide Option to Switch to Salesforce Classic" to remove the switcher. | Users without "Lightning Experience User" land here |

- Admins enable LEX from **Setup > Lightning Experience Transition Assistant**.
- Some legacy items (certain Classic-only features, older Setup pages) still open as Classic-styled iframes inside LEX.

---

## 2. Global Header (top bar, every page)

Left to right: **Org logo**, **Global Search bar**, then icons on the right (exact order varies with features enabled and release): **Agentforce**, **Favorites (star)**, **Global Actions (+)**, **Guidance Center**, **Help (?)**, **Setup (gear)**, **Notifications (bell)**, **Avatar**.

### 2.1 Global Search bar

- Click it or press **`/`** to focus. Typing shows **instant results** (recent items and matching records) in a dropdown.
- **Scope selector** (dropdown on the left of the search box, "Search: All" by default):
  - **All**: searches all searchable objects.
  - **Object-specific**: Accounts, Contacts, and so on (objects in the current app plus recently searched).
  - Some orgs default the scope to the current object when you're on that object's pages (verify).
- Press **Enter** to open the **full search results page**:
  - Left sidebar: **Top Results** plus per-object result lists.
  - Each object section has columns, sort, and **filters** (filterable fields set by the admin in Search Layouts).
  - **Show more results** expands to an object list.
- **Einstein Search / natural-language search**: queries like "my open opportunities closing this month" return list results. Being folded into Agentforce (verify).
- The search index can lag new records by a few minutes. Searches need at least 2 characters. SOSL-based. Supports wildcards `*` and `?`, plus quotes for exact phrases.
- **Search Layouts** (Object Manager > Search Layouts) control which columns appear in results.

### 2.2 Favorites (star icon)

| Control | What it does |
|---|---|
| **Star (left half)** | Toggles the current page (record, list view, dashboard, report, and so on) as a favorite. The star fills when the page is favorited. |
| **Dropdown caret (right half)** | Opens the Favorites list: click an item to navigate. |
| **Edit Favorites** (in dropdown) | Opens a modal to rename, reorder (drag), or remove favorites. |
- Favorites are personal, follow the user across apps, and also appear in the mobile app.

### 2.3 Global Actions ("+" icon)

- Opens a menu of **global quick actions**: New Event, New Task, New Contact, Log a Call, New Opportunity, New Case, New Lead, New Note, Email, and similar.
- Configured in **Setup > Publisher Layouts / Global Actions** (the global publisher layout, "Salesforce Mobile and Lightning Experience Actions" section).
- Actions open in a **docked composer window** at the bottom of the screen. You can **minimize, expand (pop-out), or close** it, and keep several open at once.
- Records created this way are **not related** to the current record unless you fill a lookup. Use object-specific actions on a record page to create related records.

### 2.4 Guidance Center (Trailhead "mountain/Astro" icon)

- Opens a **side panel** of in-app learning: Trailhead modules, videos, **Learning Paths** assigned by the company, and contextual help for the current page.
- Admins see setup guidance. In trial orgs this panel also hosts guided setup.
- Content depends on the page, the user type (admin or end user), and the company's assignments. Admins can turn off Salesforce-suggested content in Setup (Guidance Center / In-App Learning settings).

### 2.5 Help ("?" icon)

- **Help for this Page**: context-sensitive help.salesforce.com article.
- **Search Help**, **Trailhead**, **Release Notes** / What's New, **Keyboard Shortcuts**, **Contact Support** (Help & Training portal), **Give Feedback** (verify exact items).
- Admins can add custom help links: Setup > **Help Menu**, "Add a section to the Help menu".

### 2.6 Setup (gear icon)

| Menu item | What it does |
|---|---|
| **Setup** | Opens Setup Home in a new browser tab. There is no default keyboard shortcut. |
| **Service Setup** / **Sales Setup** / **Marketing Setup** / **Agentforce Setup** etc. | Product-specific guided setup homes (show when the licenses exist) (verify). |
| **Developer Console** | Opens the legacy browser IDE in a popup (Apex, SOQL, logs). |
| **Edit Page** | Opens the **Lightning App Builder** for the current page (record, home, or app page). Needs "Customize Application". |
| **Edit Object** | (On record or list pages) Jumps to Object Manager for that object. |
| **Edit Lightning App** / Edit Nav (verify) | Opens App Manager for the current app. |
| **Open Flow Builder** / **Open Agentforce Builder** | Present in some orgs (verify). |
| **Advanced Setup** | Present in Starter/Pro Suite orgs. Switches from simplified setup to full Setup. |

- Setup Home has a left **Quick Find box** for filtering the Setup tree, plus top tabs **Home** and **Object Manager**. The **Create** dropdown (top right) creates Custom Object, Custom Tab, App, User, Email Template, Process (Flow), and similar.
- Setup opens in a new tab by default.

### 2.7 Notifications (bell)

- A red badge shows the unread count. Click to open the **Notifications tray**.
- Covers @mentions, approval requests, task assignments, custom notifications (sent through Flow "Send Custom Notification" or Apex), report subscriptions, and Agentforce or Einstein alerts.
- **Mark all as read**. Click a notification to go to its record.
- Settings: Setup > **Notification Builder** (custom notification types and delivery settings: desktop, mobile, Slack). Users manage which notifications they get in Personal Settings > Notifications (verify path).

### 2.8 Avatar / profile menu (user photo, far right)

| Item | What it does |
|---|---|
| Name link | Opens your **User Profile** page (Chatter profile: About, followers, groups, files). |
| **Settings** | Opens **Personal Settings** (see section 15). |
| **Switch to Salesforce Classic** | Shows only when the user is allowed Classic. |
| **Log Out** | Ends the session. |
| **Add Username** | Lets the browser remember multiple logins (account switcher). |
| **Display Density** (in this menu) | **Comfy** or **Compact**. Comfy puts labels above fields. Compact puts labels beside fields and gives denser rows. The admin sets the org default. |
| **Login-As banner** | While "logged in as" another user, a banner shows **Log out as <User>**. |
| **Return to <Admin>** | (Sandbox and login-as flows) |
| My Profile photo | Hover over the photo on the profile page to **Update Photo**. |

### 2.9 Agentforce button (formerly Einstein Copilot)

- **Einstein Copilot was renamed "Agentforce" (Agentforce Assistant / Agentforce Employee Agent)** in late 2024. The header icon opens the **Agentforce side panel** (conversation pane docked on the right).
- The button appears when an employee agent is **activated** (Agentforce Builder / Setup > Agentforce Agents) and the user has the matching **permission set** (for example, "Agentforce Default Admin" or the agent's access permission set) (verify names).
- The header icon is controlled per user through permissions, **not per Lightning app**.
- The panel is context-aware. On a record it can summarize the record, draft emails, query data, or run custom **topics/actions** (Flows, Apex, prompt templates).
- Developers can open and close the panel or send utterances from LWC with the **Agentforce Conversation Client (ACC) API**.
- Older orgs may still show **Einstein** sparkle icons on fields and in the composer (Einstein Generative AI features such as Einstein Service Replies and Sales Emails). These are separate from the Agentforce panel.

---

## 3. App Launcher and Navigation Bar

### 3.1 App Launcher (waffle, 9-dot grid, top left)

- Click it to open a popover with a **search box**: "Search apps and items...". Typing finds **apps** and **items** (objects/tabs) by name.
- **View All**: opens the full App Launcher page with these sections:
  - **All Apps**: tiles you can **drag to reorder**. Hovering a tile shows its description. The order applies to the user.
  - **All Items**: every tab or object the user can access, including objects not in the current app's nav bar.
- **Visit AppExchange** link (if enabled).
- Apps are defined in Setup > **App Manager**. Visibility is set by profile or permission set assignment of the app.
- Users can set a **default app** only indirectly (the last-used app persists). Admins set app defaults per profile.

### 3.2 Navigation bar (below the header)

- **App name** on the left (click to go to the app's first item).
- **Tabs (items)**: each nav item opens that object's last-used list view (or Home, Recently Viewed, and so on).
- **Item dropdown caret (v)** next to each object tab shows:
  - **Recent records** (last few viewed).
  - **Recent list views**.
  - **Favorite** list views.
  - **"+ New <Object>"** shortcut.
  - (The Home tab has no dropdown. Reports and Dashboards dropdowns show recent reports or dashboards.)
- **More** dropdown: overflow items that don't fit on screen.
- **Pencil icon (Personalize Your Nav Bar)**, at the far right:
  - **Add More Items**: search all items, including objects, Lightning pages, Visualforce tabs, and web tabs.
  - **Drag to reorder** items. **X to remove** user-added items.
  - **Rename** items (temporary items only, verify). **Reset Navigation to Default**.
  - Admins can disable personalization per app ("Disable end user personalization of nav items in this app" in App Manager > App Options).
- **Temporary tabs**: opening a record from search or a link adds a *temporary* item to the nav bar, shown in italics. It disappears on reload unless saved through Personalize.
- **Navigation Style**: **Standard navigation** (nav bar with tabs) or **Console navigation** (workspace tabs, see section 12). Set in App Manager.

---

## 4. Home Page

- Configured with the **Lightning App Builder** (Home Page templates). Can be assigned per app or per profile.
- Common standard components:
  - **Assistant** (Einstein/Agentforce insights: overdue tasks, leads with no activity, deals with no recent activity, and similar).
  - **Performance chart** (Opportunities: closed, open greater than 70%, goal). Set the goal with the pencil.
  - **Today's Tasks**, **Today's Events**, **Recent Records**, **Top Deals**, **Key Deals**, **Recent Items**.
  - **Dashboard** component (one dashboard).
  - **Rich text**, **List View**, **Report Chart**, **Flow**, and **Visualforce/LWC** custom components.
- **Edit Page** in the gear menu opens App Builder. Activation can target **Org default**, **App default**, or **App + profile**.

---

## 5. List Views (Object tab pages)

URL: `/lightning/o/<Object>/list?filterName=<ListViewId or DeveloperName>`

### 5.1 Header area

| Control | What it does |
|---|---|
| **Object icon and name** (for example, "Accounts") | Label above the list view name. |
| **List View picker** (list view name with caret) | Dropdown with a search box: **Recently Viewed** (pinned at top), **Recent List Views**, **My List Views**, **All Other Lists**/**All List Views**, and **Favorites**. Click to switch. |
| **Pin icon** (next to the list name) | **Pin this list view** to make it your **default** for the object. Changes to **Unpin** when pinned. Without a pinned list, Recently Viewed is the default. |
| **Item count and status** | "50+ items • Sorted by Name • Filtered by All accounts • Updated a few seconds ago". |
| **New** | Opens the New record modal. With multiple record types, the **record type selector** appears first. |
| **Import** | Opens the **Data Import Wizard** (Accounts, Contacts, Leads, Solutions, Campaign Members, custom objects). Shows on some standard objects (Leads, Contacts, Accounts). |
| **Change Owner** | Mass-changes the owner of selected rows (checkboxes). Includes a "Send notification email" option. Needs "Transfer Record" or ownership (Leads, Cases, Accounts, Opportunities, custom objects, verify per object). |
| **Assign Label** | Applies **Record Labels** (user-defined personal tags, a newer feature) to selected records (verify availability). |
| **Printable View** | Opens a print-friendly view of the current list (up to the loaded rows). |
| **Add to Campaign** | Leads and Contacts only: adds selected rows as campaign members. |
| **Send List Email** | Contacts, Leads, and Person Accounts: mass email to selected rows. |
| **Merge** (Accounts, Contacts, Leads) | Some orgs show it on the list view or through the record's **Check for Duplicates/Merge**. |
| **New Contact/Discover Companies** etc. | Object-specific buttons from the list view **search layout** button list. |
| Overflow **caret (v)** | Holds buttons that don't fit. |

- List view buttons are controlled in **Object Manager > <Object> > Search Layouts for Salesforce Classic > List View** (where you add or remove standard and custom list buttons). This is still the place even in Lightning.

### 5.2 Toolbar (right side above the grid)

| Icon | What it does |
|---|---|
| **Search this list...** box | Filters the currently loaded list by text in **searchable** columns (not all field types: no formula fields, for example). Only searches visible-type fields within the list's filter. |
| **Gear: List View Controls** | Menu (see 5.3). |
| **Display As (Table icon with caret)** | **Table**, **Kanban**, **Split View**. Kanban only appears if the list has a groupable picklist and is not Recently Viewed. |
| **Refresh (circular arrow)** | Reloads the list data. |
| **Edit List (pencil)** / inline edit | Some versions show a pencil to toggle **inline edit mode**. You can also double-click or click the cell pencil (see 5.5). |
| **Charts (bar chart icon)** | Opens the **list view chart panel** on the right: **New Chart** (Vertical Bar, Horizontal Bar, Donut), aggregate **Count/Sum/Average/Min/Max** of a field, grouped by a field. A gear switches charts. Charts are based on the list's filters. Not available on Recently Viewed. |
| **Filter (funnel icon)** | Opens the **Filters panel**: **Filter by Owner** (All / My / My team's / Queue), **+ Add Filter** (field, operator, value), **Filter Logic** ("1 AND (2 OR 3)"), **Remove All**, **Save** / **Cancel**. On a list you don't own, changes prompt **Save As** (creates a new list). |

### 5.3 Gear "List View Controls" menu

| Item | What it does |
|---|---|
| **New** | Create a list view: name, API name, and visibility (**Only I can see**, **All users can see**, **Share with groups of users**: public groups or roles. Sharing beyond yourself needs the "Manage Public List Views" permission). Then opens filters. |
| **Clone** | Copies the current list (filters and columns) under a new name. |
| **Rename** | Changes the label or API name (only lists you own or can manage). |
| **Sharing Settings** | Changes who can see the list (same three options as New). |
| **Edit List Filters** | Opens the filter panel (same as the funnel). |
| **Select Fields to Display** | Dual-listbox for choosing and ordering columns. Saves to the list (on shared lists only if permitted). |
| **Delete** | Deletes the list view (yours, or public ones if you have Manage Public List Views). |
| **Reset Column Widths** | Restores default column widths after you've dragged them. |
| **(Kanban) Kanban Settings** | In Kanban display: choose **Group By** (picklist) and **Summarize By** (currency or number field). |
| **List View Settings for Recently Viewed** | Recently Viewed is not editable: only **Select Fields to Display** is available. Columns come from the **Recently Viewed** search layout (verify). |

### 5.4 Table behaviour

- **Click a column header** to sort ascending, click again for descending. You can't sort by some field types (long text, multi-select picklist).
- **Drag column edges** to resize. **Text wrap / Clip text** per column through the column header dropdown.
- **Lazy loading**: the list loads about 50 rows at a time as you scroll, up to 2,000 rows. The count shows "50+" and similar.
- **Row checkbox** selects for mass actions (up to 200 rows for mass actions).
- **Row-level action caret (v)** at the right end of each row: Edit, Delete, Change Owner, and other object-specific actions.
- Clicking a **name field** opens the record. Ctrl/Cmd-click opens it in a new browser tab.
- Lookup fields show a **hover card** with a compact layout preview.

### 5.5 Inline edit in list views

- Hover a cell and click the **pencil**, or double-click the cell. Edited cells turn yellow. Edit several rows, then **Save** or **Cancel** at the bottom.
- **Mass inline edit**: select several rows, edit one cell, and tick **"Update N selected items"** to apply the same value to all.
- Inline edit is **not** available when: the list has more than one record type and the filter doesn't narrow to one (for some fields), the field is read-only, a formula, or locked, the list is Recently Viewed, or the object doesn't support it (Tasks/Events do now, verify).

### 5.6 Recently Viewed list

- System list (the default when nothing is pinned). Can't be filtered, charted, or shown as Kanban. Columns: through Select Fields to Display or the search layout (verify).

---

## 6. Kanban View

- Display As > **Kanban**. Records show as **cards** in **columns** by a picklist (Opportunity Stage by default, Lead Status, Case Status, or any picklist).
- **Drag a card** between columns to update the picklist value. Required fields or **validation rules** can block the move and show an error. On Opportunities, moving to **Closed Lost** can prompt for Loss Reason (verify).
- Column headers show a **summary** (for example, sum of Amount, set with **Summarize By**).
- **Kanban Settings** (gear): Group By, Summarize By.
- Cards show the first fields of the **compact layout** (verify: Kanban uses the list's first few columns).
- On cards: Opportunity **alerts** (orange icon: no open activities, overdue tasks). Card **action caret**: Edit, Delete, New Task, New Event.
- Limits: up to 200 records per list load. Not available for Recently Viewed. Grouping needs a picklist the user can edit (verify).

---

## 7. Split View

- Display As > **Split View**, or the split-view icon in the console. The list shows on the left as a narrow column, and the selected record opens on the right.
- Arrow controls at the top of the list. You can **collapse** the list panel (chevron) and **switch lists** with the picker in the split pane.
- Keeps your place in the list while you work through records.
- In console apps, Split View is a toggle on the workspace-tab bar (see section 12).

---

## 8. Record Pages

URL: `/lightning/r/<Object>/<RecordId>/view`. Layout = Lightning record page (App Builder) + page layout (fields, related lists, buttons) + compact layout (highlights).

### 8.1 Highlights panel (top card)

- **Object icon, object label, record name**.
- **Key fields** (up to about 7) from the **Compact Layout** (Object Manager > Compact Layouts). The compact layout also drives mobile headers and hover cards.
- **Follow** button (+Follow / Following): follows the record in Chatter (needs Feed Tracking enabled on the object).
- **Action buttons** on the right (from the page layout's "Salesforce Mobile and Lightning Experience Actions" section, or **Dynamic Actions** configured in App Builder). The first 3 to 4 show as buttons and the rest go in the **overflow caret (v)**.

### 8.2 Standard record action buttons

| Button | What it does / notes |
|---|---|
| **Edit** | Opens the edit modal with the full page layout fields (or Dynamic Forms sections). |
| **Delete** | Confirmation dialog, then the record goes to the **Recycle Bin**. Cascades to master-detail children. Lookups clear. Account delete also deletes related Contacts, Opps, and Cases (with conditions). |
| **Clone** | Opens a New modal prefilled with field values (no related records). **Clone with Related** is available for Opportunities (products, contact roles, and others, verify), configured as a separate action. |
| **Change Owner** | Picks a new user or queue. Option to send a notification email. On Accounts, includes checkboxes to transfer related open opportunities, cases, and notes/attachments owned by the old owner (verify). |
| **Change Record Type** | Picks a new record type. Picklist values may need re-selecting. Needs the record type assigned to your profile or permission sets. |
| **Printable View** | Opens a print-friendly page of details and related lists. |
| **Sharing** | Opens the manual sharing dialog: add users, groups, or roles with **Read Only** or **Read/Write** access. Shows only if the OWD is Private or Public Read Only and you own the record or are above the owner in the role hierarchy. |
| **Sharing Hierarchy** | Shows **who has access and why** (role hierarchy, sharing rules, manual sharing, teams). Newer feature (verify availability on each object). |
| **Submit for Approval** | Starts the matching **Approval Process** (classic approval processes, or Flow Approval Orchestration in newer orgs). Comments optional. The record then locks. |
| **Recall Approval Request** | On pending approvals (in the Approval History related list). |
| **Approve / Reject / Reassign** | On the approval request record, or through Items to Approve. |
| **Follow / Unfollow** | Chatter feed tracking. |
| **Check for New Data / Find Duplicates / Merge** | Duplicate management on Accounts, Contacts, and Leads ("View Duplicates" banner, then **Compare and Merge**, up to 3 records). |
| **Convert** | Leads only: Lead Conversion modal (create or choose Account, Contact, and Opportunity). |
| **Close Case / Change Status** | Case-specific quick actions (verify per org). |
| **New Note / New Task / Log a Call / Send Email** | Quick actions, often surfaced in the activity composer instead. |
| **Show more (caret v)** | Overflow menu for the rest of the actions. |
| **Edit Labels / Assign Label** | Record Labels (verify). |
| **View Account Hierarchy** (Accounts) | Shows the parent and child account tree. |
| **Manage Contact Roles / Add Products / Edit Products / Choose Price Book** | Opportunity-specific, on related lists. |

- **Dynamic Actions**: in App Builder, select the Highlights panel and choose "Use Dynamic Actions" to add, remove, or reorder actions with **visibility filters** (field values, device, permissions).
- **Dynamic Forms**: field sections are placed directly on the Lightning page instead of the "Record Detail" component.

### 8.3 Path component

- A horizontal chevron bar across picklist stages (Opportunity Stage, Lead Status, Case Status, or any picklist with record-type support). Configure it in **Setup > Path Settings** (enable, then New Path).
- Controls:
  - **Click a stage**: it gets selected (highlighted). The button changes to **Mark as Current Stage**.
  - **Mark Status as Complete / Mark Stage as Complete**: moves the record to the next stage.
  - **Show More / Show Less (chevron)**: expands **Key Fields** (up to 5 per stage, inline-editable) and **Guidance for Success** (rich text) per stage.
  - **Closed stage**: on Opportunities, clicking **Select Closed Stage** opens a modal to choose Closed Won or Closed Lost. On Leads, the final stage is **Converted** and shows **Select Converted Status**, which launches conversion.
  - **Confetti**: optional celebration on chosen stages (Path settings: "Celebrate" with a frequency).
- Validation rules fire on stage change.

### 8.4 Activity timeline and composer

- The **Activity** tab or component: the **composer tabs** sit at the top, with the **timeline** below.
- **Composer tabs** (configurable quick actions):

| Tab | What it does |
|---|---|
| **Email** | Email composer: From, To, Cc/Bcc, Subject, Body, **templates (insert template icon)**, attachments, merge fields. With **Einstein Activity Capture** or **Email-to-Salesforce** settings, emails log automatically. Sends through Salesforce or Gmail/Outlook integration. |
| **New Task** | Subject, Due Date, Assigned To, Status, Priority, Name (WhoId: Contact/Lead), Related To (WhatId). Optional **Recurrence**. |
| **New Event** | Subject, Start/End, Location, All-Day, attendees (**Invitees**), Related To. |
| **Log a Call** | Creates a **completed Task** (Type = Call) with comments. Records a past call. |
| (Optional) **Send List Email**, **Upload File**, custom actions | |

- **Timeline** sections: **Upcoming & Overdue** (open tasks and future events) and **past activities grouped by month**.
  - **Filters (funnel)**: date range (All time, last 7 days, next 7 days, last 30 days), **Activities to show** (All, Logged calls, Email, Events, List email, Tasks), **Show** (All activities, My activities). Sort (newest or oldest first).
  - **Refresh**, **Expand All / Collapse All**, **View More**, **View All** (opens the Activity History list).
  - Task row: **checkbox to complete**, expand chevron for details, row action caret (Edit, Delete, Change Date, Change Priority, Change Status, Edit Comments).
- **Activity Timeline vs Related Lists**: admins can switch to **Activities as Related Lists** (Open Activities and Activity History) in the page.
- Orgs can enable the **new activity timeline** (Spring '24+, "Activity Timeline" component with improved filters, verify current naming).

### 8.5 Chatter feed and publisher

- The **Chatter** tab or Feed component. Publisher tabs: **Post**, **Poll**, **Question** (and sometimes **Link**, **File**, **Thanks**, verify).
- Post: rich text, **@mention** users or groups (sends a notification), **#topic** tags, attach file, choose visibility on community records.
- The feed shows posts and **tracked field changes** (feed tracking, up to 20 fields per object, Setup > Feed Tracking).
- Feed item actions: **Like**, **Comment**, **Share**, item caret (**Bookmark**, **Edit**, **Delete**, **Mute**, Copy link).
- Feed filter and sort: Most Recent Activity, Latest Posts, filter by All Updates, Emails, Call Logs, Text Posts, and similar.

### 8.6 Related lists and Related List Quick Links

- **Related** tab: cards for each related list (from the **page layout** or the **Dynamic Related List – Single** component).
  - Card header: **list name (count)**, **New** or other buttons (Add, Manage, Add Contact Roles), and a **caret** for more.
  - Up to about 10 columns visible in Lightning. The list shows a few rows, then **View All** opens the full related list page (sort, inline edit in some cases).
  - Row action caret: **Edit**, **Delete**, and **Remove Relationship** (for junction or related records, for example on AccountContactRelation, verify).
- **Related List Quick Links** component: compact hyperlinks at the top of the page ("Contacts (3) | Opportunities (2) | ..."). **Hover** to preview a list, click to open the full list.
- Related lists show only if the user has **Read** on the child object and the list is on the assigned layout.

### 8.7 Details tab and inline edit

- **Details** tab: field sections from the page layout or Dynamic Forms. Collapsible section headers.
- **Pencil icon** on hover over an editable field enables inline edit for the **entire section/page** (all editable fields become inputs). Ends with **Save** / **Cancel** at the bottom (sticky footer).
- A **lock icon** marks read-only fields (from field-level security, page layout read-only, formula fields, or an approval lock).
- **System Information** section: Created By, Last Modified By (with timestamps), Owner (with a **Change Owner** icon next to it).
- **Help text "i" icon**: hover to see the field's **Help Text**.
- Lookup fields: hover to see the **hover card** with the compact layout and actions.

### 8.8 Other record page elements

- **Tabs component** (Details, Related, Activity, Chatter, and custom tabs), **Accordion**, **Rich Text**, **Report Chart**, **Flow**, **Knowledge**, **Files**, and **Notes** components.
- **Record Page "Show Feed" / "Feed View"** (Cases in Console: Feed-based layout, verify).
- **Recently viewed / back**: the browser back button works. Use the **record breadcrumbs** in some layouts.
- **Highlight banners**: "This record is locked" (approval), "Potential duplicate records" (duplicate rules), and **Einstein/Agentforce insights** (verify).

---

## 9. Utility Bar

- A fixed footer bar at the **bottom of the screen** in an app. Configure it in App Manager > Edit > **Utility Items (Desktop Only)**.
- Common items: **Recent Items**, **Notes**, **History** (console), **Macros**, **Omni-Channel**, **Phone (Lightning Dialer / Open CTI softphone)**, **Chatter Feed**, **Rich Text**, **Flow**, **List View**, **Report Chart**, **Agentforce/Einstein**-related utilities, and custom LWCs with `lightning__UtilityBar`.
- Per-item properties: label, icon, panel width and height, **Start automatically** (load in background), **Pop out** allowed.
- Click an item to open its panel. **Minimize** with a dash and **Pop out** into a separate window (console).

---

## 10. Lightning Dialer

- A Salesforce-native **phone in the utility bar** (Phone item). Needs a Lightning Dialer license or add-on (Sales Engagement / Dialer, verify packaging).
- Features: click-to-dial (phone icons on phone fields), **Call log** auto-creation (Log a Call task), **Voicemail drop** (prerecorded), local presence, **Call recording** (with consent settings), **Einstein Conversation Insights** (call transcripts and analysis), and **Make calls from browser or forward to phone**.
- Alternatives: **Open CTI** softphones from telephony partners, and **Service Cloud Voice** (Amazon Connect based) for contact centres.

---

## 11. Calendar, Notes, Files, Chatter, Groups, Topics

### 11.1 Calendar (Calendar tab)

- **Views**: **Day**, **Week**, **Month**, **Table** (list of events). **Today** button, **< >** arrows, a date picker.
- **New Event** button. **Click and drag** on the grid to create an event. Drag and drop to move events.
- **My Calendars** sidebar: your events and **Other Calendars** (colleagues', with **Add Calendars** through the gear: users, **public calendars**, **resource calendars**, or **object-based calendars** built from date fields, for example "Opportunities by Close Date").
- **Calendar gear**: **New Calendar** (object-based), **Add Calendars**, show or hide, color.
- **Calendar Sync**: Einstein Activity Capture or Lightning Sync (retired; use EAC or Outlook/Gmail integration, verify).

### 11.2 Notes (Notes tab and Notes related list)

- **Enhanced Notes** (ContentNote) replaced the old Notes & Attachments notes. Rich text, autosave, **Relate to multiple records**, share, and **Add to Records**.
- The Notes tab lists your notes. **New Note** opens the docked composer.
- The **Notes** utility bar item is commonly added for quick note-taking.
- Older **Notes & Attachments** related list still exists for legacy (Note object, plain text).

### 11.3 Files (Files tab)

- Built on **Salesforce Files** (ContentDocument / ContentVersion). Left nav filters: **Owned by Me**, **Shared with Me**, **Recent**, **Following**, **Libraries** (Content libraries), and external sources (**Files Connect**: SharePoint, Google Drive, verify).
- **Upload Files** button, plus drag-and-drop onto the Files related list on records.
- File detail page: **Preview**, **Download**, **Share** (users, groups, **Public Link** if enabled), **Upload New Version**, **Edit File Details**, **Delete**, **View File Details**, Sharing settings ("Who can see", **Viewer / Collaborator** access).
- Attachments (legacy object) are read-only in LEX lists. New uploads are Files.

### 11.4 Chatter tab

- Left nav: **What I Follow**, **To Me**, **Bookmarked**, **Company**, **Muted**, **Streams** (custom combined feeds), **Recent Groups**, **Topics**.
- The publisher at top (Post, Poll, Question). Enable it in Setup > **Chatter Settings**.

### 11.5 Groups (Groups tab)

- Chatter groups: **Public**, **Private**, **Unlisted**. **Archived** after inactivity (configurable).
- Group page: feed, **Members**, **Files**, **Join / Request to Join / Leave**, **Manage members**, group **email settings** (every post, daily or weekly digest).
- Groups can be **broadcast-only** (only owners and managers post) and allow customers (external) members.

### 11.6 Topics

- **#hashtags** in posts create or add topics. Topics can also be added to records (enable Topics for Objects in Setup).
- Topic pages: feed, **Related Topics**, **Knowledgeable People**, **Follow**. The **Topics** tab lists trending topics (verify the tab exists in all orgs).

### 11.7 Recycle Bin

- In LEX it's a **tab / App Launcher item "Recycle Bin"**. Views: **My Recycle Bin** and **Org Recycle Bin** (needs "Modify All Data" / admin).
- Buttons: **Restore** (restores the record and its cascade-deleted children and relationships), **Empty Recycle Bin** / **Empty Org Recycle Bin**, **Delete** (permanently purge selected).
- Records stay **15 days**, then hard-delete automatically. Capacity is **25 × storage MB** records (oldest purged first).
- Not all items go to the Recycle Bin: metadata deletions (fields go to "Deleted Fields" for 15 days), some objects, and **hard deletes** through the Bulk API option.
- Deleted reports and dashboards also appear here (with the right permissions).

### 11.8 Reports and Dashboards tabs (brief, see the separate file)

- **Reports tab** left nav: **Recent**, **Created by Me**, **Private Reports**, **Public Reports**, **All Reports**, **Folders** (All Folders, Created by Me, Shared with Me), **Favorites**.
  - Buttons: **New Report**, **New Folder**. Row caret: Run, Edit, Subscribe, Move, Export, Delete, Favorite.
  - **Report Builder**: Outline (Groups, Columns), Filters, Preview. Buttons Save & Run, Save, Close, Run, Add Chart, Subscribe, Export.
- **Dashboards tab**: similar folders. **New Dashboard**, **New Folder**. Dashboard view: **Refresh**, **Edit**, **Subscribe**, **Follow**, **Clone**, **Delete**, **Export**, and the **View as** (dynamic dashboard, running user) dropdown.
- **Analytics tab** (Analytics Home, verify): unified home for reports, dashboards, and CRM Analytics/Tableau assets.

---

## 12. Console Apps (Service Console, Sales Console)

- Navigation style: **Console navigation**. There's no standard nav bar. Instead you get a **navigation menu dropdown** (a single object picker on the left) and **workspace tabs**.

| Element | What it does |
|---|---|
| **Navigation menu (dropdown caret next to app name)** | Picks which object list view to show (Cases, Accounts, and so on). Users can **Edit** the menu items (personalize). |
| **Workspace tabs** | Each record opens as a **primary tab** across the top. Close it with X. Right-click or the caret for: **Refresh Tab**, **Pin Tab**, **Close Tab**, **Close All**, **Rename**, **Open in new browser tab** (verify). |
| **Subtabs** | Related records opened from a primary tab open as **subtabs** under it. Example: Account (primary), then Contact and Case (subtabs). Configure in App Manager > **Navigation Rules** (open as Workspace tab or as subtab of a parent). |
| **Split View toggle** | A list pane on the left that stays visible while records open in tabs. |
| **Pinned tabs** | Stay at the left and survive closing all tabs. |
| **Tab limit** | Admins can set the max number of open workspace tabs (Console setting) (verify). |
| **Utility bar** | Especially **Omni-Channel** (accept work items, presence status), **Macros**, **History**, **Notes**, **Phone/Softphone**. |
| **Tab persistence** | Tabs reload after a browser refresh. |
| **Pinned regions** | Console page templates with a pinned header or left sidebar (record pages with **Pinned Left Sidebar**, verify). |

- Console keyboard shortcuts must be enabled: App Manager > the app's **Console Keyboard Shortcuts** (or Setup > Keyboard Shortcuts, verify). See section 14.

---

## 13. Salesforce Mobile App (iOS/Android)

- **Bottom nav bar**: **Home** (or the first item), **Search**, **Notifications**, **Menu (☰)**, and sometimes **Agentforce** (verify). With **the new mobile navigation** (2023+), the bottom bar has up to 4 items plus **Menu**, set by the admin's mobile navigation configuration.
- **Menu**: **App Switcher** (choose the app; the mobile nav reflects that app's nav items), Favorites, Recent, Settings, Help, Log Out.
- Users can **personalize** the bottom bar and menu items (verify).
- **Record page**: Highlights (compact layout), then tabs (Details, Related, Activity, Chatter) depending on the **mobile form factor** page assignment. Actions sit in the **action bar** (… "Show more") at the bottom or top right.
- **Global actions**: the "+" (create) entry at the bottom (verify).
- **Pull down** to refresh. Swipe actions on list items (verify).
- **Offline**: Briefcase Builder (selected records available offline).
- **Admin**: Setup > **Salesforce Mobile App > Mobile Navigation** (legacy) or App Manager's **mobile** settings. Lightning pages can be assigned per **form factor** (Desktop vs Phone).
- **Mobile Publisher** builds branded apps for Experience Cloud sites (separate product).

---

## 14. Keyboard Shortcuts (Lightning Experience)

Windows uses **Ctrl / Alt**. macOS uses **Cmd / Option** (some use Ctrl on Mac too). "then" means release the first key before pressing the second.

### 14.1 Standard navigation apps

| Shortcut | Action |
|---|---|
| **Ctrl + /** (Cmd + / on Mac) | **Show the keyboard shortcuts menu** (full list) |
| **/** | Focus Global Search |
| **G then H** | Go to Home |
| **G then L** | Go to the list view of the current object (verify) |
| **G then N** | Go to the Navigation bar (focus) |
| **G then R** | Go to Related list (verify) |
| **G then .** (period) | Go to Actions (highlights panel) (verify) |
| **G then D** | Go to Details (verify) |
| **G then F** | Go to Feed (verify) |
| **G then A** | Go to the Global Actions menu (verify) |
| **E** | Edit the current record |
| **N** | New record (on a list or record page) (verify) |
| **Ctrl + S** | Save an edited record |
| **Esc** | Cancel or close a dialog |
| **Ctrl + Shift + K** (verify) | Open the Agentforce panel (verify) |

### 14.2 Console navigation apps (after enabling Console Keyboard Shortcuts)

| Shortcut | Action |
|---|---|
| **Ctrl + Shift + K** | Show the console shortcut list (verify; Ctrl + / works in both) |
| **Ctrl + Shift + W** | Close the active workspace tab (verify) |
| **Shift + R** | Refresh the active tab |
| **Shift + T** | Go to the workspace tabs |
| **Shift + S** | Go to subtabs |
| **Shift + N** | Open the Navigation menu |
| **Shift + U** | Open the Utility bar |
| **Shift + F** | Go to the Feed or Chatter |
| **Shift + P** | Open or close the Split view pane (verify) |
| **Ctrl + C then S** | Copy the URL of the active subtab |
| **Ctrl + C then W** | Copy the URL of the active workspace tab and its subtabs |
| **Ctrl + Shift + ←/→** | Previous or next workspace tab (verify) |
| **Shift + C** | Close the current subtab (verify) |

- **Custom keyboard shortcuts**: Setup > **Keyboard Shortcuts** (verify path; App Manager > Utility/Console shortcuts) lets users or admins remap the console shortcuts.
- Shortcuts don't fire while focus is inside a text input.

---

## 15. Personal Settings (Avatar > Settings)

The left nav groups (exact names vary by edition and permissions; use the **Quick Find** at the top left of Personal Settings):

### 15.1 My Personal Information

| Page | Purpose |
|---|---|
| **Personal Information / Advanced User Details** | View and edit your User record: name, email, phone, alias, nickname, title, address. **Advanced User Details** shows the full user detail page (Classic-style), including Role, Profile, locale, Login History links, OAuth connected apps, and **Permission Set Assignments** (read-only). |
| **Change My Password** | Old password, new password, and security question (subject to password policies). |
| **Reset My Security Token** | Emails a new **security token**. API logins from untrusted IPs need password+token. Hidden if your profile has Login IP Ranges set (because the token isn't used then). Resetting it invalidates the old token. |
| **Language & Time Zone** | Time Zone, Locale (date, number, and name format), Language, Email Encoding. |
| **Approver Settings** | Delegated Approver, "Receive Approval Request Emails" preference. |
| **Grant Account Login Access** | Grant **Salesforce Support** or partner/admin access to log in as you for a set duration (if the admin needs to; otherwise admins with "Login As" through Setup > Users can do this directly when "Administrators Can Log in as Any User" is on). |
| **Connections / Connected Apps** (OAuth) | Lists the **Connected Apps OAuth Usage** for apps you authorized (Data Loader, Salesforce CLI, Outlook, and so on). **Revoke** removes a token. |
| **Authentication Settings for External Systems** | Per-user credentials for Named Credentials (named principal / per-user auth). |
| **External Credentials / External Auth Identities** | Newer per-user credential storage (verify). |
| **Login History** | Your recent logins (date, IP, browser, status). |

### 15.2 Display & Layout

- **Customize My Tabs** (Classic tab bar), **Customize My Pages** (Classic home), **Density settings** (Comfy or Compact), **Lightning Experience Theme** (if allowed).

### 15.3 Email

- **My Email Settings**: Email Name, Email Address, **Automatic Bcc**, **Email Signature**.
- **Email Templates** (personal templates).
- **Send Through External Email Services** / **Send Through Gmail/Office 365** (connect email account so sends go through your mailbox).
- **My Email to Salesforce**: the Email-to-Salesforce address for logging emails by Bcc.
- **Stay-in-Touch Settings** (Classic contact updates).
- **Outlook / Gmail Integration** settings and the **Einstein Activity Capture** personal settings (exclude addresses, sync direction).

### 15.4 Calendar & Reminders

- **Activity Reminders**: popup reminders for events (default lead time) and tasks (default reminder time), "Play a reminder sound".
- **Calendar Sharing** (share your calendar with users or groups) and Lightning calendar settings.

### 15.5 Other common items

- **Notifications**: which notifications you get and through which channel (desktop or mobile).
- **Chatter** > **Email Notifications** (per-event: following, mentions, comments, group digests), **My Feeds**, and **My Groups** settings.
- **Record Labels / Assistant settings** (verify).
- **Import** (personal data import) (verify).
- **Advanced User Details > Mobile Devices / Apps** (registered devices).
- **Authentication methods**: **Advanced User Details** shows **App Registration: Salesforce Authenticator / One-Time Password Authenticator / Security Key (U2F/WebAuthn)**, **Built-in authenticator** (Touch ID / Windows Hello). Connect or **Disconnect** them here. MFA is **required** for UI logins (MFA enforcement since 2022 and auto-enabled 2023).
- **Desktop Add-ons**, **Sync** (legacy Lightning Sync / Exchange Sync).
- **My Delegated Approvers**, **Manage Email Templates**.

---

## 16. Other UI Bits Worth Knowing

- **Toast messages**: green (success), red (error), yellow (warning), gray (info) popups at the top centre. Many include a link to the record ("Account 'Acme' was created").
- **Modals**: New and Edit forms. **Save & New** creates another record right away. Fields with a red asterisk are required (page layout or field-level).
- **Lookup dialog**: type to search. **"+ New <Object>"** at the bottom creates a related record inline. **Show All Results** opens advanced lookup search.
- **Record type selection modal**: shows when the user has more than one available record type. Admins can set the default per profile. Users can skip it with "Record Type Selection" preferences (verify).
- **Docked composer windows** (Global Actions, emails, notes): stack at the bottom right. Minimize, expand, or pop out.
- **Lightning Experience Themes / Branding**: Setup > **Themes and Branding** sets the brand colour, logo, and background image. Built-in themes include "Lightning Blue" and others.
- **SLDS 2 / Salesforce Cosmos theme**: a newer visual design (SLDS 2 and the "Salesforce Cosmos" theme) is rolling out from 2025 with rounder buttons, new spacing, and styling hooks (verify enablement status in your org).
- **Dark mode**: Lightning Experience **Dark Mode** was introduced as a **beta** (with SLDS 2, 2025) and is chosen per user under the avatar menu or Display settings (verify GA status).
- **Session timeout warning** modal: "Your session is about to expire" with **Continue Working** or Log Out.
- **In-App Guidance prompts**: popups or walkthroughs set up by admins (Setup > **In-App Guidance**), plus Salesforce's own feature tips. **Dismiss** or **Remind me later**.
- **Login-As**: from Setup > Users > **Login** link (needs "Administrators Can Log in as Any User" or a grant).
- **Help text, field history, and Field Audit Trail**: the **History** related list shows tracked field changes (Setup > Object > Fields & Relationships > **Set History Tracking**, up to 20 fields).
- **Einstein / Agentforce sparkle icons**: generative AI features embedded in the email composer (**Draft with Einstein / Agentforce**), record summaries, and Service Replies. Admins enable them in Setup > **Einstein Setup / Agentforce** (verify current labels).
- **Recent Items** (utility item or Home component) and the **App Launcher's "Recent"**: user-specific.

---

## 17. Quick URL and Navigation Reference

| Destination | URL path (relative to `https://<MyDomain>.lightning.force.com`) |
|---|---|
| Home | `/lightning/page/home` |
| Object list | `/lightning/o/Account/list` (`?filterName=Recent` / `AllAccounts` / ListView Id) |
| New record | `/lightning/o/Account/new` (`?recordTypeId=...&defaultFieldValues=Name=Acme`) |
| Record view | `/lightning/r/Account/001.../view` (or `/lightning/r/001.../view`) |
| Record edit | `/lightning/r/Account/001.../edit` |
| Related list | `/lightning/r/Account/001.../related/Contacts/view` |
| Setup page | `/lightning/setup/SetupOneHome/home`, `/lightning/setup/ObjectManager/home`, `/lightning/setup/ManageUsers/home` |
| App by DeveloperName | `/lightning/app/c__MyApp` or `/lightning/app/standard__Sales` |
| Custom tab / Lightning app page | `/lightning/n/My_Tab_Name` |
| Report | `/lightning/r/Report/00O.../view` |
| Dashboard | `/lightning/r/Dashboard/01Z.../view` |
| Classic switch | `/ltng/switcher?destination=classic` |

- Record ID prefixes help identify objects: **001** Account, **003** Contact, **005** User, **006** Opportunity, **00Q** Lead, **500** Case, **00T** Task, **00U** Event, **00O** Report, **01Z** Dashboard, **069** ContentDocument, **068** ContentVersion, **0PS** Permission Set, **00e** Profile, **00G** Group/Queue.
- IDs are 15-character (case-sensitive) or 18-character (case-insensitive, checksum suffix).

---

## 18. Who Controls What (UI to Setup mapping)

| UI element | Where it's configured |
|---|---|
| Nav bar items, utility bar, app branding, navigation style | Setup > **App Manager** > Edit (Lightning app) |
| Highlights panel fields | Object Manager > **Compact Layouts** |
| Record action buttons | Page layout "Mobile & Lightning Actions" section or App Builder **Dynamic Actions** |
| Detail fields and sections | **Page Layouts**, or App Builder **Dynamic Forms** |
| Related lists | Page Layout Related Lists section, or the Dynamic Related List component |
| List view buttons | Object Manager > **Search Layouts for Salesforce Classic > List View** |
| Search result columns | Object Manager > **Search Layouts** (Lightning) |
| Global "+" actions | Setup > **Publisher Layouts** (Global) |
| Path | Setup > **Path Settings** |
| Kanban/list chart | User level (list view) |
| Feed tracking | Setup > **Feed Tracking** |
| Home page | Lightning App Builder (Home page), with activation |
| Record page assignment | App Builder **Activation**: Org default, App default, App + record type + profile, by form factor |
| Notifications | Setup > **Notification Builder** |
| Help menu custom links | Setup > **Help Menu** |
| Themes | Setup > **Themes and Branding** |
| Agentforce panel | Setup > **Agentforce Agents** / Agentforce Builder, plus permission sets |
| Guidance Center content | Setup > Guidance Center / **Learning Paths** / **In-App Guidance** |
| Keyboard shortcuts (console) | App Manager > Console app > Keyboard Shortcuts (verify) |

---

## 19. Gotchas and Common Confusions

1. **"I can't see the button."** The cause is usually one of these:
   - It isn't on the page layout's Lightning Actions section.
   - Dynamic Actions are hiding it.
   - The user lacks object or field permission (for example, no Delete permission hides Delete).
   - It's in the **overflow (v)** menu.
   - Classic-only buttons (JavaScript buttons) don't work in LEX at all.
2. **List view buttons live in the "Search Layouts for Salesforce Classic" > List View layout**, even for Lightning. This is a common source of confusion.
3. **Pinned list ≠ favorite list.** Pinning sets your default list for that object. Favoriting adds it to the global Favorites star.
4. **Recently Viewed** can't be filtered, charted, Kanban'd, or inline-edited (in most cases). Switch to a real list view first.
5. **Inline edit not working in a list view**: the list may span multiple record types, include read-only fields, or exceed limits. Add a Record Type filter to fix it.
6. **Kanban drag fails**: a validation rule or required field blocks the stage change. Open the record to fix it.
7. **Global actions create unrelated records.** Use the record page's composer or quick action to auto-relate a record (WhoId/WhatId prefilled).
8. **Log a Call = a completed Task** (Status Completed, TaskSubtype Call). It isn't a separate object.
9. **Notes**: Enhanced Notes (ContentNote) vs the legacy Note object. Only Enhanced Notes appear in the Notes tab.
10. **Files vs Attachments**: LEX uses Files. Legacy Attachments are read-only legacy data.
11. **Recycle Bin**: 15 days. Deleting a parent restores its children together. Restoring a child alone when the parent is deleted fails. The Org Recycle Bin needs admin rights.
12. **Sharing button missing**: OWD is Public Read/Write (nothing to share), or you're not the owner or above them in the hierarchy.
13. **Sandbox URLs and usernames**: append `.sandboxname` to the username and log in at test.salesforce.com or the sandbox My Domain. Emails become `.invalid`. Fix them to receive mail.
14. **Release names**: "Winter '27" ships in the fall of **2026**. API versions add 1 per release.
15. **Einstein Copilot → Agentforce (Assistant / Employee Agent)**, **Data Cloud → Data 360**, and Einstein features are being folded under the Agentforce brand. Older docs and Trailhead modules use the old names. Setup labels may differ from marketing names (verify in the org).
16. **Developer Edition orgs** can be **deleted if inactive** (about 45 days without login, verify). Trailhead Playgrounds are separate DE-type orgs. Keep track of their usernames (Playground Starter app > Get Your Login Credentials).
17. **Scratch org ≠ sandbox**: scratch orgs are empty, source-driven, and expire (7 to 30 days), created from a Dev Hub. Sandboxes are copies of production.
18. **Setup opens in a new browser tab.** Users often think it "didn't open".
19. **Display density** (Comfy/Compact) is per user from the avatar menu. Admins set the default in Setup > **Density Settings**. Users who prefer their own can override it.
20. **Console apps**: records open as workspace tabs and subtabs, not full-page navigation. **Navigation Rules** decide whether a record opens as a primary tab or as a subtab of its parent.
21. **Keyboard shortcuts** differ between standard and console apps. Press **Ctrl + /** (Cmd + / on Mac) to see the list for your current context.
22. **Security token** reset is hidden when the profile has Login IP Ranges. Resetting it breaks integrations that use password+token.
23. **Hidden apps/tabs**: missing from the App Launcher means the app isn't assigned to the profile or permission set, or the tab is **Tab Hidden** (Tab Settings). **Default Off** means it's visible in All Items but not on the nav bar.
24. **Temporary nav items** (italics) disappear after refresh unless saved through the nav bar pencil.
25. **Path vs Kanban vs Stage picklist**: all three edit the same field. Path also shows guidance and key fields per stage.
26. **Agentforce icon visible in all apps**: per-app visibility isn't supported. Control it with permission sets.
27. **Classic switcher**: to stop users from switching to Classic, assign the **"Hide Option to Switch to Salesforce Classic"** permission through a permission set or profile. Don't remove "Lightning Experience User", because that pushes them *into* Classic.
