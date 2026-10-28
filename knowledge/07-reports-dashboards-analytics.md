# Salesforce Reports, Dashboards & Analytics (Lightning Experience)

**What this file covers:** Reports tab navigation, report types (standard and custom), the Lightning Report Builder (button by button), formats, formulas, buckets, run-page actions, subscriptions, snapshots, historical trending, folders and sharing.
Dashboards (builder, widgets, filters, running user, properties, view-page actions), embedded report charts, limits, and common report recipes.
CRM Analytics (Tableau CRM), Analytics Studio, Einstein Discovery, Tableau / Tableau Next status as of late 2026. Items whose current values may have changed are marked "(verify)".

---

## 1. Mental model

| Layer | What it is | Where configured |
|---|---|---|
| Report type | Template defining which objects/relationships and fields a report can use | Setup > Report Types (custom); standard types built in |
| Report | Saved query + layout (format, groupings, filters, columns, chart) on a report type | Reports tab > New Report |
| Report folder | Container that controls access to reports (Viewer/Editor/Manager) | Reports tab > New Folder |
| Dashboard | Visual page of widgets; each chart/table widget is backed by one source report | Dashboards tab > New Dashboard |
| Dashboard folder | Same sharing model as report folders | Dashboards tab > New Folder |
| Reporting snapshot | Scheduled job that copies summary/tabular report results into a custom object | Setup > Reporting Snapshots |
| CRM Analytics | Separate analytics engine (datasets, recipes, lenses, SAQL dashboards) | App Launcher > Analytics Studio; Setup > Analytics |
| Tableau / Tableau Next | Separate Tableau platform; Tableau Next is built on Data 360 (formerly Data Cloud) | Tableau Next workspaces; Tableau Cloud |

Key rule: a report only ever shows records the **running user** can see (sharing + object/field-level security), except dashboards running as a specified user, which show data as that user to all viewers.

---

## 2. Reports tab (Lightning list view)

### 2.1 Left navigation

| Item | Shows |
|---|---|
| **Recent** | Reports you have viewed recently (default landing view) |
| **Created by Me** | Reports you created, across folders |
| **Private Reports** | Reports saved in your personal "Private Reports" folder (only you, plus admins with "View All Data"/"Manage All Private Reports and Dashboards" can see) |
| **Public Reports** | Reports in the legacy "Public Reports" folder (visible to all internal users) |
| **All Reports** | Every report you have access to |
| **Folders** section: **Created by Me**, **Shared with Me**, **All Folders** | Folder navigation |
| **Favorites** section: **All Favorites** | Reports starred with the favorite (star) icon |

- Search box ("Search all reports...") searches the current list view only (searching in "All Reports" searches everything accessible).
- List columns: Report Name, Description, Folder, Created By, Created On, Subscribed (icon). Row-level action menu (down arrow): **Edit**, **Delete**, **Export**, **Subscribe**, **Move**, **Favorite** (varies with permissions) (verify exact menu).
- Folder row action menu: **Share**, **Rename**, **Delete**, (nested folder) **Move** (verify).

### 2.2 Top buttons

| Button | Action |
|---|---|
| **New Report** | Opens the report type picker (see 3.4), then the Report Builder |
| **New Folder** | Creates a report folder; prompt for Folder Label and Folder Unique Name (API name) |
| (some orgs) **New Report (Salesforce Classic)** | Opens the Classic builder; only if enabled / legacy (verify) |

Required permissions: "Create and Customize Reports" to build; "Report Builder" (or "Report Builder (Lightning Experience)") to use the drag-and-drop builder; "Run Reports" to view; "Export Reports" to export; "Manage Public Reports" / "Create Report Folders" / "Edit My Reports" for folder work.

---

## 3. Report types

### 3.1 Standard report types
- Created automatically by Salesforce for standard objects and for custom objects with **Allow Reports** checked.
- Grouped by category in the picker (Accounts & Contacts, Opportunities, Customer Support Reports, Activities, Campaigns, Leads, Price Books/Products/Assets, Administrative Reports, File and Content Reports, Other Reports, custom-object categories).
- For master-detail and lookup relationships Salesforce auto-generates join types such as "Accounts with Custom Object" (inner join).
- Cannot be edited (fields, layout, joins are fixed). Some standard types hide fields — e.g., "Opportunities" type includes Account fields but not all lookups.
- Field history report types appear automatically ("<Object> History") when Field History Tracking is enabled for that object.

### 3.2 Custom report types (CRT)
Setup > Feature Settings > Analytics > Reports & Dashboards > **Report Types** > **New Custom Report Type**.

**Step 1 – Define the report type**

| Field | Notes |
|---|---|
| Primary Object | Cannot be changed after save. The "A" in "A with B" |
| Report Type Label / Name | Label shown in picker; API name |
| Description | Shown in picker; required |
| Store in Category | Category in the report type picker |
| Deployment Status | **In Development** (only users with "Manage Custom Report Types" see it) or **Deployed** (visible to all report creators) |

**Step 2 – Define report records set (relationships)**
- Add up to **3 related objects** below the primary = 4 objects total, chained A > B > C > D (each child relates to the object above it).
- For each related object choose:
  - "Each 'A' record must have at least one related 'B' record" = **inner join** ("A with B").
  - "'A' records may or may not have related 'B' records" = **outer join** ("A with or without B").
- Once a level is "with or without", all lower levels must also be "with or without".
- Only relationships that exist (lookup/master-detail, child relationships) are offered.

**Step 3 – Edit Layout (Fields Available for Reports)**
- Drag fields into sections; rename display labels; set **Checked by Default** (fields pre-added to new reports).
- **Add fields related via lookup** ("Add fields related via lookup" link) to pull fields from objects reachable by lookup (up to 5 levels via lookup) — this is the key trick to include parent fields without adding a join.
- New custom fields are NOT automatically added to CRT layouts (unlike standard types) — must edit layout. (Admins: "Auto add new custom fields to custom report types" setting exists in Reports & Dashboards Settings in some releases (verify).)
- Max 1,000 fields per CRT (verify).

**Other CRT notes**
- Edit relationships later: you can add objects; removing/changing join type is restricted if reports use it.
- Deleting a CRT deletes all reports built on it (and dashboard components using them).
- CRTs and reports deploy via Metadata API (`ReportType`, `Report`, `Dashboard`, folders).
- Limit: 2,000 custom report types per org (Enterprise+; verify edition-specific limits).

