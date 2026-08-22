# PRE-PRODUCTION REPAIR & SAFETY AUDIT
## Existing Tauri Project: My-Stats-main

أنت تعمل على مشروع Tauri موجود بالفعل، وليس مشروعًا جديدًا.

اسم المشروع الحالي:

My-Stats-main

مسار المشروع الحالي على جهاز المطور:

E:\Ahmed_VB\My-Stats-main\My-Stats-main

تعامل مع هذا المسار باعتباره:

PROJECT ROOT

هذا المشروع قائم ويحتوي على وظائف وقاعدة بيانات واختبارات وإعدادات موجودة بالفعل.

المطلوب هو:

PRE-PRODUCTION AUDIT + SAFE REPAIR

أي فحص المشروع وإصلاح المشاكل الضرورية فقط قبل Production Build، مع الحفاظ الكامل على الوظائف الحالية والبيانات الحالية.

==================================================
1. قاعدة أساسية: ممنوع إعادة بناء المشروع
==================================================

قبل تنفيذ أي تعديل:

قم بفحص المشروع الحالي بالكامل.

لا تقم بإعادة بناء المشروع من الصفر.

لا تقم بإعادة تصميم Architecture.

لا تقم بتحويل المشروع إلى Framework آخر.

لا تقم بتحويل JavaScript إلى TypeScript.

لا تقم بتغيير React.

لا تقم بتغيير Tauri.

لا تقم بتغيير Rust Toolchain.

لا تقم بتحديث Dependencies لمجرد وجود إصدارات أحدث.

لا تقم بإعادة تصميم واجهة المستخدم.

لا تقم بحذف Features موجودة.

لا تقم بحذف Tables.

لا تقم بحذف Records.

لا تقم بتغيير أسماء الجداول.

لا تقم بتغيير أسماء الأعمدة.

لا تقم بتغيير Business Logic إلا إذا كان هناك Bug واضح وخطير.

لا تقم بحذف قاعدة البيانات.

لا تقم بإنشاء Database جديدة بدل الحالية.

لا تقم بحذف Backups.

لا تقم بعمل Reset Database.

لا تقم بعمل DROP DATABASE.

أي تعديل يجب أن يكون:

MINIMAL
SAFE
BACKWARD COMPATIBLE
DATA PRESERVING

==================================================
2. اسم ومسار المشروع
==================================================

اسم المشروع:

My-Stats-main

مسار التطوير الحالي:

E:\Ahmed_VB\My-Stats-main\My-Stats-main

هذا المسار خاص بجهاز المطور فقط.

ممنوع وضع هذا المسار Hard-coded داخل Production Code.

ممنوع استخدام:

E:\Ahmed_VB\My-Stats-main\My-Stats-main

داخل:

JavaScript
React
Rust
Tauri
SQLite
Reports
Exports
Backups
Configuration

يجب أن يعتمد البرنامج في Production على Runtime Application Directory وليس على مسار التطوير.

==================================================
3. لا تغير اسم المشروع
==================================================

ممنوع:

Rename للمشروع.

Rename للمجلد.

نقل المشروع.

إنشاء مشروع جديد.

إنشاء مجلد باسم آخر.

تغيير اسم Repository.

تغيير Application Name.

لا تغير أي اسم إلا إذا كان ذلك مطلوبًا صراحة في مرحلة منفصلة.

==================================================
4. قرار قاعدة البيانات — مهم جدًا
==================================================

هذا قرار معماري نهائي.

قاعدة البيانات الأساسية يجب أن تبقى مرتبطة بمجلد البرنامج.

لا تنقل قاعدة البيانات الأساسية إلى:

AppData

Documents

Registry

Cloud

Server

أو أي مكان آخر خارج مجلد البرنامج.

الهدف:

إذا تم تغيير Windows أو عمل Format للقرص C، يجب ألا نفقد البيانات الموجودة على قرص آخر.

وإذا تم نقل البرنامج من:

C:

إلى:

D:

أو:

E:

أو:

F:

يجب أن تنتقل قاعدة البيانات مع البرنامج.

==================================================
5. بنية بيانات Production
==================================================

