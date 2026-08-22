import React, { useState, useEffect } from "react";
import { Lock, User, LogIn, ShieldCheck, Eye, EyeOff, Sparkles, KeyRound, Code2, Phone, Mail, UserPlus, Loader2, Copy, FileDown, AlertTriangle, ShieldAlert, CheckCircle2, ArrowRight } from "lucide-react";
import designerImg from '../../assets/Ahmed.jpeg';
import kawkabIcon from '/kawkab.png';
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/ui/Toast";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import invoke from "../../api/tauriApi";
import { copyRecoveryCode, exportRecoveryCode, RECOVERY_WARNING } from "../../utils/recoveryUtils";

// ─── Floating particles background ─────────────────────────────────────
// Static particles generated once at module level (not during render)
const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 4 + Math.random() * 12,
  speed: 15 + Math.random() * 30,
  delay: Math.random() * 8,
  opacity: 0.03 + Math.random() * 0.07,
}));

const Particles = () => {

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">        {PARTICLES.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: 'var(--color-primary)',
            opacity: p.opacity,
            animation: `float ${p.speed}s ease-in-out ${p.delay}s infinite alternate`,
          }}
        />
      ))}
      <style>{`
        @keyframes float {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, -30px) scale(1.2); }
          100% { transform: translate(-10px, 10px) scale(0.9); }
        }
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes slideUpFade {
          from { opacity: 1; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(8, 145, 178, 0.15); }
          50% { box-shadow: 0 0 40px rgba(8, 145, 178, 0.3); }
        }
        .animate-slideUpFade {
          animation: slideUpFade 0.6s ease-out forwards;
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradientShift 8s ease infinite;
        }
      `}</style>
    </div>
  );
};

const LoginPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null); // 'username' | 'password' | null
  // ── First-Run Setup state ────────────────────────────────────────────
  const [needsSetup, setNeedsSetup] = useState(null); // null=checking, true=setup, false=login
  const [setupUsername, setSetupUsername] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  // Recovery code shown ONCE after first-run setup (never persisted in JS)
  const [setupRecoveryCode, setSetupRecoveryCode] = useState(null);
  // Forgot-password / recovery flow state
  const [recoveryStep, setRecoveryStep] = useState(null); // null | 'username' | 'code' | 'newpass' | 'done'
  const [recoveryUsername, setRecoveryUsername] = useState("");
  const [recoveryInputCode, setRecoveryInputCode] = useState("");
  const [recoveryNewPass, setRecoveryNewPass] = useState("");
  const [recoveryNewPassConfirm, setRecoveryNewPassConfirm] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryShowPass, setRecoveryShowPass] = useState(false);
  const [recoveryResultCode, setRecoveryResultCode] = useState(null); // NEW code after recovery (shown once)
  const [recoveryError, setRecoveryError] = useState("");
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  // ── Detect first run: no user accounts → show admin setup screen ─────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const count = await invoke('get_user_count');
        if (mounted) setNeedsSetup(Number(count) === 0);
      } catch {
        if (mounted) setNeedsSetup(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ── Password Recovery flow (replaces the old unauthenticated reset) ──
  const startRecovery = () => {
    setRecoveryStep('username');
    setRecoveryUsername('');
    setRecoveryInputCode('');
    setRecoveryNewPass('');
    setRecoveryNewPassConfirm('');
    setRecoveryResultCode(null);
    setRecoveryError('');
  };

  const cancelRecovery = () => {
    setRecoveryStep(null);
    setRecoveryError('');
  };

  const handleRecoveryUsername = (e) => {
    e.preventDefault();
    if (!recoveryUsername.trim()) {
      setRecoveryError('يرجى إدخال اسم المستخدم');
      return;
    }
    setRecoveryError('');
    setRecoveryStep('code');
  };

  const handleRecoveryCode = (e) => {
    e.preventDefault();
    if (!recoveryInputCode.trim()) {
      setRecoveryError('يرجى إدخال رمز الاسترداد');
      return;
    }
    setRecoveryError('');
    setRecoveryStep('newpass');
  };

  const handleRecoveryNewPass = async (e) => {
    e.preventDefault();
    if (recoveryNewPass.length < 4) {
      setRecoveryError('كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل');
      return;
    }
    if (recoveryNewPass !== recoveryNewPassConfirm) {
      setRecoveryError('كلمتا المرور غير متطابقتين');
      return;
    }
    setRecoveryLoading(true);
    setRecoveryError('');
    try {
      const res = await invoke('recover_password', {
        username: recoveryUsername.trim(),
        recoveryCode: recoveryInputCode.trim(),
        newPassword: recoveryNewPass,
      });
      setRecoveryResultCode(res.recovery_code);
      setRecoveryStep('done');
    } catch (err) {
      setRecoveryError(err || 'فشل استرداد كلمة المرور');
    } finally {
      setRecoveryLoading(false);
    }
  };

  // Copy / export use the shared helpers (no duplication).

  // Adapter: route the shared helper notifications into the toast system.
  const notifyRecovery = (msg, type) => (type === 'success' ? toast.success(msg) : toast.error(msg));

  const finishRecovery = () => {
    // Pre-fill the login form with the recovered username.
    setUsername(recoveryUsername.trim());
    setRecoveryStep(null);
    setRecoveryResultCode(null);
    toast.success('يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة');
  };

  const handleForgotPassword = () => {
    startRecovery();
  };

  if (user) {
    return <Navigate to="/" replace />;
  }

  // ── First-Run Setup: create the initial admin account ─────────────────
  const handleSetup = async (e) => {
    e.preventDefault();
    const u = setupUsername.trim();
    if (!u) {
      toast.error('يرجى إدخال اسم المستخدم');
      return;
    }
    if (setupPassword.length < 4) {
      toast.error('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
      return;
    }
    if (setupPassword !== setupConfirm) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }
    setSetupLoading(true);
    try {
      const created = await invoke('create_first_admin', { username: u, password: setupPassword });
      toast.success(`تم إنشاء حساب المدير ${created.user.username} بنجاح`);
      // Show the one-time recovery code BEFORE logging in — it is the only
      // way back in if the password is ever forgotten.
      setSetupRecoveryCode(created.recovery_code);
      setSetupLoading(false);
    } catch (err) {
      toast.error(err || 'فشل إنشاء حساب المدير');
      setSetupLoading(false);
    }
  };

  // After the user saves the recovery code, proceed to login with the
  // credentials they just created.
  const handleSetupProceed = async () => {
    setSetupLoading(true);
    const u = setupUsername.trim();
    try {
      const success = await login(u, setupPassword);
      if (success) {
        navigate("/");
      } else {
        setSetupLoading(false);
        setNeedsSetup(false);
        setUsername(u);
        setPassword(setupPassword);
      }
    } catch {
      setSetupLoading(false);
      setNeedsSetup(false);
      setUsername(u);
      setPassword(setupPassword);
    }
  };

  const isSetupFormValid = setupUsername.trim() && setupPassword.length >= 4 && setupPassword === setupConfirm;

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    const success = await login(username, password);
    if (success) {
      navigate("/");
    } else {
      setLoading(false);
    }
  };

  const isFormValid = username.trim() && password.trim();

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      dir="rtl"
      style={{
        background: 'linear-gradient(135deg, #0c1929 0%, #0f172a 30%, #1a2332 70%, #0f172a 100%)',
      }}
    >
      {/* Animated gradient overlay */}
      <div
        className="absolute inset-0 animate-gradient opacity-20"
        style={{
          background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 25%, #7c3aed 50%, #059669 75%, #0891b2 100%)',
          backgroundSize: '200% 200%',
        }}
      />

      {/* Floating particles */}
      <Particles />

      {/* Login Card */}
      <div
        className="w-full max-w-md relative z-10"
      >
        {/* Glass card */}
        <div
          className="rounded-3xl p-8 sm:p-10 backdrop-blur-xl border shadow-2xl"
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            borderColor: 'rgba(51, 65, 85, 0.6)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 35px rgba(8, 145, 178, 0.15)',
          }}
        >
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <div className="relative mx-auto mb-5 w-20 h-20 group">
              {/* Gradient ring behind the icon */}
              <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-cyan-400 via-emerald-300 to-cyan-500 opacity-60 blur-sm group-hover:opacity-80 group-hover:scale-110 transition-all duration-500" />
              <div
                className="relative w-full h-full rounded-full overflow-hidden border-2 border-cyan-400/80 shadow-lg"
                style={{
                  boxShadow: '0 8px 32px rgba(8, 145, 178, 0.35)',
                }}
              >
                <img src={designerImg} alt="أحمد كوكب" className="w-full h-full object-cover" />
              </div>
              <div
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-slate-900 border-2 border-cyan-400 flex items-center justify-center shadow-md z-10"
              >
                <ShieldCheck size={12} className="text-cyan-400" />
              </div>
            </div>

            <h1
              className="text-2xl sm:text-3xl font-black tracking-tight mb-2 text-slate-100"
            >
              {recoveryStep
                ? 'استرداد كلمة المرور'
                : needsSetup && setupRecoveryCode
                  ? 'احفظ رمز الاسترداد'
                  : needsSetup
                    ? 'إعداد أول تشغيل — إنشاء حساب المدير'
                    : 'منظومة إحصائيات الأدوية والمستلزمات الطبية'}
            </h1>
            <p
              className="text-sm font-semibold text-slate-400"
            >
              {recoveryStep
                ? 'استعد الوصول إلى حسابك باستخدام رمز الاسترداد.'
                : needsSetup && setupRecoveryCode
                  ? 'هذا الرمز هو طريقتك الوحيدة لاستعادة الحساب إذا نسيت كلمة المرور.'
                  : needsSetup
                    ? 'لم يتم العثور على أي حسابات. أنشئ حساب المدير للبدء بأمان.'
                    : 'الهيئة العامة للتأمين الصحي'}
            </p>
            <div
              className="w-12 h-0.5 mx-auto mt-4 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500"
            />
          </div>

          {/* ═══ Password Recovery flow (forgot password) ═══ */}
          {recoveryStep ? (
            <div className="space-y-5">
              {recoveryError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 text-xs font-bold">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{recoveryError}</span>
                </div>
              )}

              {recoveryStep === 'done' && recoveryResultCode ? (
                /* Final step: show the NEW one-time code exactly once */
                <div className="space-y-4">
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                    <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                    <span>تم استعادة الوصول بنجاح. تم إنشاء رمز استرداد جديد — احفظه جيداً لأنه يُستخدم مرة واحدة فقط.</span>
                  </div>
                  <div className="text-center p-4 rounded-2xl bg-slate-900/80 border border-cyan-800/50">
                    <p className="text-[10px] font-bold text-slate-500 mb-2">رمز الاسترداد الجديد</p>
                    <p dir="ltr" className="font-mono text-lg font-black tracking-widest text-cyan-300 select-all">{recoveryResultCode}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" icon={Copy} className="flex-1" onClick={() => copyRecoveryCode(recoveryResultCode, notifyRecovery)}>
                      نسخ الرمز
                    </Button>
                    <Button type="button" variant="secondary" icon={FileDown} className="flex-1" onClick={() => exportRecoveryCode(recoveryResultCode, recoveryUsername, notifyRecovery)}>
                      تصدير إلى ملف
                    </Button>
                  </div>
                  <Button type="button" variant="primary" icon={LogIn} className="w-full" onClick={finishRecovery}>
                    تسجيل الدخول الآن
                  </Button>
                </div>
              ) : recoveryStep === 'newpass' ? (
                <form onSubmit={handleRecoveryNewPass} className="space-y-5" noValidate>
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-950/70 border border-cyan-800/50 text-cyan-300 text-[11px] font-bold">
                      <User size={12} />
                      الحساب: <span dir="ltr" className="font-mono">{recoveryUsername.trim()}</span>
                    </div>
                  </div>
                  <div className="relative">
                    <Input
                      label="كلمة المرور الجديدة"
                      type={recoveryShowPass ? 'text' : 'password'}
                      icon={Lock}
                      value={recoveryNewPass}
                      onChange={(e) => setRecoveryNewPass(e.target.value)}
                      onFocus={() => setFocusedField('recovery-newpass')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="4 أحرف على الأقل"
                      required
                      autoFocus
                      inputClassName={`!bg-slate-900/80 !border-slate-700 !text-slate-100 placeholder-slate-500 pl-10 transition-all ${
                        focusedField === 'recovery-newpass' ? '!border-cyan-400 !ring-2 !ring-cyan-500/20' : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setRecoveryShowPass(!recoveryShowPass)}
                      className="absolute left-3 bottom-3.5 cursor-pointer text-slate-400 hover:text-cyan-400 transition-colors"
                      aria-label={recoveryShowPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {recoveryShowPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      label="تأكيد كلمة المرور الجديدة"
                      type={recoveryShowPass ? 'text' : 'password'}
                      icon={Lock}
                      value={recoveryNewPassConfirm}
                      onChange={(e) => setRecoveryNewPassConfirm(e.target.value)}
                      onFocus={() => setFocusedField('recovery-confirm')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="أعد إدخال كلمة المرور"
                      required
                      inputClassName={`!bg-slate-900/80 !border-slate-700 !text-slate-100 placeholder-slate-500 pl-10 transition-all ${
                        focusedField === 'recovery-confirm' ? '!border-cyan-400 !ring-2 !ring-cyan-500/20' : ''
                      }`}
                    />
                  </div>
                  <Button type="submit" variant="primary" icon={KeyRound} className="w-full" loading={recoveryLoading} disabled={!recoveryNewPass || !recoveryNewPassConfirm}>
                    تغيير كلمة المرور
                  </Button>
                  <button type="button" onClick={cancelRecovery} className="w-full text-center text-[11px] font-bold text-slate-500 hover:text-slate-300 transition-colors cursor-pointer">
                    رجوع لتسجيل الدخول
                  </button>
                </form>
              ) : recoveryStep === 'code' ? (
                <form onSubmit={handleRecoveryCode} className="space-y-5" noValidate>
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-950/70 border border-cyan-800/50 text-cyan-300 text-[11px] font-bold">
                      <User size={12} />
                      الحساب: <span dir="ltr" className="font-mono">{recoveryUsername.trim()}</span>
                    </div>
                  </div>
                  <div>
                    <Input
                      label="رمز الاسترداد"
                      icon={ShieldAlert}
                      value={recoveryInputCode}
                      onChange={(e) => setRecoveryInputCode(e.target.value)}
                      onFocus={() => setFocusedField('recovery-code')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                      required
                      autoFocus
                      dir="ltr"
                      inputClassName={`text-left font-mono !bg-slate-900/80 !border-slate-700 !text-slate-100 placeholder-slate-500 transition-all ${
                        focusedField === 'recovery-code' ? '!border-cyan-400 !ring-2 !ring-cyan-500/20' : ''
                      }`}
                    />
                    <p className="text-[10px] font-bold text-slate-500 mt-1.5 pr-1">أدخل رمز الاسترداد الذي حصلت عليه عند إعداد الحساب أو عند آخر استرداد.</p>
                  </div>
                  <Button type="submit" variant="primary" icon={ArrowRight} className="w-full" disabled={!recoveryInputCode.trim()}>
                    متابعة
                  </Button>
                  <button type="button" onClick={cancelRecovery} className="w-full text-center text-[11px] font-bold text-slate-500 hover:text-slate-300 transition-colors cursor-pointer">
                    رجوع لتسجيل الدخول
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRecoveryUsername} className="space-y-5" noValidate>
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs font-bold">
                    <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
                    <span>أدخل اسم المستخدم ثم رمز الاسترداد لإنشاء كلمة مرور جديدة. لا يمكن استرداد الحساب بدون رمز الاسترداد.</span>
                  </div>
                  <div>
                    <Input
                      label="اسم المستخدم"
                      icon={User}
                      value={recoveryUsername}
                      onChange={(e) => setRecoveryUsername(e.target.value)}
                      onFocus={() => setFocusedField('recovery-username')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="أدخل اسم المستخدم"
                      required
                      autoFocus
                      inputClassName={`!bg-slate-900/80 !border-slate-700 !text-slate-100 placeholder-slate-500 transition-all ${
                        focusedField === 'recovery-username' ? '!border-cyan-400 !ring-2 !ring-cyan-500/20' : ''
                      }`}
                    />
                  </div>
                  <Button type="submit" variant="primary" icon={ArrowRight} className="w-full" disabled={!recoveryUsername.trim()}>
                    متابعة
                  </Button>
                  <button type="button" onClick={cancelRecovery} className="w-full text-center text-[11px] font-bold text-slate-500 hover:text-slate-300 transition-colors cursor-pointer">
                    رجوع لتسجيل الدخول
                  </button>
                </form>
              )}
            </div>
          ) : needsSetup && setupRecoveryCode ? (
            /* ═══ First-Run: recovery code shown ONCE after admin creation ═══ */
            <div className="space-y-5">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs font-bold leading-relaxed">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{RECOVERY_WARNING}</span>
              </div>
              <div className="text-center p-4 rounded-2xl bg-slate-900/80 border border-cyan-800/50">
                <p className="text-[10px] font-bold text-slate-500 mb-2">رمز الاسترداد (يُعرض مرة واحدة فقط)</p>
                <p dir="ltr" className="font-mono text-lg font-black tracking-widest text-cyan-300 select-all">{setupRecoveryCode}</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" icon={Copy} className="flex-1" onClick={() => copyRecoveryCode(setupRecoveryCode, notifyRecovery)}>
                  نسخ الرمز
                </Button>
                <Button type="button" variant="secondary" icon={FileDown} className="flex-1" onClick={() => exportRecoveryCode(setupRecoveryCode, setupUsername, notifyRecovery)}>
                  تصدير إلى ملف
                </Button>
              </div>
              <Button type="button" variant="primary" icon={LogIn} className="w-full" loading={setupLoading} onClick={handleSetupProceed}>
                تم حفظ الرمز — متابعة الدخول
              </Button>
            </div>
          ) : needsSetup ? (
            <form onSubmit={handleSetup} className="space-y-5" noValidate>
              <div>
                <Input
                  label="اسم المستخدم"
                  icon={User}
                  value={setupUsername}
                  onChange={(e) => setSetupUsername(e.target.value)}
                  onFocus={() => setFocusedField('setup-username')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="أدخل اسم مستخدم المدير"
                  required
                  autoFocus
                  inputClassName={`!bg-slate-900/80 !border-slate-700 !text-slate-100 placeholder-slate-500 transition-all ${
                    focusedField === 'setup-username' ? '!border-cyan-400 !ring-2 !ring-cyan-500/20' : ''
                  }`}
                />
              </div>

              <div className="relative">
                <Input
                  label="كلمة المرور"
                  type={showSetupPassword ? 'text' : 'password'}
                  icon={Lock}
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  onFocus={() => setFocusedField('setup-password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="4 أحرف على الأقل"
                  required
                  inputClassName={`!bg-slate-900/80 !border-slate-700 !text-slate-100 placeholder-slate-500 pl-10 transition-all ${
                    focusedField === 'setup-password' ? '!border-cyan-400 !ring-2 !ring-cyan-500/20' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowSetupPassword(!showSetupPassword)}
                  className="absolute left-3 bottom-3.5 cursor-pointer text-slate-400 hover:text-cyan-400 transition-colors"
                  aria-label={showSetupPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showSetupPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="relative">
                <Input
                  label="تأكيد كلمة المرور"
                  type={showSetupPassword ? 'text' : 'password'}
                  icon={Lock}
                  value={setupConfirm}
                  onChange={(e) => setSetupConfirm(e.target.value)}
                  onFocus={() => setFocusedField('setup-confirm')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="أعد إدخال كلمة المرور"
                  required
                  inputClassName={`!bg-slate-900/80 !border-slate-700 !text-slate-100 placeholder-slate-500 pl-10 transition-all ${
                    focusedField === 'setup-confirm' ? '!border-cyan-400 !ring-2 !ring-cyan-500/20' : ''
                  }`}
                />
              </div>

              {/* Submit */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  icon={UserPlus}
                  className="w-full py-4 text-lg rounded-2xl shadow-xl font-bold bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-700 hover:from-cyan-500 hover:to-teal-500 text-white shadow-cyan-900/40 transition-all duration-300 transform active:scale-98"
                  loading={setupLoading}
                  disabled={!isSetupFormValid}
                >
                  إنشاء حساب المدير
                </Button>
              </div>

              <p className="text-center text-[10px] font-bold text-slate-500 leading-relaxed">
                تُخزَّن كلمة المرور مشفّرة بأمان (Argon2id) — لا تُحفظ كلمة المرور نصاً أبداً.
              </p>
            </form>
          ) : needsSetup === null ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={22} className="text-cyan-400 animate-spin" />
            </div>
          ) : (
          /* Login Form */
          <form onSubmit={handleLogin} className="space-y-5" noValidate>
            {/* Username */}
            <div>
              <Input
                label="اسم المستخدم"
                icon={User}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setFocusedField('username')}
                onBlur={() => setFocusedField(null)}
                placeholder="أدخل اسم المستخدم"
                required
                autoFocus
                inputClassName={`!bg-slate-900/80 !border-slate-700 !text-slate-100 placeholder-slate-500 transition-all ${
                  focusedField === 'username' ? '!border-cyan-400 !ring-2 !ring-cyan-500/20' : ''
                }`}
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Input
                label="كلمة المرور"
                type={showPassword ? 'text' : 'password'}
                icon={Lock}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                placeholder="أدخل كلمة المرور"
                required
                inputClassName={`!bg-slate-900/80 !border-slate-700 !text-slate-100 placeholder-slate-500 pl-10 transition-all ${
                  focusedField === 'password' ? '!border-cyan-400 !ring-2 !ring-cyan-500/20' : ''
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 bottom-3.5 cursor-pointer text-slate-400 hover:text-cyan-400 transition-colors"
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Forgot Password Link — opens the recovery flow. Only on the
                normal login form (hidden during first-run setup AND while the
                first-run check runs). */}
            {needsSetup === false && (
              <div className="text-center -mt-2">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-[11px] font-bold transition-colors inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 cursor-pointer"
                >
                  <KeyRound size={12} />
                  نسيت كلمة المرور؟
                </button>
              </div>
            )}

            {/* Submit */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                icon={LogIn}
                className="w-full py-4 text-lg rounded-2xl shadow-xl font-bold bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-700 hover:from-cyan-500 hover:to-teal-500 text-white shadow-cyan-900/40 transition-all duration-300 transform active:scale-98"
                loading={loading}
                disabled={!isFormValid}
              >
                تسجيل الدخول
              </Button>
            </div>

            {/* Designer Branding — inside the form */}
            <div className="pt-4 pb-2 text-center border-t border-slate-800/80 mt-4">
              <div className="flex items-center justify-center gap-3">
                <div className="relative flex-shrink-0">
                  <div className="absolute -inset-3 rounded-2xl bg-gradient-to-br from-cyan-400 via-emerald-300 to-cyan-500 opacity-25 blur-lg" />
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-900 border border-slate-700/80 shadow-lg flex items-center justify-center p-1.5">
                    <img src={kawkabIcon} alt="كوكب" className="w-full h-full object-scale-down" />
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Code2 size={13} className="text-cyan-400" />
                    <span className="text-[11px] font-bold text-slate-400">من إعداد وتصميم</span>
                  </div>
                  <button type="button" onClick={() => navigate('/help/about-designer')} className="text-xs font-black text-cyan-300 hover:text-cyan-200 transition-all cursor-pointer">كيميائى / أحمد علي أحمد كوكب</button>
                  {/* Contact Info */}
                  <div className="flex items-center justify-center gap-3 mt-1.5">
                    <a href="tel:01000314398" className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-emerald-400 transition-colors no-underline">
                      <Phone size={11} className="text-emerald-400" />
                      <span dir="ltr">01000314398</span>
                    </a>
                    <span className="text-slate-700">|</span>
                    <a href="mailto:a.kawkab2020@gmail.com" className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-cyan-400 transition-colors no-underline">
                      <Mail size={11} className="text-cyan-400" />
                      <span>a.kawkab2020@gmail.com</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </form>
          )}

          {/* Hint */}
          <div className="mt-5 text-center">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold bg-cyan-950/70 border border-cyan-800/50 text-cyan-300"
            >
              <Sparkles size={14} className="text-cyan-400" />
              <span>بيانات الدخول محمية بتشفير آمن لكلمات المرور</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-5">
          <p
            className="text-[11px] font-medium text-slate-400"
          >
            جميع الحقوق محفوظة © {new Date().getFullYear()}
          </p>
          <p
            className="text-[10px] font-medium mt-0.5 text-slate-500"
          >
            منظومة إحصائيات الأدوية والمستلزمات الطبية v2.0
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