### 3.3 Cross filters (use instead of outer-join gymnastics)
- Filter parent records by presence/absence of child records: "Accounts **with** Opportunities", "Accounts **without** Cases".
- Builder: Filters pane > **Filters** dropdown arrow > **Add Cross Filter** (or "Add Filter" > cross filter option) > choose primary object, **with/without**, secondary object > optionally **Add [Object] Filter** subfilters (e.g., Opportunities with Stage = Closed Won).
- Limits: **3 cross filters** per report, **5 subfilters** each (verify — some docs say up to 5 cross filters in Lightning (verify)).
- Cross filters cannot reference row-level formulas; they work on child objects related to the report type's objects.
- "Without" cross filter is the standard answer to "find X with no Y" (accounts with no activities, contacts with no cases).

### 3.4 Report type picker (Lightning)
- Opens on **New Report**. Left list: **Recently Used**, **All**, and categories. Search box at top ("Search Report Types...").
- Right pane shows **Details** (description, objects, fields list preview "Fields used in report type").
- Option "Show only report types I created" / filters may appear (verify). Click **Start Report**.
- Report types can be hidden from the picker via Setup > Report Types > "Select Report Types to Hide" (verify name).

---

## 4. Lightning Report Builder (button by button)

### 4.1 Header bar

| Control | Behavior |
|---|---|
| Report name/type label | Top left: "New <Report Type> Report" until saved; pencil rename via Save dialog |
| **Add Chart** | Adds a chart (requires at least one grouping); opens chart settings gear |
| **Undo / Redo** arrows | Undo builder changes (verify presence in all orgs) |
| **Update** / **Refresh** | Refreshes the preview with current changes (button name "Update" when auto-preview off, or "Refresh"); preview is limited sample rows |
| **Update Preview Automatically** toggle | When on, preview refreshes after each change; turn off for large reports |
| **Save & Run** | Saves then runs |
| **Save** (with dropdown: **Save As**) | Save dialog: Report Name, Report Unique Name, Report Description, Folder (Select Folder) |
| **Run** | Runs without saving (new reports) / runs the saved version + unsaved changes |
| **Close** | Exits builder; prompts if unsaved |

### 4.2 Left panes

**Outline pane**
- **Groups**: "Group Rows" (Add group... picklist) and, once a row grouping exists, **Group Columns** (makes it a Matrix). Drag fields from Columns into groups.
- **Columns**: list of detail columns; "Add column..." search; drag to reorder; X to remove; **Remove All Columns**.
- Column dropdown (on column header in preview): **Sort Ascending/Descending**, **Group Rows by This Field**, **Group Columns by This Field**, **Summarize** (Sum, Average, Max, Min, Median (Lightning), Unique count (verify)), **Bucket this Column**, **Remove Column**, **Show Unique Count** (verify), **Edit Bucket Column**.
- Columns dropdown arrow in Outline header: **Add Summary Formula**, **Add Row-Level Formula**, **Add Bucket Column**.
- Group dropdown: **Date granularity** ("Group Date By": Day, Calendar Week, Calendar Month, Calendar Quarter, Calendar Year, Fiscal Quarter, Fiscal Year, Calendar Month in Year, Calendar Day in Month), **Sort**.

**Filters pane**
- **Standard filters** (always at top, depend on report type):
  - **Show Me**: scope, e.g., "My opportunities", "My team's opportunities", "All opportunities"; for activities "My activities"; for accounts "My accounts", "All accounts". Teams depend on role hierarchy/territories ("Opportunity Teams", "My territories").
  - **Date field filter** (e.g., "Close Date" / "Created Date"): field picker + Range (All Time, Custom, Current FY, Previous FQ, Next 30 Days, etc.) + From/To.
  - Some types add others (e.g., Opportunity Status: Any / Open / Closed / Closed Won; Probability).
- **Field filters**: Filters dropdown > **Add Filter** or "Add filter..." search. Each filter: Field, Operator (equals, not equal to, less than, greater than, less or equal, greater or equal, contains, does not contain, starts with, includes/excludes for multi-select), Value(s). Supports relative date literals (TODAY, LAST 90 DAYS, THIS FISCAL QUARTER, N DAYS AGO:n etc.).
  - **Field-to-field filters** (compare two fields, e.g., Close Date > Created Date) — Lightning only; same data type; one side must be a field (verify limits: up to 20 per report (verify)).
  - Filter on **Locked**/unlockable state in dashboards: "Lock" icon to prevent viewers from changing filter on run page (verify "Locked" option).
- **Filter logic**: Filters dropdown > **Add Filter Logic** → e.g. `(1 AND 2) OR 3`. Numbers correspond to field filters (not standard filters, not cross filters).
- **Cross filter**: Filters dropdown > **Add Cross Filter**.
- **Row limit filter**: Filters dropdown > **Add Row Limit** (tabular reports): row limit N, sort field, ascending/descending ("Top 10 opportunities by Amount"). Required to use a tabular report as a dashboard source (with sort) for tables.
- **Scope of relative filters for "Owner"**: Owner filters can use role/territory "Hierarchy" scope via Show Me drill (verify).
- Max **20 field filters** per report (verify; some docs cite 50 in Lightning (verify)).

### 4.3 Preview toggles (bottom of preview)

| Toggle | Effect |
|---|---|
| **Row Counts** | Shows record counts per group and grand total |
| **Detail Rows** | Shows/hides individual records (off = summary-only view; required off for some matrix layouts) |
| **Subtotals** | Shows group subtotals |
| **Grand Total** | Shows the grand total row |
| **Stacked Summaries** | Matrix only: stacks multiple summary values vertically vs side-by-side |

**Conditional Formatting** (Lightning): from report run page or builder (format menu / "Conditional Formatting" button in builder header in summary/matrix) — up to 5 rules (verify), each on a summary field or summary formula, 3 color bands (low/mid/high) with breakpoints. Applies to grouped reports only (not tabular).

### 4.4 Chart (Add Chart / chart gear)
- Chart types: Vertical Bar, Horizontal Bar, Stacked Vertical Bar, Stacked Horizontal Bar, Line, Donut, Funnel, Scatter, (Pie in some contexts), Combo via "Plot additional values" (verify list).
- Chart Properties: Chart Title, X-Axis, Y-Axis value, Show Values, Legend, Plot additional values, Sort By, Palette (via theme), "Display As" in some.
- One chart per report; chart only works on grouped reports (summary, matrix, joined with groupings).
- Run page: **chart toggle** icon (show/hide), chart gear to change type.