يفضل أن تكون البنية المنطقية:

My-Stats-main\
│
├── My-Stats-main.exe
│
├── data\
│   └── medicine_dispenser.db
│
├── backups\
│
├── reports\
│
├── exports\
└── logs\

لكن:

إذا كانت البنية الحالية للمشروع تعمل بشكل صحيح وتضع قاعدة البيانات بجوار EXE مباشرة، فلا تقم بنقلها أو تغييرها بشكل خطير.

الأولوية هي:

KEEP EXISTING DATABASE
+
KEEP EXISTING DATA
+
MAKE PATH RESOLUTION SAFE

لا تغير مكان قاعدة البيانات لمجرد تحسين Architecture.

==================================================
6. قاعدة البيانات الحالية
==================================================

اسم قاعدة البيانات الحالية:

medicine_dispenser.db

يجب الحفاظ على قاعدة البيانات الحالية.

ممنوع إنشاء:

new_database.db

database_new.db

medicine_dispenser_v2.db

أو أي قاعدة بيانات بديلة.

إذا كانت قاعدة البيانات الحالية بجوار EXE، حافظ عليها ما لم يكن هناك سبب تقني ضروري.

إذا كانت داخل data، استخدمها.

==================================================
7. Database Path Resolution
==================================================

يجب ألا يعتمد البرنامج على:

C:\

D:\

E:\

أو أي Drive ثابت.

يجب تحديد مكان قاعدة البيانات اعتمادًا على مكان تشغيل البرنامج.

مثال:

إذا كان البرنامج في:

D:\My-Stats-main\

يجب أن تكون قاعدة البيانات في:

D:\My-Stats-main\data\medicine_dispenser.db

أو في الموقع الحالي المعتمد داخل المشروع.

إذا تم نقل البرنامج إلى:

E:\My-Stats-main\

يجب أن يستخدم:

E:\My-Stats-main\data\medicine_dispenser.db

وإذا تم نقله إلى:

F:\My-Stats-main\

يجب أن يستخدم:

F:\My-Stats-main\data\medicine_dispenser.db

المهم:

لا تستخدم مسار التطوير.

==================================================
8. منع إنشاء Database ثانية
==================================================

هذه نقطة CRITICAL.

ممنوع حدوث:

Old Database
+
New Empty Database

بسبب تغيير:

Working Directory

أو:

Installation Directory

أو:

Current Directory

قبل فتح SQLite:

1. حدد Runtime Application Directory.
2. حدد Data Directory إذا كانت مستخدمة.
3. ابحث عن قاعدة البيانات الحالية.
4. تحقق من وجودها.
5. استخدمها.
6. لا تنشئ Database جديدة إذا كانت Database القديمة موجودة.

إذا لم توجد Database إطلاقًا:

اعتبرها First Run.

لا تنشئ Database فارغة إذا كانت هناك Database قديمة يمكن اكتشافها.

==================================================
9. عند فشل فتح قاعدة البيانات
==================================================

إذا فشل فتح Database:

اعرض رسالة واضحة للمستخدم.

مثال:

"تعذر فتح قاعدة البيانات الحالية. لم يتم إنشاء قاعدة بيانات جديدة حفاظًا على بياناتك."

ممنوع أن يقوم البرنامج تلقائيًا بإنشاء Database جديدة عند فشل فتح Database قديمة.

==================================================
10. دعم التشغيل من أي Drive
==================================================

يجب أن يعمل البرنامج من:

C:

D:

E:

F:

وأي Drive صالح.

مثال:

D:\My-Stats-main\

E:\My-Stats-main\

F:\My-Stats-main\

ولا يجب أن يعتمد على:

E:\Ahmed_VB\My-Stats-main\My-Stats-main

==================================================
11. C:\Reports
==================================================

ابحث في المشروع بالكامل عن:

C:\Reports

وأي مسار ثابت مشابه.

لا تستخدم مسارًا ثابتًا للتقارير.

اجعل Reports تعتمد على:

Application Directory

أو:

Data Directory

أو:

User-selected Directory

بحسب التصميم الحالي.

المهم:

