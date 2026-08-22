import React from 'react';
import { 
  Mail, Phone, MapPin, Globe, MessageSquare, 
  Code, Briefcase, GraduationCap, Award, ExternalLink, Calendar,
  FileText, Code2
} from 'lucide-react';
import Breadcrumb from '../../components/ui/Breadcrumb';
import Card from '../../components/ui/Card';
import kawkabIcon from '/kawkab.png';
import akPhoto from '/ak_photo.png';

const AboutDesignerPage = () => {
  const skills = [
    'Python', 'Flask', 'JavaScript', 'React.js', 'Tauri', 'HTML5 / CSS3', 
    'SQL / SQLite', 'Bootstrap / Tailwind', 'تصميم قواعد البيانات', 
    'أنظمة إدارة المعلومات الصحية', 'تصميم التقارير الإحصائية', 
    'تحليل البيانات الصحية', 'تطوير تطبيقات الويب المتكاملة'
  ];

  const projects = [
    {
      title: 'نظام إدارة منصرف الأدوية المطور (My Stats)',
      date: '٢٠٢٥ - ٢٠٢٦',
      desc: 'النسخة الأحدث المبنية على تقنيات Tauri و React لتقديم أداء محلي فائق السرعة، ونظام نسخ احتياطي متطور، وإكسل مجمع مقسم لصفحات، وحماية أقفال الأشهر للبيانات المالية والإحصائية.',
    },
    {
      title: 'نظام دليل أدوية التأمين الصحي الإلكتروني والبروتوكولات المنظمة',
      date: '٢٠٢٢ - ٢٠٢٣',
      desc: 'قاعدة بيانات متكاملة للأدوية المعتمدة وآليات صرفها حسب الجرعات العلاجية المسموح بها، مع ربطها بالبروتوكولات الطبية لمساعدة الأطباء والصيادلة في التحقق الفوري.',
    },
    {
      title: 'نظام إدارة المخزون الطبي للمؤسسات',
      date: '٢٠٢١ - ٢٠٢٢',
      desc: 'نظام إدارة المستودعات والطلبات الطبية وتنبيهات انخفاض مخزون الأدوية الحيوي والمستلزمات الطبية في عيادات ومستشفيات التأمين الصحي.',
    },
    {
      title: 'نظام متابعة المرضى الإكلينيكي',
      date: '٢٠١٩ - ٢٠٢١',
      desc: 'تتبع السجلات الصحية للمرضى وجدولة زيارات العيادات وإصدار التقارير الطبية الدورية لتسهيل عملية المتابعة المستمرة.',
    },
    {
      title: 'نظام التقارير الإحصائية الصحية وتصنيف البيانات',
      date: '٢٠١٨ - ٢٠١٩',
      desc: 'محرك تحليل البيانات واستخراج المؤشرات الحيوية لمعدلات الاستهلاك الطبي لعرضها في لوحات معلومات تفاعلية تدعم متخذي القرار الإداري.',
    }
  ];

  const changelog = [
    {
      version: 'v2.1.0',
      date: 'مايو 2026',
      changes: [
        'إضافة تصدير متقدم لملفات Excel مجمعة بصفحات متعددة',
        'تطوير نظام النسخ الاحتياطي وإضافة ميزة تدوير النسخ التلقائية',
        'دعم فحص سلامة قاعدة البيانات (Integrity Check)',
        'إضافة تلميحات سياقية (Tooltips) للحقول المعقدة',
        'إنشاء جولة تعريفية ودليل استخدام تفاعلي'
      ]
    },
    {
      version: 'v2.0.0',
      date: 'أبريل 2026',
      changes: [
        'إطلاق النسخة الجديدة باستخدام Tauri و React',
        'تحويل واجهة المستخدم إلى تصميم الزجاج الحديث (Glassmorphism)',
        'تحسين أداء العمليات الإحصائية وحفظ البيانات محلياً'
      ]
    }
  ];

  const contacts = [
    { icon: Phone, label: 'الهاتف', value: '01000314398', href: 'tel:01000314398', color: 'text-emerald-500' },
    { icon: MessageSquare, label: 'واتساب', value: '01000314398', href: 'https://wa.me/201000314398', color: 'text-green-500' },
    { icon: Mail, label: 'البريد الإلكتروني', value: 'a.kawkab2020@gmail.com', href: 'mailto:a.kawkab2020@gmail.com', color: 'text-blue-500' },
    { icon: Globe, label: 'الموقع البديل', value: 'a.kawkab@yahoo.com', href: 'mailto:a.kawkab@yahoo.com', color: 'text-cyan-500' },
    { icon: MapPin, label: 'العنوان', value: 'سوهاج، مصر', href: '#', color: 'text-rose-500', targetSelf: true }
  ];

  return (
    <div dir="rtl" className="animate-in fade-in duration-500 pb-10">
      <Breadcrumb items={[{ label: 'الرئيسية', to: '/' }, { label: 'نبذة عن المصمم' }]} />

      {/* Header Banner */}
      <div className="relative rounded-3xl overflow-hidden mb-8 shadow-sm border border-[var(--color-border)] bg-[var(--color-bg-card)]">
        <div className="absolute top-0 right-0 left-0 h-32 bg-gradient-to-l from-[var(--color-primary)] to-[var(--color-primary-dark)] opacity-90" />
        
        <div className="relative pt-16 pb-8 px-6 flex flex-col items-center text-center">
          {/* Profile Images Container */}
          <div className="relative group mb-4">
            <div className="absolute inset-0 bg-[var(--color-primary)] rounded-full blur opacity-25 group-hover:opacity-40 transition-opacity" />
            <img 
              src={akPhoto} 
              alt="ك/ أحمد علي أحمد" 
              className="relative w-36 h-36 rounded-full object-cover border-4 border-white shadow-xl transition-transform duration-300 group-hover:scale-105"
            />
            {/* Overlay - Kawkab Logo */}
            <div className="absolute bottom-1 left-1 w-12 h-12 rounded-full border-2 border-white bg-white shadow-md p-1 overflow-hidden flex items-center justify-center">
              <img src={kawkabIcon} alt="كوكب" className="w-full h-full object-scale-down" />
            </div>
          </div>

          <h1 className="text-2xl font-black" style={{ color: 'var(--color-text)' }}>ك/ أحمد علي أحمد</h1>
          <p className="text-xs font-bold text-[var(--color-primary)] mt-1 tracking-wider">أحمد كوكب</p>
          <p className="text-sm font-semibold mt-2" style={{ color: 'var(--color-text-muted)' }}>
            متخصص في تطوير برمجيات ونظم الويب وإدارة قواعد البيانات الطبية
          </p>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Right Side: Bio & Contacts */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Personal Bio */}
          <Card className="hover:border-primary/10 transition-all">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] pb-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <GraduationCap size={18} />
              </div>
              <h2 className="text-md font-black" style={{ color: 'var(--color-text)' }}>نبذة شخصية</h2>
            </div>
            
            <div className="text-xs font-medium space-y-4 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              <p>
                ك/ أحمد علي أحمد، والشهير في الوسط التقني بـ <strong>(أحمد كوكب)</strong>، مطور نظم معلومات وقواعد بيانات إلكترونية ذو خبرة برمجية واسعة.
              </p>
              <p>
                حاصل على <strong>بكالوريوس علوم كيمياء</strong> من جامعة سوهاج عام 1992. وقد دمجه مع شغفه الفريد بـ تكنولوجيا المعلومات والبرمجة.
              </p>
              <p>
                يجمع بين خلفيته العلمية التحليلية في الكيمياء ومهاراته العالية في البرمجة وتصميم واجهات وتجربة المستخدم لتوفير حلول مخصصة، عملية، ومستقرة تلائم بيئة العمل الصحية المعقدة.
              </p>
            </div>
          </Card>

          {/* Technical Skills */}
          <Card className="hover:border-primary/10 transition-all">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] pb-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Code size={18} />
              </div>
              <h2 className="text-md font-black" style={{ color: 'var(--color-text)' }}>المهارات التقنية</h2>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {skills.map((skill, index) => (
                <span 
                  key={index} 
                  className="text-[10px] font-black px-2.5 py-1.5 rounded-xl border transition-colors hover:bg-[var(--color-primary)] hover:text-white"
                  style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </Card>

          {/* Contact Details */}
          <Card className="hover:border-primary/10 transition-all">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] pb-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Award size={18} />
              </div>
              <h2 className="text-md font-black" style={{ color: 'var(--color-text)' }}>قنوات التواصل الفوري</h2>
            </div>

            <div className="space-y-3">
              {contacts.map((contact, index) => {
                const Icon = contact.icon;
                return (
                  <a 
                    key={index}
                    href={contact.href}
                    target={contact.targetSelf ? '_self' : '_blank'}
                    rel="noreferrer"
                    className="flex items-center justify-between p-3 rounded-2xl border border-[var(--color-border)] hover:bg-[var(--color-border)]/20 transition-all group no-underline"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl bg-[var(--color-bg)] shadow-sm flex items-center justify-center ${contact.color}`}>
                        <Icon size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-[var(--color-text-muted)] leading-none">{contact.label}</p>
                        <p className="text-xs font-black mt-1 text-[var(--color-text)] tracking-wider">{contact.value}</p>
                      </div>
                    </div>
                    {contact.href !== '#' && (
                      <ExternalLink size={12} className="text-[var(--color-text-muted)] opacity-40 group-hover:opacity-100 transition-opacity" />
                    )}
                  </a>
                );
              })}
            </div>
          </Card>

        </div>

        {/* Left Side: Projects Timeline */}
        <div className="lg:col-span-2 space-y-6">
          
          <Card className="hover:border-primary/10 transition-all h-full">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] pb-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Briefcase size={18} />
              </div>
              <h2 className="text-md font-black" style={{ color: 'var(--color-text)' }}>تاريخ المشاريع والأنظمة المطورة</h2>
            </div>

            <div className="relative mr-4 border-r-2 border-[var(--color-border)] pr-6 space-y-8 py-2">
              {projects.map((proj, index) => (
                <div key={index} className="relative group">
                  {/* Circle Indicator on timeline */}
                  <div className="absolute right-[-31px] top-0.5 w-4 h-4 rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-bg-card)] group-hover:bg-[var(--color-primary)] transition-all" />
                  
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-black text-[var(--color-text)]">{proj.title}</h3>
                      <span className="flex items-center gap-1 text-[9px] font-black bg-primary/10 text-[var(--color-primary)] p-1 px-2 rounded-full">
                        <Calendar size={10} />
                        {proj.date}
                      </span>
                    </div>
                    <p className="text-xs font-semibold leading-relaxed text-[var(--color-text-muted)] mt-1.5">
                      {proj.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center mt-10 pt-6 border-t border-[var(--color-border)] space-y-4">
              {/* Kawkab Branding */}
              <div className="flex items-center justify-center gap-3">
                <div className="relative flex-shrink-0">
                  <div className="absolute -inset-2 rounded-xl bg-gradient-to-br from-cyan-400 via-emerald-300 to-cyan-500 opacity-25 blur-md" />
                  <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-white shadow-md flex items-center justify-center p-1">
                    <img src={kawkabIcon} alt="كوكب" className="w-full h-full object-scale-down" />
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Code2 size={13} className="text-[var(--color-primary)]" />
                    <span className="text-[10px] font-bold text-[var(--color-text-muted)]">من إعداد وتصميم</span>
                  </div>
                  <p className="text-sm font-black text-[var(--color-primary)]">كيميائى / أحمد علي أحمد كوكب</p>
                </div>
              </div>
              {/* Contact Info Row */}
              <div className="flex items-center justify-center gap-5 text-[11px]">
                <a href="tel:01000314398" className="flex items-center gap-1.5 font-bold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors no-underline">
                  <Phone size={14} className="text-emerald-500" />
                  <span dir="ltr">01000314398</span>
                </a>
                <span className="text-[var(--color-border)]">|</span>
                <a href="mailto:a.kawkab2020@gmail.com" className="flex items-center gap-1.5 font-bold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors no-underline">
                  <Mail size={14} className="text-blue-500" />
                  <span dir="ltr">a.kawkab2020@gmail.com</span>
                </a>
              </div>
              <p className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wide">
                حقوق الملكية الفكرية والبرمجية محفوظة للمصمم ك/ أحمد علي أحمد (أحمد كوكب) © ٢٠٢٦
              </p>
            </div>
          </Card>

          {/* Changelog Card */}
          <Card className="hover:border-primary/10 transition-all">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] pb-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <FileText size={18} />
              </div>
              <h2 className="text-md font-black" style={{ color: 'var(--color-text)' }}>سجل التحديثات (Changelog)</h2>
            </div>

            <div className="space-y-6">
              {changelog.map((release, idx) => (
                <div key={idx} className="relative pl-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-black bg-emerald-500 text-white px-2 py-0.5 rounded-md">
                      {release.version}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--color-text-muted)]">
                      {release.date}
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-xs font-semibold space-y-1.5 text-[var(--color-text-muted)] leading-relaxed marker:text-emerald-400">
                    {release.changes.map((change, cIdx) => (
                      <li key={cIdx}>{change}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

        </div>

      </div>
    </div>
  );
};

export default AboutDesignerPage;