---

## 5. Report formats

| Format | How you get it | Groupings | Use |
|---|---|---|---|
| **Tabular** | No groupings | None | Lists, exports, mailing lists; can be a dashboard table source only with Row Limit + sort |
| **Summary** | Add row grouping(s) | Up to **3 row groupings** | Totals per group; charts; most dashboards |
| **Matrix** | Add row + column grouping | Up to **2 row + 2 column** groupings | Cross-tab (e.g., Stage x Close Month); PREVGROUPVAL/PARENTGROUPVAL across axes |
| **Joined** | Report header "Report" dropdown > **Joined Report** (Lightning: format switcher next to report name, "Report ⌄ > Joined Report") (verify UI label) | Up to **5 blocks**; common groupings across blocks (up to 3); each block its own filters | Compare different report types side by side, e.g., Opportunities and Cases by Account |

Joined report specifics:
- Blocks added via **Add Block** (choose report type). Each block can have its own report type, columns, filters (standard filters per block), summaries.
- Grouping must be on fields common to all block report types (or shared via "common fields").
- Cross-block custom summary formulas allowed (reference block summaries as `B1#AMOUNT:SUM`).
- Joined reports cannot use row limit, bucket fields across blocks with different types (buckets per block allowed), and historically could not be used for reporting snapshots; dashboard support exists (chart needs grouping) (verify limits).
- Winter '27 Beta: **Common Rows Only** option shows only records present in all blocks (requires Support enablement).
- Joined reports: no conditional formatting on cross-block formulas (verify); export is formatted only (verify).

---

## 6. Formulas, buckets, summaries

### 6.1 Summary (custom summary) formulas
- Outline > Columns dropdown > **Add Summary Formula**. Fields: Column Name, Description, Formula Output Type (Number, Currency, Percent), Decimal Points, Display ("Grand Total Only", "All Summary Levels", or "Specific Groups" picking row/column group levels).
- Operate on summarized values: `AMOUNT:SUM`, `RowCount`, `AMOUNT:AVG`, `PROBABILITY:MAX`.
- Example win rate: `WON:SUM / CLOSED:SUM` or on a count basis: `RowCount / PARENTGROUPVAL(RowCount, GRAND_SUMMARY)`.
- Limit: **5 summary formulas per report** (classic); Lightning allows more — commonly cited 5 per report and 10 per joined report block set (verify).
- Require at least one grouping for group-level display (tabular: grand total only).

### 6.2 Summary functions

| Function | Signature | Purpose / example |
|---|---|---|
| `PARENTGROUPVAL` | `PARENTGROUPVAL(summary_field, grouping_level)` or matrix `PARENTGROUPVAL(field, parent_row_grouping, parent_column_grouping)` | Percent of parent: `AMOUNT:SUM / PARENTGROUPVAL(AMOUNT:SUM, GRAND_SUMMARY)` ; group levels named like `ACCOUNT.NAME`, `GRAND_SUMMARY` |
| `PREVGROUPVAL` | `PREVGROUPVAL(summary_field, grouping_level [, increment])` | Period over period: `AMOUNT:SUM - PREVGROUPVAL(AMOUNT:SUM, CLOSE_DATE)`; increment default 1, max 12 |
| `ROWCOUNT` | `RowCount` | Record count in the group |
| Logical / math | `IF`, `CASE`, `AND`, `OR`, `NOT`, `ISBLANK`, `NULLVALUE`, `BLANKVALUE`, `ROUND`, `ABS`, `MAX`, `MIN`, `MOD`, `CEILING`, `FLOOR`, `EXP`, `LN`, `SQRT` | Standard formula functions available |

- In Lightning the formula editor offers Functions, Fields ("Summary fields") and group-level insert buttons; use **Check Syntax** (validate) before Apply.
- Avoid division by zero: `IF(CLOSED:SUM = 0, 0, WON:SUM/CLOSED:SUM)`.

### 6.3 Row-level formulas
- Outline > Columns dropdown > **Add Row-Level Formula**. Column Name, Description, Formula Output Type (Number, Currency, Percent, Date, Date/Time, Text), Formula.
- Calculated per record; can be grouped/summarized/sorted/filtered (filter yes; cross filters/buckets on them no).
- Example "Days open": `TODAY() - DATEVALUE(CREATED_DATE)`; "Deal size": `IF(AMOUNT > 100000, "Large", "Standard")`.
- Limit: historically **1 row-level formula per report** (Lightning only, not joined reports); increase announced in later releases — (verify current limit; some 2025+ sources mention up to 3 or 5).
- Not available in joined reports (verify) and Classic.

### 6.4 Bucket fields
- Group values without creating a custom field: Column header dropdown > **Bucket this Column** or Columns dropdown > **Add Bucket Column**.
- Types: **Numeric** (ranges: "<=", ">", e.g. Amount 0–10k/10k–100k/100k+), **Picklist** (map values into buckets, e.g. Stage → Early/Late), **Text** (map text values).
- Options: Bucket Name, "Treat empty values as zeros" (numeric), "Show unbucketed values as Other".
- Limits: **5 bucket fields per report**, **20 buckets per bucket field** (verify), up to 20 values per bucket for text/picklist (verify).
- Cannot be used in cross filters or custom summary formulas; can be grouped/filtered/charted.

### 6.5 Summaries on columns
- Sum, Average, Max, Min, Median (Lightning only, number/currency/percent), **Unique Count** (Lightning "Show Unique Count" on a column, count distinct) (verify GA availability).
- Up to 100 summarized columns (verify).

---

## 7. Report run page (viewing a report)

### 7.1 Header buttons and menu

| Control | Action |
|---|---|
| **Favorite** (star) | Add to favorites |
| **Enable Field Editing** (pencil icon / inline editing) | Inline edit records in report (Lightning; requires "Enable inline editing in reports" in Reports & Dashboards Settings; tabular/summary/matrix; not on joined; limited field types — not formula, lookups (verify), record types) |
| **Refresh** | Re-run with latest data |
| **Edit** | Open Report Builder |
| **Subscribe** | Subscribe yourself (and others, with permission) to scheduled emailed results |
| ▼ overflow menu | **Save As**, **Export**, **Add to Dashboard** (verify location), **Delete**, **Clone** (legacy; "Save As" now the clone), **Printable View** (Classic-like), **Subscribe**, **Move** (verify), **Edit Report Properties** (verify) |
| **Filters** pane icon (funnel) | Opens run-page filter panel: change standard filters and field filter values temporarily (not saved unless edit) ; locked filters not editable |
| **Chart** toggle | Show/hide chart; chart gear for properties |
| **Search** (Find in report) | Search within report results (verify) |
| **Record preview (eye icon)** | Winter '27 Beta: preview record in side panel without leaving report |