لا تعتمد على C:\.

==================================================
12. فحص جميع Hard-Coded Paths
==================================================

ابحث عن:

C:\

D:\

E:\

E:\Ahmed_VB\

My-Stats-main

localhost

127.0.0.1

وأي مسارات خاصة بجهاز المطور.

صنف النتائج إلى:

CRITICAL
HIGH
MEDIUM
SAFE

قم بإصلاح المسارات التي تؤثر على Production فقط.

لا تغير Test Paths التي تستخدم فقط في Testing.

==================================================
13. Password Security — CRITICAL
==================================================

راجع نظام تسجيل الدخول بالكامل.

يجب ألا يتم تخزين كلمات المرور Plain Text.

لا يجب أن يكون:

password_hash

هو كلمة المرور نفسها.

استخدم Password Hashing حقيقيًا.

يفضل:

Argon2id

أو:

bcrypt

يجب أن يكون النظام:

Password
↓
Hash
↓
SQLite

وعند تسجيل الدخول:

Password
↓
Verify Hash
↓
Login

لا تقم بتخزين كلمة المرور الأصلية.

==================================================
14. Default Credentials
==================================================

ابحث عن:

admin/admin

user/user

viewer/viewer

وأي:

Test Users

Demo Users

Mock Users

Default Passwords

لا يجب أن تكون هذه البيانات موجودة داخل Production Frontend أو Production Bundle.

إذا كانت موجودة فقط في:

Test Code

Development Mock

Seed Data

افصلها عن Production.

لا تحذف أي مستخدم حقيقي موجود في Database بدون ضرورة.

==================================================
15. Admin Password Reset
==================================================

راجع:

reset_admin_password

وأي وظيفة مشابهة.

ممنوع وجود:

admin

123456

password

أو أي كلمة مرور Hard-coded داخل Production Code.

إذا كانت هناك آلية Reset حقيقية:

اجعلها آمنة.

ولا تعرض كلمات المرور داخل Source Code.

==================================================
16. SQLite Configuration
==================================================

راجع إعدادات SQLite الحالية.

خصوصًا:

PRAGMA foreign_keys = ON

PRAGMA journal_mode = WAL

PRAGMA busy_timeout

PRAGMA synchronous

إذا كانت الإعدادات الحالية سليمة:

حافظ عليها.

لا تغير SQLite Configuration لمجرد التحسين.

==================================================
17. Database Integrity
==================================================

قبل أي Migration أو تعديل Database:

أنشئ Backup.

ثم نفذ:

PRAGMA integrity_check

إذا كانت النتيجة:

ok

تابع.

إذا فشلت:

STOP

ولا تقم بأي Migration.

==================================================
18. Migration Safety
==================================================

أي Migration يجب أن تكون:

Safe

Backward Compatible

Data Preserving

ممنوع:

DROP TABLE

DELETE FROM

DROP DATABASE

Reset Database

إلا إذا كان هناك سبب تقني واضح جدًا.

عند إضافة Column:

استخدم Migration آمنة.

عند تغيير Schema:

احتفظ بالبيانات القديمة.

==================================================
19. Backup Before Migration
==================================================

قبل أي تعديل على Database:

أنشئ Backup كامل.

مثال:

backups\
medicine_dispenser_2026-08-11_143000.db

لا تستبدل Backup قديمًا.

لا تحذف النسخ القديمة تلقائيًا.

==================================================
20. Backup System
==================================================

راجع نظام Backup الحالي.

يجب أن يدعم:

Create Backup

Verify Backup

Restore Backup

Timestamp

Data Integrity

لا تحذف Backups الحالية.

==================================================
21. PDF Attachments
==================================================

المشروع يحتوي على بيانات PDF مرتبطة بقاعدة البيانات.

لا تقم بتغيير:

patient_pdfs

أو:

pdf_data

ولا تقم بتحويل طريقة التخزين الآن.

تأكد فقط أن Backup يشمل البيانات الموجودة فعليًا.

==================================================
22. Excel
==================================================

لا تعيد تصميم نظام Excel.

اختبر:

Import

Export

مع:

Arabic

Dates

Currency

