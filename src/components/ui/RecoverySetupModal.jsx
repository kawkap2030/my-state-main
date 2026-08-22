import React, { useState } from "react";
import { KeyRound, ShieldAlert, Copy, FileDown, Eye, EyeOff, Loader2, CheckCircle2, X } from "lucide-react";
import invoke from "../../api/tauriApi";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "./Toast";
import Input from "./Input";
import Button from "./Button";
import { copyRecoveryCode, exportRecoveryCode, RECOVERY_WARNING } from "../../utils/recoveryUtils";

export default function RecoverySetupModal({ isOpen, onClose, targetUsername, legacyMode = false }) {
  const { user, markRecoveryConfigured } = useAuth();
  const toast = useToast();
  
  const activeUsername = targetUsername || user?.username || "";
  const [currentPassword, setCurrentPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedCode, setGeneratedCode] = useState(null);

  if (!isOpen) return null;

  const notify = (msg, type) => (type === "success" ? toast.success(msg) : toast.error(msg));

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      setError("يرجى إدخال كلمة المرور الحالية");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const code = await invoke("create_recovery_code", {
        username: activeUsername,
        currentPassword,
      });
      setGeneratedCode(code);
      markRecoveryConfigured();
      toast.success("تم إنشاء رمز الاسترداد بنجاح");
    } catch (err) {
      setError(err || "فشل إنشاء رمز الاسترداد — تأكد من كلمة المرور الحالية");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCurrentPassword("");
    setGeneratedCode(null);
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" dir="rtl">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
        <button
          onClick={handleClose}
          className="absolute top-4 left-4 text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
          aria-label="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>

        {!generatedCode ? (
          <form onSubmit={handleGenerate} className="space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">إعداد رمز الاسترداد</h3>
                <p className="text-xs text-slate-400">للحساب: <span className="text-cyan-400 font-semibold">{activeUsername}</span></p>
              </div>
            </div>

            <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-3.5 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90 leading-relaxed">
                {legacyMode
                  ? 'حسابك لا يحتوي على رمز استرداد لكلمة المرور. يُنصح بإنشاء رمز استرداد الآن حتى تتمكن من استعادة حسابك إذا نسيت كلمة المرور.'
                  : 'يستخدم رمز الاسترداد لاستعادة الوصول إلى حسابك إذا نسيت كلمة المرور. يتطلب إنشاؤه تأكيد كلمة المرور الحالية.'}
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">كلمة المرور الحالية</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور الحالية لتأكيد الهوية"
                  className="pl-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                variant="primary"
                disabled={loading || !currentPassword}
                className="flex-1 justify-center bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <KeyRound className="w-4 h-4 ml-2" />}
                إنشاء رمز الاسترداد
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleClose}
                disabled={loading}
              >
                {legacyMode ? 'لاحقاً' : 'إلغاء'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">تم إنشاء رمز الاسترداد</h3>
                <p className="text-xs text-emerald-400 font-medium">احفظ هذا الرمز الآن في مكان آمن</p>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-cyan-500/30 rounded-2xl p-4 text-center space-y-2">
              <p className="text-xs text-slate-400">رمز الاسترداد الخاص بك (يُعرض مرة واحدة فقط):</p>
              <div className="font-mono text-xl sm:text-2xl font-bold tracking-wider text-cyan-300 bg-slate-900/90 py-3 px-4 rounded-xl border border-slate-800 dir-ltr select-all">
                {generatedCode}
              </div>
            </div>

            <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90 leading-relaxed">
                {RECOVERY_WARNING}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => copyRecoveryCode(generatedCode, notify)}
                className="flex-1 justify-center border-cyan-500/30 hover:bg-cyan-950/40 text-cyan-200"
              >
                <Copy className="w-4 h-4 ml-2" />
                نسخ الرمز
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={() => exportRecoveryCode(generatedCode, activeUsername, notify)}
                className="flex-1 justify-center border-slate-700 hover:bg-slate-800 text-slate-200"
              >
                <FileDown className="w-4 h-4 ml-2" />
                تصدير (TXT)
              </Button>
            </div>

            <Button
              type="button"
              variant="primary"
              onClick={handleClose}
              className="w-full justify-center bg-emerald-600 hover:bg-emerald-500 text-white mt-2"
            >
              تم الحفظ، إغلاق النافذة
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
