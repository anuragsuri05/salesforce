// Seeds a fresh Slavy org: standard objects, security model, apps, layouts, automation,
// reports, dashboards and demo data. Run `npm run seed` to reset the database.
import { db, run, tx, setOrgSetting } from './db.js';
import { saveObject, saveField, saveMeta, invalidate, getField } from './metadata.js';
import { createRecord, updateRecord } from './records.js';
import { systemContext, getUser } from './security.js';
import './automation.js';
import { hashPassword, newId, nowIso, PREFIX, todayStr, addDays } from './util.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------- field helpers ----------
const vals = (list) => list.map((v) => (typeof v === 'string' ? { value: v, label: v } : { label: v.value, ...v }));
const F = {
  text: (apiName, label, x = {}) => ({ apiName, label, type: 'Text', length: 255, ...x }),
  area: (apiName, label, x = {}) => ({ apiName, label, type: 'TextArea', length: 255, ...x }),
  long: (apiName, label, x = {}) => ({ apiName, label, type: 'LongTextArea', length: 32000, visibleLines: 4, ...x }),
  email: (apiName, label, x = {}) => ({ apiName, label, type: 'Email', ...x }),
  phone: (apiName, label, x = {}) => ({ apiName, label, type: 'Phone', ...x }),
  url: (apiName, label, x = {}) => ({ apiName, label, type: 'Url', ...x }),
  num: (apiName, label, x = {}) => ({ apiName, label, type: 'Number', precision: 18, scale: 0, ...x }),
  cur: (apiName, label, x = {}) => ({ apiName, label, type: 'Currency', precision: 18, scale: 2, ...x }),
  pct: (apiName, label, x = {}) => ({ apiName, label, type: 'Percent', precision: 5, scale: 0, ...x }),
  bool: (apiName, label, x = {}) => ({ apiName, label, type: 'Checkbox', ...x }),
  date: (apiName, label, x = {}) => ({ apiName, label, type: 'Date', ...x }),
  dt: (apiName, label, x = {}) => ({ apiName, label, type: 'DateTime', ...x }),
  pick: (apiName, label, values, x = {}) => ({ apiName, label, type: 'Picklist', values: vals(values), restricted: true, ...x }),
  multi: (apiName, label, values, x = {}) => ({ apiName, label, type: 'MultiPicklist', values: vals(values), restricted: true, ...x }),
  lookup: (apiName, label, referenceTo, x = {}) => ({ apiName, label, type: 'Lookup', referenceTo, deleteConstraint: 'setNull', ...x }),
  md: (apiName, label, referenceTo, x = {}) => ({ apiName, label, type: 'MasterDetail', referenceTo, deleteConstraint: 'cascade', required: true, ...x }),
  formula: (apiName, label, formula, returnType, x = {}) => ({ apiName, label, type: 'Formula', formula, returnType, ...x }),
  rollup: (apiName, label, rollup, returnType = 'Number', x = {}) => ({ apiName, label, type: 'Rollup', rollup, returnType, ...x }),
};

const INDUSTRIES = ['Agriculture', 'Banking', 'Biotechnology', 'Communications', 'Construction', 'Consulting', 'Education', 'Electronics', 'Energy',
  'Finance', 'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Manufacturing', 'Media', 'Retail', 'Technology', 'Telecommunications', 'Transportation', 'Utilities', 'Other'];
const LEAD_SOURCES = ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Trade Show', 'Advertisement', 'Employee Referral', 'Other'];
const STAGES = [
  { value: 'Prospecting', probability: 10 }, { value: 'Qualification', probability: 20 }, { value: 'Needs Analysis', probability: 30 },
  { value: 'Value Proposition', probability: 40 }, { value: 'Proposal/Price Quote', probability: 75 }, { value: 'Negotiation/Review', probability: 90 },
  { value: 'Closed Won', probability: 100, closed: true, won: true }, { value: 'Closed Lost', probability: 0, closed: true },
];
const SALUTATIONS = ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'];
const ADDRESS = (prefix, label) => [
  F.area(`${prefix}Street`, `${label} Street`), F.text(`${prefix}City`, `${label} City`, { length: 40 }), F.text(`${prefix}State`, `${label} State/Province`, { length: 80 }),
  F.text(`${prefix}PostalCode`, `${label} Zip/Postal Code`, { length: 20 }), F.text(`${prefix}Country`, `${label} Country`, { length: 80 }),
];