### 7.2 Export (overflow > Export)
- **Formatted Report**: .xlsx with header, groupings, subtotals, formatting as on screen. Limit approx **100,000 rows and 100 columns** (verify); not available for joined/large rows beyond.
- **Details Only**: raw rows, no formatting/groupings. Formats: **Excel Format .xlsx**, **Comma Delimited .csv**, (.xls). Encoding selection (ISO-8859-1, UTF-8, etc.). Useful for re-import/large data.
- Requires "Export Reports" permission. Spring '26: admins can configure a **custom disclaimer** for exported reports in Reports & Dashboards Settings.
- Joined reports: export Formatted only? (Lightning supports formatted export of joined reports (verify)).
- Printable View: HTML/printable output (Classic carryover; may export .xls).

### 7.3 Inline editing
- Click pencil on a cell, edit, **Save**. Validation rules and triggers fire. Multiple-row editing then Save.
- Not supported: joined reports, historical trending, cross-object certain fields, fields from CRT lookups beyond 1 level (verify), encrypted fields, formula/rollups.

### 7.4 Add to Dashboard
- From run page: **Add to Dashboard** prompts to pick existing or new dashboard and component type (verify availability in all orgs; also via dashboard + Widget > Chart or Table).

---

## 8. Report subscriptions

- Run page > **Subscribe** (or list view row menu).
- Settings: **Frequency** (Daily, Weekly on chosen days, Monthly on chosen day), **Time** (hourly slots), **Attachment** (Lightning: attach file .xlsx or .csv — "Attach File" option with Formatted / Details only) (verify), **Recipients** (Edit Recipients: Me, users, groups, roles, roles & subordinates — requires "Subscribe to Reports: Add Recipients" permission), **Conditions** (Add Conditions).
- **Conditions**: up to **5 conditions** on aggregates (e.g., Record Count > 0, Sum of Amount < 100000); "Send email when: All conditions met / Any condition met". Without conditions, every run emails.
- Email: table (HTML) of report results (up to ~ row limit; "first 2,000 rows" in Lightning? (verify)) plus link.
- Limits: a user can subscribe to up to **7 reports** in Lightning (verify; historically 5); org total subscriptions per hour time slot limited (verify).
- Running user for the subscription: the subscriber? In Lightning the **report is run as the subscription owner** unless "Run Report As" is allowed... Recipients get the results per the person who set up the subscription (verify; Lightning has "Run report as" for some orgs).
- Permissions: "Subscribe to Reports", "Subscribe to Reports: Add Recipients", "Subscribe to Reports: Send to Groups and Roles", "Subscribe to Reports: Set Running User".
- Admin: Setup > Reports & Dashboards Settings > "Enable Lightning Report Subscriptions" / allow attachments; "Allow users to subscribe to reports" (verify).

---

## 9. Historical Trend Reporting
- Setup > Feature Settings > Analytics > Reports & Dashboards > **Historical Trending**. Enable per object: Opportunities, Cases, Forecasting Items, and up to 3 custom objects (verify).
- Select up to **8 fields** per object to track (plus default fields) (verify).
- Captures daily snapshots for the last **3 months** (data retained ~3 months + current month).
- Creates a report type "<Object> with Historical Trending". Reports show values at up to **5 snapshot dates** (historical columns) and "change" indicators (green/red).
- Filters on "Historical Date" via **Historical Date** standard filter; Matrix shows date columns.
- Limits: tracks up to **100 million rows** total? (verify); not for all objects; separate from Field History Tracking.

## 10. Reporting Snapshots (formerly Analytic Snapshots)
- Copy report results on a schedule into a custom object ("target object") for trending beyond 3 months.
- Setup: create target custom object with fields; Setup > **Reporting Snapshots** > **New Reporting Snapshot**: Name, Running User, Source Report (tabular or summary; not matrix/joined), Target Object > **Save & Edit Field Mappings** (map source columns; for summary reports choose **Grouping Level**) > **Schedule Reporting Snapshot** (frequency daily/weekly/monthly, start/end, preferred time, email on success/failure).
- Limits: source report max **2,000 rows** inserted per run; max 100 fields mapped (verify); the snapshot runs with the running user's access. Errors appear in "Run History".
- Report on target object to see trends (e.g., weekly pipeline snapshot).

## 11. Field History Reports
- Enable field history tracking on the object (Object Manager > Fields & Relationships > **Set History Tracking**; up to 20 fields per object; Field Audit Trail extends to 60).
- Report type: "<Object> History" (e.g., Opportunity Field History, Case History, Account History). Columns: Field/Event, Old Value, New Value, Edited By, Edit Date.
- Standard history: data retained 18 months via UI / 24 months via API (Field Audit Trail extends to 10 years).
- Opportunity also has **Opportunity History** report type (Stage/Amount/Close Date changes; "Opportunity Stage History").

---

## 12. Report folders and sharing

### 12.1 Enhanced folder sharing (default for orgs since Summer '13)
Access levels:

| Level | Can do |
|---|---|
| **Viewer** | View/run reports in folder; refresh; export (if permission); clone into another folder they can edit |
| **Editor** | Viewer + edit/save/move reports in and out of folder; delete reports |
| **Manager** | Editor + share folder, rename, delete folder |

