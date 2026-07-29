import React, { useState, useRef } from 'react';
import { 
  BookOpen, Search, Printer, FileText, Info, Rocket, Pill, 
  Syringe, Scale, Calendar, HelpCircle, Key, Database, ChevronLeft, CheckCircle2, AlertTriangle, ArrowUpRight,
  Monitor, Command, Search as SearchIcon, Bell, Wifi, Activity, FileSignature, Sun, Layout, Clock
} from 'lucide-react';
import Breadcrumb from '../../components/ui/Breadcrumb';
import Card from '../../components/ui/Card';

const UserGuidePage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('intro');
  const contentRef = useRef(null);

  // Guide sections content
  const sections = [
    {
      id: 'intro',
      title: 'مقدمة عن التطبيق',
      icon: Info,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            تطبيق <strong>إحصائياتي (My Stats)</strong> هو نظام متكامل ومحلي بالكامل مصمم لإدارة وحصر عمليات صرف الأدوية والمستلزمات الطبية للعيادات والإدارات التابعة لفروع الهيئة العامة للتأمين الصحي. يساعد هذا التطبيق على تنظيم عملية الصرف، تتبع الموازنات، وتوفير تقارير دقيقة للغاية لدعم متخذي القرار.
          </p>
          <div className="p-4 rounded-2xl border border-primary/20 bg-primary/5 space-y-3">
            <h5 className="font-bold text-sm flex items-center gap-2 text-[var(--color-primary)]">
              <CheckCircle2 size={16} /> الميزات الرئيسية للنظام:
            </h5>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-semibold text-[var(--color-text-muted)] list-disc list-inside">
              <li>العمل بنسبة 100% بدون إنترنت (قاعدة بيانات محلية آمنة).</li>
              <li>إدارة البيانات الهيكلية (الفروع، المناطق، العيادات).</li>
              <li>فصل عمليات صرف الأنسولين وتتبع أرصدته وحساب معدلاته.</li>
              <li>نظام خاص لمتابعة وصرف أدوية الأحكام القضائية.</li>
              <li>إدخال المنصرف الشهري للأدوية المجانية والمدعمة بالتفصيل.</li>
              <li>تتبع وإدخال التذاكر الطبية للعيادات المملوكة والمدعمة (56c و 56b).</li>
              <li>تقارير إحصائية، مالية، ومقارنة متطورة برسوم بيانية.</li>
              <li>تصدير PDF احترافي مع توقيع رقمي وإعدادات مسبقة قابلة للحفظ.</li>
              <li>نظام متكامل لإدارة البيانات والنسخ الاحتياطي وحماية الأقفال.</li>
              <li>وضع Dark Mode والأوضاع المتعددة للواجهة مع تفضيلات محفوظة.</li>
              <li>نافذة التنقل السريع (Command Palette) باختصار Ctrl+K.</li>
              <li>نظام إشعارات ذكي مع تراجع (Undo) وتجميع الإشعارات وسجل كامل.</li>
              <li>لوحة تحليل أداء النظام (حجم DB، سرعة الاستعلامات، حالة الذاكرة).</li>
              <li>البحث العام في جميع صفحات النظام باختصار Ctrl+Shift+F.</li>
              <li>إكمال تلقائي (AutoComplete) في حقول البحث للفروع والعيادات والأدوية.</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'getting-started',
      title: 'بدء الاستخدام وتأسيس البيانات',
      icon: Rocket,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            لتشغيل التطبيق والبدء بالعمليات الحسابية والصرف، يجب تأسيس البيانات الهيكلية أولاً وفق التسلسل التالي:
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-4 p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
              <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center font-black text-sm shrink-0">١</div>
              <div className="flex-1">
                <h6 className="font-bold text-sm text-[var(--color-text)]">إعداد الهيكل الإداري:</h6>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  أدخل الفروع الإدارية أولاً، ثم المناطق التابعة لكل فرع، وأخيراً العيادات التابعة لكل منطقة عبر قائمة <strong>البيانات الأساسية</strong>.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
              <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center font-black text-sm shrink-0">٢</div>
              <div className="flex-1">
                <h6 className="font-bold text-sm text-[var(--color-text)]">تكويد الأدوية والمستلزمات:</h6>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  قم بإدخال تصنيفات الأدوية (مثل: أقراص، شراب، مضادات) ثم أضف الأدوية والوحدات الخاصة بكل صنف لضمان التناسق.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
              <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center font-black text-sm shrink-0">٣</div>
              <div className="flex-1">
                <h6 className="font-bold text-sm text-[var(--color-text)]">بدء حركة الصرف:</h6>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  انتقل إلى الصفحة الرئيسية، اختر الفرع والمنطقة والعيادة والنشاط المراد العمل عليه لبدء إضافة المنصرف.
                </p>
              </div>
            </div>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span><strong>نصيحة للإدارة:</strong> يتيح لك النظام إمكانية حذف عدة عيادات أو فروع دفعة واحدة باستخدام خاصية "الحذف المتعدد" لتسريع التعديلات.</span>
          </div>
        </div>
      ),
    },
    {
      id: 'interface',
      title: 'واجهة المستخدم والتنقل',
      icon: Monitor,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            تم تطوير واجهة المستخدم بميزات تنقل ذكية لتسريع العمل وتحسين التجربة:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2 flex items-center gap-2">
                <Sun size={14} /> الوضع الداكن/الفاتح
              </h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                يدعم النظام التبديل السلس بين الوضعين الفاتح والداكن. اضغط على أيقونة الشمس/القمر في الشريط العلوي للتبديل. يتم حفظ تفضيلك تلقائياً في المتصفح لاستخدامه في الزيارات القادمة، مع اكتشاف تلقائي لتفضيل نظام التشغيل في الزيارة الأولى.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2 flex items-center gap-2">
                <Command size={14} /> نافذة التنقل السريع (Ctrl+K)
              </h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                اضغط <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-[10px]">Ctrl+K</kbd> لفتح نافذة التنقل السريع (Command Palette). اكتب جزءاً من اسم الصفحة للانتقال إليها فوراً دون الحاجة للتنقل عبر القوائم الجانبية. يمكنك أيضاً الضغط على الزر المخصص في الشريط العلوي.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2 flex items-center gap-2">
                <SearchIcon size={14} /> البحث العام (Ctrl+Shift+F)
              </h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                اضغط <kbd className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-[10px]">Ctrl+Shift+F</kbd> لفتح البحث العام في النظام. اكتب أي كلمة مفتاحية (مثل اسم دواء، فرع، تقرير) وسيبحث النظام في جميع الصفحات ويعرض النتائج في لوحة مركزية.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2 flex items-center gap-2">
                <Layout size={14} /> تأثيرات التنقل والتحميل
              </h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                عند التنقل بين الصفحات، تظهر تأثيرات انتقال سلسة (Page Transitions) مع شاشة تحميل (Splash Screen) عند بدء التشغيل. إذا فشل تحميل إحدى الصفحات، يظهر نظام Error Boundary ودي مع زر إعادة المحاولة بدلاً من الصفحة البيضاء.
              </p>
            </div>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span><strong>اختصارات مهمة:</strong> Ctrl+K للتنقل السريع | Ctrl+Shift+F للبحث العام | Ctrl+P للطباعة</span>
          </div>
        </div>
      ),
    },
    {
      id: 'regular-drugs',
      title: 'صرف الأدوية العادية التفصيلي',
      icon: Pill,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            تُعد شاشة <strong>صرف الأدوية (التفصيلي)</strong> هي الشاشة المحورية لإدخال استهلاك الأدوية اليومية أو الدورية للعيادات:
          </p>
          <ul className="list-decimal list-inside space-y-2 text-xs font-semibold text-[var(--color-text-muted)]">
            <li>من قائمة العمليات، اختر <strong>صرف الأدوية (التفصيلي)</strong>.</li>
            <li>اختر العيادة، الشهر المستهدف، والتصنيف الدوائي.</li>
            <li>حدد الدواء المطلوب؛ سيقترح عليك النظام السعر التلقائي بناءً على آخر عملية صرف مسجلة لنفس الدواء لتسهيل الإدخال وتوحيد الأسعار.</li>
            <li>أدخل <strong>الكمية المنصرفة</strong>، و<strong>السعر الفعلي</strong>، و<strong>عدد الحالات</strong> التي صُرف لها الدواء.</li>
            <li>اضغط على زر <strong>إضافة للجدول</strong>. يمكنك تكرار هذه العملية لإضافة أدوية متعددة في جدول مؤقت.</li>
            <li>بعد التأكد من مطابقة السجلات، اضغط على زر <strong>حفظ المنصرف النهائي</strong> لترحيل البيانات إلى قاعدة البيانات.</li>
          </ul>
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 rounded-xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            <span><strong>ميزة جديدة:</strong> حقول البحث للفروع والعيادات والأدوية تدعم الآن الإكمال التلقائي (AutoComplete) — ابدأ بكتابة أول حرف وستظهر القائمة المنسدلة تلقائياً.</span>
          </div>
        </div>
      ),
    },
    {
      id: 'insulin',
      title: 'إدارة وصرف الأنسولين',
      icon: Syringe,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            نظراً للأهمية الخاصة للأنسولين، صُمم له نظام تتبع مستقل تماماً لتسجيل حركته الشهرية:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">تأسيس أكواد الأنسولين:</h6>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                من شاشة "إدارة الأنسولين" في البيانات الأساسية، أدخل أكواد الأنسولين الرسمية، نوع الأنسولين (طويل المفعول، مختلط، إلخ)، وحدات الصرف، والتصنيف.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">تسجيل المنصرف الشهري:</h6>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                في شاشة "صرف الأنسولين"، حدد العيادة والشهر والكود. سيقوم النظام بحساب <strong>معدل الصرف</strong> و<strong>الرصيد المتبقي تلقائياً</strong> فور إدخال الكمية والحالات والسعر لحساب الموازنة.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'judicial',
      title: 'أحكام المحكمة والمرضى القضائيين',
      icon: Scale,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            يحتوي النظام على نظام ذكي لمتابعة صرف الأدوية الصادرة بموجب أحكام قضائية لمرضى محددين:
          </p>
          <div className="space-y-3 text-xs text-[var(--color-text-muted)]">
            <p>
              ١. <strong>تسجيل المريض القضائي</strong>: من خلال شاشة الأحكام القضائية، أضف بيانات المريض بالكامل (الاسم، التشخيص الطبي، تاريخ حكم المحكمة، وتاريخ بدء العلاج الفعلي) وربطه بعيادته.
            </p>
            <p>
              ٢. <strong>إدخال حركات الصرف</strong>: قم بتسجيل صرف الدواء المعتمد بالحكم للمريض مع إدخال الجرعة الشهرية المحددة والتكلفة الفعلية.
            </p>
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl text-xs font-bold flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>تنبيه هام: تتطلب سجلات الأحكام القضائية دقة شديدة، ولا يسمح النظام بحذف دواء أو مريض مرتبط بعمليات صرف نشطة ومحفوظة مسبقاً لحفظ نزاهة السجلات المرفوعة قانونياً.</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'monthly-dispensing',
      title: 'المنصرف الشهري (المجاني والمدعم)',
      icon: Calendar,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            يستخدم لتسجيل التوتالات والقيم الإجمالية الموزعة شهرياً للعيادات وهي مقسمة إلى قسمين رئيسيين:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-sm text-[var(--color-text)] mb-2">أدوية مجانية شهرية:</h6>
              <p className="text-[var(--color-text-muted)] mb-2">يتم إدخال قيم استهلاك الأدوية المجانية مقسمة إلى الفئات التالية:</p>
              <ul className="list-disc list-inside space-y-1 text-[var(--color-text-muted)]">
                <li>مجاني الهيئة (العاملين)</li>
                <li>مجاني الطلاب (المدارس)</li>
                <li>مجاني الأطفال والرضع</li>
                <li>مجاني المرأة المعيلة</li>
              </ul>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-sm text-[var(--color-text)] mb-2">أدوية مدعمة شهرية (تجارية):</h6>
              <p className="text-[var(--color-text-muted)] mb-2">تتطلب إدخال القيمة الإجمالية المنصرفة، مع تحديد <strong>قيمة مساهمة المريض</strong> بدقة للفئات التالية:</p>
              <ul className="list-disc list-inside space-y-1 text-[var(--color-text-muted)]">
                <li>موظفو الهيئة وعائلاتهم</li>
                <li>طلاب المدارس</li>
                <li>الأطفال دون السن المدرسي</li>
              </ul>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'notifications',
      title: 'الإشعارات الذكية وحالة الاتصال',
      icon: Bell,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            تم إضافة نظام إشعارات ذكي وشريط حالة اتصال لتحسين متابعة المستخدم:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2 flex items-center gap-2">
                <Bell size={14} /> نظام الإشعارات الذكية
              </h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                يعرض النظام إشعارات Toast متطورة عند نجاح أو فشل العمليات. يدعم النظام:
              </p>
              <ul className="list-disc list-inside mt-2 text-[var(--color-text-muted)] leading-relaxed space-y-1">
                <li><strong>التراجع (Undo):</strong> تظهر رسالة تراجع بعد الحذف تسمح بإلغاء العملية.</li>
                <li><strong>تجميع الإشعارات:</strong> يتم تجميع الإشعارات المتكررة في إشعار واحد مع عداد.</li>
                <li><strong>سجل الإشعارات:</strong> لوحة مركزية تعرض آخر 100 إشعار مع تصنيفها (نجاح، خطأ، تحذير، معلومات).</li>
              </ul>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2 flex items-center gap-2">
                <Wifi size={14} /> شريط حالة الاتصال
              </h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                شريط صغير في أسفل الشاشة يعرض حالة الاتصال بالخلفية (Tauri API):
              </p>
              <ul className="list-disc list-inside mt-2 text-[var(--color-text-muted)] leading-relaxed space-y-1">
                <li><strong className="text-green-500">🟢 متصل:</strong> الخدمة الخلفية تعمل بشكل طبيعي.</li>
                <li><strong className="text-red-500">🔴 غير متصل:</strong> يتم إعادة المحاولة تلقائياً كل 5 ثوانٍ.</li>
                <li><strong className="text-yellow-500">🟡 جاري الاتصال:</strong> محاولة إعادة الاتصال جارية.</li>
              </ul>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'medical-tickets',
      title: 'حصر التذاكر الطبية والفترات',
      icon: FileText,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            يسمح النظام بحصر وتتبع أعداد التذاكر الطبية الصادرة من العيادات خلال الفترات الشهرية (الأولى، الثانية، الثالثة، الرابعة):
          </p>
          <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] space-y-3">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="font-bold text-xs text-[var(--color-text)]">العيادات المملوكة:</span>
              <span className="text-[10px] bg-primary/10 text-primary p-1 px-2 rounded-full font-black">56c & 56b</span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              للعيادات المملوكة بالكامل للهيئة، يتم إدخال تذاكر الفئتين <strong>56c</strong> و <strong>56b</strong> لكل فترة زمنية ولكل تصنيف مرضى (هيئة، طلاب، أطفال).
            </p>
            <div className="flex justify-between items-center border-b pb-2 pt-2">
              <span className="font-bold text-xs text-[var(--color-text)]">العيادات المدعمة:</span>
              <span className="text-[10px] bg-amber-500/10 text-amber-600 p-1 px-2 rounded-full font-black">56c فقط</span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              بالنسبة للعيادات الخارجية المدعمة، يتم الاكتفاء بإدخال قيم تذاكر الفئة <strong>56c</strong> فقط للفترات الأربع.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'supplies-and-groups',
      title: 'المستلزمات والمجموعات الدوائية',
      icon: Database,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            يتعامل النظام مع مستلزمات الجراحة والمجموعات العلاجية الخاصة ذات القيمة المرتفعة:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">المستلزمات الطبية:</h6>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                يتم إدخال قيمة استهلاك المستلزمات الطبية شهرياً للعيادات مقسمة إلى: <strong>قيمة المستهلك الفردي</strong> و<strong>قيمة الجهات الاعتبارية</strong> التي تم التوريد لها.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">المجموعات الدوائية:</h6>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                يتم تعريف وتكويد أكواد المجموعات الدوائية، وتسجيل التكلفة الإجمالية لكل عيادة شهرياً لتحديد ميزانية الفئات العلاجية المتخصصة (مثل أدوية الأورام أو الفشل الكلوي).
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'export',
      title: 'نظام التصدير المتقدم والإعدادات المفضلة',
      icon: FileSignature,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            تم تطوير نظام التصدير ليشمل خيارات احترافية متعددة مع دعم كامل للغة العربية:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">📄 تصدير PDF احترافي</h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                يستخدم النظام مكتبة jsPDF + jspdf-autotable لإنشاء ملفات PDF احترافية مع:
              </p>
              <ul className="list-disc list-inside mt-1 text-[var(--color-text-muted)] space-y-1">
                <li>دعم كامل للغة العربية عبر خط Amiri المدمج.</li>
                <li>رأس وتذييل لكل صفحة مع شعار الهيئة.</li>
                <li>ترقيم الصفحات تلقائي (صفحة X من Y).</li>
                <li>تقسيم الجداول الطويلة تلقائياً عبر صفحات متعددة.</li>
                <li>تضمين الرسوم البيانية (Charts) كصور داخل الـ PDF.</li>
              </ul>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">✍️ التوقيع الرقمي للتقارير</h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                أضف توقيعاً رقمياً احترافياً في أسفل كل تقرير مصدّر:
              </p>
              <ul className="list-disc list-inside mt-1 text-[var(--color-text-muted)] space-y-1">
                <li>اسم مُعد التقرير ومدير الصيدلية.</li>
                <li>رقم الاعتماد وتاريخ التصدير.</li>
                <li>يُحفظ التوقيع في قاعدة البيانات لاستخدامه تلقائياً في المرات القادمة.</li>
                <li>يمكن إظهار أو إخفاء التوقيعات عند التصدير.</li>
              </ul>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">💾 الإعدادات المفضلة (Export Presets)</h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                احفظ مجموعات الإعدادات المفضلة للتصدير واستخدمها بنقرة واحدة:
              </p>
              <ul className="list-disc list-inside mt-1 text-[var(--color-text-muted)] space-y-1">
                <li>احفظ إعداداتك (اتجاه الورق، الهوامش، التوقيعات) كـ Preset باسم مخصص.</li>
                <li>المشرفون (Admin) يمكنهم إنشاء Presets عامة يراها جميع المستخدمين.</li>
                <li>كل مستخدم يمكنه إنشاء Presets خاصة به فقط.</li>
                <li>يُحمل الإعداد الافتراضي تلقائياً عند فتح نافذة التصدير.</li>
              </ul>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">⚙️ إعدادات التصدير السريعة</h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                قبل تصدير أي ملف، تظهر نافذة إعدادات سريعة تسمح لك بـ:
              </p>
              <ul className="list-disc list-inside mt-1 text-[var(--color-text-muted)] space-y-1">
                <li>اختيار اتجاه الورقة (أفقي/رأسي).</li>
                <li>تحديد الهوامش (ضيق/قياسي/واسع).</li>
                <li>تشغيل/إيقاف ترقيم الصفحات والتوقيعات.</li>
                <li>معاينة سريعة للإعدادات قبل التصدير.</li>
                <li>طباعة مباشرة عبر المتصفح مع إعدادات مخصصة.</li>
              </ul>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'reports',
      title: 'التقارير المتطورة والتحليلات',
      icon: ArrowUpRight,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            يحتوي النظام على محرك تقارير قوي يغطي الجوانب الإحصائية والمالية:
          </p>
          <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] space-y-2.5 text-xs text-[var(--color-text-muted)] font-semibold">
            <p>📊 <strong>التحليل الإحصائي العام</strong>: يوضح المنصرف الإجمالي والكميات موزعة على مستوى الفروع والمناطق والعيادات.</p>
            <p>💰 <strong>الرقابة والتقارير المالية</strong>: تحليلات مالية دقيقة لقيم الأدوية المنصرفة، حصة مساهمة المرضى، وصافي التكلفة التي تتحملها ميزانية الهيئة.</p>
            <p>🔄 <strong>نظام المقارنة الذكي</strong>: لمقارنة استهلاك الفروع والمناطق والعيادات عبر فترات زمنية أو مقارنتها ببعضها لتحديد الانحرافات.</p>
            <p>📅 <strong>مركز التحليل الزمني</strong>: تتبع المنحنى البياني للاستهلاك عبر الأشهر والسنوات.</p>
            <p>📥 <strong>التصدير المتقدم</strong>: تصدير إلى PDF احترافي (مع توقيع رقمي وترقيم صفحات) أو Excel متعدد الأوراق أو Word. تدعم جميع الصيغ اللغة العربية بالكامل.</p>
          </div>
        </div>
      ),
    },
    {
      id: 'performance',
      title: 'لوحة تحليل أداء النظام',
      icon: Activity,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            تم إضافة لوحة تحليل أداء متكاملة تتيح للمشرف مراقبة صحة النظام وأدائه:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">📦 حجم قاعدة البيانات</h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                يعرض الحجم الفعلي لقاعدة البيانات على القرص الصلب مع مؤشر بصري لحالة الحجم (آمن، متوسط، كبير).
              </p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">⚡ سرعة الاستعلامات</h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                يقيس النظام وقت استجابة آخر 5 استعلامات لقاعدة البيانات ويعرض متوسط وقت الاستجابة بالمللي ثانية.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">👥 المستخدمون النشطون</h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                يعرض إجمالي عدد المستخدمين المسجلين في النظام وعدد المستخدمين النشطين حالياً.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">💾 حالة الذاكرة</h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                يعرض استهلاك الذاكرة للتطبيق مع مؤشر تحذير عند الاقتراب من الحد الأقصى.
              </p>
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            يمكن الوصول إلى لوحة الأداء من خلال <strong>الإدارة ← أداء النظام</strong>. تظهر البيانات بشكل فوري ويتم تحديثها مع كل دخول إلى الصفحة.
          </p>
        </div>
      ),
    },
    {
      id: 'scheduled-reports',
      title: 'التقارير المجدولة',
      icon: Clock,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            تتيح لك هذه الخاصية جدولة إنشاء تقارير PDF تلقائياً في مواعيد محددة (شهرياً، ربع سنوياً، سنوياً) وحفظها في مجلد محدد دون تدخل يدوي:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">📅 جدولة التقارير</h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                يمكنك إنشاء تقارير مجدولة من خلال <strong>الإدارة → التقارير المجدولة</strong>. حدد:
              </p>
              <ul className="list-disc list-inside mt-1 text-[var(--color-text-muted)] space-y-1">
                <li>نوع التقرير (تحليلي، مالي، تنفيذي، أدوية).</li>
                <li>الدورية (شهري، ربع سنوي، سنوي).</li>
                <li>اليوم من الشهر (١-٢٨ أو آخر يوم).</li>
                <li>مجلد الإخراج لحفظ ملفات PDF.</li>
                <li>تصفية حسب الفرع/المنطقة/العيادة (اختياري).</li>
              </ul>
            </div>
            <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <h6 className="font-bold text-xs text-[var(--color-primary)] mb-2">⚙️ التشغيل والمتابعة</h6>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                بعد إنشاء التقرير المجدول، يمكنك:
              </p>
              <ul className="list-disc list-inside mt-1 text-[var(--color-text-muted)] space-y-1">
                <li>تشغيل التقرير يدوياً فوراً بزر <strong>▶️ تشغيل الآن</strong>.</li>
                <li>تفعيل/إيقاف الجدولة عبر زر <strong>Toggle</strong>.</li>
                <li>مشاهدة <strong>سجل التشغيل</strong> لكل تقرير (النجاح، الفشل، حجم الملف).</li>
                <li>فتح مجلد الإخراج مباشرة من الواجهة.</li>
                <li>عند بدء تشغيل النظام، يتحقق تلقائياً من التقارير المستحقة.</li>
              </ul>
            </div>
          </div>
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-600 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span><strong>ملاحظة:</strong> يجب أن يكون مسار مجلد الإخراج موجوداً وقابلاً للكتابة. تأكد من تحديد مجلد صحيح قبل تفعيل الجدولة.</span>
          </div>
        </div>
      ),
    },
    {
      id: 'admin-tasks',
      title: 'إدارة المستخدمين والنسخ الاحتياطي والأقفال',
      icon: Key,
      content: (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            تنظيم وحفظ استقرار النظام وحماية سرية البيانات والتحكم في أمان القاعدة والنسخ الاحتياطي:
          </p>
          <div className="space-y-3">
            <div className="p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl">
              <h6 className="font-bold text-xs text-[var(--color-text)] flex items-center gap-2 mb-1">
                <Key size={14} className="text-primary" /> نظام إدارة الحسابات والصلاحيات:
              </h6>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                يتيح النظام للمدير التحكم الكامل بالحسابات: **إضافة مستخدمين جدد، تعديل الصلاحيات والأدوار (مدير نظام، مدخل بيانات، مشاهد فقط)، إعادة تعيين وتغيير كلمات المرور، وحذف الحسابات** غير المرغوبة مع آليات حماية تمنع الحذف الذاتي أو حذف المدير الوحيد.
              </p>
            </div>
            <div className="p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl">
              <h6 className="font-bold text-xs text-[var(--color-text)] flex items-center gap-2 mb-1">
                <Calendar size={14} className="text-primary" /> إدارة أقفال الأشهر (محسّنة):
              </h6>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                تم تطوير نظام الأقفال ليشمل:
              </p>
              <ul className="list-disc list-inside text-[var(--color-text-muted)] text-xs space-y-1 mt-1">
                <li><strong>تقويم تفاعلي</strong> يعرض جميع أشهر السنة مع حالة كل شهر (مقفل/مفتوح) بالألوان.</li>
                <li><strong>إقفال تلقائي</strong> للشهر الحالي حسب تاريخ النظام.</li>
                <li><strong>إشعارات تحذيرية</strong> عند محاولة تعديل بيانات شهر مقفل لمنع الأخطاء.</li>
                <li>إمكانية فتح وإغلاق الأشهر يدوياً للمشرف.</li>
              </ul>
            </div>
            <div className="p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl">
              <h6 className="font-bold text-xs text-[var(--color-text)] flex items-center gap-2 mb-1">
                <Database size={14} className="text-primary" /> النسخ الاحتياطي الشامل (28 جدولاً):
              </h6>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                يقوم النظام بحفظ واستعادة نسخ احتياطية مضغوطة بصيغة ZIP تغطي **كافة جداول قاعدة البيانات بـ 28 جدولاً** (تتضمن الحركات، المستخدمين، سجلات المراجعة، عزل الشهور، والأنصبة المالية)، مع نظام تدوير تلقائي (Rotation) لحفظ آخر 10 نسخ لحماية مساحة التخزين.
              </p>
            </div>
            <div className="p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl">
              <h6 className="font-bold text-xs text-[var(--color-text)] flex items-center gap-2 mb-1">
                <Database size={14} className="text-primary" /> التفريغ والتطهير المتقدم:
              </h6>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                يمكنك إجراء **تفريغ جزئي** (لمسح حركات الصرف والاحتفاظ بالهياكل والأدوية)، أو **تفريغ كلي (ضبط المصنع)**، أو **تفريغ متقدم شرطي** بالاعتماد على الفروع أو الشهور أو تصنيفات الأدوية. يتم حفظ نسخة احتياطية إجبارية قبل أي عملية مسح مع طلب عبارة "تأكيد الحذف".
              </p>
            </div>
          </div>
        </div>
      ),
    }
  ];

  // Filter sections by search query
  const filteredSections = sections.filter(sec => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    
    // Check in title
    if (sec.title.toLowerCase().includes(query)) return true;

    // A simple text check on content elements (approximated string conversion)
    // We can also match standard keywords
    return sec.id.toLowerCase().includes(query);
  });

  const handlePrint = () => {
    window.print();
  };

  const scrollToSection = (id) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div dir="rtl" className="animate-in fade-in duration-500 pb-10 print-container">
      <div className="no-print">
        <Breadcrumb items={[{ label: 'الرئيسية', to: '/' }, { label: 'دليل المستخدم' }]} />
      </div>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b pb-4 print:border-none print:pb-0">
        <div className="flex items-center gap-4">
          <div className="section-icon bg-white text-[var(--color-primary)] shadow-sm border p-3 rounded-2xl print:hidden">
            <BookOpen size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>دليل المستخدم</h1>
            <p className="text-sm font-medium print:hidden" style={{ color: 'var(--color-text-muted)' }}>دليل شامل لكيفية استخدام نظام إحصائياتي وإدارة منصرف الأدوية</p>
            <p className="text-xs font-medium hidden print:block text-slate-500">الهيئة العامة للتأمين الصحي - نظام إحصائياتي لإدارة الأدوية والمنصرف</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 no-print">
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[var(--color-primary)] hover:opacity-90 shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Printer size={16} />
            <span>طباعة وتصدير PDF</span>
          </button>
        </div>
      </div>

      {/* Search Bar - No print */}
      <div className="mb-6 no-print">
        <div className="relative flex items-center">
          <Search size={18} className="absolute right-4 text-[var(--color-text-muted)]" />
          <input 
            type="text"
            placeholder="ابحث عن موضوع معين في دليل المستخدم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl py-3.5 pr-12 pl-4 text-sm font-bold text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-primary)] shadow-sm transition-all"
          />
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Right Index Sidebar - No print */}
        <div className="lg:col-span-1 no-print">
          <div className="sticky top-24 space-y-2 p-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-sm">
            <h3 className="text-xs font-black text-[var(--color-text-muted)] px-3 mb-3 uppercase tracking-wider">فهرس الدليل</h3>
            <div className="max-h-[60vh] overflow-y-auto space-y-1 custom-scrollbar">
              {filteredSections.map(sec => {
                const Icon = sec.icon;
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => scrollToSection(sec.id)}
                    className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-right text-xs font-bold transition-all ${
                      isActive 
                        ? 'bg-[var(--color-primary)] text-white shadow-sm' 
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)]/50 hover:text-[var(--color-primary)]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={14} className={isActive ? 'text-white' : 'text-[var(--color-primary)]'} />
                      <span>{sec.title}</span>
                    </div>
                    <ChevronLeft size={12} className={`transition-transform ${isActive ? 'rotate-90 text-white' : 'opacity-40'}`} />
                  </button>
                );
              })}
              {filteredSections.length === 0 && (
                <div className="text-center py-4 text-xs font-bold text-[var(--color-text-muted)]">
                  لا توجد نتائج بحث مطابقة
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Left Content Area */}
        <div className="lg:col-span-3 space-y-6" ref={contentRef}>
          {filteredSections.map((sec, index) => {
            const Icon = sec.icon;
            return (
              <div 
                key={sec.id} 
                id={sec.id} 
                className="scroll-mt-24 print:scroll-mt-0 print:border-none print:shadow-none"
              >
                <Card className="hover:border-primary/20 transition-all duration-300 print:border print:border-slate-200 print:bg-white print:p-4 print:mb-6">
                  <div className="flex items-center gap-3 border-b border-[var(--color-border)] pb-3 mb-4 print:border-slate-300">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center print:hidden">
                      <Icon size={18} />
                    </div>
                    <h2 className="text-md font-black text-[var(--color-text)] print:text-black">{sec.title}</h2>
                  </div>
                  <div className="text-[var(--color-text-muted)] print:text-black">
                    {sec.content}
                  </div>
                  
                  {/* Footer style page break hint for print */}
                  <div className="hidden print:block text-[9px] text-slate-400 mt-4 text-left border-t pt-2">
                    صفحة {index + 1} - دليل نظام إحصائياتي
                  </div>
                </Card>
                
                {/* Forces a page break for the next card in print mode */}
                {index < filteredSections.length - 1 && (
                  <div className="hidden print:block page-break-before" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Styles for Print */}
      <style>{`
        @media print {
          /* Hide all non-printable elements */
          .no-print,
          header,
          aside,
          nav,
          .section-icon,
          button,
          input,
          .breadcrumb,
          .breadcrumb-item {
            display: none !important;
          }
          
          /* Reset backgrounds and layouts for white paper printing */
          body, html, #root, main, .print-container {
            background: white !important;
            color: black !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            direction: rtl !important;
          }

          .lg\\:col-span-3 {
            width: 100% !important;
            grid-column: span 4 / span 4 !important;
          }

          .grid {
            display: block !important;
          }

          .page-break-before {
            page-break-before: always !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
          }

          /* Ensure high print contrast and avoid break in card middle */
          .card, .neu-card {
            border: 1px solid #e2e8f0 !important;
            background: #ffffff !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-shadow: none !important;
            margin-bottom: 20px !important;
            padding: 20px !important;
            border-radius: 8px !important;
          }

          p, span, li, h1, h2, h3, h4, h5, h6 {
            color: #000000 !important;
            text-shadow: none !important;
          }

          .bg-primary\\/5, .bg-primary\\/10 {
            background-color: #f8fafc !important;
            border-color: #cbd5e1 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default UserGuidePage;