const OBJECTS = [
  {
    apiName: 'Account', label: 'Account', pluralLabel: 'Accounts', keyPrefix: '001', icon: 'A', color: '#7f8de1', sharingModel: 'Read',
    nameField: { label: 'Account Name', type: 'Text' }, trackHistory: true, enableActivities: true, enableFeed: true,
    highlightFields: ['Type', 'Phone', 'Website', 'Industry'], listColumns: ['Name', 'BillingCity', 'Phone', 'Industry', 'OwnerId'],
    fields: [
      F.text('AccountNumber', 'Account Number', { length: 40 }),
      F.pick('Type', 'Type', ['Prospect', 'Customer - Direct', 'Customer - Channel', 'Partner', 'Other']),
      F.pick('Industry', 'Industry', INDUSTRIES, { trackHistory: true }),
      F.cur('AnnualRevenue', 'Annual Revenue'),
      F.num('NumberOfEmployees', 'Employees'),
      F.pick('Rating', 'Rating', ['Hot', 'Warm', 'Cold']),
      F.phone('Phone', 'Phone'), F.url('Website', 'Website'),
      F.lookup('ParentId', 'Parent Account', 'Account', { relatedListLabel: 'Child Accounts' }),
      F.pick('AccountSource', 'Account Source', LEAD_SOURCES),
      ...ADDRESS('Billing', 'Billing'),
      F.long('Description', 'Description'),
      F.rollup('NumberOfContacts__c', 'Number of Contacts', { childObject: 'Contact', relField: 'AccountId', op: 'COUNT' }, 'Number', { scale: 0, isCustom: true }),
      F.long('AI_Briefing__c', 'AI Account Briefing', { isCustom: true, visibleLines: 6 }),
      F.rollup('OpenPipeline__c', 'Open Pipeline', { childObject: 'Opportunity', relField: 'AccountId', op: 'SUM', field: 'Amount', filter: 'NOT(IsClosed)' }, 'Currency', { isCustom: true }),
    ],
  },
  {
    apiName: 'Contact', label: 'Contact', pluralLabel: 'Contacts', keyPrefix: '003', icon: 'C', color: '#a094ed', sharingModel: 'Read',
    nameField: { label: 'Name', type: 'Text', formula: "TRIM(FirstName & ' ' & LastName)" }, trackHistory: true, enableActivities: true, enableFeed: true,
    highlightFields: ['Title', 'AccountId', 'Phone', 'Email'], listColumns: ['Name', 'AccountId', 'Title', 'Phone', 'Email', 'OwnerId'],
    fields: [
      F.pick('Salutation', 'Salutation', SALUTATIONS), F.text('FirstName', 'First Name', { length: 40 }), F.text('LastName', 'Last Name', { length: 80, required: true }),
      F.lookup('AccountId', 'Account Name', 'Account', { relatedListLabel: 'Contacts' }),
      F.text('Title', 'Title', { length: 128 }), F.text('Department', 'Department', { length: 80 }),
      F.email('Email', 'Email', { trackHistory: true }), F.phone('Phone', 'Phone'), F.phone('MobilePhone', 'Mobile'),
      F.lookup('ReportsToId', 'Reports To', 'Contact', { relatedListLabel: 'Direct Reports' }),
      F.pick('LeadSource', 'Lead Source', LEAD_SOURCES), F.date('Birthdate', 'Birthdate'),
      F.bool('DoNotCall', 'Do Not Call'), F.bool('HasOptedOutOfEmail', 'Email Opt Out'),
      ...ADDRESS('Mailing', 'Mailing'), F.long('Description', 'Description'),
    ],
  },
  {
    apiName: 'Lead', label: 'Lead', pluralLabel: 'Leads', keyPrefix: '00Q', icon: 'L', color: '#f88962', sharingModel: 'ReadWrite',
    nameField: { label: 'Name', type: 'Text', formula: "TRIM(FirstName & ' ' & LastName)" }, trackHistory: true, enableActivities: true, enableFeed: true,
    pathField: 'Status', highlightFields: ['Title', 'Company', 'Phone', 'Email'], listColumns: ['Name', 'Company', 'State', 'Email', 'Status', 'OwnerId'],
    fields: [
      F.pick('Salutation', 'Salutation', SALUTATIONS), F.text('FirstName', 'First Name', { length: 40 }), F.text('LastName', 'Last Name', { length: 80, required: true }),
      F.text('Company', 'Company', { required: true }), F.text('Title', 'Title', { length: 128 }),
      F.email('Email', 'Email'), F.phone('Phone', 'Phone'), F.phone('MobilePhone', 'Mobile'), F.url('Website', 'Website'),
      F.pick('Status', 'Lead Status', [{ value: 'Open - Not Contacted', isDefault: true }, 'Working - Contacted', { value: 'Closed - Converted', converted: true }, 'Closed - Not Converted'], { required: true, trackHistory: true }),
      F.pick('LeadSource', 'Lead Source', LEAD_SOURCES), F.pick('Industry', 'Industry', INDUSTRIES), F.pick('Rating', 'Rating', ['Hot', 'Warm', 'Cold']),
      F.cur('AnnualRevenue', 'Annual Revenue'), F.num('NumberOfEmployees', 'No. of Employees'),
      F.area('Street', 'Street'), F.text('City', 'City', { length: 40 }), F.text('State', 'State/Province', { length: 80 }), F.text('PostalCode', 'Zip/Postal Code', { length: 20 }), F.text('Country', 'Country', { length: 80 }),
      F.long('Description', 'Description'),
      F.bool('IsConverted', 'Converted', { readOnly: true }), F.date('ConvertedDate', 'Converted Date', { readOnly: true }),
      F.lookup('ConvertedAccountId', 'Converted Account', 'Account', { readOnly: true, relatedListLabel: 'Converted Leads' }),
      F.lookup('ConvertedContactId', 'Converted Contact', 'Contact', { readOnly: true, relatedListLabel: 'Converted Leads' }),
      F.lookup('ConvertedOpportunityId', 'Converted Opportunity', 'Opportunity', { readOnly: true, relatedListLabel: 'Converted Leads' }),
    ],
  },
  {
    apiName: 'Opportunity', label: 'Opportunity', pluralLabel: 'Opportunities', keyPrefix: '006', icon: 'O', color: '#fcb95b', sharingModel: 'Private',
    nameField: { label: 'Opportunity Name', type: 'Text' }, trackHistory: true, enableActivities: true, enableFeed: true,
    pathField: 'StageName', highlightFields: ['AccountId', 'CloseDate', 'Amount', 'OwnerId'], listColumns: ['Name', 'AccountId', 'Amount', 'CloseDate', 'StageName', 'OwnerId'],
    fields: [
      F.lookup('AccountId', 'Account Name', 'Account', { relatedListLabel: 'Opportunities' }),
      F.cur('Amount', 'Amount', { trackHistory: true }),
      F.date('CloseDate', 'Close Date', { required: true, trackHistory: true }),
      F.pick('StageName', 'Stage', STAGES, { required: true, trackHistory: true }),
      F.pct('Probability', 'Probability (%)'),
      F.formula('ExpectedRevenue', 'Expected Revenue', 'BLANKVALUE(Amount, 0) * BLANKVALUE(Probability, 0) / 100', 'Currency', { scale: 2 }),
      F.pick('ForecastCategoryName', 'Forecast Category', ['Pipeline', 'Best Case', 'Commit', 'Omitted', 'Closed']),
      F.pick('Type', 'Type', ['New Customer', 'Existing Customer - Upgrade', 'Existing Customer - Replacement', 'Existing Customer - Downgrade']),
      F.pick('LeadSource', 'Lead Source', LEAD_SOURCES), F.text('NextStep', 'Next Step'),
      F.lookup('CampaignId', 'Primary Campaign Source', 'Campaign', { relatedListLabel: 'Opportunities' }),
      F.formula('IsClosed', 'Closed', "OR(ISPICKVAL(StageName, 'Closed Won'), ISPICKVAL(StageName, 'Closed Lost'))", 'Checkbox'),
      F.formula('IsWon', 'Won', "ISPICKVAL(StageName, 'Closed Won')", 'Checkbox'),
      F.formula('DaysToClose__c', 'Days to Close', 'IF(IsClosed, 0, CloseDate - TODAY())', 'Number', { scale: 0, isCustom: true }),
      F.rollup('LineItemTotal__c', 'Products Total', { childObject: 'OpportunityLineItem', relField: 'OpportunityId', op: 'SUM', field: 'TotalPrice' }, 'Currency', { isCustom: true }),
      F.pick('Approval_Status__c', 'Approval Status', [{ value: 'Not Submitted', isDefault: true }, 'Pending', 'Approved', 'Rejected'], { isCustom: true, readOnly: false }),
      F.long('Description', 'Description'),
    ],
  },
  {
    apiName: 'Case', label: 'Case', pluralLabel: 'Cases', keyPrefix: '500', icon: 'K', color: '#f2cf5b', sharingModel: 'Private',
    nameField: { label: 'Case Number', type: 'AutoNumber', format: '{00001000}' }, trackHistory: true, enableActivities: true, enableFeed: true,
    pathField: 'Status', highlightFields: ['Subject', 'Priority', 'Status', 'ContactId'], listColumns: ['Name', 'Subject', 'ContactId', 'Status', 'Priority', 'CreatedDate', 'OwnerId'],
    fields: [
      F.text('Subject', 'Subject'), F.long('Description', 'Description'),
      F.lookup('AccountId', 'Account Name', 'Account', { relatedListLabel: 'Cases' }),
      F.lookup('ContactId', 'Contact Name', 'Contact', { relatedListLabel: 'Cases' }),
      F.pick('Status', 'Status', [{ value: 'New', isDefault: true }, 'Working', 'Escalated', { value: 'Closed', closed: true }], { required: true, trackHistory: true }),
      F.pick('Priority', 'Priority', ['High', { value: 'Medium', isDefault: true }, 'Low'], { trackHistory: true }),
      F.pick('Origin', 'Case Origin', ['Phone', 'Email', 'Web', 'Chat']),
      F.pick('Type', 'Type', ['Question', 'Problem', 'Feature Request']),
      F.pick('Reason', 'Case Reason', ['Installation', 'Equipment Complexity', 'Performance', 'Breakdown', 'Equipment Design', 'Feedback', 'Other']),
      F.lookup('ParentId', 'Parent Case', 'Case', { relatedListLabel: 'Child Cases' }),
      F.bool('IsEscalated', 'Escalated'), F.dt('ClosedDate', 'Closed Date', { readOnly: true }),
      F.email('SuppliedEmail', 'Web Email'), F.text('SuppliedName', 'Web Name', { length: 80 }), F.phone('SuppliedPhone', 'Web Phone'),
      F.formula('AgeDays__c', 'Age (Days)', 'IF(ISPICKVAL(Status, \'Closed\'), DATEVALUE(ClosedDate) - DATEVALUE(CreatedDate), TODAY() - DATEVALUE(CreatedDate))', 'Number', { scale: 0, isCustom: true }),
    ],
  },
  {
    apiName: 'Campaign', label: 'Campaign', pluralLabel: 'Campaigns', keyPrefix: '701', icon: 'M', color: '#f49756', sharingModel: 'Read',
    nameField: { label: 'Campaign Name', type: 'Text' }, enableActivities: true, enableFeed: true,
    highlightFields: ['Status', 'Type', 'StartDate', 'EndDate'], listColumns: ['Name', 'Type', 'Status', 'StartDate', 'EndDate', 'OwnerId'],
    fields: [
      F.pick('Type', 'Type', ['Conference', 'Webinar', 'Trade Show', 'Email', 'Advertisement', 'Other']),
      F.pick('Status', 'Status', [{ value: 'Planned', isDefault: true }, 'In Progress', 'Completed', 'Aborted']),
      F.date('StartDate', 'Start Date'), F.date('EndDate', 'End Date'), F.bool('IsActive', 'Active'),
      F.cur('BudgetedCost', 'Budgeted Cost'), F.cur('ActualCost', 'Actual Cost'), F.cur('ExpectedRevenue', 'Expected Revenue in Campaign'),
      F.lookup('ParentId', 'Parent Campaign', 'Campaign', { relatedListLabel: 'Child Campaigns' }), F.long('Description', 'Description'),
      F.rollup('NumberOfMembers__c', 'Members', { childObject: 'CampaignMember', relField: 'CampaignId', op: 'COUNT' }, 'Number', { scale: 0, isCustom: true }),
      F.rollup('NumberOfResponses__c', 'Responses', { childObject: 'CampaignMember', relField: 'CampaignId', op: 'COUNT', filter: "ISPICKVAL(Status, 'Responded')" }, 'Number', { scale: 0, isCustom: true }),
      F.rollup('WonAmount__c', 'Value Won Opportunities', { childObject: 'Opportunity', relField: 'CampaignId', op: 'SUM', field: 'Amount', filter: 'IsWon' }, 'Currency', { isCustom: true }),
    ],
  },
  {
    apiName: 'CampaignMember', label: 'Campaign Member', pluralLabel: 'Campaign Members', keyPrefix: '00v', icon: 'm', color: '#f49756', sharingModel: 'ControlledByParent',
    nameField: { label: 'Member Number', type: 'AutoNumber', format: 'CM-{00000}' }, searchable: false,
    listColumns: ['Name', 'CampaignId', 'ContactId', 'LeadId', 'Status'],
    fields: [
      F.md('CampaignId', 'Campaign', 'Campaign', { relatedListLabel: 'Campaign Members' }),
      F.lookup('ContactId', 'Contact', 'Contact', { relatedListLabel: 'Campaign History' }),
      F.lookup('LeadId', 'Lead', 'Lead', { relatedListLabel: 'Campaign History' }),
      F.pick('Status', 'Status', [{ value: 'Planned', isDefault: true }, 'Sent', 'Responded']),
    ],
  },
  {
    apiName: 'Product2', label: 'Product', pluralLabel: 'Products', keyPrefix: '01t', icon: 'P', color: '#b781d3', sharingModel: 'Read',
    nameField: { label: 'Product Name', type: 'Text' }, highlightFields: ['ProductCode', 'Family', 'ListPrice', 'IsActive'],
    listColumns: ['Name', 'ProductCode', 'Family', 'ListPrice', 'IsActive'],
    fields: [
      F.text('ProductCode', 'Product Code', { length: 40, unique: true, externalId: true }),
      F.pick('Family', 'Product Family', ['Hardware', 'Software', 'Services', 'Support']),
      F.cur('ListPrice', 'List Price'), F.bool('IsActive', 'Active', { defaultValue: 'TRUE' }), F.long('Description', 'Product Description'),
    ],
  },
  {
    apiName: 'OpportunityLineItem', label: 'Opportunity Product', pluralLabel: 'Opportunity Products', keyPrefix: '00k', icon: 'p', color: '#b781d3', sharingModel: 'ControlledByParent',
    nameField: { label: 'Line Number', type: 'AutoNumber', format: 'OLI-{00000}' }, searchable: false,
    listColumns: ['Name', 'Product2Id', 'Quantity', 'UnitPrice', 'TotalPrice'],
    fields: [
      F.md('OpportunityId', 'Opportunity', 'Opportunity', { relatedListLabel: 'Products' }),
      F.lookup('Product2Id', 'Product', 'Product2', { required: true, relatedListLabel: 'Opportunity Products', deleteConstraint: 'restrict' }),
      F.num('Quantity', 'Quantity', { scale: 2, required: true, defaultValue: '1' }),
      F.cur('UnitPrice', 'Sales Price'), F.pct('Discount', 'Discount', { scale: 2 }),
      F.formula('TotalPrice', 'Total Price', 'Quantity * BLANKVALUE(UnitPrice, 0) * (1 - BLANKVALUE(Discount, 0) / 100)', 'Currency', { scale: 2 }),
      F.text('Description', 'Line Description'),
    ],
  },
  {
    apiName: 'Contract', label: 'Contract', pluralLabel: 'Contracts', keyPrefix: '800', icon: 'T', color: '#6ec06e', sharingModel: 'Read',
    nameField: { label: 'Contract Number', type: 'AutoNumber', format: '{00000100}' }, trackHistory: true, enableActivities: true, enableFeed: true,
    pathField: 'Status', highlightFields: ['AccountId', 'Status', 'StartDate', 'EndDate'], listColumns: ['Name', 'AccountId', 'Status', 'StartDate', 'EndDate', 'OwnerId'],
    fields: [
      F.lookup('AccountId', 'Account Name', 'Account', { required: true, relatedListLabel: 'Contracts' }),
      F.pick('Status', 'Status', [{ value: 'Draft', isDefault: true }, 'In Approval Process', 'Activated'], { trackHistory: true }),
      F.date('StartDate', 'Contract Start Date'), F.num('ContractTerm', 'Contract Term (months)'),
      F.formula('EndDate', 'Contract End Date', 'IF(OR(ISBLANK(StartDate), ISBLANK(ContractTerm)), NULL, ADDMONTHS(StartDate, ContractTerm) - 1)', 'Date'),
      F.cur('ContractValue__c', 'Contract Value', { isCustom: true }), F.long('SpecialTerms', 'Special Terms'),
    ],
  },
  {
    apiName: 'Task', label: 'Task', pluralLabel: 'Tasks', keyPrefix: '00T', icon: '✓', color: '#4bc076', sharingModel: 'ControlledByParent', isActivity: true,
    nameField: { label: 'Subject', type: 'Text' }, ownerLabel: 'Assigned To', searchable: true,
    highlightFields: ['ActivityDate', 'Status', 'Priority', 'WhatId'], listColumns: ['Name', 'WhoId', 'WhatId', 'ActivityDate', 'Status', 'Priority', 'OwnerId'],
    fields: [
      F.lookup('WhoId', 'Name', ['Contact', 'Lead'], { polymorphic: true }),
      F.lookup('WhatId', 'Related To', ['*'], { polymorphic: true }),
      F.date('ActivityDate', 'Due Date'),
      F.pick('Status', 'Status', [{ value: 'Not Started', isDefault: true }, 'In Progress', { value: 'Completed', closed: true }, 'Waiting on someone else', 'Deferred'], { required: true }),
      F.pick('Priority', 'Priority', ['High', { value: 'Normal', isDefault: true }, 'Low'], { required: true }),
      F.pick('TaskSubtype', 'Task Subtype', [{ value: 'Task', isDefault: true }, 'Call', 'Email']),
      F.long('Description', 'Comments'),
      F.formula('IsClosed', 'Closed', "ISPICKVAL(Status, 'Completed')", 'Checkbox'),
    ],
  },
  {
    apiName: 'Event', label: 'Event', pluralLabel: 'Events', keyPrefix: '00U', icon: '◷', color: '#eb7092', sharingModel: 'ControlledByParent', isActivity: true,
    nameField: { label: 'Subject', type: 'Text' }, ownerLabel: 'Assigned To',
    highlightFields: ['StartDateTime', 'EndDateTime', 'Location', 'WhatId'], listColumns: ['Name', 'StartDateTime', 'EndDateTime', 'Location', 'OwnerId'],
    fields: [
      F.lookup('WhoId', 'Name', ['Contact', 'Lead'], { polymorphic: true }),
      F.lookup('WhatId', 'Related To', ['*'], { polymorphic: true }),
      F.dt('StartDateTime', 'Start', { required: true }), F.dt('EndDateTime', 'End', { required: true }),
      F.text('Location', 'Location'), F.bool('IsAllDayEvent', 'All-Day Event'),
      F.pick('ShowAs', 'Show Time As', [{ value: 'Busy', isDefault: true }, 'Free', 'Out of Office']),
      F.long('Description', 'Description'),
    ],
  },
  {
    apiName: 'Project__c', label: 'Project', pluralLabel: 'Projects', keyPrefix: 'a00', icon: '◆', color: '#3cc2b3', sharingModel: 'ReadWrite', isCustom: true,
    nameField: { label: 'Project Name', type: 'Text' }, trackHistory: true, enableActivities: true, enableFeed: true,
    pathField: 'Status__c', highlightFields: ['Account__c', 'Status__c', 'Health__c', 'End_Date__c'], listColumns: ['Name', 'Account__c', 'Status__c', 'Health__c', 'Budget__c', 'End_Date__c', 'OwnerId'],
    fields: [
      F.lookup('Account__c', 'Account', 'Account', { relatedListLabel: 'Projects', isCustom: true }),
      F.lookup('Opportunity__c', 'Opportunity', 'Opportunity', { relatedListLabel: 'Projects', isCustom: true }),
      F.pick('Status__c', 'Status', [{ value: 'Planning', isDefault: true }, 'In Progress', 'On Hold', 'Completed'], { isCustom: true, trackHistory: true }),
      F.pick('Health__c', 'Health', ['Green', 'Yellow', 'Red'], { isCustom: true, trackHistory: true }),
      F.cur('Budget__c', 'Budget', { isCustom: true }), F.cur('Spent__c', 'Spent', { isCustom: true }),
      F.formula('Budget_Remaining__c', 'Budget Remaining', 'BLANKVALUE(Budget__c, 0) - BLANKVALUE(Spent__c, 0)', 'Currency', { isCustom: true, scale: 2 }),
      F.pct('Percent_Complete__c', 'Percent Complete', { isCustom: true }),
      F.date('Start_Date__c', 'Start Date', { isCustom: true }), F.date('End_Date__c', 'End Date', { isCustom: true }),
      F.multi('Workstreams__c', 'Workstreams', ['Discovery', 'Design', 'Build', 'Data Migration', 'Training', 'Go-Live'], { isCustom: true }),
      F.long('Notes__c', 'Notes', { isCustom: true }),
    ],
  },
];