Large Datasets

Empty Cells

Duplicate Rows

لا تحذف Excel Libraries إلا بعد التأكد أنها غير مستخدمة.

==================================================
23. Reports
==================================================

اختبر:

PDF

Excel

Print

Reports

وتأكد من عدم وجود:

C:\Reports

أو أي Hard-coded Report Path.

==================================================
24. Rust Error Handling
==================================================

ابحث عن:

unwrap()

expect()

panic!()

لا تقم بإزالة جميع الحالات بشكل آلي.

راجعها واحدة واحدة.

أصلح الحالات التي يمكن أن تؤدي إلى:

Application Crash

Database Corruption

Lost Data

Failed Report

Failed Backup

Failed Transaction

لا تغير الحالات الآمنة بلا داعٍ.

==================================================
25. Tauri Capabilities
==================================================

راجع:

src-tauri/capabilities/

حافظ على:

Least Privilege

ممنوع إضافة:

shell:allow-all

fs:allow-all

http:allow-all

إلا إذا كان هناك استخدام فعلي ومحدد.

إذا ظهر Permission Error:

حدد السبب.

ثم أضف أقل Permission ممكن.

لا توسع الصلاحيات لمجرد أن Build فشل.

==================================================
26. Dependencies
==================================================

ممنوع تنفيذ:

npm update

npm upgrade

cargo update

rustup update

إلا إذا كان هناك سبب تقني واضح يمنع تشغيل المشروع.

نريد الحفاظ على البيئة الحالية.

==================================================
27. JavaScript / TypeScript
==================================================

لا تحول المشروع إلى TypeScript.

المشروع الحالي يعتمد على JavaScript.

لا تقم بتحويل:

.js

إلى:

.ts

ولا:

.jsx

إلى:

.tsx

إلا إذا كان هناك ملف محدد جدًا يحتاج ذلك ولا يمكن إصلاحه بطريقة آمنة.

==================================================
28. React
==================================================

لا تعيد تصميم:

Components

Navigation

Forms

Tables

Dashboard

Pages

UI

إلا لإصلاح Bug واضح.

لا تغير الشكل العام للتطبيق.

==================================================
29. Performance
==================================================

راجع الأداء بدون إعادة كتابة المشروع.

ركز على:

SQLite Queries

Large Tables

Excel Import

Excel Export

Reports

Dashboard

PDF Handling

تجنب تحميل كميات ضخمة من البيانات إلى Frontend دفعة واحدة إذا كان Pagination ممكنًا.

لكن لا تغير Behavior الحالي بدون سبب واضح.

==================================================
30. Production Logs
==================================================

ابحث عن:

console.log

println!

debug logs

temporary logs

لا تحذف Logging المفيد.

لكن افصل Debug Logging عن Production.

ممنوع تسجيل:

Passwords

Tokens

Secrets

Sensitive Information

==================================================
31. Development Data
==================================================

ابحث عن:

Mock Data

Test Data

Demo Data

Test Users

Development Database

Development Paths

افصلها عن Production.

لا تحذف البيانات الحقيقية.

==================================================
32. Environment Files
==================================================

افحص:

.env

.env.local

.env.production

تأكد من عدم وجود:

Passwords

API Keys

Secrets

Private Keys

إذا وجدت Secret حقيقيًا:

لا تطبعه كاملًا.

اذكر فقط:

SECRET FOUND

==================================================
33. Tauri Version
==================================================

لا تغير Tauri Version الحالية.

لا تغير:

React

Vite

Rust

SQLite

Dependencies

إلا إذا كان هناك سبب تقني واضح.

الأولوية:

STABILITY FIRST

==================================================
34. WebView2
==================================================

حافظ على إعداد WebView2 الحالي.

إذا كان المشروع يستخدم:

Offline Installer

لا تغيره إلى:

Online Installer

لأن البرنامج يجب أن يكون قادرًا على التثبيت في بيئة بدون Internet.

==================================================
35. Windows Compatibility
==================================================

يجب أن يعمل البرنامج على:

Windows 10 64-bit

Windows 11 64-bit

ولا يجب أن يعتمد على:

