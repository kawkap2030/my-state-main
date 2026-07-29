import React, { useState } from "react";
import { Lock, User, LogIn, Activity, ShieldCheck, Eye, EyeOff, Sparkles, KeyRound } from "lucide-react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/ui/Toast";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import invoke from "../../api/tauriApi";

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
          from { opacity: 0; transform: translateY(30px); }
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
  const [resetLoading, setResetLoading] = useState(false);
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const handleForgotPassword = async () => {
    const confirmed = window.confirm(
      'هل تريد إعادة تعيين كلمة المرور إلى القيمة الافتراضية؟\n\n' +
      'اسم المستخدم: admin\n' +
      'كلمة المرور: admin\n\n' +
      'يمكنك تغييرها لاحقاً بعد تسجيل الدخول.'
    );
    if (!confirmed) return;

    setResetLoading(true);
    try {
      const response = await invoke('reset_admin_password');
      toast.success(response);
    } catch (err) {
      toast.error(err || 'فشلت عملية إعادة التعيين');
    } finally {
      setResetLoading(false);
    }
  };

  if (user) {
    return <Navigate to="/" replace />;
  }

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
        background: 'linear-gradient(135deg, var(--color-bg) 0%, color-mix(in srgb, var(--color-primary), var(--color-bg) 90%) 50%, var(--color-bg) 100%)',
      }}
    >
      {/* Animated gradient overlay */}
      <div
        className="absolute inset-0 animate-gradient opacity-30"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 25%, var(--color-purple) 50%, var(--color-dash-3) 75%, var(--color-primary) 100%)',
          backgroundSize: '200% 200%',
        }}
      />

      {/* Floating particles */}
      <Particles />

      {/* Login Card */}
      <div
        className="w-full max-w-md animate-slideUpFade relative"
        style={{ animationDelay: '0.1s' }}
      >
        {/* Glass card */}
        <div
          className="rounded-3xl p-8 sm:p-10 backdrop-blur-xl border shadow-2xl"
          style={{
            background: 'var(--color-glass)',
            borderColor: 'var(--color-glass-border)',
            animation: 'pulseGlow 4s ease-in-out infinite',
          }}
        >
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <div
              className="w-20 h-20 mx-auto mb-5 rounded-2xl flex items-center justify-center relative group"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                boxShadow: '0 8px 32px rgba(8, 145, 178, 0.25)',
              }}
            >
              <Activity size={36} className="text-white" />
              <div
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shadow-md"
                style={{ border: '2px solid var(--color-primary)' }}
              >
                <ShieldCheck size={12} style={{ color: 'var(--color-primary)' }} />
              </div>
            </div>

            <h1
              className="text-2xl sm:text-3xl font-black tracking-tight mb-2"
              style={{ color: 'var(--color-text)' }}
            >
              منظومة الإحصاء الطبي
            </h1>
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--color-text-muted)' }}
            >
              الهيئة العامة للتأمين الصحي
            </p>
            <div
              className="w-12 h-0.5 mx-auto mt-4 rounded-full"
              style={{ background: 'var(--color-primary)' }}
            />
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5" noValidate>
            {/* Username */}
            <div
              className="animate-slideUpFade"
              style={{ animationDelay: '0.2s' }}
            >
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
                inputClassName={focusedField === 'username' ? 'ring-2 ring-primary/20' : ''}
              />
            </div>

            {/* Password */}
            <div
              className="animate-slideUpFade relative"
              style={{ animationDelay: '0.3s' }}
            >
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
                inputClassName={focusedField === 'password' ? 'ring-2 ring-primary/20 pl-10' : 'pl-10'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 bottom-3.5 cursor-pointer transition-opacity hover:opacity-70"
                style={{ color: 'var(--color-text-muted)' }}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Forgot Password Link */}
            <div className="text-center -mt-2">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetLoading}
                className={`text-[11px] font-bold transition-colors inline-flex items-center gap-1.5 ${
                  resetLoading ? 'text-slate-400 cursor-not-allowed' : 'text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300'
                }`}
              >
                <KeyRound size={12} />
                {resetLoading ? 'جاري إعادة التعيين...' : 'نسيت كلمة المرور؟'}
              </button>
            </div>

            {/* Submit */}
            <div
              className="animate-slideUpFade pt-2"
              style={{ animationDelay: '0.4s' }}
            >
              <Button
                type="submit"
                variant="primary"
                icon={LogIn}
                className="w-full py-4 text-lg rounded-2xl shadow-xl transition-all duration-300"
                loading={loading}
                disabled={!isFormValid}
              >
                تسجيل الدخول
              </Button>
            </div>
          </form>

          {/* Hint */}
          <div
            className="animate-slideUpFade mt-6 text-center"
            style={{ animationDelay: '0.5s' }}
          >
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold"
              style={{
                background: `color-mix(in srgb, var(--color-primary), transparent 90%)`,
                color: 'var(--color-primary)',
              }}
            >
              <Sparkles size={14} />
              <span>للدخول كمسؤول: admin / admin</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="text-center mt-6 animate-slideUpFade"
          style={{ animationDelay: '0.6s' }}
        >
          <p
            className="text-[11px] font-medium"
            style={{ color: 'var(--color-text-muted)' }}
          >
            جميع الحقوق محفوظة © {new Date().getFullYear()}
          </p>
          <p
            className="text-[10px] font-medium mt-0.5"
            style={{ color: 'var(--color-text-muted)', opacity: 0.7 }}
          >
            نظام إحصائيات الأدوية والمستلزمات الطبية — v2.0
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