const LAYOUTS = {
  Account: {
    sections: [
      { label: 'Account Information', columns: 2, fields: ['Name', 'OwnerId', 'ParentId', 'Rating', 'AccountNumber', 'Phone', 'Type', 'Website', 'Industry', 'AnnualRevenue', 'NumberOfEmployees', 'AccountSource'] },
      { label: 'Address Information', columns: 2, fields: ['BillingStreet', 'BillingCity', 'BillingState', 'BillingPostalCode', 'BillingCountry'] },
      { label: 'Rollups', columns: 2, fields: ['NumberOfContacts__c', 'OpenPipeline__c'] },
      { label: 'AI', columns: 1, fields: ['AI_Briefing__c'] },
      { label: 'Description', columns: 1, fields: ['Description'] },
      { label: 'System Information', columns: 2, fields: ['CreatedById', 'LastModifiedById'] },
    ],
    relatedLists: [
      { object: 'Contact', field: 'AccountId', label: 'Contacts', columns: ['Name', 'Title', 'Email', 'Phone'] },
      { object: 'Opportunity', field: 'AccountId', label: 'Opportunities', columns: ['Name', 'StageName', 'Amount', 'CloseDate'] },
      { object: 'Case', field: 'AccountId', label: 'Cases', columns: ['Name', 'Subject', 'Status', 'Priority'] },
      { object: 'Contract', field: 'AccountId', label: 'Contracts', columns: ['Name', 'Status', 'StartDate', 'EndDate'] },
      { object: 'Project__c', field: 'Account__c', label: 'Projects', columns: ['Name', 'Status__c', 'Health__c', 'End_Date__c'] },
      { object: 'Account', field: 'ParentId', label: 'Child Accounts', columns: ['Name', 'Type', 'Industry'] },
    ],
  },
  Contact: {
    sections: [
      { label: 'Contact Information', columns: 2, fields: ['Salutation', 'OwnerId', 'FirstName', 'Phone', 'LastName', 'MobilePhone', 'AccountId', 'Email', 'Title', 'ReportsToId', 'Department', 'LeadSource', 'Birthdate'] },
      { label: 'Preferences', columns: 2, fields: ['DoNotCall', 'HasOptedOutOfEmail'] },
      { label: 'Address Information', columns: 2, fields: ['MailingStreet', 'MailingCity', 'MailingState', 'MailingPostalCode', 'MailingCountry'] },
      { label: 'Description', columns: 1, fields: ['Description'] },
      { label: 'System Information', columns: 2, fields: ['CreatedById', 'LastModifiedById'] },
    ],
    relatedLists: [
      { object: 'Opportunity', field: 'AccountId', label: 'Opportunities', columns: ['Name', 'StageName', 'Amount'], viaParent: 'AccountId', hidden: true },
      { object: 'Case', field: 'ContactId', label: 'Cases', columns: ['Name', 'Subject', 'Status', 'Priority'] },
      { object: 'CampaignMember', field: 'ContactId', label: 'Campaign History', columns: ['Name', 'CampaignId', 'Status'] },
      { object: 'Contact', field: 'ReportsToId', label: 'Direct Reports', columns: ['Name', 'Title', 'Email'] },
    ].filter((r) => !r.hidden),
  },
  Lead: {
    sections: [
      { label: 'Lead Information', columns: 2, fields: ['Salutation', 'OwnerId', 'FirstName', 'Phone', 'LastName', 'MobilePhone', 'Company', 'Email', 'Title', 'Website', 'LeadSource', 'Status', 'Industry', 'Rating', 'AnnualRevenue', 'NumberOfEmployees'] },
      { label: 'Address Information', columns: 2, fields: ['Street', 'City', 'State', 'PostalCode', 'Country'] },
      { label: 'Conversion', columns: 2, fields: ['IsConverted', 'ConvertedDate', 'ConvertedAccountId', 'ConvertedContactId', 'ConvertedOpportunityId'] },
      { label: 'Description', columns: 1, fields: ['Description'] },
      { label: 'System Information', columns: 2, fields: ['CreatedById', 'LastModifiedById'] },
    ],
    relatedLists: [{ object: 'CampaignMember', field: 'LeadId', label: 'Campaign History', columns: ['Name', 'CampaignId', 'Status'] }],
  },
  Opportunity: {
    sections: [
      { label: 'Opportunity Information', columns: 2, fields: ['Name', 'OwnerId', 'AccountId', 'CloseDate', 'Type', 'StageName', 'LeadSource', 'Probability', 'Amount', 'ExpectedRevenue', 'NextStep', 'ForecastCategoryName', 'CampaignId', 'DaysToClose__c'] },
      { label: 'Approval & Products', columns: 2, fields: ['Approval_Status__c', 'LineItemTotal__c'] },
      { label: 'Description', columns: 1, fields: ['Description'] },
      { label: 'System Information', columns: 2, fields: ['CreatedById', 'LastModifiedById'] },
    ],
    relatedLists: [
      { object: 'OpportunityLineItem', field: 'OpportunityId', label: 'Products', columns: ['Product2Id', 'Quantity', 'UnitPrice', 'TotalPrice'] },
      { object: 'Project__c', field: 'Opportunity__c', label: 'Projects', columns: ['Name', 'Status__c', 'Health__c'] },
    ],
  },
  Case: {
    sections: [
      { label: 'Case Information', columns: 2, fields: ['Name', 'OwnerId', 'ContactId', 'Status', 'AccountId', 'Priority', 'Type', 'Origin', 'Reason', 'ParentId', 'IsEscalated', 'AgeDays__c'] },
      { label: 'Web Information', columns: 2, fields: ['SuppliedEmail', 'SuppliedName', 'SuppliedPhone'] },
      { label: 'Description Information', columns: 1, fields: ['Subject', 'Description'] },
      { label: 'System Information', columns: 2, fields: ['CreatedById', 'CreatedDate', 'LastModifiedById', 'ClosedDate'] },
    ],
    relatedLists: [{ object: 'Case', field: 'ParentId', label: 'Child Cases', columns: ['Name', 'Subject', 'Status'] }],
  },
  Campaign: {
    sections: [
      { label: 'Campaign Information', columns: 2, fields: ['Name', 'OwnerId', 'ParentId', 'IsActive', 'Type', 'Status', 'StartDate', 'EndDate'] },
      { label: 'Planning', columns: 2, fields: ['BudgetedCost', 'ActualCost', 'ExpectedRevenue'] },
      { label: 'Campaign Statistics', columns: 2, fields: ['NumberOfMembers__c', 'NumberOfResponses__c', 'WonAmount__c'] },
      { label: 'Description', columns: 1, fields: ['Description'] },
    ],
    relatedLists: [
      { object: 'CampaignMember', field: 'CampaignId', label: 'Campaign Members', columns: ['Name', 'ContactId', 'LeadId', 'Status'] },
      { object: 'Opportunity', field: 'CampaignId', label: 'Opportunities', columns: ['Name', 'StageName', 'Amount'] },
      { object: 'Campaign', field: 'ParentId', label: 'Child Campaigns', columns: ['Name', 'Status', 'StartDate'] },
    ],
  },
  Product2: {
    sections: [{ label: 'Product Information', columns: 2, fields: ['Name', 'ProductCode', 'Family', 'IsActive', 'ListPrice'] }, { label: 'Description', columns: 1, fields: ['Description'] }],
    relatedLists: [{ object: 'OpportunityLineItem', field: 'Product2Id', label: 'Opportunity Products', columns: ['Name', 'OpportunityId', 'Quantity', 'TotalPrice'] }],
  },
  OpportunityLineItem: {
    sections: [{ label: 'Product Information', columns: 2, fields: ['OpportunityId', 'Product2Id', 'Quantity', 'UnitPrice', 'Discount', 'TotalPrice', 'Description'] }],
    relatedLists: [],
  },
  CampaignMember: { sections: [{ label: 'Member Information', columns: 2, fields: ['CampaignId', 'Status', 'ContactId', 'LeadId'] }], relatedLists: [] },
  Contract: {
    sections: [
      { label: 'Contract Information', columns: 2, fields: ['Name', 'OwnerId', 'AccountId', 'Status', 'StartDate', 'ContractTerm', 'EndDate', 'ContractValue__c'] },
      { label: 'Terms', columns: 1, fields: ['SpecialTerms'] },
    ],
    relatedLists: [],
  },
  Task: {
    sections: [{ label: 'Task Information', columns: 2, fields: ['Name', 'OwnerId', 'ActivityDate', 'Status', 'WhoId', 'Priority', 'WhatId', 'TaskSubtype'] }, { label: 'Comments', columns: 1, fields: ['Description'] }],
    relatedLists: [],
  },
  Event: {
    sections: [{ label: 'Event Information', columns: 2, fields: ['Name', 'OwnerId', 'StartDateTime', 'EndDateTime', 'IsAllDayEvent', 'ShowAs', 'Location', 'WhoId', 'WhatId'] }, { label: 'Description', columns: 1, fields: ['Description'] }],
    relatedLists: [],
  },
  Project__c: {
    sections: [
      { label: 'Project Information', columns: 2, fields: ['Name', 'OwnerId', 'Account__c', 'Opportunity__c', 'Status__c', 'Health__c', 'Start_Date__c', 'End_Date__c', 'Percent_Complete__c', 'Workstreams__c'] },
      { label: 'Budget', columns: 2, fields: ['Budget__c', 'Spent__c', 'Budget_Remaining__c'] },
      { label: 'Notes', columns: 1, fields: ['Notes__c'] },
    ],
    relatedLists: [],
  },
};

