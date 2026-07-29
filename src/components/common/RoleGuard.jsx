import React from "react";
import { useAuth } from "../../context/AuthContext";
import { ShieldOff } from "lucide-react";

/**
 * RoleGuard - Restricts access based on user role.
 * 
 * Props:
 *   requiredRole: 'admin' | 'data_entry' | 'viewer'
 *   fallback: Optional JSX to show if no permission (default: styled access denied)
 *   children: Content to render if permitted
 * 
 * Usage:
 *   <RoleGuard requiredRole="admin">
 *     <AdminOnlyContent />
 *   </RoleGuard>
 */
const RoleGuard = ({ requiredRole = "viewer", fallback, children }) => {
  const { hasPermission } = useAuth();

  if (hasPermission(requiredRole)) {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fadeIn" dir="rtl">
      <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center">
        <ShieldOff size={36} className="text-red-400" />
      </div>
      <h2 className="text-xl font-black text-[var(--color-text)]">غير مصرح بالوصول</h2>
      <p className="text-[var(--color-text-muted)] text-sm text-center max-w-sm">
        ليس لديك الصلاحية اللازمة لعرض هذه الصفحة. يرجى التواصل مع مدير النظام.
      </p>
    </div>
  );
};

export default React.memo(RoleGuard);