- Share with: Users, Public Groups, Roles, Roles and Internal Subordinates, Roles/Internal & Portal Subordinates, Territories (and subordinates), Partner/Customer users (Experience Cloud).
- Folder > row action > **Share** > "Share With" type, search name, "Access" level > **Share** > **Done**. "Who Can Access" list.
- **Nested folders** (Lightning): subfolders up to 4 levels deep (verify); sharing set at top-level folder inherits down.
- Special folders: **Private Reports** (per user), **Public Reports** (all users, legacy), **Unfiled Public Reports** (legacy Classic name).
- Users need object-level access + "Run Reports" for data; folder access does not grant record access.
- Relevant permissions: "Manage Reports in Public Folders", "View Reports in Public Folders", "Create and Customize Reports", "Create Report Folders", "Edit My Reports", "Manage All Private Reports and Dashboards" (lets admins see/manage others' private reports).
- Spring '26 ("Smarter sharing"): enhancements to sharing reports/folders (verify details).

### 12.2 Legacy folder sharing
- Folder access "Read Only" or "Read/Write"; visible to "all users", "this folder is hidden from all users", or specific groups/roles. Converted by enabling "Enable access levels for sharing report and dashboard folders" (Setup > Folder Sharing).

---

## 13. Dashboards

### 13.1 Dashboards tab
Left nav mirrors Reports: **Recent**, **Created by Me**, **Private Dashboards**, **All Dashboards**, Folders (**Created by Me**, **Shared with Me**, **All Folders**), Favorites. Buttons: **New Dashboard**, **New Folder**.

### 13.2 Creating a dashboard
**New Dashboard** dialog: Name, Description, Folder (Select Folder), **Create** → opens Dashboard Builder.

### 13.3 Dashboard Builder (Lightning)

Header controls:

| Control | Purpose |
|---|---|
| **+ Widget** (labelled "+ Component" in older orgs; dropdown) | Add **Chart or Table**, **Image**, **Rich Text**, **Lightning Web Component** (Spring '26 Beta) (verify list) |
| **+ Filter** | Add dashboard filter |
| **Properties** (gear) | Dashboard properties |
| **Undo/Redo** | |
| **Save** / **Done** | Save, Done returns to view mode |
| Theme / palette via Properties | Light/Dark theme, palette |

Component types (via "Chart or Table" > choose source report > display):
| Display As | Notes |
|---|---|
| **Vertical/Horizontal Bar, Stacked (100% too)** | Group by up to 2 dimensions |
| **Line** | Trends over time; cumulative option |
| **Donut / Pie** | Show total in center option |
| **Funnel** | Pipeline by stage |
| **Scatter** | Two measures |
| **Gauge** | Single measure vs ranges (breakpoints, colors, segment ranges, show %/total) |
| **Metric** | Single number (grand total); colored ranges |
| **Table** | Up to 4 columns from summary report groupings/summaries |
| **Lightning Table** | Up to 10 columns from source report detail fields; sortable; can show rows from tabular report with row limit (verify); Spring '26 retains source report table settings |
| **Image** | URL/Files image |
| **Rich Text** | Text with formatting (Lightning "Rich Text" component replaces Classic Visualforce text) |
| Visualforce page component | Classic-era; Lightning supports via LWC/Visualforce (verify) |

Component settings (edit pencil on widget):
- **Report** (source; only reports in folders shared with viewers make sense), **Use chart settings from report** checkbox.
- **Display As** (above), **X-Axis**, **Y-Axis**, **Measure** (pick summary field or Record Count), **Display Units** (Shortened/Full/Shortened Thousands/Millions), **Sort By** (label or value, asc/desc), **Max Groups Displayed** (cap number of groups), **Show Values**, **Show Chart Gridlines**, **Show Total** (donut), **Show Percentages**, **Legend Position** (Right/Bottom/None), **Custom Chart Colors** / "Use report chart colors", **Show "Others" group**, **Cumulative** (line), **Decimal Places**.
- **Title**, **Subtitle**, **Footer**.
- **Drill-down**: clicking a chart element drills to the source report filtered by that value ("Drill to report" / "View Report"). Component setting "Link to report or URL" (verify).
- Component sizes are drag/resize on a 12-column grid (Lightning; up to 9 columns in older UI (verify)).

### 13.4 Dashboard filters
- **+ Filter**: Field (from fields in source reports; must be filterable by all components or component set to "not filtered"), Display Label, **Filter values**: up to **50 values** per filter; operators equals/not equal/less than/greater/range/contains/starts with.
- **Up to 5 filters per dashboard** across all editions since Spring '24 (previously 3). Confirmed current 2026.
- Component-level: "Ignore filter" for components whose report type lacks the field (verify UI).
- Filters apply to the dashboard view session; viewer can pick values; "Dashboard filters can't be used with dynamic dashboards"? — historically restrictions; now allowed (verify).

### 13.5 Running user (Properties > "View Dashboard As")

| Option | Behavior |
|---|---|
| **Me** | Dashboard always shows data as you (owner/creator); all viewers see your view of data — exposes data beyond viewer access |
| **Another person** (specified user) | Pick a user; requires "View All Data" to pick someone else (verify); all viewers see that user's data |
| **The dashboard viewer** (Dynamic dashboard) | Each viewer sees their own data; needs "Manage Dynamic Dashboards" to create |
| **Let authorized users change running user** checkbox | Users with "View My Team's Dashboards" or "View All Data" can switch the running user while viewing |

- Dynamic dashboard limits: Enterprise **5**, Unlimited/Performance **10**, Developer 3 (verify; purchasable more). Dynamic dashboards can't be scheduled refresh in Classic; can't be followed? / no subscription for dynamic? In Lightning subscription to dynamic dashboard allowed? (verify).
- Dashboard "Specified user" runs data under that user's sharing; best for org-wide KPI.

### 13.6 Dashboard Properties dialog
- Name, Description, Folder, **View Dashboard As** (above), **Dashboard Grid Size** (9-column vs 12-column) (verify), **Dashboard Theme** (Light / Dark), **Dashboard Palette** (Accessible, Aurora, Bluegrass, Dusk, Fire, Heat, Lake, Mineral, Nightfall, Ocean, Pond, Sunrise, Water, Watermelon, Unity, ...) (verify list).
- Summer '26: **brand color palettes** — set default theme for Reports and Dashboards via Setup > Themes and Branding.

### 13.7 Dashboard view page buttons

| Button | Action |
|---|---|
| **Refresh** | Re-runs all source reports; shows "As of <time> Viewing as <user>"; manual refresh limited (Lightning: once per minute) (verify) |
| **Subscribe** | Schedule email of dashboard image/snapshot (Frequency, Time, Recipients) |
| **Edit** | Open builder |
| ▼ overflow | **Clone**, **Save As** (verify), **Delete**, **Subscribe**, **Export/Download image** (verify), **Properties**, **Open in Lightning Experience / Classic** |
| **Follow** | Chatter follow for updates (posting snapshots of components) |
| **Full Screen** (expand icon) | Presentation/full-screen mode |
| Filter bar | Dashboard filters dropdowns |
| Component menu (on hover) | **Expand / View in full screen**, **Go to Report** (View Report), **Refresh** component? , **Post snapshot to feed** (Classic carry, verify) |

- Dashboard subscriptions (Lightning): send on schedule; recipients users/groups/roles with permission; recipients see the dashboard with the running user setting; cannot subscribe to dynamic dashboards if viewer (verify). Limits per user: up to 7 dashboards? (verify).
- Scheduled refresh: Lightning uses subscriptions to refresh+email; Classic "Schedule Refresh" (Enterprise+).

### 13.8 Dashboard limits (verify current)

| Limit | Value |
|---|---|
| Components (widgets) per dashboard | **25** (Lightning; some enhanced dashboards beyond (verify)) |
| Filters per dashboard | **5** (all editions since Spring '24), up to **50 values** each |
| Source report rows used in charts | Dashboards use grouped data; max groups displayed per chart; table up to 20 rows (verify) |
| Dynamic dashboards | EE 5, UE/PXE 10, DE 3 |
| Report per component | 1 |
| Lightning Table columns | 10 |
| Dashboard folders | Same as report folders |

### 13.9 Embedding report charts / dashboards
- **Report Chart** standard Lightning component on record pages (Lightning App Builder): settings Label, Report, **Filter by** (Filter the report chart by the current record ID — requires report to have relevant ID filter / record's ID in the report type), Show refresh button, Hide on error, Cache data. Up to 2,000 groups? Use for e.g. "Open cases for this account".
- **Dashboard** component on app/home pages (Lightning App Builder): pick dashboard, height, hide on error.
- Experience Cloud: Report/Dashboard components; Winter '27 Beta adds embedding in **LWR** Experience Cloud sites (previously Aura only).
- **Report Chart in Classic page layouts**: "Report Charts" section on detail page layout (legacy).
- Related list "Related Report" not standard; use Report Chart.

---

## 14. Reporting limits (summary)

| Limit | Value |
|---|---|
| Rows displayed in Lightning report run page | **2,000** rows (detail); use export for full; summary-only view shows groups beyond (verify) |
| Report Builder preview | Up to ~10–20 rows sample (verify) |
| Export Formatted | ~100,000 rows / 100 columns (verify) |
| Export Details only | No hard UI row cap beyond timeout (verify) |
| Row groupings | Summary 3; Matrix 2 rows + 2 columns |
| Joined report | 5 blocks; 3 common groupings; 100 columns |
| Field filters | 20 per report (verify) |
| Cross filters | 3 per report (5 subfilters each) (verify) |
| Bucket fields | 5 per report; 20 buckets each (verify) |
| Summary formulas | 5 per report (classic); joined: 10 across blocks (verify) |
| Row-level formulas | 1 per report historically (verify for increases) |
| Report charts | 1 per report |
| Report run timeout | ~10 minutes (verify) |
| Custom report types per org | 2,000 (verify edition) |
| Objects in CRT | 4 (primary + 3); lookup fields via up to 5 levels |
| Field history tracking | 20 fields per object (60 with Field Audit Trail) |
| Historical trending | Past 3 months; 5 snapshot dates per report; 8 fields (verify) |
| Reporting snapshot rows | 2,000 per run |
| Subscribed reports per user | 7 (Lightning) (verify) |
| Report API (Analytics REST API) | 2,000 rows synchronous; async 2,000 detail rows? ; 500 sync runs/hour per org (verify) |
| Dashboard components | 25 |

---

## 15. Common report recipes

### 15.1 Pipeline by Stage
- Report type: **Opportunities**.
- Show Me: All opportunities; Close Date: Current and Next FQ; Opportunity Status: Open.
- Group Rows: Stage; (optional Group Columns: Close Month → Matrix).
- Columns: Opportunity Name, Account Name, Owner, Amount, Close Date, Probability.
- Summaries: Amount Sum; Expected Revenue Sum.
- Chart: Funnel or horizontal bar by Stage; dashboard component funnel.

### 15.2 Closed Won by Owner this Quarter
- Opportunities; Close Date: Current FQ; Stage equals Closed Won (or Opportunity Status = Won). Group Rows: Opportunity Owner. Sum of Amount. Chart: bar sorted descending. Dashboard metric: Grand total vs quota (gauge with breakpoints).

### 15.3 Win rate by owner (summary formula)
- Opportunities; Status: Closed; Group by Owner; summary formula `WON:SUM / CLOSED:SUM` (Percent). Won and Closed are checkbox fields summarizable as 1/0 on Opportunities report type.

### 15.4 Cases by Status
- Report type: **Cases**. Show Me: All cases; Date Opened: Last 30 days. Group Rows: Status; optional Group Columns: Priority. Record Count. Donut chart. Add "Age" column for aging; bucket Age (0–2, 3–7, 8+ days).

### 15.5 Open cases with no activity (cross filter)
- Cases; filter Status != Closed; Cross filter: Cases **without** Activities (verify availability; or use Last Modified / custom Last Activity).

### 15.6 Accounts without Opportunities
- Report type Accounts; cross filter **Accounts without Opportunities** (subfilter Close Date = Last 365 days for "no recent opps").

### 15.7 Activity reports
- Report type: **Tasks and Events** (Activities category) — fields: Subject, Assigned, Due Date, Status, Related To, Type. Show Me: My activities / My team's activities / All activities (requires "View All Data" or role).
- "Activities with Accounts/Contacts/Opportunities" report types show activities related to those objects.
- Lightning Activity reporting limits: Activities Report on Event/Task combined; archived activities (older than 365 days closed tasks) hidden unless "Show archived" (verify).
- Calls logged per rep this week: Tasks and Events; Date: This Week; Type equals Call; Group by Assigned; Record Count.
- Enhanced Email / Einstein Activity Capture activities generally NOT reportable via standard activity reports (EAC data stored outside Salesforce; use Activity Metrics / Activity dashboards) (verify).

### 15.8 Field history report (stage changes)
- Opportunity History report type: Close Date this quarter; Group by "To Stage"; columns From Stage, Stage Duration (verify), Last Modified By.
- Or "Opportunity Field History": Field/Event equals Stage; Old Value, New Value, Edit Date.

### 15.9 Lead conversion
- Report type: Leads; Group by Lead Source; columns Converted (checkbox) → summary formula `CONVERTED:SUM / RowCount`.

### 15.10 Month-over-month growth (PREVGROUPVAL)
- Opportunities Closed Won; Group Rows: Close Date by Calendar Month; formula `(AMOUNT:SUM - PREVGROUPVAL(AMOUNT:SUM, CLOSE_DATE)) / PREVGROUPVAL(AMOUNT:SUM, CLOSE_DATE)`, Display at group level Close Date.

### 15.11 Percent of total (PARENTGROUPVAL)
- Group by Region (or Owner); formula `AMOUNT:SUM / PARENTGROUPVAL(AMOUNT:SUM, GRAND_SUMMARY)` Percent.

### 15.12 Users who haven't logged in
- Report type: Users (Administrative Reports); filter Last Login < LAST 30 DAYS or blank; Active = True.

### 15.13 Login history
- Setup > Login History is separate; report type "Users" includes Last Login only; full login history export via Setup.

---

## 16. Reports & Dashboards Settings (Setup)
Setup > Feature Settings > Analytics > Reports & Dashboards > **Reports and Dashboards Settings**. Notable options:
- Enable floating report headers.
- Enable Dashboard Component Snapshots / "Allow users to post dashboard component snapshots".
- Enable Lightning Report Builder? (LEX default).
- Enable inline editing in reports (Lightning).
- Enable Unique Count / Median (verify).
- Enable Reports Folder Sharing ("Enable access levels for sharing report and dashboard folders").
- Enable Lightning Report and Dashboard subscriptions; "Enable report attachments".
- Exclude Disclaimer from Exported Reports / custom export disclaimer (Spring '26).
- Show Report Type Hidden/Unused report types.
- Use Fiscal Year for date filters (Fiscal Year settings in Company Settings).
- Enable Dashboard "Lightning Table" / "Enhanced charts" (verify).

---

## 17. Analytics APIs & metadata
- **Reports and Dashboards REST API** (`/services/data/vXX.X/analytics/reports/{id}`; `?includeDetails=true`; describe `/describe`; run async `/instances`). Sync run returns up to 2,000 detail rows.
- **Dashboards API** `/analytics/dashboards/{id}` (refresh, status).
- Metadata API types: `Report`, `ReportType`, `Dashboard`, `ReportFolder` (as `Folder`), `DashboardFolder`, `AnalyticSnapshot`.
- Apex: `Reports.ReportManager.runReport(reportId, includeDetails)`.
- SOQL alternative for exporting more rows; Data Loader.

---

## 18. Einstein & AI features in standard reporting (verify currency)
- **Einstein for Reports / Agentforce in reports**: natural-language report creation ("Ask for a report") and summaries in some releases; Agentforce "Analytics" actions via Tableau Next / Tableau Agent (verify GA status and naming).
- **Einstein Activity Capture metrics**, **Sales Cloud Einstein** forecasting insights, and **Pipeline Inspection** are separate analytics surfaces (not reports).
- **Einstein Analytics / Tableau CRM** naming → now **CRM Analytics**.
- Tableau-powered **Lightning dashboards**? — no; standard dashboards remain native. "Tableau View" Lightning component embeds Tableau Cloud/Server views in Lightning pages.

---

## 19. CRM Analytics (formerly Einstein Analytics / Tableau CRM)

### 19.1 Licensing & access
- Licenses: CRM Analytics Growth, CRM Analytics Plus; included in some Revenue Intelligence, Service Analytics, B2B Marketing Analytics, etc. Permission set licenses + permission sets ("CRM Analytics Plus Admin/User").
- Enable: Setup > Analytics > **Getting Started** > Enable CRM Analytics.
- Open: App Launcher > **Analytics Studio** (also "Analytics" tab).

### 19.2 Analytics Studio navigation
- Left: **Home**, **Browse** (All Items, Apps, Dashboards, Lenses, Datasets, Recipes, Stories/Discovery, Watchlists), **Data Manager** link, **Collections**? (verify), **Explorer**. **Create** button: App, Dashboard, Lens, Dataset (CSV upload, Data Manager), Recipe, Story (Einstein Discovery), Watchlist, Template App.
- **Data Manager**: tabs **Monitor** (jobs), **Dataflows & Recipes**, **Data/Connect** (Connections, connected objects/sync), **Settings**.

### 19.3 Core objects

| Object | What |
|---|---|
| **App** | Folder-like container; sharing Viewer/Editor/Manager (same model as report folders) |
| **Dataset** | Denormalized, compressed, indexed data store (immutable versions); built by recipes/dataflows/CSV upload |
| **Connected object (sync)** | Local cache of Salesforce object or external source (Snowflake, BigQuery, Redshift, Azure, S3, etc.) via **Data Sync** (formerly Replication); incremental sync for Salesforce objects |
| **Recipe (Data Prep)** | Visual ETL: inputs, Join (lookup/left/right/inner/outer), Append, Aggregate, Transform (formulas, bucket, split, predict missing, sentiment, clustering, time series), Filter, Update, Output (dataset or write-back to Salesforce/external) |
| **Dataflow** | Legacy JSON-based ETL (sfdcDigest, digest, augment, append, computeExpression, computeRelative, flatten, sfdcRegister); still supported, recipes recommended; conversion tool "Convert to recipe" (verify) |
| **Lens** | Ad hoc exploration of a dataset (chart/table/compare table, SAQL mode); can be saved and clipped to dashboards |
| **Dashboard** | Designer canvas with widgets (charts, tables, number, list/date/range selectors, link, text, image, container, navigation), layouts per device, faceting, bindings, steps (queries) |
| **SAQL** | Salesforce Analytics Query Language: `q = load "ds"; q = filter q by 'Stage' == "Closed Won"; q = group q by 'Owner'; q = foreach q generate 'Owner', sum('Amount') as 'sum_Amount'; q = order q by 'sum_Amount' desc; q = limit q 10;` |
| **SOQL / Direct Data** | Dashboards can query Salesforce directly (SOQL steps) or live Snowflake (Direct Data) |
| **Template apps** | Prebuilt apps (Sales Analytics, Service Analytics, Revenue Intelligence) |
| **Security** | Sharing inheritance (Opportunity, Account, Case, Contact, Lead, custom) and **security predicates** on datasets; app sharing |
| **Watchlist / Notifications** | Alerts on query thresholds |
| **Embedded** | CRM Analytics Dashboard component on Lightning pages (filter by record) |

- Scheduling: data sync runs, then recipes/dataflows on schedule or event-based (after sync).
- Limits (verify): max 1 billion rows per org (Plus), dataset row limit, 60 dataflow runs / 24h (Plus 100?), concurrent queries.
- Bindings: selection/results bindings to make dashboards interactive.

### 19.4 Einstein Discovery
- Creates **Stories** (models) from datasets: outcome to maximize/minimize, predictions, explanations, improvements. Deploy as **Prediction Definition** to Salesforce objects (Einstein Prediction field, Lightning component "Einstein Predictions", Flow/Apex `predict` actions, scoring via Prediction job).
- Model Manager monitors accuracy and drift. Now part of CRM Analytics Plus (verify; also Model Builder in Data 360 is positioned for new ML).

### 19.5 CRM Analytics status (2026)
- Live and supported; Salesforce positions **Tableau Next** as next-generation agentic analytics; CRM Analytics remains the native option for dashboards embedded in Salesforce records. No forced migration announced as of late 2026 (verify).

---

## 20. Tableau & Tableau Next
- **Tableau** (Desktop, Cloud, Server, Prep) — separate platform acquired 2019; connects to Salesforce via Salesforce connector, CRM Analytics, Data 360 connector. Lightning **Tableau View** component embeds views.
- **Tableau Next** (GA 2025): API-first, agentic analytics on **Hyperforce** using **Data 360** (rebranded from Data Cloud, Oct 2025) as data layer; all data must be Data 360 objects/data model objects. Components: **Workspaces**, **Semantic models** (Tableau Semantics), **Visualizations**, **Dashboards**, **Metrics**, **Concierge / Tableau Agent / Agentforce analytics skills** (natural-language Q&A), Inspector (metric monitoring). Semantic models via natural language "coming" in 2026 (verify).
- Licensing distinct (Tableau Next/Tableau+ editions) (verify).
- Status: Tableau, CRM Analytics, and Tableau Next all live with active roadmaps; Tableau Next does not replace existing products as of 2026.

---

## 21. Recent release highlights (reports & dashboards)

| Release | Item | Status |
|---|---|---|
| Spring '24 | Up to 5 dashboard filters in all editions (was 3 for non-UE) | GA |
| Spring '26 | Dashboard tables retain source report table settings | GA (verify) |
| Spring '26 | Custom disclaimer on exported reports | GA (verify) |
| Spring '26 | Embedded Lightning Web Components in dashboards | Beta |
| Spring '26 | Smarter report/folder sharing improvements | (verify) |
| Summer '26 | Brand color palettes / default theme for Reports & Dashboards (Setup > Themes and Branding) | (verify) |
| Winter '27 | Preview records from Lightning reports (eye icon side panel) | Beta |
| Winter '27 | Joined reports "Common Rows Only" | Beta (Support enablement) |
| Winter '27 | Embed Lightning Reports & Dashboards in LWR Experience Cloud sites | Beta |

---

## Gotchas / common confusions

1. **Report type decides everything.** If a field or object is missing, it's the report type (or FLS), not the report. Custom report types do not auto-add new custom fields — edit the CRT layout.
2. **"With" vs "with or without".** Inner join hides parents lacking children (e.g., Accounts with Contacts excludes accounts without contacts). For "records with no children" use a **without cross filter**, not a CRT.
3. **Standard filter "Show Me" and date range silently limit results.** Default "My ..." and a narrow date range are the #1 cause of "my report is missing records". Set All + All Time when debugging.
4. **2,000-row display limit** in Lightning run page; export Details Only for full data. Dashboards use summary data so not affected the same way.
5. **Filter logic numbers** refer only to field filters, not standard filters or cross filters.
6. **Dashboard running user** "Me"/specified user exposes that user's data to all viewers — a common security leak. Dynamic dashboards (viewer) are limited in number.
7. **Folder access ≠ record access.** Sharing a folder gives access to the report definition; data is still governed by sharing/FLS (except dashboards with a fixed running user).
8. **Private Reports** can't be shared; move to a shared folder. Admins need "Manage All Private Reports and Dashboards" to see others' private reports.
9. **Deleting a custom report type deletes all its reports.** Deleting a report used by a dashboard breaks the component.
10. **Matrix vs Summary groupings**: summary max 3 row groupings; matrix 2x2. Charts need a grouping.
11. **Summary formula vs row-level formula**: summary works on aggregates (`AMOUNT:SUM`), row-level on each record. Row-level formulas can't be used in cross filters/buckets and historically only one per report.
12. **Bucket fields** can't be used in summary formulas or cross filters; they're report-specific (not reusable).
13. **Historical trending (3 months, specific objects) vs reporting snapshots (unlimited history, custom object) vs field history (per-field changes)** — different features.
14. **Reporting snapshots** accept tabular/summary only, max 2,000 rows per run, and run as the specified running user.
15. **Subscriptions** email when conditions met (or always without conditions); recipients see data per running user of subscription — verify running-user semantics before adding recipients.
16. **Export "Formatted" vs "Details Only"**: formatted preserves groupings (xlsx, row cap); details-only is raw data for import/analysis.
17. **Dashboard filters** (max 5, 50 values each) only work when the filter field exists in each component's source report type; otherwise component shows error or must ignore.
18. **Joined reports** have more restrictions (no row limit, limited export, limited inline edit, limited formula types). Common Rows Only is Beta in Winter '27.
19. **Lightning vs Classic**: Some features (row-level formulas, field-to-field filters, Lightning Table, conditional formatting UI) are Lightning-only; Classic-only items like "Schedule Refresh" and Printable View persist in legacy orgs.
20. **Activities**: archived activities and Einstein Activity Capture emails/events may not appear in standard activity reports.
21. **CRM Analytics data is not live**: datasets refresh on sync/recipe schedules; sharing inheritance/security predicates must be configured or users may see all rows.
22. **Tableau Next ≠ CRM Analytics ≠ Tableau Cloud**; Tableau Next requires Data 360 data. Don't assume migration paths; all three coexist (2026).
23. **Fiscal periods**: Relative date filters ("THIS FISCAL QUARTER") depend on Fiscal Year settings; custom fiscal years change behavior.
24. **Currency**: in multi-currency orgs report amounts display in user's currency with "converted" columns; dated exchange rates apply to opportunities only (advanced currency management).
25. **Report Chart on record page** needs a report filter field the component can match to the current record ID; otherwise it shows unfiltered data.