// ---------- deterministic pseudo-random ----------
let seedState = 42;
const rand = () => { seedState = (seedState * 1664525 + 1013904223) % 4294967296; return seedState / 4294967296; };
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => Math.floor(a + rand() * (b - a + 1));

const COMPANIES = ['Acme Corporation', 'Globex Industries', 'Initech Systems', 'Umbrella Health', 'Stark Manufacturing', 'Wayne Logistics', 'Wonka Foods', 'Tyrell Biotech',
  'Cyberdyne Robotics', 'Soylent Nutrition', 'Hooli Cloud', 'Pied Piper Data', 'Vandelay Imports', 'Oscorp Energy', 'Gringotts Financial', 'Monarch Hotels',
  'Blue Sun Telecom', 'Aperture Labs', 'Massive Dynamic', 'Nakatomi Trading', 'Dunder Paper Co', 'Sterling Cooper Media', 'Prestige Worldwide', 'Bluth Construction',
  'Cogswell Cogs', 'Spacely Sprockets', 'Krusty Retail', 'Zorg Electronics', 'Gekko Capital', 'Ollivander Crafts', 'Black Mesa Research', 'Rekall Travel',
  'InGen Agriculture', 'Weyland Transport', 'Virtucon Utilities', 'Duff Beverages', 'Mom Corp', 'Planet Express', 'Sirius Cybernetics', 'Yoyodyne Aerospace'];
const FIRST = ['Ava', 'Liam', 'Noah', 'Emma', 'Olivia', 'Mateo', 'Sofia', 'Aria', 'Ethan', 'Mia', 'Lucas', 'Zara', 'Kai', 'Nia', 'Omar', 'Leah', 'Ravi', 'Anya', 'Diego', 'Hana', 'Felix', 'Ines', 'Theo', 'Maya', 'Jonah', 'Lena', 'Arjun', 'Chloe', 'Malik', 'Yuki'];
const LAST = ['Garcia', 'Nguyen', 'Patel', 'Smith', 'Okafor', 'Kowalski', 'Rossi', 'Johansson', 'Haddad', 'Silva', 'Tanaka', 'Murphy', 'Fischer', 'Dubois', 'Kim', 'Novak', 'Reyes', 'Ahmed', 'Larsen', 'Costa', 'Moreau', 'Singh', 'Walker', 'Ibrahim', 'Chen'];
const TITLES = ['CEO', 'CFO', 'CTO', 'VP Sales', 'VP Operations', 'Director of IT', 'Procurement Manager', 'Head of Marketing', 'Operations Manager', 'IT Manager', 'Buyer', 'COO'];
const CITIES = [['San Francisco', 'CA', 'USA'], ['New York', 'NY', 'USA'], ['Austin', 'TX', 'USA'], ['Chicago', 'IL', 'USA'], ['Seattle', 'WA', 'USA'], ['Boston', 'MA', 'USA'],
  ['London', '', 'UK'], ['Berlin', '', 'Germany'], ['Bengaluru', 'KA', 'India'], ['Toronto', 'ON', 'Canada'], ['Sydney', 'NSW', 'Australia'], ['Singapore', '', 'Singapore']];
const CASE_SUBJECTS = ['Unable to log in to portal', 'Invoice shows wrong amount', 'Device overheating after update', 'Request for feature: bulk export', 'Shipment delayed',
  'Integration returns 500 error', 'Password reset email not received', 'Need training for new team', 'Performance degradation in reports', 'Warranty claim for unit',
  'Data sync failing nightly', 'Question about renewal pricing', 'Mobile app crashes on launch', 'SSO configuration help', 'Billing address change'];

// ---------- main ----------
export function seed({ reset = false } = {}) {
  if (reset) {
    for (const t of ['org', 'objects', 'fields', 'meta', 'records', 'users', 'permset_assignments', 'sessions', 'login_history', 'audit_trail', 'field_history',
      'record_shares', 'feed', 'feed_comments', 'feed_likes', 'notifications', 'approvals', 'email_log', 'counters', 'recent_items', 'favorites']) db.exec(`DELETE FROM ${t}`);
    invalidate();
  }
  seedState = 42;
  tx(seedAll);
}