جهاز المطور

مسار المطور

Drive محدد

Internet أثناء التشغيل

==================================================
36. Installer
==================================================

راجع إعدادات Installer فقط.

لا تبنِ Installer النهائي الآن.

يجب أن يكون المستخدم قادرًا على اختيار مسار التثبيت.

مثل:

C:\My-Stats-main

D:\My-Stats-main

E:\My-Stats-main

ويجب أن يعمل البرنامج من المكان المختار.

لا تفرض:

C:\Program Files

إذا كان ذلك يتعارض مع تصميم تخزين قاعدة البيانات داخل مجلد البرنامج.

==================================================
37. نقل البرنامج بين الأقراص
==================================================

يجب أن يدعم التصميم:

D:\My-Stats-main

ثم:

نسخ المجلد بالكامل

إلى:

E:\My-Stats-main

ثم تشغيل:

E:\My-Stats-main\My-Stats-main.exe

ويجب أن يستخدم Database الموجودة في:

E:\My-Stats-main\

أو:

E:\My-Stats-main\data\

بحسب البنية الحالية.

ولا يجب أن يعود إلى:

D:\

ولا:

C:\

ولا:

AppData

==================================================
38. تغيير Windows
==================================================

اختبار السيناريو التالي:

Windows 10

ثم:

Database على D:

ثم:

Format C:

ثم:

Install Windows جديد

ثم:

تشغيل البرنامج من D:

النتيجة المطلوبة:

يتم اكتشاف Database القديمة.

تفتح نفس البيانات.

لا يتم إنشاء Database جديدة.

==================================================
39. Database Discovery
==================================================

نفذ منطقًا واضحًا لتحديد Database.

الأولوية:

1. Database الحالية في موقع البرنامج.
2. Data Directory الحالية إذا كانت مستخدمة.
3. أي موقع قديم معروف فقط إذا كان المشروع لديه Legacy Database Path واضح.
4. First Run فقط إذا لم توجد Database فعلية.

ممنوع إنشاء Database جديدة لمجرد فشل فتح المسار الأول.

==================================================
40. Transaction Safety
==================================================

راجع العمليات الحساسة:

Database Writes

Payments

Imports

Bulk Operations

Reports

Backups

استخدم Transactions عند الحاجة.

لا تسمح بعملية فاشلة أن تترك Database في حالة جزئية.

==================================================
41. الاختبارات بعد الإصلاح
==================================================

بعد تنفيذ الإصلاحات:

نفذ بالترتيب:

npm install

ثم:

npm run lint

ثم:

npm run test

ثم:

npm run test:e2e

ثم:

npm run build

لا تستخدم Tauri Production Build قبل نجاح هذه المراحل.

==================================================
42. Database Test
==================================================

استخدم نسخة من Database الحالية للاختبار.

لا تعمل على Database الأصلية أثناء اختبار Migration.

اختبر:

Open

Read

Write

Update

Backup

Restore

Migration

Integrity Check

ثم تحقق من:

عدد الجداول.

عدد السجلات.

العلاقات.

البيانات.

==================================================
43. Drive Relocation Test
==================================================

اختبر:

Database موجودة.

ثم تشغيل البرنامج من:

D:\My-Stats-main

ثم نسخ البرنامج إلى:

E:\My-Stats-main

ثم تشغيل:

E:\My-Stats-main\My-Stats-main.exe

يجب أن يستخدم Database الموجودة في E:.

يجب ألا يستخدم D:.

يجب ألا يستخدم C:.

يجب ألا يستخدم AppData.

==================================================
44. ما يجب ألا تفعله
==================================================

ممنوع تمامًا:

❌ حذف Database

❌ إنشاء Database بديلة

❌ نقل Database إلى AppData

❌ نقل Database إلى Documents

❌ حذف Backups

❌ Reset Database

❌ DROP TABLE بدون ضرورة

❌ DELETE بيانات

❌ تغيير Schema بطريقة غير آمنة

❌ تغيير React

❌ تحويل JavaScript إلى TypeScript

❌ تحديث Dependencies بدون ضرورة

❌ تحديث Tauri بدون ضرورة

