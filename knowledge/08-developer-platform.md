# Salesforce Developer Platform: Apex, SOQL, LWC, APIs, Integration, Tooling, DevOps

**What this file covers:** Pro-code development on Salesforce: Apex (language, triggers, async, security, testing, governor limits), SOQL/SOSL, Lightning Web Components, Aura/Visualforce (legacy).
Platform APIs (REST, SOAP, Bulk 2.0, Composite, GraphQL, Metadata, Tooling, Pub/Sub, Platform Events, CDC), integration patterns, and OAuth/authentication (Connected Apps vs External Client Apps).
Tooling and lifecycle: `sf` CLI, Salesforce DX, VS Code/Agentforce Vibes, Developer Console, debugging, orgs, packaging, deployment, code analysis, AppExchange, Heroku, and Agentforce developer hooks.

> Currency note (as of Oct 2026): Winter '27 is rolling out (final wave ~Oct 9, 2026) = **API v68.0**. Summer '26 = v67.0, Spring '26 = v66.0, Winter '26 = v65.0. Each release adds +1.0 (three per year). Items that may change are marked **(verify)**.

---

## 1. Apex Language

### 1.1 Basics
- Strongly typed, object-oriented, Java-like; compiled and run on Salesforce multitenant servers. **Case-insensitive** (identifiers, keywords, field names).
- Runs in **system mode** by default (ignores object/field permissions, and sharing unless declared). Use `with sharing`, `WITH USER_MODE`, `AccessLevel.USER_MODE`, or `stripInaccessible` to enforce user access.
- Each class has an `apiVersion` in its `-meta.xml`. Behavior can differ by version.
- Statements end with `;`. Comments are `//` and `/* */`. Strings use **single quotes only**.
- Equality: `==` is case-insensitive for Strings and compares values for sObjects and collections. `===` checks reference identity.
- Null-safe navigation `?.` (API 50+). Null coalescing `??` (API 60+, Spring '24).
- Switch: `switch on expr { when 'a', 'b' { } when null { } when else { } }`. Also works on sObject type: `when Account a { }`.
- Ternary, `instanceof`, casting `(Account) obj`, `for (Account a : accts)`, `for (Account a : [SELECT ...])` (SOQL for loop, batches of 200 internally, heap-friendly).

### 1.2 Data types

| Category | Types |
|---|---|
| Primitives | `Blob`, `Boolean`, `Date`, `Datetime`, `Time`, `Decimal`, `Double`, `Integer` (32-bit), `Long` (64-bit), `Id` (15/18 char), `String`, `Object` |
| sObjects | `Account`, `My_Obj__c`, generic `SObject` |
| Collections | `List<T>` (ordered, = array `T[]`), `Set<T>` (unique, unordered), `Map<K,V>` |
| Enums | `public enum Season { WINTER, SPRING }` plus built-ins like `System.LoggingLevel`, `Trigger.operationType` |
| Others | classes, interfaces, `System.Type`, `JSON`, `Schema.*` describe types |

- Uninitialized variables are `null` (even Boolean and Integer). Always initialize.
- `Decimal` is used for Currency fields. `Id` validates format on assignment (throws `StringException`).
- `Datetime` is stored in UTC and displayed in user TZ. `Date.today()`, `Datetime.now()`, `System.now()`.

### 1.3 Collections cheat sheet
```apex
List<Account> accs = new List<Account>();
List<String> names = new List<String>{'a', 'b'};
Set<Id> ids = new Set<Id>();
Map<Id, Account> m = new Map<Id, Account>([SELECT Id, Name FROM Account LIMIT 10]);
m.keySet(); m.values(); m.containsKey(x); m.get(x); m.put(k, v);
accs.add(a); accs.size(); accs.isEmpty(); accs.sort(); accs.contains(x);
names.addAll(otherList); ids.retainAll(otherSet); ids.removeAll(otherSet);
```
- Map from list: `new Map<Id, SObject>(listOfSObjects)` keys by Id.
- Comparable/Comparator: implement `Comparable.compareTo(Object)` or use `List.sort(Comparator<T>)` (API 60+).
- No hard collection size limit; bounded by heap.

### 1.4 Classes, interfaces, modifiers
```apex
public with sharing class InvoiceService implements Queueable, Database.AllowsCallouts {
    public static final Integer MAX = 200;           // constant
    private Map<Id, Invoice__c> cache;
    public String status { get; private set; }        // property
    public InvoiceService() { cache = new Map<Id, Invoice__c>(); }
    public void execute(QueueableContext ctx) { /* ... */ }
    @TestVisible private static Boolean flag = false;
}
public interface Discountable { Decimal discount(Decimal amount); }
public abstract class BaseHandler { public abstract void run(); public virtual void log() {} }
public class ChildHandler extends BaseHandler { public override void run() {} }
```

| Modifier | Meaning |
|---|---|
| `private` | Default. Visible in the defining class only |
| `protected` | Visible to inner classes and subclasses |
| `public` | Visible within the namespace/app |
| `global` | Visible everywhere, including outside a managed package namespace. Hard to remove once packaged |
| `virtual` / `abstract` | Allow extension or override. Classes are **final by default** |
| `static` | Class-level. Static variables persist only for the **transaction**, not across requests |
| `transient` | Not saved in view state (VF) or in serialized state |
| `final` | Assign once |

- Inner classes are one level deep only. Static initializer blocks: `static { }`.
- Annotations: `@AuraEnabled(cacheable=true)`, `@InvocableMethod`, `@InvocableVariable`, `@future`, `@isTest`, `@TestSetup`, `@TestVisible`, `@RestResource`, `@HttpGet/@HttpPost/@HttpPut/@HttpPatch/@HttpDelete`, `@ReadOnly`, `@RemoteAction`, `@Deprecated`, `@JsonAccess`, `@NamespaceAccessible`, `@SuppressWarnings`.

### 1.5 Sharing keywords

| Keyword | Behavior |
|---|---|
| `with sharing` | Enforces the running user's **record-level** sharing |
| `without sharing` | Ignores sharing (system context). Use deliberately, e.g. for guest or admin utilities |
| `inherited sharing` | Takes on the sharing mode of the **calling** class. If it's the entry point (Aura/LWC, VF, REST, Batch), it runs **with sharing** |
| (omitted) | Inherits from the caller. If it's the entry point, it effectively runs **without sharing** (except Aura/LWC entry points, where omitted runs with sharing as of later API versions, so be explicit) |

- Sharing keywords control **records only**. They do **not** enforce CRUD/FLS. Use user mode for those.
- The sharing setting is determined by the class where the method is **defined**, not where it's called from. Inner classes do not inherit the outer class's setting.
- Best practice: `with sharing` by default, `inherited sharing` for utility/service classes, `without sharing` only in narrow, documented inner classes.

### 1.6 Security: CRUD/FLS enforcement

| Mechanism | Usage | Notes |
|---|---|---|
| `WITH USER_MODE` (SOQL/SOSL) | `[SELECT Name FROM Account WITH USER_MODE]` | Enforces CRUD, FLS **and sharing**. Throws `QueryException` and reports **all** inaccessible fields. Recommended (GA Summer '23) |
| `WITH SYSTEM_MODE` | Explicit system mode | Default anyway |
| `AccessLevel.USER_MODE` | `Database.insert(recs, AccessLevel.USER_MODE)`; `Database.query(q, AccessLevel.USER_MODE)` | For DML and dynamic SOQL |
| DML keyword form | `insert as user acc;` / `update as system acc;` | Shorthand for user-mode DML |
| `WITH SECURITY_ENFORCED` | Older SOQL clause | FLS and CRUD only, not sharing. Fails on the first inaccessible field. Doesn't cover WHERE. **Superseded** by USER_MODE |
| `Security.stripInaccessible(AccessType.READABLE, records)` | Returns `SObjectAccessDecision`; `.getRecords()`, `.getRemovedFields()` | Silently strips fields instead of throwing. Good for graceful degradation |
| Describe checks | `Schema.sObjectType.Account.fields.Name.isAccessible()`, `isCreateable()`, `isUpdateable()`, `isDeletable()` | Manual, verbose (legacy pattern) |
| Permission set session activation | `AccessLevel.withPermissionSetId(psId)` (verify) | Run user mode with an extra perm set |

- Avoid SOQL injection. Use bind variables (`:var`), `Database.queryWithBinds(q, bindMap, AccessLevel)`, or `String.escapeSingleQuotes()`.

### 1.7 Exceptions
```apex
try {
    insert acc;
} catch (DmlException e) {
    for (Integer i = 0; i < e.getNumDml(); i++) { System.debug(e.getDmlMessage(i)); }
} catch (Exception e) {
    System.debug(LoggingLevel.ERROR, e.getMessage() + ' ' + e.getStackTraceString());
    throw new MyCustomException('Wrapped: ' + e.getMessage(), e);
} finally { /* cleanup */ }

public class MyCustomException extends Exception {}   // name must end with "Exception"
```
- Built-ins: `DmlException`, `QueryException` (e.g., "List has no rows for assignment to SObject"), `NullPointerException`, `ListException`, `LimitException` (**cannot be caught**), `CalloutException`, `JSONException`, `StringException`, `TypeException`, `NoAccessException`, `AuraHandledException` (for LWC/Aura, which sees the message), `System.AsyncException`.
- In triggers, use `record.addError('msg')` or `record.Field__c.addError('msg')` to block the save with a user-facing message and roll back that record.
- `Database.setSavepoint()` / `Database.rollback(sp)` for partial transaction control. Savepoints count toward the DML limit.
- An uncaught exception rolls back the whole transaction (except already-published "Publish Immediately" platform events).

### 1.8 DML statements vs Database methods

| | DML statements | `Database` class methods |
|---|---|---|
| Syntax | `insert`, `update`, `upsert x Ext_Id__c`, `delete`, `undelete`, `merge` | `Database.insert(recs, allOrNone)`, `.update`, `.upsert`, `.delete`, `.undelete`, `.merge`, `.convertLead`, `.emptyRecycleBin` |
| Partial success | No. Any failure throws and rolls back all | `allOrNone=false` returns `SaveResult[]`, `UpsertResult[]`, `DeleteResult[]` with per-record `isSuccess()` / `getErrors()` |
| Extra options | `as user` / `as system` | `Database.DMLOptions` (assignment rules, truncation, duplicate rule header, email header), `AccessLevel` |
| Async / big object | | `Database.insertAsync`, `Database.insertImmediate` (big objects / external objects) |

```apex
Database.SaveResult[] results = Database.insert(accs, false);
for (Database.SaveResult r : results) {
    if (!r.isSuccess()) for (Database.Error err : r.getErrors()) System.debug(err.getStatusCode() + ': ' + err.getMessage());
}
```
- **Mixed DML**: you can't do DML on setup objects (User, Group, PermissionSetAssignment, etc.) and non-setup objects in the same transaction. Separate them with `@future`/Queueable, or `System.runAs` in tests.
- Never put SOQL/DML inside loops. Bulkify: collect, then one DML.

---

## 2. Triggers

### 2.1 Syntax and events
```apex
trigger AccountTrigger on Account (before insert, before update, before delete,
                                   after insert, after update, after delete, after undelete) {
    AccountTriggerHandler.run();   // delegate; keep logic out of trigger
}
```

| Event | Typical use | Notes |
|---|---|---|
| before insert/update | Validate, set fields on `Trigger.new` (no DML needed) | Ids not yet assigned on insert |
| before delete | Prevent deletes (`addError`) | `Trigger.old` only |
| after insert/update | Related-record DML, callouts via async, use record Ids | `Trigger.new` is **read-only** |
| after delete | Clean up related data | |
| after undelete | Restore related data | `Trigger.new` only |

### 2.2 Context variables

| Variable | Meaning |
|---|---|
| `Trigger.isExecuting` | True if the current context is a trigger |
| `Trigger.isInsert/isUpdate/isDelete/isUndelete` | Operation |
| `Trigger.isBefore/isAfter` | Timing |
| `Trigger.new` | List of new versions (insert, update, undelete). Editable in **before** only |
| `Trigger.newMap` | Map Id to new record (before update, after insert/update/undelete) |
| `Trigger.old` / `Trigger.oldMap` | Old versions (update, delete) |
| `Trigger.operationType` | `System.TriggerOperation` enum, e.g. `BEFORE_INSERT`, `AFTER_UPDATE` |
| `Trigger.size` | Total records in invocation (old + new) |

- Triggers process records in **chunks of 200**. A 1,000-record DML fires the trigger 5 times in the same transaction (governor limits shared).
- Not fired by: cascade deletes of child records (non-master-detail), mass campaign status changes, some mass operations (e.g., renaming picklist values, mass address updates), and certain `*History` objects. Truncating custom objects doesn't fire them.
- Recursion: use a static `Set<Id>` of processed Ids (not a static Boolean, which breaks with >200 records).

### 2.3 Order of execution (save procedure, server-side)
1. Load the original record from the DB (or initialize for insert/upsert).
2. Load new field values and overwrite old. System validation: for UI saves, layout-specific required fields, field formats, max length. For API, foreign keys and restricted picklists (verify current exact list).
3. Run **before-save record-triggered flows** (fast field updates).
4. Run all **before triggers**.
5. Run most system validation again (required fields, formats) and **custom validation rules**.
6. Run **duplicate rules** (Block action stops the save).
7. **Save** the record to the DB (no commit yet).
8. Run all **after triggers**.
9. **Assignment rules** (Lead/Case).
10. **Auto-response rules**.
11. **Workflow rules** (legacy). If field updates happen, the record is updated again: before and after update triggers fire **one more time** (only once more), plus standard validations. Custom validation, duplicate rules, and flows are not re-run for that pass.
12. **Escalation rules**.
13. **Processes (Process Builder)** and flows launched by processes or workflow (legacy; order among them not guaranteed).
14. **After-save record-triggered flows** (ordered by Trigger Order 1-2000, then by name/API name).
15. **Entitlement rules**.
16. Parent **roll-up summary** recalculation. The parent goes through its own save procedure.
17. Grandparent roll-up summary recalculation (same).
18. **Criteria-based sharing** evaluation.
19. **Commit** all DML.
20. Post-commit: send emails, run enqueued async work (`@future`, Queueable), **asynchronous paths** of record-triggered flows, outbound messages, publish "after commit" platform events.

- Multiple triggers on the same object/event have **no guaranteed order**. That's why "one trigger per object" exists.
- Record-triggered flow ordering (Trigger Order) applies within before-save and within after-save groups.

### 2.4 Trigger frameworks / one-trigger-per-object
- Pattern: one trigger per object that delegates to a handler class with methods per context (`beforeInsert`, `afterUpdate`, ...).
- Popular frameworks: **Kevin O'Hara's TriggerHandler** (lightweight, bypass API), **fflib Apex Enterprise Patterns** (Domain/Selector/Service/Unit of Work), **Trigger Actions Framework** (Mitch Spano; metadata-driven ordering with `Trigger_Action__mdt`, mixes Apex and flow actions), **Nebula Core**.
- Features to look for: bypass per handler/user (custom setting or custom metadata), recursion control, max loop count, ordered actions, testability.
```apex
public virtual class TriggerHandler {
    public void run() {
        switch on Trigger.operationType {
            when BEFORE_INSERT { beforeInsert(); }
            when AFTER_UPDATE  { afterUpdate(); }
            when else {}
        }
    }
    protected virtual void beforeInsert() {}
    protected virtual void afterUpdate() {}
}
```

---

## 3. Asynchronous Apex

| Type | Declare | Params | Chaining | Monitoring | Best for |
|---|---|---|---|---|---|
| `@future` | `@future(callout=true) static void m(Set<Id> ids)` | Primitives/collections of primitives only (no sObjects) | No (future cannot call future) | No job Id returned | Simple fire-and-forget, callouts from triggers, mixed DML fix |
| Queueable | `implements Queueable` + `System.enqueueJob(obj)` | Any member types (sObjects, objects) | Yes, 1 child per job (unlimited depth in prod; dev/trial orgs limited to 5 deep (verify)) | Returns job Id; `AsyncApexJob` | Most async work. Preferred over future |
| Batch | `implements Database.Batchable<SObject>` + `Database.executeBatch(obj, scope)` | start/execute/finish | Call another batch from `finish()` | `AsyncApexJob`, Apex Jobs page | Large data volumes (up to 50M rows via QueryLocator) |
| Schedulable | `implements Schedulable` + `System.schedule(name, cron, obj)` | `execute(SchedulableContext)` | Can start batch/queueable | Scheduled Jobs, `CronTrigger` | Time-based jobs |
| Continuation | `new Continuation(timeoutSecs)` in VF/Aura/LWC `@AuraEnabled(continuation=true)` | Up to 3 parallel callouts | | | Long-running callouts from UI without blocking threads |

### 3.1 Queueable
```apex
public class SyncJob implements Queueable, Database.AllowsCallouts {
    private List<Id> ids;
    public SyncJob(List<Id> ids) { this.ids = ids; }
    public void execute(QueueableContext ctx) {
        // callouts allowed due to AllowsCallouts
        if (moreWork) System.enqueueJob(new SyncJob(remaining));
    }
}
Id jobId = System.enqueueJob(new SyncJob(ids));
// Options: delay 0-10 min, and duplicate signature
System.enqueueJob(new SyncJob(ids), 5);                       // delay minutes
AsyncOptions opts = new AsyncOptions(); opts.MaximumQueueableStackDepth = 10;
opts.DuplicateSignature = QueueableDuplicateSignature.Builder().addId(acctId).build();
System.enqueueJob(new SyncJob(ids), opts);
```
- `Finalizer` interface (`System.attachFinalizer(new MyFinalizer())`) runs after a Queueable completes or fails (even on uncaught exceptions/limits). Use it for retries and logging.
- `Database.AllowsCallouts` is required for callouts in Queueable and Batch. `Database.Stateful` keeps instance state across batch executes.

### 3.2 Batch Apex
```apex
public class CleanupBatch implements Database.Batchable<SObject>, Database.Stateful {
    Integer processed = 0;
    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator('SELECT Id FROM Log__c WHERE CreatedDate < LAST_N_DAYS:90');
    }
    public void execute(Database.BatchableContext bc, List<Log__c> scope) { delete scope; processed += scope.size(); }
    public void finish(Database.BatchableContext bc) { System.debug(processed); }
}
Id jobId = Database.executeBatch(new CleanupBatch(), 200);   // scope 1-2000, default 200
```
- `start` can return a `QueryLocator` (up to 50M records) or an `Iterable` (subject to the 50,000 SOQL row limit). `execute` gets fresh governor limits per chunk.
- Up to **5** batch jobs active or processing at once. The **Apex Flex Queue** holds up to **100** jobs in `Holding` status.
- `Database.RaisesPlatformEvents` lets the batch fire `BatchApexErrorEvent` on unhandled errors.

### 3.3 Schedulable
```apex
public class NightlyScheduler implements Schedulable {
    public void execute(SchedulableContext sc) { Database.executeBatch(new CleanupBatch()); }
}
// cron: Seconds Minutes Hours Day_of_month Month Day_of_week [Year]
System.schedule('Nightly 2am', '0 0 2 * * ?', new NightlyScheduler());
```
- Max **100** scheduled Apex jobs per org. Synchronous callouts aren't allowed directly in a scheduled `execute` (delegate to Queueable/future).
- A scheduled class can't be edited while a job is scheduled unless "Allow deployments of components when corresponding Apex jobs are pending or in progress" is enabled in Deployment Settings.

### 3.4 Other async
- **Platform Event triggers** (`after insert` on `__e`) run asynchronously as the Automated Process user. Batch size is configurable via `PlatformEventSubscriberConfig`.
- **Apex Cursors** (`Database.getCursor(query)`, `cursor.fetch(position, count)`) process up to 50M rows across chained Queueables; pagination cursors exist for UI. Check GA status **(verify)**.
- `System.Callable` interface for loosely coupled dynamic invocation.

---

## 4. Governor Limits (per transaction)

| Limit | Synchronous | Asynchronous |
|---|---|---|
| SOQL queries | **100** | **200** |
| Records retrieved by SOQL | **50,000** | 50,000 |
| Records via `Database.getQueryLocator` | 10,000 | 10,000 (Batch `start` QueryLocator: 50M) |
| SOSL queries | 20 | 20 |
| Records per SOSL query | 2,000 | 2,000 |
| DML statements | **150** | 150 |
| Records processed by DML (incl. `Database.emptyRecycleBin`) | **10,000** | 10,000 |
| Stack depth for recursive trigger/DML | 16 | 16 |
| Callouts (HTTP + web service) | **100** | 100 |
| Cumulative callout timeout | 120 s | 120 s |
| Single callout timeout | default 10 s, max 120 s | same |
| Callout request/response size | 6 MB | 12 MB |
| `@future` calls | 50 | 0 in batch/future (50 in Queueable (verify)) |
| `System.enqueueJob` | 50 | 1 |
| `Messaging.sendEmail` calls | 10 | 10 |
| Heap size | **6 MB** (Winter '27: **10 MB** (verify)) | **12 MB** (Winter '27: **25 MB** (verify)) |
| CPU time | **10,000 ms** | **60,000 ms** |
| Max transaction execution time | 10 min | 10 min |
| Push notification method calls | 10 | 10 |
| `EventBus.publish` calls (Publish Immediately) | 150 | 150 |
| Cursor.fetch calls | 100 | 100 |

**Other notable limits**
- Org-wide async Apex executions per 24 h: greater of **250,000** or **200 x user licenses**.
- Batch: 5 concurrent, 100 in Flex Queue. Scheduled jobs: 100. Batch `start` methods: 1 at a time (verify).
- Apex code size: **6 MB** per org (excluding managed packages and `@isTest` classes). A class can be 1M characters max.
- Concurrent long-running (>5 s) synchronous requests: 10 per org (verify).
- `Limits` class: `Limits.getQueries()` / `Limits.getLimitQueries()`, `getDmlStatements()`, `getCpuTime()`, `getHeapSize()`, `getCallouts()`. Use `OrgLimits.getMap()` for org-level limits.
- `@ReadOnly` (VF/web service/Schedulable) raises the SOQL row limit to 1M but disallows DML.

---

## 5. Testing Apex

### 5.1 Rules
- **75% org-wide code coverage** is required to deploy Apex to production, and **every trigger needs >0% (at least 1 line)** coverage. Each test must pass. Aim for 90%+ and meaningful asserts.
- Test classes and methods: `@isTest`. Test code doesn't count toward the 6 MB code limit or coverage denominators.
- Test data isn't visible by default (`@isTest(SeeAllData=true)` opens org data; avoid it). Some setup data (User, Profile, RecordType, Organization) is always visible.
- Tests don't commit data, and send no emails (sendEmail returns success but doesn't deliver).
- Callouts are **not allowed** in tests. Use mocks.
- `Test.startTest()` / `Test.stopTest()`: gives a **fresh set of governor limits** for the code between them. `stopTest()` forces **all async jobs** (future, queueable, batch (one execute), scheduled) enqueued after `startTest` to run synchronously.
- `@TestSetup` method runs once per class. Each test method gets a rolled-back copy of that data. Not allowed with `SeeAllData=true`.
- `System.runAs(user)` enforces **record sharing** (not FLS/CRUD) and avoids mixed-DML errors in tests.
- Assertions: `Assert.areEqual(expected, actual, msg)`, `Assert.isTrue`, `Assert.isNotNull`, `Assert.fail()` (the `Assert` class, API 56+). Legacy: `System.assertEquals`.
- `@isTest(isParallel=true)` allows parallel run. `Test.isRunningTest()`, `Test.getStandardPricebookId()`, `Test.setFixedSearchResults(ids)` for SOSL, `Test.loadData(Account.sObjectType, 'staticResourceName')`, `Test.enableChangeDataCapture()`, `Test.getEventBus().deliver()`, `Test.setCreatedDate()`.

### 5.2 Test data factory and example
```apex
@isTest
public class TestDataFactory {
    public static List<Account> createAccounts(Integer n, Boolean doInsert) {
        List<Account> accs = new List<Account>();
        for (Integer i = 0; i < n; i++) accs.add(new Account(Name = 'Test ' + i));
        if (doInsert) insert accs;
        return accs;
    }
}

@isTest
private class AccountServiceTest {
    @TestSetup static void setup() { TestDataFactory.createAccounts(200, true); }

    @isTest static void bulkUpdateSetsRating() {
        List<Account> accs = [SELECT Id FROM Account];
        Test.startTest();
        AccountService.rate(accs);
        Test.stopTest();
        Assert.areEqual(200, [SELECT COUNT() FROM Account WHERE Rating = 'Hot'], 'All rated');
    }
}
```
- Test bulk (200+), positive, negative, and permission (`runAs`) paths.

### 5.3 Callout mocks
```apex
@isTest
global class WeatherMock implements HttpCalloutMock {
    global HttpResponse respond(HttpRequest req) {
        HttpResponse res = new HttpResponse();
        res.setHeader('Content-Type', 'application/json');
        res.setBody('{"temp":21}'); res.setStatusCode(200);
        return res;
    }
}
// in test:
Test.setMock(HttpCalloutMock.class, new WeatherMock());
```
- `StaticResourceCalloutMock` / `MultiStaticResourceCalloutMock` serve bodies from static resources.
- SOAP (WSDL2Apex) callouts: implement `WebServiceMock.doInvoke(...)`, then `Test.setMock(WebServiceMock.class, ...)`.
- You can't do DML before a callout in the same test transaction ("uncommitted work pending") unless the DML sits before `Test.startTest()` and the callout after it.

### 5.4 Stub API (mocking classes)
```apex
@isTest
public class MockProvider implements System.StubProvider {
    public Object handleMethodCall(Object stubbedObject, String stubbedMethodName, Type returnType,
        List<Type> paramTypes, List<String> paramNames, List<Object> args) {
        if (stubbedMethodName == 'getRate') return 1.5;
        return null;
    }
}
RateService svc = (RateService) Test.createStub(RateService.class, new MockProvider());
```
- Works only in tests. Can't stub static methods, private methods, constructors, or system types. Libraries: **ApexMocks** (fflib), **Amoss**. Dependency injection via constructor or `Type.forName()` plus custom metadata.
- Run tests: Developer Console, Setup > Apex Test Execution, VS Code, `sf apex run test`.

---

## 6. SOQL

### 6.1 Syntax
```sql
SELECT Id, Name, Owner.Name, (SELECT LastName FROM Contacts ORDER BY LastName LIMIT 5)
FROM Account
WHERE Industry IN ('Tech','Finance') AND AnnualRevenue > 1000000 AND Name LIKE 'Acme%'
  AND CreatedDate = LAST_N_DAYS:30
ORDER BY Name ASC NULLS LAST
LIMIT 100 OFFSET 0
```
- Clause order: `SELECT ... FROM ... [USING SCOPE] [WHERE] [WITH] [GROUP BY] [HAVING] [ORDER BY] [LIMIT] [OFFSET] [FOR VIEW|REFERENCE|UPDATE]`.
- No `SELECT *`. Use `FIELDS(ALL)`, `FIELDS(STANDARD)`, `FIELDS(CUSTOM)`. `FIELDS(ALL)`/`FIELDS(CUSTOM)` need `LIMIT 200` (unbounded only for STANDARD).
- Apex binds: `WHERE Id IN :idSet`, `WHERE Name = :acc.Name`. Dynamic: `Database.query(str)`, `Database.queryWithBinds(str, Map<String,Object>, AccessLevel)`, `Database.countQuery()`.
- Operators: `=, !=, <, <=, >, >=, LIKE (% _), IN, NOT IN, INCLUDES/EXCLUDES` (multi-select picklists), `AND, OR, NOT`.
- `USING SCOPE mine | team | everything | delegated | mine_and_my_groups`.
- Single-record assignment `Account a = [SELECT ... LIMIT 1];` throws `QueryException` when there are 0 rows. Prefer a list.
- Winter '27: `FORMULA()` in WHERE (beta, API 68+, non-prod) **(verify)**.

### 6.2 Relationship queries

| Direction | Syntax | Example |
|---|---|---|
| Child to parent (dot notation) | `Relationship.Field`, custom: `Parent__r.Field__c` | `SELECT Name, Account.Industry, Account.Owner.Email FROM Contact` (up to **5 levels**) |
| Parent to child (subquery) | Child relationship name (plural), custom: `Children__r` | `SELECT Name, (SELECT Subject FROM Cases) FROM Account` |
| Filter by parent | | `SELECT Id FROM Contact WHERE Account.Rating = 'Hot'` |

- Limits: max **55** child-to-parent relationships per query; max **20** parent-to-child subqueries; parent-to-child nesting up to 5 levels in REST/SOAP from API 58 (Apex supports one level of subquery nesting historically (verify)).
- Access subquery results: `acc.Contacts` (list). Don't trust it beyond the first 200 child rows in a for loop; use the SOQL for loop.

### 6.3 Aggregates
```sql
SELECT StageName, COUNT(Id) cnt, SUM(Amount) total, AVG(Amount), MIN(CloseDate), MAX(Amount)
FROM Opportunity WHERE IsClosed = false
GROUP BY StageName HAVING SUM(Amount) > 100000 ORDER BY SUM(Amount) DESC
```
- Returns `AggregateResult[]`; read with `(Decimal) ar.get('total')`. `COUNT()` without a field returns an Integer. `COUNT_DISTINCT(field)`.
- `GROUP BY ROLLUP(f1, f2)` adds subtotals and a grand total. `GROUP BY CUBE(f1, f2)` gives subtotals for all combinations. `GROUPING(field)` tells whether a row is a subtotal.
- Aggregate queries count each **aggregated row** (not the underlying rows) toward the row limit (verify). The max is 2,000 result rows unless using QueryMore/Batch. Aggregates don't support `queryMore`.
- Date functions: `CALENDAR_YEAR(CreatedDate)`, `CALENDAR_MONTH`, `FISCAL_QUARTER`, `DAY_ONLY`, `HOUR_IN_DAY`, `WEEK_IN_YEAR`. Others: `FORMAT()`, `convertCurrency()`, `toLabel()`, `convertTimezone()`.

### 6.4 Date literals
`YESTERDAY, TODAY, TOMORROW, LAST_WEEK, THIS_WEEK, NEXT_WEEK, LAST_MONTH, THIS_MONTH, NEXT_MONTH, LAST_90_DAYS, NEXT_90_DAYS, LAST_N_DAYS:n, NEXT_N_DAYS:n, N_DAYS_AGO:n, LAST_N_WEEKS:n, LAST_N_MONTHS:n, THIS_QUARTER, LAST_QUARTER, NEXT_N_QUARTERS:n, THIS_YEAR, LAST_YEAR, LAST_N_YEARS:n, THIS_FISCAL_QUARTER, LAST_FISCAL_YEAR, NEXT_N_FISCAL_YEARS:n`.
- Datetime literals use ISO format without quotes: `CreatedDate > 2026-01-01T00:00:00Z`. Date: `CloseDate = 2026-10-08`.

### 6.5 Semi-joins and anti-joins
```sql
SELECT Id, Name FROM Account WHERE Id IN (SELECT AccountId FROM Opportunity WHERE IsWon = true)   -- semi-join
SELECT Id, Name FROM Account WHERE Id NOT IN (SELECT AccountId FROM Contact WHERE AccountId != null) -- anti-join
```
- Max 2 semi/anti-joins per query. Subqueries must select an Id/reference field. No nesting. Can't use `OR` with them.

### 6.6 Locking, polymorphism, misc
- `FOR UPDATE` locks the returned rows until the transaction ends. Other transactions wait up to ~10 s, then get a `QueryException`. It can't be combined with `ORDER BY` in some contexts, aggregates, or subqueries (verify).
- `FOR VIEW` / `FOR REFERENCE` update `LastViewedDate` / `LastReferencedDate`.
- Polymorphic fields (`What`, `Who`, `Owner`) use `TYPEOF`:
```sql
SELECT Id, TYPEOF What WHEN Account THEN Phone, NumberOfEmployees WHEN Opportunity THEN Amount ELSE Name END FROM Event
```
  You can also filter with `WHERE What.Type = 'Account'`.
- `ALL ROWS` (Apex only) includes deleted and archived records. With `isDeleted = true`, it covers the Recycle Bin.
- `OFFSET` max **2,000**. `LIMIT` max is the governor limit. A SOQL statement can be up to **100,000 characters** by default (verify). The `WHERE` clause has a 4,000 char limit per value (verify).
- **Selective queries**: on objects with more than 200k records, non-selective filters in triggers throw an error. Use indexed fields (Id, Name, OwnerId, CreatedDate, SystemModstamp, RecordTypeId, lookups, External Id/unique fields). Use the **Query Plan** tool (Developer Console) to check.
- Not supported: arbitrary joins, `SELECT *` (use FIELDS), filtering on long text area/rich text, `GROUP BY` on certain fields.

### 6.7 SOSL
```apex
List<List<SObject>> res = [FIND 'Acme*' IN NAME FIELDS
    RETURNING Account(Id, Name WHERE Industry = 'Tech' LIMIT 10), Contact(FirstName, Email)
    WITH USER_MODE LIMIT 50];
List<Account> accs = (List<Account>) res[0];
// Dynamic: Search.query(str); Search.find(str) returns SearchResults; Search.suggest() for autosuggest
```
- `IN ALL FIELDS | NAME FIELDS | EMAIL FIELDS | PHONE FIELDS | SIDEBAR FIELDS`. Wildcards: `*` (any chars) and `?` (one char). Min 2 chars.
- Uses the search index (text across multiple objects); results may lag after inserts. Limits: 20 SOSL per transaction, 2,000 rows.
- Use SOQL when you know the object/field; use SOSL for text search across objects or fields.

---

## 7. Lightning Web Components (LWC)

### 7.1 File structure
```
force-app/main/default/lwc/accountCard/
  accountCard.html          # <template> markup
  accountCard.js            # ES module: export default class extends LightningElement
  accountCard.js-meta.xml   # config: apiVersion, isExposed, targets
  accountCard.css           # optional, scoped (shadow DOM)
  accountCard.svg           # optional icon
  __tests__/accountCard.test.js   # Jest (sfdx-lwc-jest)
```
- Folder/files use **camelCase**. Markup refers to it as **kebab-case**: `<c-account-card>`. The namespace is `c` (or a package namespace).
- Standards-based (Web Components, Shadow DOM (synthetic or native), ES modules). Components can be **light DOM** via `static renderMode = 'light'`.

```js
import { LightningElement, api, wire, track } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import NAME_FIELD from '@salesforce/schema/Account.Name';
import getContacts from '@salesforce/apex/ContactController.getContacts';

export default class AccountCard extends LightningElement {
    @api recordId;                 // set automatically on record pages
    @wire(getRecord, { recordId: '$recordId', fields: [NAME_FIELD] }) account;
    @wire(getContacts, { accountId: '$recordId' }) contacts;   // { data, error }
    get name() { return getFieldValue(this.account.data, NAME_FIELD); }
}
```
```html
<template>
  <lightning-card title={name} icon-name="standard:account">
    <template lwc:if={contacts.data}>
      <template for:each={contacts.data} for:item="c"><p key={c.Id}>{c.Name}</p></template>
    </template>
    <template lwc:else><p>Loading or none</p></template>
  </lightning-card>
</template>
```
- Directives: `lwc:if / lwc:elseif / lwc:else` (preferred over legacy `if:true`), `for:each` + `key`, `iterator:it`, `lwc:ref` (`this.refs.x`), `lwc:spread`, `lwc:dom="manual"`, `lwc:component lwc:is={ctor}` (dynamic components, needs `lightning__dynamicComponent` capability).
- Templates historically allow only property references, not expressions. **Complex template expressions** are GA in Winter '27 for components at apiVersion 66.0+ **(verify)**.

### 7.2 Decorators

| Decorator | Purpose |
|---|---|
| `@api` | Public property/method. Reactive. Set by the parent or App Builder. **Don't mutate** an `@api` property from inside the component |
| `@track` | Deep-reactive for object/array internal mutations. Since Spring '20, all fields are reactive on reassignment, so `@track` is only needed for mutating nested object/array contents |
| `@wire(adapter, config)` | Reactive data provisioning from LDS/Apex. `$prop` makes the param reactive. Wire to a property (`{data, error}`) or a function |

### 7.3 Lifecycle hooks
| Hook | When |
|---|---|
| `constructor()` | Created. Call `super()` first. Don't access attributes or children |
| `connectedCallback()` | Inserted into DOM. Init, subscribe (LMS), fetch. Can fire more than once |
| `renderedCallback()` | After every render. Guard with a flag to avoid loops |
| `render()` | Optional: return an alternate template |
| `disconnectedCallback()` | Removed. Unsubscribe, clean up listeners |
| `errorCallback(error, stack)` | Error boundary for descendant errors |

Order: parent constructor, parent connected, child constructor, child connected, child rendered, parent rendered.

### 7.4 Lightning Data Service (LDS) and UI API
- Shared cache, honors CRUD/FLS/sharing, and no Apex is needed. Changes sync across components.
- `lightning/uiRecordApi`: `getRecord`, `getRecords`, `getFieldValue`, `getFieldDisplayValue`, `createRecord`, `updateRecord`, `deleteRecord`, `notifyRecordUpdateAvailable(recordIds)` (replaces deprecated `getRecordNotifyChange`).
- Other wire adapters: `lightning/uiObjectInfoApi` (`getObjectInfo`, `getPicklistValues`, `getPicklistValuesByRecordType`), `lightning/uiListsApi` (`getListUi` deprecated, use `getListInfoByName`, `getListRecordsByName`), `lightning/uiRelatedListApi`, `lightning/uiLayoutApi`, `lightning/uiGraphQLApi` (`gql`, `graphql` wire adapter).
- Base form components: `lightning-record-form`, `lightning-record-view-form`, `lightning-record-edit-form` (with `lightning-input-field`/`lightning-output-field`). They use LDS.

### 7.5 Calling Apex: wire vs imperative
```apex
public with sharing class ContactController {
    @AuraEnabled(cacheable=true)
    public static List<Contact> getContacts(Id accountId) {
        return [SELECT Id, Name FROM Contact WHERE AccountId = :accountId WITH USER_MODE];
    }
    @AuraEnabled
    public static void saveContact(Contact c) { update as user c; }
}
```
```js
import saveContact from '@salesforce/apex/ContactController.saveContact';
import { refreshApex } from '@salesforce/apex';
async handleSave() {
    try { await saveContact({ c: this.draft }); await refreshApex(this.wiredContacts); }
    catch (e) { this.error = e.body?.message; }
}
```

| | `@wire` | Imperative |
|---|---|---|
| Apex requirement | `@AuraEnabled(cacheable=true)` (read-only, **no DML**) | `@AuraEnabled` (cacheable optional) |
| Timing | Framework-controlled, reactive to `$params` | You control it (button click, etc.) |
| Caching | Client cache; refresh with `refreshApex(wiredResult)` | Not cached unless cacheable |
| DML | Not allowed | Allowed |

- Apex methods must be `static` and `public` or `global`. Parameter names must match JS object keys. Throw `AuraHandledException` for clean UI messages.
- `@AuraEnabled(continuation=true)` for long callouts.

### 7.6 Communication: events and LMS
| Scenario | Mechanism |
|---|---|
| Parent to child | Set `@api` properties or call `@api` methods (`this.template.querySelector('c-child').refresh()`) |
| Child to parent | `this.dispatchEvent(new CustomEvent('select', { detail: { id } }))`; parent: `<c-child onselect={handleSelect}>`. Event names are lowercase, no `on` prefix |
| Bubbling | `{ bubbles: true, composed: true }` crosses shadow boundaries (use sparingly) |
| Unrelated components / across DOM, Aura, VF | **Lightning Message Service**: `lightning/messageService` (`publish`, `subscribe`, `unsubscribe`, `MessageContext`, `APPLICATION_SCOPE`) with a `LightningMessageChannel` metadata file (`messageChannels/MyChannel.messageChannel-meta.xml`) |
| Server push | `lightning/empApi` (CometD streaming: platform events, CDC) |

- `pubsub` module is legacy (pre-LMS). Use LMS.

### 7.7 Navigation and other modules
```js
import { NavigationMixin } from 'lightning/navigation';
export default class Nav extends NavigationMixin(LightningElement) {
    go() {
        this[NavigationMixin.Navigate]({ type: 'standard__recordPage',
            attributes: { recordId: this.recordId, objectApiName: 'Account', actionName: 'view' } });
    }
}
```
- Page reference types: `standard__recordPage`, `standard__objectPage` (list/home/new), `standard__namedPage`, `standard__navItemPage` (tabs), `standard__webPage`, `standard__recordRelationshipPage`, `standard__app`, `comm__namedPage` (Experience Cloud), `standard__component` (Aura/LWC URL-addressable via `lightning__UrlAddressable`).
- `CurrentPageReference` wire for URL state. `NavigationMixin.GenerateUrl` for hrefs.
- Useful modules: `lightning/platformShowToastEvent` (`ShowToastEvent`), `lightning/toast` (newer), `lightning/actions` (`CloseActionScreenEvent`), `lightning/modal` (`LightningModal`), `lightning/confirm`, `lightning/alert`, `lightning/prompt`, `lightning/flowSupport` (`FlowAttributeChangeEvent`, `FlowNavigationNextEvent`), `lightning/refresh` (`RefreshEvent`), `@salesforce/user/Id`, `@salesforce/label/c.MyLabel`, `@salesforce/resourceUrl/x`, `@salesforce/customPermission/X`, `@salesforce/userPermission/X`, `@salesforce/i18n/locale`, `lightning/platformResourceLoader` (`loadScript`, `loadStyle`).
- Base components (`lightning-*`): `lightning-card`, `lightning-button`, `lightning-input`, `lightning-combobox`, `lightning-datatable`, `lightning-tree-grid`, `lightning-record-picker`, `lightning-tabset`, `lightning-spinner`, `lightning-icon`, `lightning-file-upload`, `lightning-formatted-*`, `lightning-map`, `lightning-progress-indicator`, `lightning-dual-listbox`. Styling uses **SLDS** (SLDS 2 / Salesforce Cosmos theme with styling hooks `--slds-g-*` (verify)).

### 7.8 Security runtime: Locker vs Lightning Web Security

| | Lightning Locker (legacy) | Lightning Web Security (LWS) |
|---|---|---|
| Model | Secure wrappers (SecureWindow/SecureElement proxies) | JS sandboxes per namespace using distortions; native browser APIs |
| Third-party libs | Many break | Much better compatibility |
| Cross-namespace | Restricted | Components from different namespaces can be composed |
| Status | Still applies to Aura unless LWS for Aura is enabled | **Default for LWC** in new orgs; LWS for Aura is GA (verify) |
- Setting: Setup > Session Settings > "Use Lightning Web Security for Lightning web components (and Aura components)". Neither one replaces CSP. Trusted URLs (formerly CSP Trusted Sites) are still needed for external endpoints.

### 7.9 js-meta.xml and targets
```xml
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>68.0</apiVersion>
    <isExposed>true</isExposed>
    <masterLabel>Account Card</masterLabel>
    <targets>
        <target>lightning__RecordPage</target>
        <target>lightning__AppPage</target>
        <target>lightning__FlowScreen</target>
    </targets>
    <targetConfigs>
        <targetConfig targets="lightning__RecordPage">
            <property name="title" type="String" default="Hello"/>
            <objects><object>Account</object></objects>
        </targetConfig>
    </targetConfigs>
</LightningComponentBundle>
```
| Target | Where |
|---|---|
| `lightning__RecordPage`, `lightning__AppPage`, `lightning__HomePage` | Lightning App Builder |
| `lightning__RecordAction` (+ `actionType` ScreenAction/Action) | Quick actions (headless when `Action`; `@api invoke()`) |
| `lightning__GlobalAction` | Global actions (verify) |
| `lightning__FlowScreen` | Flow screen components (`@api` properties with `role="inputOnly"/"outputOnly"`) |
| `lightning__FlowAction` | Flow actions (verify) |
| `lightning__Tab` | Custom tab |
| `lightning__UtilityBar` | Utility bar |
| `lightning__Inbox` | Outlook/Gmail integration |
| `lightning__UrlAddressable` | Navigable by URL |
| `lightningCommunity__Page`, `lightningCommunity__Default` | Experience Builder (LWR and Aura sites) |
| `lightningSnapin__ChatMessage`, etc. | Messaging/Embedded Service |
| `lightning__AgentforceInput` / `lightning__AgentforceOutput` | Custom Agentforce UI for agent action inputs/outputs (Lightning types) **(verify names)** |
| `lightning__Dashboard`, `analytics__Dashboard` | CRM Analytics/dashboards |

- **LWC in Flow**: expose `@api` props in `targetConfig` for `lightning__FlowScreen`. Implement `@api validate()` returning `{ isValid, errorMessage }`. Dispatch `FlowAttributeChangeEvent` to push values.
- **LWC in Experience Cloud**: LWR sites support only LWC (no Aura). Use `lightningCommunity__Page` and guest-user-safe Apex (guest user sharing restrictions).
- **LWC in Agentforce**: custom Lightning Types (`lightningTypes/` bundle with `schema.json` + renderer/editor LWC) let agent action inputs/outputs render as rich UI in the agent panel/Experience **(verify)**.
- **Testing**: Jest via `@salesforce/sfdx-lwc-jest` (`npm run test:unit`), with mocks for wire adapters (`@salesforce/wire-service-jest-util`). **UTAM** for UI automation.
- **Local dev**: `sf lightning dev app|site|component` (Local Dev, hot reload against an org) **(verify flags)**.

---

## 8. Aura Components (legacy)
- The pre-LWC framework (2014). Still supported, but **no new features**. Build new components in LWC. LWC can be nested inside Aura, but **not Aura inside LWC**.
- Bundle: `.cmp` (markup), `Controller.js`, `Helper.js`, `Renderer.js`, `.css`, `.design`, `.svg`, `.auradoc`, `.cmp-meta.xml`.
- Syntax: `<aura:component implements="flexipage:availableForRecordHome,force:hasRecordId" controller="MyApexCtrl">`, `<aura:attribute name="x" type="String"/>`, expressions `{!v.x}` (bound) / `{#v.x}` (unbound), `component.get('v.x')`, `$A.enqueueAction(action)`, `$A.getCallback()`.
- Events: component events, application events (avoid; use LMS). `force:recordData` = LDS for Aura.
- Still needed for some features: certain interfaces (`lightning:availableForFlowActions` (older)), `lightning:isUrlAddressable`, Lightning Out (Lightning Out 2.0 for LWC is GA (verify)), some console APIs (`lightning:workspaceAPI`, `lightning:utilityBarAPI` (LWC equivalents now exist: `lightning/platformWorkspaceApi` (verify))).

## 9. Visualforce (legacy)
- Server-rendered pages (`<apex:page>`), MVC with standard controllers (`standardController="Account"`), custom controllers, and controller **extensions**. Expressions `{!Account.Name}`.
- Uses **view state** (max **170 KB**). Reduce it with `transient`, `<apex:outputPanel>` rerender, or JS Remoting (`@RemoteAction`).
- Still used for: PDF generation (`renderAs="pdf"`), email templates (VF email templates), legacy Sites, Classic overrides, and some managed package UIs. Not supported in LWR sites.
- Include LWC in VF via Lightning Out. Prefer LWC for all new UI.
- Security: escaping (`HTMLENCODE`, `JSENCODE`), CSRF protection is built into `apex:form`, and `with sharing` controllers.

---

## 10. Salesforce APIs

| API | Protocol / format | Use |
|---|---|---|
| **REST API** | REST/JSON (XML) `/services/data/vXX.X/` | CRUD, query, search, describe, limits, composite. Default choice |
| **SOAP API** | SOAP/XML, Enterprise WSDL (strongly typed, org-specific) or Partner WSDL (loosely typed, generic) | Legacy/enterprise integrations, ETL tools |
| **Bulk API 2.0** | REST, CSV | Large data loads/queries (>2,000 to millions of records). Async jobs, automatic chunking |
| **Bulk API (1.0)** | REST, CSV/XML/JSON | Legacy. Manual batches, serial/parallel mode, still supported |
| **Composite** | REST | Several requests in one call (see 10.2) |
| **GraphQL API** | `/services/data/vXX.X/graphql` | Query exactly the fields you need across related objects; mutations GA in recent releases (verify) |
| **User Interface API** | REST `/ui-api/` | Data + metadata + layouts to build UIs (what LDS uses) |
| **Connect REST API** | REST `/connect/` | Chatter, Experience Cloud, Files, CMS, recommendations, commerce. Apex equivalent: `ConnectApi` namespace |
| **Metadata API** | SOAP (and REST deploy) | Deploy/retrieve metadata (`package.xml`). Used by the CLI |
| **Tooling API** | REST/SOAP `/tooling/` | Fine-grained dev metadata: ApexClass, ApexLog, TraceFlag, code coverage (`ApexCodeCoverageAggregate`), execute anonymous, symbol tables |
| **Streaming API** | CometD (Bayeux) | PushTopic (legacy), Generic Streaming (legacy), Platform Events, CDC. Consumed by `empApi` |
| **Pub/Sub API** | **gRPC + Avro**, HTTP/2 | Modern publish/subscribe for Platform Events, CDC, Real-Time Event Monitoring. Pull-based flow control, ManagedSubscribe |
| **Apex REST / SOAP** | Your own endpoints | Custom logic exposed as APIs |
| **Analytics REST API**, **Reports & Dashboards REST**, **Data 360 (Data Cloud) APIs**, **Einstein/Models API**, **Agent API** | Specialized | |

### 10.1 REST API essentials
```
GET    /services/data/v68.0/                                  # resources
GET    /services/data/v68.0/sobjects/Account/describe
GET    /services/data/v68.0/sobjects/Account/001xx000003DGb2AAG?fields=Name,Industry
POST   /services/data/v68.0/sobjects/Account        {"Name":"Acme"}
PATCH  /services/data/v68.0/sobjects/Account/001...  {"Industry":"Tech"}
PATCH  /services/data/v68.0/sobjects/Account/Ext_Id__c/ABC123   # upsert by external Id
DELETE /services/data/v68.0/sobjects/Account/001...
GET    /services/data/v68.0/query?q=SELECT+Id,Name+FROM+Account   # nextRecordsUrl for paging (2,000/batch default)
GET    /services/data/v68.0/queryAll?q=...                   # includes deleted/archived
GET    /services/data/v68.0/search?q=FIND+{Acme}
GET    /services/data/v68.0/limits
Authorization: Bearer <access_token>
```
- Winter '27: `/services/data/latest/...` alias routes to the newest version **(verify)**. Pin explicit versions in production integrations.
- API request limits: a rolling 24-hour **org allocation** (Enterprise base 100,000 + per-license additions). Check `/limits` or the `Sforce-Limit-Info` response header.
- Concurrent long-running API requests (>20 s): 25 in production (verify).

### 10.2 Composite resources
| Resource | Max subrequests | Notes |
|---|---|---|
| `/composite` | 25 (max 5 query/sObject collections) | Sequential. Reference earlier results with `@{refId.id}`. `allOrNone` option |
| `/composite/batch` | 25 | Independent requests, no references, not transactional |
| `/composite/tree/{sObject}` | 200 records total | Create parent + child record trees in one call |
| `/composite/sobjects` (sObject Collections) | 200 records | Create/update/upsert/delete lists; `allOrNone` |
| `/composite/graph` | 500 subrequests per graph | Multiple composite graphs, each transactional |

### 10.3 Bulk API 2.0
- Ingest flow: `POST /jobs/ingest` (object, operation: insert/update/upsert/delete/hardDelete, externalIdFieldName), `PUT .../batches` with CSV (up to 150 MB), `PATCH state=UploadComplete`, poll, then `GET successfulResults/ failedResults/ unprocessedrecords/`.
- Query: `POST /jobs/query`, then results with `Sforce-Locator` paging.
- Limits: **150 million records per 24 h** for ingest, and up to 100 MB per upload after encoding (verify). Salesforce chunks the data internally into 10,000-record batches. Triggers and flows still fire. To avoid lock contention, sort records by parent Id.
- Data Loader, `sf data import bulk` / `sf data upsert bulk` / `sf data export bulk` use Bulk API 2.0.

### 10.4 Event-driven architecture

| Feature | What | Notes |
|---|---|---|
| **Platform Events** (`My_Event__e`) | Custom pub/sub messages | Publish from Apex (`EventBus.publish`), Flow, Process, APIs. Subscribe via Apex trigger (after insert), Flow (platform event-triggered), LWC `empApi`, Pub/Sub API, CometD. Publish behavior: **Publish After Commit** vs **Publish Immediately**. High-volume events retained **72 hours**. Replay with `ReplayId` |
| **Change Data Capture** (`AccountChangeEvent`, `My_Obj__ChangeEvent`) | Auto events on record create/update/delete/undelete | Select entities in Setup > Change Data Capture. Header: `ChangeEventHeader` (changeType, changedFields, recordIds, commitUser). Gap and overflow events. Retained 72 h. Apex triggers on `*ChangeEvent` run async |
| **PushTopic** / Generic Streaming | Legacy streaming | Prefer CDC/Platform Events |
| **Outbound Messages** | Workflow-based SOAP push to an endpoint, with retries up to 24 h | Legacy (workflow retirement); Flow can't send OMs natively except via certain actions (verify) |
| **Event Relays** | Relay platform events/CDC to **Amazon EventBridge** | Config in Setup |
| **Event Bus channels** | Custom channels to group/filter events (`PlatformEventChannel`, `PlatformEventChannelMember` with filter expressions) | |

- Event allocations: delivery to CometD/Pub/Sub clients is limited per 24 h (e.g., 50,000 Enterprise base, more with add-on) (verify). Apex triggers and flows don't count toward delivery allocation.
- Pub/Sub API: endpoint `api.pubsub.salesforce.com:7443`. RPCs: `Subscribe`, `ManagedSubscribe`, `Publish`, `PublishStream`, `GetTopic`, `GetSchema`.

### 10.5 Apex web services
```apex
@RestResource(urlMapping='/invoices/*')
global with sharing class InvoiceApi {
    @HttpGet
    global static Invoice__c getInvoice() {
        String id = RestContext.request.requestURI.substringAfterLast('/');
        return [SELECT Id, Name, Amount__c FROM Invoice__c WHERE Id = :id WITH USER_MODE];
    }
    @HttpPost
    global static Id create(String name, Decimal amount) {
        Invoice__c inv = new Invoice__c(Name = name, Amount__c = amount);
        insert as user inv; return inv.Id;
    }
}
// Endpoint: /services/apexrest/invoices/a01...   (with namespace: /services/apexrest/ns/invoices)
```
- SOAP: `global class X { webservice static String hello(String n) { } }`. Generate WSDL from the class page.
- Must be `global`. Requires an authenticated session (OAuth). Guest access via Sites possible but risky.

---

## 11. Integration Patterns

### 11.1 Salesforce integration pattern catalog (Architect guide)
| Pattern | Timing | Typical tech |
|---|---|---|
| Remote Process Invocation: Request and Reply | Sync | Apex callout, External Services, LWC + Continuation |
| Remote Process Invocation: Fire and Forget | Async | Platform Events, Outbound Message, async Apex callout |
| Batch Data Synchronization | Async/scheduled | Bulk API, ETL/MuleSoft, CDC |
| Remote Call-In | Sync/async | REST/SOAP/Bulk APIs, Apex REST |
| UI Update Based on Data Changes | Async | Streaming/empApi, CDC, Platform Events |
| Data Virtualization | Sync | Salesforce Connect (external objects) |

### 11.2 Named Credentials and External Credentials
- **Named Credential** = endpoint URL + reference to an **External Credential** (auth). Callouts use `callout:My_NC/path`. No hardcoded secrets, no Remote Site Setting needed.
- **External Credential** = auth protocol (OAuth 2.0 browser/client credentials/JWT, AWS Signature V4, Basic via custom headers, Custom, No Auth) + **Principals** (Named Principal = one shared identity; Per-User Principal = each user authenticates). Access is granted via **permission sets** (External Credential Principal Access). Custom headers can use formulas like `{!$Credential.My_EC.apiKey}`.
- **Legacy Named Credentials** (combined auth in one record) are deprecated for new creation (verify). Migrate them.
- Packaging: named/external credentials can be packaged; secrets are entered by the subscriber.
```apex
HttpRequest req = new HttpRequest();
req.setEndpoint('callout:Weather_API/v1/forecast?city=Paris');
req.setMethod('GET');
req.setTimeout(20000);
HttpResponse res = new Http().send(req);
if (res.getStatusCode() == 200) { Map<String,Object> body = (Map<String,Object>) JSON.deserializeUntyped(res.getBody()); }
```
- Callout rules: no callouts after uncommitted DML in the same transaction (do callout first, or go async). Triggers can't call out synchronously (use `@future(callout=true)` or Queueable). **Remote Site Settings** are needed only for non-Named-Credential endpoints.
- Certificates: Setup > Certificate and Key Management (mutual TLS via `req.setClientCertificateName`).

### 11.3 Other integration options
| Option | Notes |
|---|---|
| **External Services** | Import an **OpenAPI 2.0/3.0** spec to generate invocable actions for Flow, Apex (`ExternalService.*` classes), and Agentforce. Uses a Named Credential. No code |
| **Salesforce Connect** | External objects (`__x`) virtualized in real time: OData 2.0/4.0/4.01 adapters, cross-org adapter, Amazon DynamoDB/Athena adapters, Apex custom adapter (`DataSource.Connection`). Indirect and external lookups. Add-on license |
| **MuleSoft Anypoint Platform** | iPaaS with API-led connectivity (System, Process, Experience APIs), Anypoint Exchange, DataWeave. **MuleSoft for Flow / Composer** for no-code. **MuleSoft Agent Fabric** / Topic Center expose APIs to Agentforce (verify) |
| **Outbound Messages** | SOAP push from workflow (legacy) |
| **Heroku** | See section 16 |
| **Data 360 (Data Cloud)** connectors / Zero Copy | Federation with Snowflake, Databricks, BigQuery, Redshift |
| **Flow HTTP Callout** | Declarative REST callouts from Flow (uses Named Credential + generates External Service) |
| **Apex callouts** | `Http`, `HttpRequest`, `HttpResponse`. WSDL2Apex for SOAP |
| **Email Services / Inbound email** | `Messaging.InboundEmailHandler` |

---

## 12. Authentication: OAuth 2.0 and Apps

### 12.1 OAuth flows
| Flow | Use case | Key points |
|---|---|---|
| **Web Server (Authorization Code)** | Server-side web apps with a user | Redirect to `/services/oauth2/authorize?response_type=code`. Exchange code + client secret at `/services/oauth2/token`. **Use PKCE** (code_challenge). Gives a refresh token |
| **User-Agent (Implicit)** | Browser/mobile without a secret | Token in URL fragment. Discouraged; use Auth Code + PKCE |
| **JWT Bearer** | Server-to-server, CI/CD (`sf org login jwt`) with no interactive login | Sign the JWT with a private key; upload the cert to the app; user must be pre-authorized (admin-approved + profile/perm set). No refresh token |
| **Client Credentials** | Server-to-server, no user | client_id + secret. Runs as a designated **"Run As" integration user**. No refresh token. **Recommended** replacement for username-password |
| **Device** | CLI/IoT/TVs with limited input | User enters a code at `/setup/connect`. `sf org login device` |
| **Refresh Token** | Get a new access token | `grant_type=refresh_token`. Policies: valid until revoked, expire after N, expire if unused, rotation |
| **Username-Password** | Legacy; trusted apps | **Deprecated/being retired**: blocked by default in new orgs; Winter '27 release update with enforcement moved to **Feb 20, 2027** **(verify)**. Migrate to Client Credentials, JWT, or Auth Code + PKCE |
| **SAML Bearer Assertion** | Use an existing SAML assertion for a token | |
| **Token Exchange** | Exchange a third-party IdP token for a Salesforce token (Apex `Oauth2TokenExchangeHandler`) | Newer (verify) |
| **Asset Token / Hybrid** | IoT, mobile hybrid | Niche |

- Endpoints: `https://login.salesforce.com` (prod/dev), `https://test.salesforce.com` (sandbox), or **My Domain** `https://<mydomain>.my.salesforce.com` (preferred; required by many flows).
- Token response: `access_token`, `instance_url`, `id`, `refresh_token` (if scope `refresh_token`/`offline_access`), `signature`, `issued_at`. Scopes: `api`, `refresh_token`, `web`, `full`, `openid`, `cdp_*`, `sfap_api` (Models API), `chatbot_api` (Agent API) (verify).
- **Integration User license** (free API-only licenses, e.g. 5 per Enterprise+ org (verify)) plus the "Minimum Access - API Only Integrations" profile for integration identities.

### 12.2 Connected Apps vs External Client Apps (ECA)
| | Connected App (legacy) | External Client App |
|---|---|---|
| Status | **New creation disabled by default from Spring '26** (Support exception temporary). Existing apps keep working | **Recommended** replacement |
| Design | Settings and policies in one org-bound record | Split **settings** (developer-owned, packageable) and **policies** (admin-owned, per org) |
| Packaging | 1GP-centric | **2GP-native**, metadata-driven (`ExternalClientApplication`, `ExtlClntAppOauthSettings`, `ExtlClntAppGlobalOauthSettings`, `ExtlClntAppOauthConfigurablePolicies`) |
| Distribution | Global | **Local** (single org) or **Packaged** |
| Security posture | Older defaults (some flows on) | Secure by default: username-password and some legacy flows off, PKCE |
| Feature gaps | | Historically lacked some features (e.g., certain SAML/canvas). Check parity **(verify)** |
- Also: "API Access Control" / **"Approve Uninstalled Connected Apps"** restrictions (Sept 2025) block users from authorizing uninstalled connected apps unless they have the permission. The Salesforce CLI's own connected app (PlatformCLI) is pre-installed (verify).

---

## 13. Salesforce CLI (`sf`) and Salesforce DX

### 13.1 Basics
- `sf` (v2) replaced `sfdx` (v7). `sfdx` aliases still work for many commands but are deprecated. Install via npm (`npm install -g @salesforce/cli`) or installers. Update with `sf update`. Help: `sf <cmd> --help`, `sf commands`, `sf search`.
- Pattern: `sf <topic> <action> --flags`. Global flags: `--json`, `--target-org/-o`, `--target-dev-hub/-v`, `--api-version`, `--flags-dir`.
- Config: `sf config set target-org=myAlias`, `sf config set target-dev-hub=hub`, `sf alias set x=user@x.com`, `sf config list`.

### 13.2 Command cheat sheet
| Task | Command |
|---|---|
| Create project | `sf project generate --name myproj [--template standard|empty|analytics] [--manifest]` |
| Login (browser) | `sf org login web --alias dev --instance-url https://test.salesforce.com --set-default` |
| Login Dev Hub | `sf org login web --alias hub --set-default-dev-hub` |
| Login JWT (CI) | `sf org login jwt --client-id <id> --jwt-key-file server.key --username ci@x.com --alias ci` |
| Login device / sfdx-url | `sf org login device`; `sf org login sfdx-url --sfdx-url-file auth.txt` |
| Logout | `sf org logout --target-org dev` |
| List/open orgs | `sf org list`, `sf org display --verbose`, `sf org open --target-org dev [--path lightning/setup/...]` |
| Scratch org | `sf org create scratch --definition-file config/project-scratch-def.json --alias so1 --duration-days 7 --set-default` |
| Scratch from snapshot/shape | `sf org create scratch --snapshot X`; `sf org create shape` (verify) |
| Delete scratch | `sf org delete scratch --target-org so1 --no-prompt` |
| Sandbox | `sf org create sandbox --definition-file sb.json --alias uat`; `sf org refresh sandbox`; `sf org resume sandbox` |
| Create user/password | `sf org create user`; `sf org generate password` |
| Deploy | `sf project deploy start --source-dir force-app` / `--metadata ApexClass:MyClass` / `--manifest manifest/package.xml` |
| Deploy with tests | `sf project deploy start --manifest package.xml --test-level RunSpecifiedTests --tests MyTest --tests OtherTest` |
| Validate (check-only) | `sf project deploy validate --manifest package.xml --test-level RunLocalTests` |
| Quick deploy | `sf project deploy quick --job-id 0Af...` |
| Deploy status/resume/cancel | `sf project deploy report`, `sf project deploy resume`, `sf project deploy cancel` |
| Preview | `sf project deploy preview` / `sf project retrieve preview` |
| Retrieve | `sf project retrieve start --metadata ApexClass --manifest package.xml --source-dir ...` |
| Retrieve package | `sf project retrieve start --package-name "My Pkg"` |
| Generate manifest | `sf project generate manifest --source-dir force-app --name package.xml` (or `--from-org`) |
| Convert formats | `sf project convert source` (to mdapi), `sf project convert mdapi` (to source) |
| Delete metadata | `sf project delete source --metadata ApexClass:Old` |
| Source tracking | `sf project deploy preview`, `sf project reset tracking` |
| Generate metadata | `sf apex generate class --name X`, `sf apex generate trigger`, `sf lightning generate component --type lwc --name x`, `sf lightning generate event`, `sf schema generate sobject/field/tab` (interactive), `sf visualforce generate page` |
| Run tests | `sf apex run test --test-level RunLocalTests --code-coverage --result-format human --wait 10` |
| Specific tests | `sf apex run test --class-names MyTest --tests MyTest.method1 --synchronous` |
| Test results | `sf apex get test --test-run-id 707...` |
| Anonymous Apex | `sf apex run --file scripts/apex/hello.apex` |
| Logs | `sf apex tail log --color`, `sf apex list log`, `sf apex get log --log-id 07L...` |
| Query | `sf data query --query "SELECT Id, Name FROM Account" [--use-tooling-api] [--result-format csv] [--bulk]` |
| Record CRUD | `sf data create record --sobject Account --values "Name='Acme'"`; `sf data get record`, `update record`, `delete record` |
| Bulk data | `sf data import bulk --file a.csv --sobject Account`; `sf data upsert bulk --external-id Ext__c`; `sf data export bulk --query ...`; `sf data delete bulk` |
| Tree data | `sf data export tree --query ... --plan`; `sf data import tree --plan data/plan.json` |
| Package (2GP) | `sf package create --name "My Pkg" --package-type Unlocked --path force-app` |
| Package version | `sf package version create --package "My Pkg" --installation-key-bypass --code-coverage --wait 20` |
| Promote | `sf package version promote --package "My Pkg@1.0.0-1"` |
| Install | `sf package install --package 04t... --target-org uat --wait 10 [--installation-key x]` |
| List/report | `sf package list`, `sf package version list`, `sf package installed list`, `sf package version report` |
| 1GP | `sf package1 version create`, `sf package1 version list` |
| Org limits | `sf limits api display` |
| Describe | `sf sobject describe --sobject Account`, `sf sobject list` |
| Code Analyzer | `sf code-analyzer run --rule-selector Recommended --output-file results.html`; `sf code-analyzer rules`; `sf code-analyzer config` |
| Agents | `sf agent generate agent-spec`, `sf agent create`, `sf agent generate authoring-bundle`, `sf agent preview`, `sf agent test create/run/results`, `sf agent publish authoring-bundle`, `sf agent activate`/`deactivate`, `sf agent validate` **(verify exact subcommands; they evolve fast)** |
| Local dev | `sf lightning dev app`, `sf lightning dev site`, `sf lightning dev component` (verify) |
| Plugins | `sf plugins install <name>`, `sf plugins` |
| Env/Doctor | `sf doctor`, `sf whoami` (verify), `sf info releasenotes display` |

- Deprecated sfdx-era equivalents: `force:source:push/pull` became `sf project deploy start` / `sf project retrieve start` with tracking; `force:org:create` became `sf org create scratch`; `force:mdapi:deploy` became `sf project deploy start --metadata-dir`; `auth:web:login` became `sf org login web`.

### 13.3 DX project structure
```
myproj/
  sfdx-project.json
  .forceignore                  # paths excluded from deploy/retrieve/tracking
  config/project-scratch-def.json
  manifest/package.xml
  force-app/main/default/
    applications/ aura/ classes/ customMetadata/ flexipages/ flows/ layouts/
    lwc/ objects/Account/fields/Foo__c.field-meta.xml  permissionsets/ staticresources/ tabs/ triggers/
  scripts/apex/  scripts/soql/
  .sf/ .sfdx/                   # local state (gitignore)
  package.json, jest.config.js, eslint config, .prettierrc, .husky
```
```json
{
  "packageDirectories": [
    { "path": "force-app", "default": true, "package": "My Pkg", "versionName": "Winter", "versionNumber": "1.2.0.NEXT",
      "dependencies": [{ "package": "Base Pkg", "versionNumber": "2.0.0.LATEST" }] }
  ],
  "name": "myproj",
  "namespace": "",
  "sfdcLoginUrl": "https://login.salesforce.com",
  "sourceApiVersion": "68.0",
  "packageAliases": { "My Pkg": "0Ho...", "My Pkg@1.2.0-1": "04t..." }
}
```
- **Source format** (decomposed: one file per field, list view, etc.) vs **Metadata API format** (monolithic `Account.object`, used by package.xml deploys). Decomposed formats for custom labels, permission sets (beta/preview) are configurable via `sourceBehaviorOptions` (verify).
- Scratch def example: `{"orgName":"Acme","edition":"Developer","features":["EnableSetPasswordInApi","Communities"],"settings":{"lightningExperienceSettings":{"enableS1DesktopEnabled":true}}}`. Editions: Developer, Enterprise, Group, Professional, Partner variants.

### 13.4 Source tracking
- Tracks changes between local project and org for **scratch orgs and sandboxes with tracking enabled** (Developer/Developer Pro sandboxes: Setup > Dev Hub > "Enable Source Tracking in Developer and Developer Pro Sandboxes"). Not in production.
- `sf project deploy start` (with no flags) deploys only local changes. `sf project retrieve start` pulls remote changes. Conflicts are detected; use `--ignore-conflicts` to override. Status: `sf project deploy preview` / `sf project retrieve preview`.
- Tracking state lives in `.sf/orgs/<orgId>/`. Reset with `sf project reset tracking`.

---

## 14. Developer Tools

### 14.1 VS Code and AI assistants
- **Salesforce Extension Pack** (and Expanded): Apex (Language Server, Jorje), Apex Replay Debugger, Apex Interactive Debugger (needs license), LWC, Aura, Visualforce, SOQL Builder, SLDS validator, Org Browser, Salesforce CLI integration, Lightning Design System, Prettier Apex.
- Command palette: `SFDX: Authorize an Org`, `SFDX: Create Project`, `SFDX: Deploy This Source to Org`, `SFDX: Retrieve Source from Org`, `SFDX: Run Apex Tests`, `SFDX: Execute Anonymous Apex with Editor Contents`, `SFDX: Turn On Apex Debug Log for Replay Debugger`, `SFDX: Launch Apex Replay Debugger with Current File`.
- **Agentforce Vibes** extension (formerly **Agentforce for Developers**, earlier "Einstein for Developers"): AI chat, inline code completion, test generation, agentic multi-file edits, Salesforce-specific models (CodeGen / xGen-Code) and third-party LLMs, plus MCP support (Salesforce DX MCP Server). Also in the Agentforce Vibes IDE. **(verify naming)**
- **Salesforce DX MCP Server** (`@salesforce/mcp`) exposes org, metadata, data, testing, and code-analysis tools to AI agents/IDEs (verify).
- Claude Code: an official `salesforce-development` plugin was announced around Winter '27 **(verify)**.
- JetBrains: **Illuminated Cloud** (third-party, paid). Also The Welkin Suite (legacy).

### 14.2 Code Builder / Agentforce Vibes IDE
- A browser-based VS Code (Code-OSS) environment hosted by Salesforce, launched from an org. Includes the CLI, extensions, and Git. **Renamed "Agentforce Vibes IDE"** (2025-26) **(verify)**. Installed as a managed package; requires a license/permission.

### 14.3 Developer Console (browser IDE in the org)
**Menus**
| Menu | Contents |
|---|---|
| **File** | New (Apex Class, Apex Trigger, Visualforce Page/Component, Lightning Component/App/Event/Interface/Tokens, Static Resource), Open (classes, triggers, pages, objects), Open Resource (Ctrl/Cmd+Shift+O), Open Lightning Resources, Save, Save All, Delete, Close, Log Out |
| **Edit** | Find, Find Next/Previous, Find/Replace, Search in Files, Fix Indentation |
| **Debug** | Open Execute Anonymous Window (Ctrl/Cmd+E), Execute Last, Switch Perspective, View Log Panels, Perspective Manager, Save Perspective, Change Log Levels, Clear (Checkpoint Inspector / Checkpoint Results / Heap Dump), Toggle checkpoint |
| **Test** | Run All, New Run, Rerun, Rerun Failed Tests, Abort, Always Run Asynchronously, Clear Test Data, New Suite, Suite Manager, New Suite Run |
| **Workspace** | Switch Workspace, New Workspace, Rename Workspace, Workspace Manager |
| **Help** | Help Docs, Keyboard Shortcuts, Preferences (theme, font, autocomplete, tab size) |

**Bottom panel tabs**
| Tab | Purpose |
|---|---|
| **Logs** | Debug logs from your actions. Filter "This Session", "Debug Only". Double-click to open the Log Inspector |
| **Tests** | Test run results and status |
| **Checkpoints** | Up to **5** heap checkpoints set on Apex lines. Inspect heap/symbols when the line executes. Need log level FINEST for Apex Code (verify) |
| **Query Editor** | Run SOQL/SOSL (option: "Use Tooling API"). **Query Plan** button (enable in Preferences) shows cost and index usage |
| **View State** | Visualforce view state inspection (requires Development Mode + Show View State) |
| **Progress** | Asynchronous requests in progress (deploys, test runs) |
| **Problems** | Compilation errors with line numbers |

- **Log Inspector panels**: Stack Tree (Execution Tree, Performance Tree), Execution Stack, Execution Log, Source, Variables, Execution Overview (Save Order, Limits, Timeline, Executed Units).
- The Developer Console is in maintenance mode. VS Code is the recommended IDE. Doesn't support LWC editing.

### 14.4 Debug logs and log levels
- Setup > Debug Logs > **Trace Flags** on a user, Apex class, trigger, or Automated Process/Platform Integration user. A trace flag uses a **Debug Level** (a named set of category levels). Max 24 h per trace flag.
- **Categories**: `Database`, `Workflow`, `Validation`, `Callout`, `Apex_code`, `Apex_profiling`, `Visualforce`, `System`, `Wave`, `NBA`, `Data_access` (verify).
- **Levels** (low to high verbosity): `NONE`, `ERROR`, `WARN`, `INFO`, `DEBUG`, `FINE`, `FINER`, `FINEST`.
- Limits: each log max **20 MB** (truncated beyond that). Org retains up to **1,000 MB** of logs, and logs are kept **7 days** (verify).
- `System.debug(LoggingLevel.WARN, 'msg')`. `System.debug` statements don't execute in prod without a trace flag but **still consume CPU** for string building.
- Key log lines: `USER_DEBUG`, `SOQL_EXECUTE_BEGIN`, `DML_BEGIN`, `LIMIT_USAGE_FOR_NS`, `CUMULATIVE_LIMIT_USAGE`, `FATAL_ERROR`, `CODE_UNIT_STARTED`, `FLOW_*`, `VALIDATION_RULE`.
- Observability alternatives: **Nebula Logger** (open source), Event Monitoring (Shield), Apex exception emails (Setup > Apex Exception Email), **Scale Center** / ApexGuru (performance insights).

### 14.5 Apex Replay Debugger
- Free. Simulates a debug session from a log: set breakpoints and checkpoints in VS Code, run `SFDX: Turn On Apex Debug Log for Replay Debugger`, reproduce, `SFDX: Get Apex Debug Logs`, then right-click the log and choose `SFDX: Launch Apex Replay Debugger with Current Log File`.
- Step through lines, inspect variables (needs FINEST Apex Code / Visualforce in the log). Heap dumps from up to 5 checkpoints give deeper variable state.
- **Apex Interactive Debugger** (real-time, in sandbox) needs a paid Debugger license (Performance/Unlimited include some sessions). **ISV Customer Debugger** for subscriber orgs.

---

## 15. Orgs, Environments and Deployment

### 15.1 Org types
| Org | Purpose | Notes |
|---|---|---|
| **Developer Edition** | Free personal dev org | Limited data (5 MB data / 20 MB file) (verify), 2 users. Can be a Dev Hub |
| **Scratch org** | Disposable, source-driven, config from a def file | 1-30 days (default 7). Created from a **Dev Hub**. Daily/active limits by Dev Hub edition (e.g., Enterprise: 40 active / 80 daily (verify)) |
| **Dev Hub** | Production or DE org with Dev Hub enabled | Owns scratch orgs and 2GP packages. Enable "Unlocked Packages and Second-Generation Managed Packages" |
| **Developer sandbox** | Metadata copy, 200 MB data | Refresh every **1 day** |
| **Developer Pro sandbox** | Metadata, **1 GB** data | Refresh **1 day** |
| **Partial Copy sandbox** | Metadata + sample data via **Sandbox Template**, **5 GB**, up to 10k records/object | Refresh **5 days** |
| **Full sandbox** | Full copy of metadata and data (template optional) | Refresh **29 days** |
| **Trailhead Playground**, **Partner/Trial orgs**, **Agentforce/Data Cloud Developer Edition** | Learning, ISV demos | |
| **Scratch org snapshots** / **Org Shape** | Capture org config to spin up scratch orgs | |

- Sandbox features: Sandbox **cloning**, post-copy Apex class (`SandboxPostCopy` interface), **Data Seeding** (verify), email deliverability set to "System email only" after refresh, user emails get `.invalid` appended.

### 15.2 Change Sets (legacy declarative deployment)
- Outbound change set (source org) to inbound change set (target org). Requires a **deployment connection** (Setup > Deployment Settings) between orgs **related to the same production org**.
- Components only, **no deletions** (use destructive changes via CLI), no history, manual. Validate first; quick deploy after successful validation (within 10 days).
- Limit 10,000 files per change set. Profiles deploy only permissions related to the included components.

### 15.3 Packaging
| Type | Namespace | Upgradeable | IP protection | Use |
|---|---|---|---|---|
| **Unmanaged** | No | No | No (code is editable) | Samples, templates, one-time distribution |
| **Unlocked (2GP)** | Optional | Yes | No (metadata editable in org unless locked) | Internal enterprise modular development |
| **Org-Dependent Unlocked** | No | Yes | No | Depends on metadata in the target org; skips dependency validation |
| **Managed 1GP** | Required | Yes | Yes (Apex obfuscated) | Legacy ISV. Packaging org based |
| **Managed 2GP** | Required (can share across packages) | Yes | Yes | **Modern ISV/AppExchange**. Source-driven, built from Dev Hub with the CLI. Supports patch versions, package ancestry, push upgrades |

- Version lifecycle: **beta** (installable only in sandbox/scratch, not upgradeable) to **promoted/released** (needs 75% coverage; `--code-coverage` at creation). `04t` = subscriber package version Id, `0Ho` = package Id.
- `--skip-validation` creates faster but can't be promoted. Dependencies are declared in `sfdx-project.json`.
- Managed packages: `global` cannot be removed once released; components get a namespace prefix (`ns__Field__c`). Protected custom metadata/settings. **Push upgrades** to subscribers. **License Management App (LMA)**, **Feature Management App (FMA)**, Checkout.
- 1GP-to-2GP migration path is available (GA) **(verify)**.

### 15.4 Metadata API and package.xml
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types><members>*</members><name>ApexClass</name></types>
    <types><members>Account.Region__c</members><name>CustomField</name></types>
    <types><members>Account</members><name>CustomObject</name></types>
    <types><members>MyFlow</members><name>Flow</name></types>
    <types><members>accountCard</members><name>LightningComponentBundle</name></types>
    <version>68.0</version>
</Package>
```
- Common type names: `ApexClass`, `ApexTrigger`, `ApexPage`, `ApexComponent`, `AuraDefinitionBundle`, `LightningComponentBundle`, `CustomObject`, `CustomField`, `ValidationRule`, `RecordType`, `ListView`, `Layout`, `FlexiPage`, `Flow`, `PermissionSet`, `PermissionSetGroup`, `Profile`, `CustomLabels`/`CustomLabel`, `CustomMetadata`, `StaticResource`, `NamedCredential`, `ExternalCredential`, `RemoteSiteSetting`, `CustomTab`, `CustomApplication`, `EmailTemplate`, `Report`, `Dashboard`, `GenAiPlugin`/`GenAiPlannerBundle`/`GenAiFunction`/`Bot`/`BotVersion` (Agentforce), `AiAuthoringBundle` (Agent Script) (verify).
- Wildcard `*` is not supported for some types (e.g., standard objects need explicit names; Reports need folder paths).
- **Destructive changes**: `destructiveChanges.xml` (or `destructiveChangesPre.xml`/`destructiveChangesPost.xml`) alongside an empty `package.xml`. CLI: `sf project deploy start --manifest package.xml --post-destructive-changes destructiveChanges.xml`.
- **Metadata Coverage Report** (developer.salesforce.com/docs/metadata-coverage) shows which types are supported by Metadata API, source tracking, unlocked/managed packages, and change sets.
- Some settings aren't supported by Metadata API at all (manual post-deploy steps). Keep a runbook.

### 15.5 Deployment validation, quick deploy, test levels
| Test level | Behavior |
|---|---|
| `NoTestRun` | No tests. **Default for sandbox/non-prod**. Not allowed in prod if Apex is included (except for non-Apex-only deployments) |
| `RunSpecifiedTests` | Only the named tests. Each class/trigger in the deployment needs **75% coverage individually** from those tests |
| `RunLocalTests` | All tests in org except managed packages. **Default for production deployments that contain Apex**. Needs 75% org-wide |
| `RunAllTestsInOrg` | Includes managed package tests |
| `RunRelevantTests` | Platform picks relevant tests based on changed code (newer; beta/GA status **(verify)**) |

- **Validation** (`sf project deploy validate` or check-only) runs tests without saving. A successful validation of a deployment that ran tests (RunLocalTests/RunSpecifiedTests/RunAll) can be **quick deployed within 10 days** without re-running tests, provided no Apex has changed in the target since.
- Production deployments are all-or-nothing (`rollbackOnError` is always true in prod).
- Deployment status: Setup > **Deployment Status**.

### 15.6 DevOps Center
- Salesforce's free, UI-based DevOps tool (GA Dec 2022). Work items, pipelines (stages from dev sandbox to UAT to prod), **GitHub** (and Bitbucket (verify)) as the source of truth, source tracking-based change capture, merges, conflict detection. Clicks-not-commands for admins, interoperable with the CLI for devs.
- Newer: DevOps Center on the platform UI rework, **DevOps Testing** (quality gates), Agentforce DevOps assistance (verify).
- Alternatives: **Copado**, **Gearset**, **Flosum**, **AutoRABIT**, **Blue Canvas**, **Salto**, plus open-source CI with GitHub Actions/GitLab CI + `sf` + **sfdx-git-delta** (`sf sgd source delta`) for delta deployments.

### 15.7 Static analysis and security
- **Salesforce Code Analyzer v5** (`@salesforce/plugin-code-analyzer`): commands `sf code-analyzer run|rules|config`. Engines: **PMD** (Apex/VF/XML rules; ApexCRUDViolation, ApexSharingViolations, ApexSOQLInjection, AvoidSoqlInLoops (OperationWithLimitsInLoop), ApexDoc...), **ESLint** (LWC/Aura/JS/TS), **RetireJS** (vulnerable JS libs), **CPD** (copy-paste detection), **Regex**, **Salesforce Graph Engine (SFGE)** (data-flow path analysis, e.g., CRUD/FLS), **Flow Scanner** (flows). Config file `code-analyzer.yml`. Outputs HTML/CSV/JSON/SARIF/XML. **v4 (`sf scanner run`) retired Aug 2025.**
- VS Code extension: Salesforce Code Analyzer. CI: GitHub Action `forcedotcom/run-code-analyzer`.
- **Apex PMD** directly (pmd-apex rules: Best Practices, Code Style, Design, Error Prone, Performance, Security). Also **ApexGuru** (AI-based antipattern insights in Scale Center), **Checkmarx** (used in security review).

### 15.8 AppExchange security review
- Required for any **managed package** listed publicly on AppExchange (AppExchange Partner Program, ISV). Submitted via the **Partner Console**. Fee per submission (e.g., **$999** for paid apps; free apps free (verify)), retested periodically.
- Submit: Code Analyzer/Checkmarx scan reports, **DAST** scans (e.g., ZAP/Burp) for external endpoints, false-positive documentation, test credentials, architecture docs.
- Common failures: CRUD/FLS not enforced, SOQL injection, XSS (unescaped output), insecure storage of secrets (use protected custom metadata/settings or Named Credentials), `without sharing` without justification, insecure remote JS, TLS issues, sensitive data in debug logs, use of `@AuraEnabled` methods without access checks.
- **Salesforce Platform AppExchange** also has listings for Agentforce agents/actions (**AgentExchange**).

---

## 16. Heroku and Salesforce Functions
- **Heroku**: Salesforce-owned PaaS (Dynos, Postgres, Key-Value Store, Heroku Connect, Pipelines). Moving to **Heroku Fir** generation (Kubernetes/OCI-based (verify)).
  - **Heroku Connect**: bidirectional sync between Salesforce objects and Heroku Postgres (polling or accelerated polling via streaming).
  - **Heroku AppLink** (GA 2025): expose Heroku apps (Node, Python, Java) as **Apex/Flow/Agentforce actions** with OpenAPI specs; Salesforce calls Heroku with the user's context, and the Heroku app calls back via SDK. Effectively the **successor to Salesforce Functions** **(verify)**.
  - **Heroku Managed Inference and Agents** (AI models and MCP hosting) (verify).
- **Salesforce Functions**: serverless (Node/Java/TypeScript) invoked from Apex (`functions.Function.get('proj.fn').invoke(...)`). **End of sale Sept 2023; retired Jan 31, 2025**. Don't propose for new work. Migrate to Heroku (AppLink) or other compute.

---

## 17. Agentforce for Developers

### 17.1 Custom agent actions
Agent actions can be backed by: **Apex (`@InvocableMethod`)**, **Flow** (autolaunched), **Prompt Templates**, **External Services/MuleSoft APIs**, Heroku AppLink, standard actions. Topic and action **descriptions/instructions** drive LLM planning, so write them carefully.
```apex
public with sharing class OrderStatusAction {
    public class Request {
        @InvocableVariable(label='Order Number' description='The customer order number, e.g. 00012345' required=true)
        public String orderNumber;
    }
    public class Response {
        @InvocableVariable(label='Status' description='Current fulfillment status of the order')
        public String status;
    }
    @InvocableMethod(label='Get Order Status' description='Returns the fulfillment status for an order number'
                     category='Orders')
    public static List<Response> getStatus(List<Request> requests) {
        List<Response> out = new List<Response>();
        for (Request r : requests) {   // bulkified: one input per element
            Response res = new Response();
            res.status = [SELECT Status FROM Order WHERE OrderNumber = :r.orderNumber WITH USER_MODE LIMIT 1]?.Status;
            out.add(res);
        }
        return out;
    }
}
```
- Rules: one `@InvocableMethod` per class. Static, public/global. Takes and returns a `List`. Supports `label`, `description`, `category`, `callout=true`, `capabilityType`, `iconName`, `configurationEditor`. `@InvocableVariable` supports `label`, `description`, `required`, `placeholderText`, `defaultValue` (verify).
- In Agent Builder: New Agent Action > Reference Action Type: Apex > select > set **Require Input**, **Collect data from user**, **Show in conversation** (output), and action-level instructions. Output rendering can use **Lightning Types**.
- Agents run as the **agent user** (service agents: a dedicated "Einstein Agent User"; employee agents: the logged-in user). Apex should enforce `WITH USER_MODE`.
- **Agent Script** / **Agentforce DX**: agents authored as metadata (`aiAuthoringBundle`, `.agent` Agent Script files), tested via `sf agent test` and **Testing Center**, and previewed with `sf agent preview` **(verify)**.

### 17.2 Agent API
- REST API to talk to an agent from outside Salesforce (custom UI, apps, other agents). Base: `https://api.salesforce.com/einstein/ai-agent/v1` (verify).
- Flow: create an ECA/Connected App with **Client Credentials**, scopes `api`, `refresh_token`, `chatbot_api`, `sfap_api` (verify), then get a token, then `POST /agents/{agentId}/sessions` (with `externalSessionKey`, `instanceConfig.endpoint`), `POST /sessions/{sessionId}/messages` (sync) or `/messages/stream` (SSE streaming), then `DELETE /sessions/{sessionId}`.
- Service agents (Agentforce Service Agent) are supported; employee agents via API have restrictions (verify). Consumption is billed (Flex Credits/conversations).
- Related: **Agentforce Mobile SDK**, **Embedded Messaging / Messaging for In-App and Web (MIAW)** for customer-facing deployment, **MCP**: Salesforce **hosted MCP servers** and **MCP client support in Agentforce** (beta/GA 2025-26 (verify)), **A2A** protocol support (verify).

### 17.3 Models API (Einstein Generative AI)
- Access LLMs through the **Einstein Trust Layer** (data masking, zero data retention, toxicity scoring, audit) from Apex or REST.
- REST: `https://api.salesforce.com/einstein/platform/v1/models/{modelName}/generations`, `/chat-generations`, `/embeddings`, `/feedback`. Header `x-sfdc-app-context: EinsteinGPT`, `x-client-feature-id: ai-platform-models-connected-app` (verify).
- Apex: `aiplatform.ModelsAPI` namespace (e.g., `aiplatform.ModelsAPI.createGenerations_Request`), and `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate()` for **Prompt Templates** (Prompt Builder).
- Model names like `sfdc_ai__DefaultGPT4Omni`, `sfdc_ai__DefaultOpenAIGPT4OmniMini`, `sfdc_ai__DefaultBedrockAnthropicClaude...`, plus BYO models from **Einstein Studio** (Model Builder) **(verify current list)**.
- Requires Einstein generative AI enabled. Consumes Einstein Requests / Flex Credits.

### 17.4 Other AI dev points
- **Prompt Builder** templates (Sales Email, Field Generation, Record Summary, Flex) can be grounded with merge fields, Flow, Apex (`@InvocableMethod` with `capabilityType='PromptTemplateType://...'`), and Data 360 retrievers (RAG).
- **Data 360 (Data Cloud)** developer: Query API (SQL), Ingestion API, Data Graphs, calculated insights; `ConnectApi.CdpQuery` in Apex.
- **Agentforce Testing Center** for batch-testing agent utterances; **Agentforce observability** (Session tracing, Agent analytics).

---

## 18. Quick reference: limits and numbers to remember

| Item | Value |
|---|---|
| Current API version | **68.0** (Winter '27) (verify) |
| Code coverage to deploy to prod | **75%** org-wide, plus every trigger >0% |
| Trigger batch size | 200 |
| Batch Apex scope | default 200, max 2,000 |
| Concurrent batch jobs | 5 (+100 flex queue) |
| Scheduled Apex jobs | 100 |
| Queueable from async | 1 child |
| Future calls per transaction | 50 |
| VF view state | 170 KB |
| Debug log size | 20 MB |
| Checkpoints | 5 |
| SOQL OFFSET max | 2,000 |
| REST query batch | 2,000 records (default) |
| Composite subrequests | 25 |
| sObject Collections | 200 records |
| Platform event retention | 72 hours |
| Quick deploy window | 10 days |
| Scratch org lifetime | 1-30 days (default 7) |
| Sandbox refresh | Dev/Dev Pro 1 day, Partial 5 days, Full 29 days |
| Packaging coverage for promote | 75% |

---

## Gotchas / common confusions

1. **`with sharing` does not enforce CRUD/FLS.** It controls record visibility only. Use `WITH USER_MODE` / `AccessLevel.USER_MODE` / `stripInaccessible` for object and field security. `WITH SECURITY_ENFORCED` is older, doesn't enforce sharing, and stops at the first error.
2. **Apex runs in system mode by default**, and omitting a sharing keyword is not the same as `with sharing`. Be explicit everywhere.
3. **`System.runAs` enforces sharing but not FLS/CRUD** (and only in tests).
4. **`Trigger.new` is read-only in after triggers**. Modify fields in *before* triggers without DML. Doing DML on the same records in after triggers causes recursion.
5. **Static Boolean recursion guards break bulk loads** (records 201+ get skipped). Use a static `Set<Id>`.
6. **Workflow field updates re-fire update triggers once**. Before-save flows run *before* before-triggers. Multiple triggers on one object have **no defined order**.
7. **Callout after uncommitted DML fails** ("You have uncommitted work pending"). Callout first, or move it async. Triggers can never call out synchronously.
8. **`@future` can't take sObjects**, can't chain, and can't be called from batch/future. Prefer Queueable.
9. **`Test.stopTest()` is what forces async to run**. Assertions on async results must come after it. Only one `startTest/stopTest` pair per test method.
10. **75% coverage is org-wide for RunLocalTests**, but **per class/trigger** for RunSpecifiedTests.
11. **`cacheable=true` Apex can't do DML** and is required for `@wire`. Refresh wired data with `refreshApex` on the *whole* wired result (not `.data`).
12. **`@track` is rarely needed** now. All fields are reactive on reassignment. It's only needed for mutating inner object/array properties.
13. **Don't mutate `@api` properties** in the child. Copy them to a private field.
14. **LWC can contain Aura? No.** Aura can contain LWC; the reverse isn't possible. LWR Experience sites support LWC only.
15. **Lightning Locker and LWS are not CSP replacements**. External URLs still need Trusted URLs, and callouts need Named Credentials or Remote Site Settings.
16. **SOQL single-row assignment** throws when there are 0 rows. Query into a list or use `LIMIT 1` with a null-safe approach.
17. **Aggregate queries can't use `queryMore`** and are capped (2,000 grouped rows in Apex). Semi-joins can't be combined with `OR`.
18. **Non-selective queries** on large objects (>200k rows) fail in triggers. Filter on indexed fields; check the Query Plan.
19. **Mixed DML**: setup objects (User, PermissionSetAssignment, Group) plus regular objects in one transaction fail. Split with async or `runAs` in tests.
20. **`LimitException` can't be caught**. Design to stay under limits (check `Limits.*`).
21. **Named Credential ≠ External Credential**: the NC is the endpoint, the EC is the auth. Users need permission set access to the EC principal, or the callout fails with an auth error.
22. **Connected Apps can't be newly created by default (Spring '26+)**. Use External Client Apps. **The username-password OAuth flow is being retired** (enforcement Feb 2027 (verify)). Use Client Credentials or JWT for servers.
23. **`sfdx force:*` commands are deprecated**. Use `sf` v2 syntax (`sf project deploy start`, not `sfdx force:source:push`). `sf scanner` (Code Analyzer v4) is retired; use `sf code-analyzer`.
24. **Source tracking doesn't exist in production** or Partial/Full sandboxes. Deploy with explicit `--source-dir`, `--metadata`, or `--manifest`.
25. **Change sets can't delete metadata** and only work between orgs tied to the same production org. Use destructive manifests via the CLI.
26. **Unlocked packages aren't IP-protected**. Only managed packages obfuscate code. A `global` member in a released managed package can't be removed.
27. **Beta package versions can't be installed in production** or upgraded. Promote (with 75% coverage) first.
28. **Salesforce Functions is retired (Jan 2025)**. Use Heroku AppLink or external compute. **Code Builder** is now branded **Agentforce Vibes IDE**, and **Agentforce for Developers** is now **Agentforce Vibes** (verify).
29. **Platform events: Publish Immediately isn't rolled back** if the transaction fails; Publish After Commit is. Event triggers run as Automated Process user (set a user via `PlatformEventSubscriberConfig`).
30. **Heap/CPU limits changed in Winter '27** (10 MB sync / 25 MB async heap per release blogs (verify)). Older docs and exams cite 6 MB/12 MB. CPU stays 10 s/60 s.
31. **Invocable methods are always bulk** (List in, List out, same size and order). Agentforce and Flow may batch multiple invocations together. Never assume a single element.
32. **API version matters**: behavior (e.g., null coalescing, template expressions, `FORMULA()` in SOQL) depends on the class/component/request API version. Keep `sourceApiVersion` and meta.xml versions current.