function seedAll() {
  setOrgSetting('company', { name: 'Slavy Demo Org', currency: 'USD', locale: 'en-US', timezone: 'UTC', fiscalYearStartMonth: 1, phone: '+1 415 555 0100', address: '1 Market St, San Francisco, CA' });

  // Objects & fields
  for (const o of OBJECTS) {
    const { fields, ...def } = o;
    saveObject({ isCustom: false, searchable: true, ...def }, null, { isNew: true });
  }
  for (const o of OBJECTS) {
    o.fields.forEach((f, i) => saveField(o.apiName, { isCustom: false, ...f, sortOrder: i + 1 }, null, { isNew: true }));
  }

  // Layouts
  for (const [object, l] of Object.entries(LAYOUTS)) saveMeta('layout', { name: `${object} Layout`, object, ...l });

  // Roles
  const role = {};
  const mkRole = (key, name, parent) => { role[key] = saveMeta('role', { name, parentId: parent ? role[parent] : null }).id; };
  mkRole('ceo', 'CEO'); mkRole('vpSales', 'VP Sales', 'ceo'); mkRole('salesMgr', 'Sales Manager', 'vpSales'); mkRole('salesRep', 'Sales Representative', 'salesMgr');
  mkRole('vpSupport', 'VP Support', 'ceo'); mkRole('supportMgr', 'Support Manager', 'vpSupport'); mkRole('supportAgent', 'Support Agent', 'supportMgr');
  mkRole('marketing', 'Marketing Manager', 'ceo');

  // Profiles
  const crud = { read: true, create: true, edit: true, delete: true };
  const ro = { read: true };
  const allObjects = OBJECTS.map((o) => o.apiName);
  const profile = {};
  profile.admin = saveMeta('profile', {
    name: 'System Administrator', description: 'Full access to everything, including Setup.', license: 'Slavy',
    permissions: { system: Object.fromEntries(['ModifyAllData', 'ViewAllData', 'ViewSetup', 'CustomizeApplication', 'ManageUsers', 'ManageFlows', 'RunReports', 'ManageReports', 'ManageDashboards', 'ExportReports', 'ApiEnabled', 'ImportData', 'ManagePublicListViews', 'TransferRecords', 'ConvertLeads', 'RunSoql', 'UseAI'].map((k) => [k, true])), objects: Object.fromEntries(allObjects.map((o) => [o, { ...crud, viewAll: true, modifyAll: true }])), fields: {} },
  }).id;
  const stdSystem = { RunReports: true, ManageReports: true, ManageDashboards: true, ExportReports: true, ApiEnabled: true, ConvertLeads: true, UseAI: true };
  profile.standard = saveMeta('profile', {
    name: 'Standard User', description: 'Can create and edit most standard records and build reports.', license: 'Slavy',
    permissions: { system: stdSystem, objects: Object.fromEntries(allObjects.map((o) => [o, ['Product2', 'Campaign'].includes(o) ? ro : crud])), fields: {} },
  }).id;
  profile.sales = saveMeta('profile', {
    name: 'Sales Representative', description: 'Sales team: leads, accounts, contacts, opportunities.', license: 'Slavy',
    permissions: {
      system: { RunReports: true, ManageReports: true, ExportReports: true, ConvertLeads: true, UseAI: true },
      objects: { Account: crud, Contact: crud, Lead: crud, Opportunity: crud, OpportunityLineItem: crud, Task: crud, Event: crud, Contract: { read: true, create: true, edit: true }, Product2: ro, Campaign: ro, CampaignMember: ro, Case: ro, Project__c: ro },
      fields: {},
    },
  }).id;
  profile.support = saveMeta('profile', {
    name: 'Support Agent', description: 'Service team: cases, accounts, contacts. No access to opportunities.', license: 'Slavy',
    permissions: {
      system: { RunReports: true, ManageReports: true, UseAI: true },
      objects: { Case: crud, Account: { read: true, edit: true }, Contact: { read: true, create: true, edit: true }, Task: crud, Event: crud, Product2: ro, Contract: ro },
      fields: { 'Account.AnnualRevenue': { read: false, edit: false }, 'Account.OpenPipeline__c': { read: false, edit: false } },
    },
  }).id;
  profile.readonly = saveMeta('profile', {
    name: 'Read Only', description: 'Can view records and run reports, but not change anything.', license: 'Slavy',
    permissions: { system: { RunReports: true }, objects: Object.fromEntries(allObjects.map((o) => [o, ro])), fields: {} },
  }).id;

  // Permission sets
  const ps = {};
  ps.marketing = saveMeta('permissionSet', { name: 'Marketing_User', label: 'Marketing User', description: 'Manage campaigns and campaign members.', permissions: { system: { ImportData: true }, objects: { Campaign: crud, CampaignMember: crud, Lead: crud }, fields: {} } }).id;
  ps.dev = saveMeta('permissionSet', { name: 'Developer_Tools', label: 'Developer Tools', description: 'SOQL query editor and REST API access.', permissions: { system: { RunSoql: true, ApiEnabled: true }, objects: {}, fields: {} } }).id;
  ps.reports = saveMeta('permissionSet', { name: 'Dashboard_Builder', label: 'Dashboard Builder', description: 'Create and customize dashboards, export reports.', permissions: { system: { ManageDashboards: true, ExportReports: true }, objects: {}, fields: {} } }).id;
  ps.revenue = saveMeta('permissionSet', { name: 'Revenue_Visibility', label: 'Revenue Visibility', description: 'Grants access to account revenue fields for support staff.', permissions: { system: {}, objects: {}, fields: { 'Account.AnnualRevenue': { read: true, edit: false } } } }).id;

  // Users
  const pw = hashPassword('slavy123');
  const user = {};
  const mkUser = (key, first, last, username, title, prof, r, manager) => {
    const id = newId(PREFIX.User);
    run(`INSERT INTO users(id, username, email, first_name, last_name, alias, title, phone, profile_id, role_id, manager_id, is_active, password_hash, timezone, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'UTC', ?)`, id, username, username, first, last, (first[0] + last.slice(0, 4)).toLowerCase(), title,
      `+1 415 555 01${between(10, 99)}`, profile[prof], role[r], manager ? user[manager] : null, pw, nowIso());
    user[key] = id;
  };
  mkUser('admin', 'Alex', 'Morgan', 'admin@slavy.dev', 'CEO & System Administrator', 'admin', 'ceo');
  mkUser('vp', 'Priya', 'Shah', 'vp.sales@slavy.dev', 'VP of Sales', 'standard', 'vpSales', 'admin');
  mkUser('mgr', 'Jordan', 'Lee', 'sales.mgr@slavy.dev', 'Sales Manager', 'standard', 'salesMgr', 'vp');
  mkUser('rep1', 'Sam', 'Rivera', 'rep1@slavy.dev', 'Account Executive', 'sales', 'salesRep', 'mgr');
  mkUser('rep2', 'Taylor', 'Kim', 'rep2@slavy.dev', 'Account Executive', 'sales', 'salesRep', 'mgr');
  mkUser('supmgr', 'Riley', 'Patel', 'support.mgr@slavy.dev', 'Support Manager', 'support', 'supportMgr', 'admin');
  mkUser('agent', 'Casey', 'Brooks', 'support@slavy.dev', 'Support Specialist', 'support', 'supportAgent', 'supmgr');
  mkUser('mkt', 'Morgan', 'Chen', 'marketing@slavy.dev', 'Marketing Manager', 'standard', 'marketing', 'admin');
  mkUser('viewer', 'Jamie', 'Fox', 'viewer@slavy.dev', 'Auditor', 'readonly', 'ceo', 'admin');
  run('INSERT INTO permset_assignments(user_id, permset_id) VALUES (?, ?)', user.mkt, ps.marketing);
  run('INSERT INTO permset_assignments(user_id, permset_id) VALUES (?, ?)', user.mgr, ps.reports);
  run('INSERT INTO permset_assignments(user_id, permset_id) VALUES (?, ?)', user.supmgr, ps.revenue);
  run('INSERT INTO permset_assignments(user_id, permset_id) VALUES (?, ?)', user.vp, ps.dev);

  // Groups & queues
  const leadQueue = saveMeta('group', { name: 'Lead_Queue', label: 'Unassigned Leads', kind: 'queue', members: [`sub:${role.salesMgr}`, role.salesMgr], queueObjects: ['Lead'] }).id;
  const supportQueue = saveMeta('group', { name: 'Support_Queue', label: 'Tier 1 Support', kind: 'queue', members: [`sub:${role.supportMgr}`, role.supportMgr], queueObjects: ['Case'] }).id;
  const leadership = saveMeta('group', { name: 'Leadership', label: 'Leadership Team', kind: 'public', members: [role.ceo, role.vpSales, role.vpSupport] }).id;

  // Sharing rules
  saveMeta('sharingRule', { name: 'High_Priority_Cases', label: 'High priority cases visible to sales leadership', object: 'Case', ruleType: 'criteria',
    filters: [{ field: 'Priority', op: 'equals', value: 'High' }], sharedWith: { kind: 'roleSub', id: role.vpSales }, access: 'read', active: true });
  saveMeta('sharingRule', { name: 'Sales_Team_Opps', label: 'Sales reps see each other’s opportunities', object: 'Opportunity', ruleType: 'owner',
    ownedBy: { kind: 'role', id: role.salesRep }, sharedWith: { kind: 'role', id: role.salesRep }, access: 'read', active: true });
  saveMeta('sharingRule', { name: 'Leadership_Opps', label: 'Leadership can edit all opportunities', object: 'Opportunity', ruleType: 'owner',
    ownedBy: { kind: 'roleSub', id: role.ceo }, sharedWith: { kind: 'group', id: leadership }, access: 'edit', active: true });

  // Apps
  saveMeta('app', { name: 'Sales', sortOrder: 1, label: 'Sales', description: 'Manage your pipeline from lead to close.', color: '#0176d3', icon: 'S',
    items: ['home', 'Lead', 'Account', 'Contact', 'Opportunity', 'Product2', 'Contract', 'Task', 'reports', 'dashboards', 'chatter'], profiles: [], active: true });
  saveMeta('app', { name: 'Service', sortOrder: 2, label: 'Service', description: 'Resolve customer cases faster.', color: '#04844b', icon: 'V',
    items: ['home', 'Case', 'Account', 'Contact', 'Task', 'reports', 'dashboards', 'chatter'], profiles: [], active: true, console: true });
  saveMeta('app', { name: 'Marketing', sortOrder: 3, label: 'Marketing', description: 'Plan campaigns and nurture leads.', color: '#f49756', icon: 'M',
    items: ['home', 'Campaign', 'Lead', 'Contact', 'reports', 'dashboards'], profiles: [], active: true });
  saveMeta('app', { name: 'Projects', sortOrder: 4, label: 'Projects', description: 'Deliver projects for customers (custom object demo).', color: '#3cc2b3', icon: 'P',
    items: ['home', 'Project__c', 'Account', 'Opportunity', 'reports', 'dashboards'], profiles: [], active: true });

  // List views (public)
  const lv = (object, name, filters, columns, sort, extra = {}) => saveMeta('listView', { object, name, filters, columns, sort, scope: 'everything', visibility: 'public', ownerId: user.admin, filterLogic: '', ...extra });
  lv('Opportunity', 'Open Opportunities', [{ field: 'IsClosed', op: 'equals', value: 'false' }], ['Name', 'AccountId', 'Amount', 'CloseDate', 'StageName', 'OwnerId'], { field: 'CloseDate', dir: 'asc' }, { kanbanField: 'StageName', kanbanSummary: 'Amount' });
  lv('Opportunity', 'Closing This Month', [{ field: 'CloseDate', op: 'equals', value: 'THIS_MONTH' }], ['Name', 'AccountId', 'Amount', 'StageName', 'Probability', 'OwnerId'], { field: 'Amount', dir: 'desc' });
  lv('Opportunity', 'Won Deals', [{ field: 'StageName', op: 'equals', value: 'Closed Won' }], ['Name', 'AccountId', 'Amount', 'CloseDate', 'OwnerId'], { field: 'CloseDate', dir: 'desc' });
  lv('Lead', 'Open Leads', [{ field: 'IsConverted', op: 'equals', value: 'false' }, { field: 'Status', op: 'notEqual', value: 'Closed - Not Converted' }], ['Name', 'Company', 'Email', 'LeadSource', 'Status', 'Rating', 'OwnerId'], { field: 'CreatedDate', dir: 'desc' }, { kanbanField: 'Status' });
  lv('Lead', 'Hot Leads', [{ field: 'Rating', op: 'equals', value: 'Hot' }], ['Name', 'Company', 'Phone', 'Status', 'OwnerId'], { field: 'Name', dir: 'asc' });
  lv('Case', 'Open Cases', [{ field: 'Status', op: 'notEqual', value: 'Closed' }], ['Name', 'Subject', 'ContactId', 'Status', 'Priority', 'CreatedDate', 'OwnerId'], { field: 'CreatedDate', dir: 'desc' }, { kanbanField: 'Status' });
  lv('Case', 'High Priority Open', [{ field: 'Priority', op: 'equals', value: 'High' }, { field: 'Status', op: 'notEqual', value: 'Closed' }], ['Name', 'Subject', 'AccountId', 'Status', 'OwnerId'], { field: 'CreatedDate', dir: 'desc' });
  lv('Account', 'Customers', [{ field: 'Type', op: 'startsWith', value: 'Customer' }], ['Name', 'Industry', 'BillingCountry', 'AnnualRevenue', 'OwnerId'], { field: 'Name', dir: 'asc' });
  lv('Account', 'Tech & Finance Accounts', [{ field: 'Industry', op: 'equals', value: 'Technology,Finance,Banking' }], ['Name', 'Industry', 'AnnualRevenue', 'Rating', 'OwnerId'], { field: 'AnnualRevenue', dir: 'desc' });
  lv('Task', 'Open Tasks', [{ field: 'Status', op: 'notEqual', value: 'Completed' }], ['Name', 'WhoId', 'WhatId', 'ActivityDate', 'Priority', 'OwnerId'], { field: 'ActivityDate', dir: 'asc' });
  lv('Project__c', 'Active Projects', [{ field: 'Status__c', op: 'equals', value: 'Planning,In Progress' }], ['Name', 'Account__c', 'Status__c', 'Health__c', 'Percent_Complete__c', 'End_Date__c'], { field: 'End_Date__c', dir: 'asc' }, { kanbanField: 'Health__c', kanbanSummary: 'Budget__c' });

  // Validation rules
  const vr = (object, name, formula, errorMessage, errorField, description) => saveMeta('validationRule', { object, name, formula, errorMessage, errorField, description, active: true });
  vr('Opportunity', 'Amount_Not_Negative', 'Amount < 0', 'Amount cannot be negative.', 'Amount', 'Prevents negative opportunity amounts.');
  vr('Opportunity', 'Large_Deal_Needs_Approval', "AND(ISPICKVAL(StageName, 'Closed Won'), Amount >= 100000, NOT(ISPICKVAL(Approval_Status__c, 'Approved')))",
    'Deals of $100,000 or more must be approved before they can be Closed Won. Use "Submit for Approval".', 'StageName', 'Ties the stage to the Large Deal Approval process.');
  vr('Account', 'Website_Format', "AND(NOT(ISBLANK(Website)), NOT(BEGINS(Website, 'http')))", 'Website must start with http:// or https://', 'Website', 'Keeps website links clickable.');
  vr('Event', 'End_After_Start', 'EndDateTime < StartDateTime', 'End must be after Start.', 'EndDateTime', '');
  vr('Case', 'Cannot_Reopen_Closed_Case', "AND(ISCHANGED(Status), ISPICKVAL(PRIORVALUE(Status), 'Closed'), $Profile.Name <> 'System Administrator')",
    'Closed cases cannot be reopened. Create a new case and link it as a child case.', 'Status', 'Only administrators can reopen cases.');
  vr('Project__c', 'Spent_Within_Budget', 'AND(NOT(ISBLANK(Budget__c)), Spent__c > Budget__c * 1.2)', 'Spent cannot exceed 120% of budget without a budget change.', 'Spent__c', '');

  // Flows
  const flow = (def) => saveMeta('flow', { version: 1, order: 0, onlyWhenChanged: false, filters: [], filterLogic: '', schedule: null, description: '', ...def, name: def.name || def.label.replace(/\W+/g, '_') });
  flow({ label: 'Opportunity: Set Probability & Forecast', flowType: 'record', object: 'Opportunity', trigger: 'createOrUpdate', timing: 'before', active: true,
    description: 'Before-save flow: keeps Probability and Forecast Category in sync with the Stage.',
    condition: 'OR(ISNEW(), ISCHANGED(StageName))',
    elements: [{ id: 'el1', type: 'update', label: 'Set probability & forecast category', assignments: [
      { field: 'Probability', isFormula: true, value: "CASE(StageName, 'Prospecting', 10, 'Qualification', 20, 'Needs Analysis', 30, 'Value Proposition', 40, 'Proposal/Price Quote', 75, 'Negotiation/Review', 90, 'Closed Won', 100, 0)" },
      { field: 'ForecastCategoryName', isFormula: true, value: "CASE(StageName, 'Closed Won', 'Closed', 'Closed Lost', 'Omitted', 'Negotiation/Review', 'Commit', 'Proposal/Price Quote', 'Best Case', 'Pipeline')" },
    ] }] });
  flow({ label: 'Opportunity: Celebrate Closed Won', flowType: 'record', object: 'Opportunity', trigger: 'createOrUpdate', timing: 'after', active: true, onlyWhenChanged: true,
    description: 'Posts to the feed, notifies the owner\'s manager and creates a kickoff task when a deal is won.',
    condition: "ISPICKVAL(StageName, 'Closed Won')",
    elements: [
      { id: 'el1', type: 'post', label: 'Post to feed', body: '🎉 Closed Won! {!Name} for {!Account.Name} — ${!TEXT(Amount)}' },
      { id: 'el2', type: 'notify', label: 'Notify manager', recipient: 'ownerManager', title: 'Deal won: {!Name}', body: '{!Owner.Name} closed {!Name} for ${!TEXT(Amount)}.' },
      { id: 'el3', type: 'task', label: 'Kickoff task', subject: 'Schedule kickoff with {!Account.Name}', dueInDays: 3, priority: 'High', assignTo: 'owner' },
    ] });
  flow({ label: 'Case: Set Closed Date & Escalation', flowType: 'record', object: 'Case', trigger: 'createOrUpdate', timing: 'before', active: true,
    description: 'Stamps Closed Date and keeps the Escalated checkbox in sync with Status.',
    condition: '',
    elements: [
      { id: 'el1', type: 'update', label: 'Stamp closed date', condition: "AND(ISPICKVAL(Status, 'Closed'), ISBLANK(ClosedDate))", assignments: [{ field: 'ClosedDate', isFormula: true, value: 'NOW()' }] },
      { id: 'el2', type: 'update', label: 'Clear closed date on reopen', condition: "AND(NOT(ISPICKVAL(Status, 'Closed')), NOT(ISBLANK(ClosedDate)))", assignments: [{ field: 'ClosedDate', isFormula: true, value: 'NULL' }] },
      { id: 'el3', type: 'update', label: 'Flag escalation', condition: "ISPICKVAL(Status, 'Escalated')", assignments: [{ field: 'IsEscalated', isFormula: true, value: 'TRUE' }] },
    ] });
  flow({ label: 'Case: Alert on High Priority', flowType: 'record', object: 'Case', trigger: 'createOrUpdate', timing: 'after', active: true, onlyWhenChanged: true,
    description: 'Notifies the owner and emails the support manager when a case becomes high priority.',
    condition: "ISPICKVAL(Priority, 'High')",
    elements: [
      { id: 'el1', type: 'notify', label: 'Notify owner', recipient: 'owner', title: 'High priority case {!Name}', body: '{!Subject}' },
      { id: 'el2', type: 'email', label: 'Email support manager', to: 'support.mgr@slavy.dev', subject: 'High priority case {!Name}: {!Subject}', body: 'Account: {!Account.Name}\nContact: {!Contact.Name}\n\n{!Description}' },
    ] });
  flow({ label: 'Lead: Route Web Leads to Queue', flowType: 'record', object: 'Lead', trigger: 'create', timing: 'before', active: true,
    description: 'Web leads go to the Unassigned Leads queue for triage.',
    condition: "ISPICKVAL(LeadSource, 'Web')",
    elements: [{ id: 'el1', type: 'update', label: 'Assign to queue', assignments: [{ field: 'OwnerId', isFormula: false, value: leadQueue }] }] });
  flow({ label: 'Opportunity Product: Default Sales Price', flowType: 'record', object: 'OpportunityLineItem', trigger: 'create', timing: 'before', active: true,
    description: 'Copies the product list price when no sales price is entered.',
    condition: 'ISBLANK(UnitPrice)',
    elements: [{ id: 'el1', type: 'update', label: 'Copy list price', assignments: [{ field: 'UnitPrice', isFormula: true, value: 'Product2.ListPrice' }] }] });
  flow({ label: 'Daily: Flag Overdue Opportunities', flowType: 'scheduled', object: 'Opportunity', active: false,
    description: 'Every morning, creates a follow-up task for open opportunities whose close date has passed.',
    filters: [{ field: 'IsClosed', op: 'equals', value: 'false' }, { field: 'CloseDate', op: 'lessThan', value: 'TODAY' }], schedule: { frequency: 'daily', time: '07:00' },
    elements: [{ id: 'el1', type: 'task', label: 'Create follow-up', subject: 'Update close date: {!Name}', dueInDays: 1, priority: 'High', assignTo: 'owner' }] });
  const escalateFlow = flow({ label: 'Escalate Case to Manager', flowType: 'autolaunched', object: 'Case', active: true,
    description: 'Autolaunched flow used by the "Escalate" quick action.',
    elements: [
      { id: 'el1', type: 'update', label: 'Escalate', assignments: [{ field: 'Status', value: 'Escalated' }, { field: 'Priority', value: 'High' }] },
      { id: 'el2', type: 'notify', label: 'Tell the manager', recipient: 'ownerManager', title: 'Case {!Name} escalated', body: '{!Subject}' },
      { id: 'el3', type: 'post', label: 'Post to feed', body: 'Case escalated to management by {!$User.Name}.' },
    ] });

  // Approval process
  saveMeta('approvalProcess', { name: 'Large_Deal_Approval', label: 'Large Deal Approval', object: 'Opportunity', active: true, order: 1,
    description: 'Opportunities of $100,000 or more need manager approval before they can be Closed Won.',
    entryCriteria: 'Amount >= 100000', approver: { kind: 'manager' },
    onSubmit: [{ field: 'Approval_Status__c', value: 'Pending' }], onApprove: [{ field: 'Approval_Status__c', value: 'Approved' }],
    onReject: [{ field: 'Approval_Status__c', value: 'Rejected' }], onRecall: [{ field: 'Approval_Status__c', value: 'Not Submitted' }] });
  saveMeta('approvalProcess', { name: 'Contract_Activation', label: 'Contract Activation', object: 'Contract', active: true, order: 1,
    description: 'Contracts need manager approval to be activated.', entryCriteria: "ISPICKVAL(Status, 'Draft')", approver: { kind: 'manager' },
    onSubmit: [{ field: 'Status', value: 'In Approval Process' }], onApprove: [{ field: 'Status', value: 'Activated' }], onReject: [{ field: 'Status', value: 'Draft' }], onRecall: [{ field: 'Status', value: 'Draft' }] });

  // Quick actions
  saveMeta('action', { name: 'Escalate', label: 'Escalate', object: 'Case', actionType: 'flow', flowId: escalateFlow.id, confirm: 'Escalate this case to the owner\'s manager?', successMessage: 'Case escalated', active: true });
  saveMeta('action', { name: 'Close_Case', label: 'Close Case', object: 'Case', actionType: 'update', assignments: [{ field: 'Status', value: 'Closed' }], fields: ['Reason'], successMessage: 'Case closed', active: true });
  saveMeta('action', { name: 'Mark_Lost', label: 'Mark Closed Lost', object: 'Opportunity', actionType: 'update', assignments: [{ field: 'StageName', value: 'Closed Lost' }], fields: ['Description'], confirm: 'Mark this opportunity as Closed Lost?', successMessage: 'Opportunity closed lost', active: true });
  saveMeta('action', { name: 'New_Case', label: 'New Case', object: 'Account', actionType: 'create', childObject: 'Case', lookupField: 'AccountId', fields: ['Subject', 'Priority', 'Origin', 'Description'], successMessage: 'Case created', active: true });
  saveMeta('action', { name: 'Map', label: 'View on Map', object: 'Account', actionType: 'url', url: 'https://www.openstreetmap.org/search?query={!BillingCity}%20{!BillingCountry}', active: true });
  saveMeta('action', { name: 'Add_Product', label: 'Add Product', object: 'Opportunity', actionType: 'create', childObject: 'OpportunityLineItem', lookupField: 'OpportunityId', fields: ['Product2Id', 'Quantity', 'UnitPrice', 'Discount'], successMessage: 'Product added', active: true });

  // Web-to-Lead / Web-to-Case
  setOrgSetting('webToLead', { enabled: true, defaultOwnerId: user.admin, fields: ['FirstName', 'LastName', 'Company', 'Email', 'Phone', 'Title', 'Description'] });
  setOrgSetting('webToCase', { enabled: true, defaultOwnerId: user.agent, fields: ['SuppliedName', 'SuppliedEmail', 'SuppliedPhone', 'Subject', 'Description', 'Priority'] });

  // Prompt templates (Prompt Builder)
  const pt = (def) => saveMeta('promptTemplate', { active: true, description: '', outputField: null, ...def, name: def.label.replace(/\W+/g, '_') });
  const briefing = pt({ label: 'Account Briefing', object: 'Account', templateType: 'field', outputField: 'AI_Briefing__c',
    description: 'A short briefing for account owners, stored on the account.',
    instructions: 'Write a briefing (max 120 words) for {!$User.Name} about the account {!Name} ({!TEXT(Industry)}, {!BillingCity}).\nCover: relationship status, open pipeline ({!TEXT(OpenPipeline__c)}), open cases and the single most important next step.\n\nAccount data:\n{!RecordDetails}' });
  pt({ label: 'Case Reply', object: 'Case', templateType: 'email',
    description: 'Draft an empathetic customer reply for a case.',
    instructions: 'Draft a reply email to {!Contact.Name} about case {!Name}: "{!Subject}".\nBe empathetic, explain the next steps clearly and sign as {!$User.FirstName}. Status is {!TEXT(Status)}, priority {!TEXT(Priority)}.\n\nCase details:\n{!RecordDetails}' });
  pt({ label: 'Deal Coaching', object: 'Opportunity', templateType: 'flex',
    description: 'Coaching tips to move a deal forward.',
    instructions: 'Act as an experienced sales coach. The opportunity {!Name} ({!TEXT(StageName)}, {!TEXT(Amount)}, closing {!TEXT(CloseDate)}) is owned by {!Owner.Name}.\nGive 3-5 concrete coaching tips to win this deal, and list the main risks.\n\nDeal data:\n{!RecordDetails}' });
  pt({ label: 'Lead Qualification Notes', object: 'Lead', templateType: 'field', outputField: 'Description',
    description: 'BANT-style qualification notes stored in the lead description.',
    instructions: 'Write short BANT qualification notes (Budget, Authority, Need, Timeline) for the lead {!Name}, {!Title} at {!Company} ({!TEXT(Industry)}, {!TEXT(NumberOfEmployees)} employees). Mark unknowns as "To discover".\n\nLead data:\n{!RecordDetails}' });
  void briefing;

  seedData(user, { leadQueue, supportQueue });
  seedAnalytics(user);
}