❌ تحديث Rust Toolchain بدون ضرورة

❌ إعادة تصميم UI

❌ إعادة كتابة المشروع

❌ حذف Features

❌ إزالة Libraries بدون إثبات أنها غير مستخدمة

❌ استخدام مسارات خاصة بجهاز المطور

❌ ترك Passwords داخل Source Code

❌ ترك admin/admin في Production

❌ إنشاء Database جديدة عند فشل فتح Database القديمة

❌ الاعتماد على C:\ كمكان ثابت للبيانات

==================================================
45. بعد كل إصلاح
==================================================

بعد كل مجموعة إصلاحات:

1. Compile
2. Test
3. Verify Database
4. Verify Application Startup
5. Verify affected Feature

إذا فشل أي شيء:

STOP

لا تنتقل إلى إصلاح آخر قبل فهم السبب.

==================================================
46. تقرير الإصلاح النهائي
==================================================

في النهاية أنشئ تقريرًا واضحًا يحتوي على:

## FIXED

المشاكل التي تم إصلاحها.

## NOT FIXED

المشاكل التي تحتاج قرارًا أو وقتًا إضافيًا.

## NOT TOUCHED

الأجزاء التي لم يتم تغييرها حفاظًا على الاستقرار.

## DATABASE

Location

Integrity

Migration

Backup

Restore

## SECURITY

Password Hashing

Default Users

Secrets

Permissions

## PATHS

Hard-coded Paths Removed

Runtime Paths Verified

## TESTS

| Test | Result |
|---|---|
| npm install | PASS/FAIL |
| Lint | PASS/FAIL |
| Unit Tests | PASS/FAIL |
| E2E | PASS/FAIL |
| Frontend Build | PASS/FAIL |
| Database Integrity | PASS/FAIL |
| Backup | PASS/FAIL |
| Restore | PASS/FAIL |
| Application Startup | PASS/FAIL |
| Drive Relocation | PASS/FAIL |

==================================================
47. شرط التوقف النهائي
==================================================

بعد تنفيذ الإصلاحات والاختبارات:

لا تقم بعمل:

tauri build

ولا تقم بإنشاء Installer نهائي.

توقف وانتظر تعليماتي.

سأراجع تقريرك ونتائج الاختبارات أولًا، وبعد ذلك فقط سيتم إعطاؤك تعليمات Production Build.

==================================================
FINAL RULE
==================================================

هذا المشروع وصل إلى مرحلة متقدمة.

الأولوية ليست:

"Make everything better"

الأولوية هي:

"Make the existing application production-safe without breaking anything."

أي تعديل غير ضروري:

DO NOT MAKE IT.

أي Database Change غير ضروري:

DO NOT MAKE IT.

أي Dependency Update غير ضروري:

DO NOT MAKE IT.

أي UI Redesign:

DO NOT MAKE IT.

أي تغيير في مكان قاعدة البيانات:

DO NOT MAKE IT.

أي تغيير في أسماء المشروع أو المجلدات:

DO NOT MAKE IT.

==================================================
FINAL ARCHITECTURE DECISION
==================================================

اسم المشروع:

My-Stats-main

مسار التطوير:

E:\Ahmed_VB\My-Stats-main\My-Stats-main

هذا المسار لا يجوز Hard-code في Production.

قاعدة البيانات الأساسية:

medicine_dispenser.db

يجب أن تبقى مرتبطة بمجلد البرنامج.

التطبيق يجب أن يكون قادرًا على العمل من:

C:

D:

E:

F:

وأي Drive صالح.

وعند نقل مجلد البرنامج بالكامل إلى Drive آخر:

يجب أن تنتقل معه قاعدة البيانات والبيانات والـBackups.

الهدف النهائي:

Application
+
Database
+
Backups
+
Reports
+
Exports

تظل مرتبطة بمجلد البرنامج، مع استخدام Runtime Paths ديناميكية وعدم الاعتماد على جهاز المطور.

نفذ فقط الإصلاحات الضرورية.

ثم:

AUDIT
→
FIX
→
TEST
→
VERIFY
→
REPORT
→
STOP