function seedData(user, { supportQueue }) {
  const ctx = systemContext(getUser(user.admin));
  const today = todayStr();
  const salesOwners = [user.rep1, user.rep2, user.rep1, user.rep2, user.mgr, user.vp, user.admin, user.admin];
  const supportOwners = [user.agent, user.agent, user.supmgr, supportQueue, user.admin];

  // Products
  const products = [
    ['Slavy Cloud Starter', 'SC-100', 'Software', 1200], ['Slavy Cloud Pro', 'SC-200', 'Software', 4800], ['Slavy Cloud Enterprise', 'SC-300', 'Software', 18000],
    ['Edge Gateway G2', 'HW-210', 'Hardware', 2500], ['Sensor Pack (10)', 'HW-110', 'Hardware', 900], ['Implementation Services', 'SV-500', 'Services', 15000],
    ['Training Day', 'SV-120', 'Services', 2000], ['Premier Support (annual)', 'SP-900', 'Support', 9000], ['Data Migration Package', 'SV-610', 'Services', 7500], ['Analytics Add-on', 'SC-410', 'Software', 3600],
  ].map(([Name, ProductCode, Family, ListPrice]) => createRecord(ctx, 'Product2', { Name, ProductCode, Family, ListPrice, IsActive: true }));

  // Campaigns
  const campaigns = [
    ['Dreamforce-style Summit 2026', 'Conference', 'Completed', -120, -117, 80000, 76000],
    ['Q3 Product Webinar Series', 'Webinar', 'Completed', -90, -30, 15000, 12000],
    ['Fall Email Nurture', 'Email', 'In Progress', -20, 40, 5000, 2100],
    ['Industry Trade Show', 'Trade Show', 'Planned', 45, 48, 60000, null],
    ['Paid Search Q4', 'Advertisement', 'In Progress', -10, 80, 40000, 9000],
  ].map(([Name, Type, Status, s, e, BudgetedCost, ActualCost]) => createRecord(ctx, 'Campaign', {
    Name, Type, Status, StartDate: addDays(today, s), EndDate: addDays(today, e), BudgetedCost, ActualCost, ExpectedRevenue: BudgetedCost * 6, IsActive: Status !== 'Completed', OwnerId: user.mkt,
  }));

  // Accounts, contacts
  const accounts = [];
  const contacts = [];
  COMPANIES.forEach((name, i) => {
    const [city, state, country] = pick(CITIES);
    const type = i < 22 ? pick(['Customer - Direct', 'Customer - Channel']) : pick(['Prospect', 'Prospect', 'Partner', 'Other']);
    const id = createRecord(ctx, 'Account', {
      Name: name, Type: type, Industry: pick(INDUSTRIES.slice(0, 21)), AnnualRevenue: between(5, 900) * 100000, NumberOfEmployees: between(20, 20000),
      Rating: pick(['Hot', 'Warm', 'Cold']), Phone: `+1 ${between(200, 989)} 555 ${between(1000, 9999)}`, Website: `https://www.${name.toLowerCase().replace(/[^a-z]+/g, '')}.com`,
      BillingCity: city, BillingState: state, BillingCountry: country, BillingStreet: `${between(1, 999)} ${pick(['Main', 'Market', 'Oak', 'Pine', 'Harbor', 'Elm'])} St`,
      AccountNumber: `ACC-${String(1000 + i)}`, AccountSource: pick(LEAD_SOURCES), OwnerId: pick(salesOwners),
      Description: `${name} is a ${type.toLowerCase()} in ${city}.`,
    });
    accounts.push(id);
    const n = between(1, 4);
    for (let k = 0; k < n; k++) {
      const first = pick(FIRST), last = pick(LAST);
      contacts.push({ id: createRecord(ctx, 'Contact', {
        Salutation: pick(SALUTATIONS), FirstName: first, LastName: last, AccountId: id, Title: pick(TITLES),
        Email: `${first}.${last}@${name.toLowerCase().replace(/[^a-z]+/g, '')}.com`.toLowerCase(), Phone: `+1 ${between(200, 989)} 555 ${between(1000, 9999)}`,
        LeadSource: pick(LEAD_SOURCES), MailingCity: city, MailingCountry: country, Department: pick(['IT', 'Finance', 'Operations', 'Sales', 'Executive']),
        OwnerId: pick(salesOwners),
      }), accountId: id });
    }
  });
  // Parent accounts
  updateRecord(ctx, accounts[1], { ParentId: accounts[0] });
  updateRecord(ctx, accounts[2], { ParentId: accounts[0] });

  // Opportunities
  const opps = [];
  for (let i = 0; i < 64; i++) {
    const acc = pick(accounts);
    const src = pick(LEAD_SOURCES);
    const winP = ['Partner Referral', 'Employee Referral'].includes(src) ? 0.8 : src === 'Purchased List' ? 0.2 : 0.5;
    const stage = i < 26 ? (rand() < winP ? 'Closed Won' : 'Closed Lost') : pick(STAGES.slice(0, 6)).value;
    const closed = stage.startsWith('Closed');
    let amount = between(8, 240) * 1000;
    const won = stage === 'Closed Won';
    const id = createRecord(ctx, 'Opportunity', {
      Name: `${COMPANIES[accounts.indexOf(acc)]} - ${pick(['Platform Expansion', 'New Deployment', 'Renewal', 'Add-on Licenses', 'Services Engagement', 'Pilot'])}`,
      AccountId: acc, StageName: stage, Amount: amount, CloseDate: addDays(today, closed ? -between(1, 300) : between(-10, 120)),
      Type: pick(['New Customer', 'Existing Customer - Upgrade', 'Existing Customer - Replacement']), LeadSource: src,
      CampaignId: rand() < 0.4 ? pick(campaigns) : null, NextStep: closed ? '' : pick(['Send proposal', 'Schedule demo', 'Legal review', 'Pricing call', 'Executive sponsor meeting']),
      OwnerId: pick(salesOwners), Approval_Status__c: won && amount >= 100000 ? 'Approved' : 'Not Submitted',
    });
    opps.push({ id, stage, amount });
  }
  // Line items for some opportunities
  for (const o of opps.slice(0, 30)) {
    for (let k = 0; k < between(1, 3); k++) {
      createRecord(ctx, 'OpportunityLineItem', { OpportunityId: o.id, Product2Id: pick(products), Quantity: between(1, 10), Discount: pick([0, 0, 5, 10, 15]) });
    }
  }

  // Leads
  const leadStatuses = ['Open - Not Contacted', 'Open - Not Contacted', 'Working - Contacted', 'Working - Contacted', 'Closed - Not Converted'];
  const leads = [];
  for (let i = 0; i < 45; i++) {
    const first = pick(FIRST), last = pick(LAST);
    const company = `${pick(['Northwind', 'Contoso', 'Fabrikam', 'Tailspin', 'Litware', 'Adatum', 'Proseware', 'Woodgrove', 'Lucerne', 'Alpine'])} ${pick(['Labs', 'Group', 'Partners', 'Health', 'Retail', 'Bank', 'Logistics', 'Studios'])}`;
    const [city, state, country] = pick(CITIES);
    const src = pick(LEAD_SOURCES.filter((s) => s !== 'Web'));
    leads.push(createRecord(ctx, 'Lead', {
      Salutation: pick(SALUTATIONS), FirstName: first, LastName: last, Company: company, Title: pick(TITLES), Email: `${first}.${last}@${company.toLowerCase().replace(/[^a-z]+/g, '')}.io`.toLowerCase(),
      Phone: `+1 ${between(200, 989)} 555 ${between(1000, 9999)}`, Status: pick(leadStatuses), LeadSource: i % 9 === 0 ? 'Web' : src, Industry: pick(INDUSTRIES.slice(0, 21)),
      Rating: pick(['Hot', 'Warm', 'Cold']), AnnualRevenue: between(1, 200) * 100000, NumberOfEmployees: between(5, 5000), City: city, State: state, Country: country,
      OwnerId: pick([user.rep1, user.rep2, user.mgr]),
    }));
  }

  // History for predictive Lead Scoring: some leads converted, some disqualified, with realistic signal.
  const sysLead = systemContext(getUser(user.admin));
  leads.forEach((id, i) => {
    if (i % 3 === 0) return; // keep a third open
    const raw = db.prepare('SELECT data FROM records WHERE id = ?').get(id);
    const d = JSON.parse(raw.data);
    let p = { Hot: 0.7, Warm: 0.4, Cold: 0.15 }[d.Rating] ?? 0.3;
    if (['Partner Referral', 'Employee Referral', 'Web'].includes(d.LeadSource)) p += 0.2;
    if (d.LeadSource === 'Purchased List') p -= 0.15;
    if (/CEO|CTO|CFO|COO|VP|Head/.test(d.Title || '')) p += 0.1;
    if (rand() < p) updateRecord(sysLead, id, { Status: 'Closed - Converted', IsConverted: true, ConvertedDate: addDays(today, -between(5, 150)) }, { trusted: true });
    else updateRecord(sysLead, id, { Status: 'Closed - Not Converted' }, { trusted: true });
  });

  // Campaign members
  campaigns.forEach((c, ci) => {
    const n = between(6, 14);
    for (let k = 0; k < n; k++) {
      const useContact = rand() < 0.6;
      createRecord(ctx, 'CampaignMember', {
        CampaignId: c, ...(useContact ? { ContactId: pick(contacts).id } : { LeadId: pick(leads) }),
        Status: ci < 2 ? pick(['Sent', 'Responded', 'Responded']) : pick(['Planned', 'Sent', 'Responded']),
      });
    }
  });

  // Cases
  for (let i = 0; i < 48; i++) {
    const c = pick(contacts);
    const status = pick(['New', 'Working', 'Working', 'Escalated', 'Closed', 'Closed', 'Closed']);
    createRecord(ctx, 'Case', {
      Subject: pick(CASE_SUBJECTS), Description: 'Customer reported the issue via ' + pick(['phone', 'email', 'the web form']) + '. Details attached in the thread.',
      AccountId: c.accountId, ContactId: c.id, Status: status, Priority: pick(['High', 'Medium', 'Medium', 'Low']), Origin: pick(['Phone', 'Email', 'Web', 'Chat']),
      Type: pick(['Question', 'Problem', 'Problem', 'Feature Request']), Reason: pick(['Installation', 'Performance', 'Breakdown', 'Feedback', 'Other']),
      OwnerId: pick(supportOwners),
    });
  }

  // Contracts
  for (let i = 0; i < 10; i++) {
    createRecord(ctx, 'Contract', { AccountId: accounts[i], Status: i < 6 ? 'Activated' : 'Draft', StartDate: addDays(today, -between(30, 400)), ContractTerm: pick([12, 24, 36]), ContractValue__c: between(20, 400) * 1000, OwnerId: pick(salesOwners) });
  }

  // Projects (custom object)
  const projNames = ['ERP Integration', 'Customer Portal Launch', 'Data Warehouse Migration', 'Field Service Rollout', 'Analytics Modernization', 'Mobile App Pilot', 'Security Hardening', 'Onboarding Automation'];
  projNames.forEach((name, i) => {
    const won = opps.filter((o) => o.stage === 'Closed Won');
    const budget = between(40, 300) * 1000;
    createRecord(ctx, 'Project__c', {
      Name: name, Account__c: accounts[i * 2], Opportunity__c: won[i % won.length]?.id, Status__c: pick(['Planning', 'In Progress', 'In Progress', 'On Hold', 'Completed']),
      Health__c: pick(['Green', 'Green', 'Yellow', 'Red']), Budget__c: budget, Spent__c: Math.round(budget * rand() * 0.9), Percent_Complete__c: between(5, 100),
      Start_Date__c: addDays(today, -between(10, 120)), End_Date__c: addDays(today, between(10, 200)), Workstreams__c: 'Discovery;Build', OwnerId: pick([user.mgr, user.rep1, user.admin]),
    });
  });

  // Activities
  const subjects = ['Call to discuss requirements', 'Send pricing proposal', 'Follow up on demo', 'Prepare QBR deck', 'Check implementation status', 'Confirm renewal terms', 'Intro call'];
  for (let i = 0; i < 60; i++) {
    const c = pick(contacts);
    const done = rand() < 0.4;
    createRecord(ctx, 'Task', {
      Name: pick(subjects), WhoId: c.id, WhatId: rand() < 0.5 ? c.accountId : pick(opps).id, ActivityDate: addDays(today, done ? -between(1, 40) : between(-3, 20)),
      Status: done ? 'Completed' : pick(['Not Started', 'In Progress']), Priority: pick(['High', 'Normal', 'Normal', 'Low']), TaskSubtype: pick(['Task', 'Call', 'Call', 'Email']),
      OwnerId: pick([user.rep1, user.rep2, user.mgr, user.admin]), Description: done ? 'Spoke with the customer, next steps agreed.' : '',
    });
  }
  for (let i = 0; i < 24; i++) {
    const c = pick(contacts);
    const start = new Date(Date.now() + between(-20, 25) * 86400000);
    start.setUTCHours(between(14, 21), pick([0, 30]), 0, 0);
    createRecord(ctx, 'Event', {
      Name: pick(['Discovery meeting', 'Product demo', 'Executive briefing', 'Contract review', 'Onsite workshop', 'Lunch & learn']),
      WhoId: c.id, WhatId: c.accountId, StartDateTime: start.toISOString(), EndDateTime: new Date(start.getTime() + pick([30, 60, 90]) * 60000).toISOString(),
      Location: pick(['Zoom', 'Customer HQ', 'Our office', 'Google Meet']), ShowAs: 'Busy', OwnerId: pick([user.rep1, user.rep2, user.mgr, user.admin]),
    });
  }

  // Spread created dates over the last 6 months so reports look realistic.
  for (const row of db.prepare("SELECT id, object FROM records WHERE object NOT IN ('Task', 'Event')").all()) {
    const d = new Date(Date.now() - between(1, 180) * 86400000 - between(0, 86000) * 1000).toISOString();
    run('UPDATE records SET created_at = ?, modified_at = ? WHERE id = ?', d, d, row.id);
  }

  // A few feed posts
  const post = (parent, by, body) => run('INSERT INTO feed(id, parent_id, type, body, data, created_by, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)', newId(PREFIX.Feed), parent, 'post', body, by, new Date(Date.now() - between(1, 72) * 3600000).toISOString());
  post(accounts[0], user.rep1, 'Met with their CTO today — they want to expand to 3 new regions next quarter. @Jordan Lee can we get a solutions engineer on the next call?');
  post(accounts[0], user.mgr, 'Great news! I will loop in the SE team.');
  post(opps[25].id, user.rep2, 'Legal review is done, waiting for the signed order form.');
  post(accounts[3], user.agent, 'Heads up: three open support cases this week for this account. Might be worth a check-in call.');
}

function seedAnalytics(user) {
  const rep = (def) => saveMeta('report', { visibility: 'public', folder: 'Shared Reports', ownerId: user.admin, scope: 'all', filters: [], filterLogic: '', groupings: [], colGroupings: [], aggregates: [], showDetails: true, description: '', ...def });
  const pipeline = rep({ name: 'Pipeline by Stage', object: 'Opportunity', format: 'summary', folder: 'Sales Reports', description: 'Open opportunities grouped by stage.',
    columns: ['Name', 'Account.Name', 'Amount', 'CloseDate', 'OwnerId'], filters: [{ field: 'IsClosed', op: 'equals', value: 'false' }],
    groupings: [{ field: 'StageName' }], aggregates: [{ op: 'sum', field: 'Amount' }], chart: { type: 'funnel' }, sort: { field: 'Amount', dir: 'desc' } });
  const byOwner = rep({ name: 'Pipeline by Owner and Stage', object: 'Opportunity', format: 'matrix', folder: 'Sales Reports',
    columns: ['Name', 'Amount'], filters: [{ field: 'IsClosed', op: 'equals', value: 'false' }], groupings: [{ field: 'OwnerId' }], colGroupings: [{ field: 'StageName' }],
    aggregates: [{ op: 'sum', field: 'Amount' }], chart: { type: 'bar' } });
  const wonByMonth = rep({ name: 'Closed Won by Month', object: 'Opportunity', format: 'summary', folder: 'Sales Reports',
    columns: ['Name', 'Account.Name', 'Amount', 'OwnerId'], filters: [{ field: 'StageName', op: 'equals', value: 'Closed Won' }, { field: 'CloseDate', op: 'equals', value: 'LAST_N_MONTHS:12' }],
    groupings: [{ field: 'CloseDate', dateGranularity: 'month' }], aggregates: [{ op: 'sum', field: 'Amount' }], chart: { type: 'line' } });
  const leadsBySource = rep({ name: 'Leads by Source', object: 'Lead', format: 'summary', folder: 'Marketing Reports', columns: ['Name', 'Company', 'Status', 'OwnerId'],
    groupings: [{ field: 'LeadSource' }], aggregates: [], chart: { type: 'donut' } });
  const casesByStatus = rep({ name: 'Cases by Status', object: 'Case', format: 'summary', folder: 'Service Reports', columns: ['Name', 'Subject', 'Priority', 'Account.Name', 'OwnerId'],
    groupings: [{ field: 'Status' }], chart: { type: 'donut' } });
  const casesMatrix = rep({ name: 'Open Cases by Priority and Origin', object: 'Case', format: 'matrix', folder: 'Service Reports', columns: ['Name', 'Subject'],
    filters: [{ field: 'Status', op: 'notEqual', value: 'Closed' }], groupings: [{ field: 'Priority' }], colGroupings: [{ field: 'Origin' }], chart: { type: 'column' } });
  rep({ name: 'Accounts by Industry', object: 'Account', format: 'summary', folder: 'Sales Reports', columns: ['Name', 'Type', 'BillingCountry', 'AnnualRevenue'],
    groupings: [{ field: 'Industry' }], aggregates: [{ op: 'sum', field: 'AnnualRevenue' }], chart: { type: 'bar' } });
  rep({ name: 'Open Tasks', object: 'Task', format: 'tabular', folder: 'Activity Reports', columns: ['Name', 'WhoId', 'WhatId', 'ActivityDate', 'Priority', 'OwnerId'],
    filters: [{ field: 'Status', op: 'notEqual', value: 'Completed' }], sort: { field: 'ActivityDate', dir: 'asc' } });
  const openCases = rep({ name: 'Open Cases', object: 'Case', format: 'tabular', folder: 'Service Reports', columns: ['Name', 'Subject', 'Status', 'Priority', 'OwnerId'],
    filters: [{ field: 'Status', op: 'notEqual', value: 'Closed' }] });
  const campaignRoi = rep({ name: 'Campaign Performance', object: 'Campaign', format: 'summary', folder: 'Marketing Reports', columns: ['Name', 'Status', 'BudgetedCost', 'ActualCost', 'WonAmount__c'],
    groupings: [{ field: 'Type' }], aggregates: [{ op: 'sum', field: 'WonAmount__c' }, { op: 'sum', field: 'ActualCost' }], chart: { type: 'column' } });

  saveMeta('dashboard', { name: 'Sales Executive Dashboard', description: 'Pipeline health and wins at a glance.', visibility: 'public', folder: 'Sales Dashboards',
    ownerId: user.admin, runningUser: user.admin, columns: 3, components: [
      { id: 'c1', reportId: pipeline.id, type: 'metric', title: 'Open Pipeline', size: 'small', footer: 'All open opportunities' },
      { id: 'c2', reportId: wonByMonth.id, type: 'metric', title: 'Won (last 12 months)', size: 'small' },
      { id: 'c3', reportId: pipeline.id, type: 'gauge', title: 'Pipeline vs. Target', size: 'small', gauge: { min: 0, max: 6000000, breakpoints: [2000000, 4000000] } },
      { id: 'c4', reportId: pipeline.id, type: 'funnel', title: 'Pipeline by Stage', size: 'medium' },
      { id: 'c5', reportId: wonByMonth.id, type: 'line', title: 'Closed Won Trend', size: 'medium' },
      { id: 'c6', reportId: byOwner.id, type: 'bar', title: 'Pipeline by Owner', size: 'medium' },
      { id: 'c7', reportId: leadsBySource.id, type: 'donut', title: 'Leads by Source', size: 'medium' },
      { id: 'c8', reportId: campaignRoi.id, type: 'column', title: 'Won Revenue by Campaign Type', size: 'medium' },
    ] });
  saveMeta('dashboard', { name: 'Service Dashboard', description: 'Case volume and backlog.', visibility: 'public', folder: 'Service Dashboards',
    ownerId: user.admin, runningUser: 'viewer', columns: 3, components: [
      { id: 'c1', reportId: openCases.id, type: 'metric', title: 'Open Cases', size: 'small' },
      { id: 'c2', reportId: casesByStatus.id, type: 'donut', title: 'Cases by Status', size: 'medium' },
      { id: 'c3', reportId: casesMatrix.id, type: 'column', title: 'Open Cases by Priority & Origin', size: 'medium' },
      { id: 'c4', reportId: casesByStatus.id, type: 'table', title: 'Status Breakdown', size: 'small' },
    ] });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = Date.now();
  seed({ reset: process.argv.includes('--reset') });
  console.log(`Seeded Slavy demo org in ${Date.now() - started} ms. Log in as admin@slavy.dev / slavy123`);
}
