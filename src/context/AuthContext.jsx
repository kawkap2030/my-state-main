import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import invoke from "../api/tauriApi";
import { useToast } from "../components/ui/Toast";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

// ─── Role Helpers ─────────────────────────────────────────────────────────────

const ROLE_HIERARCHY = { admin: 3, data_entry: 2, viewer: 1 };

export const ROLE_LABELS = {
  admin: "مدير النظام",
  data_entry: "مدخل بيانات",
  viewer: "مشاهد فقط",
};

export const ROLE_COLORS = {
  admin: "bg-red-100 text-red-700",
  data_entry: "bg-blue-100 text-blue-700",
  viewer: "bg-gray-100 text-gray-600",
};

/**
 * Check if the user has at least the required role level.
 * 'admin' > 'data_entry' > 'viewer'
 */
export const hasPermission = (userRole, requiredRole) => {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
};

/**
 * Can user modify data? (admin or data_entry)
 */
export const canEdit = (userRole) => hasPermission(userRole, "data_entry");

/**
 * Is user an admin?
 */
export const isAdmin = (userRole) => userRole === "admin";

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  // Always start logged out so the app opens on the login page.
  // Session is only kept in memory for the current app run (not restored from storage).
  useEffect(() => {
    localStorage.removeItem("app_user");
    const t = setTimeout(() => setLoading(false), 0);
    return () => clearTimeout(t);
  }, []);

  const login = useCallback(async (username, password) => {
    try {
      const userData = await invoke("login", { username, passwordHash: password });
      setUser(userData);
      localStorage.setItem("app_user", JSON.stringify(userData));
      toast.success(`مرحباً بك ${userData.username} — ${ROLE_LABELS[userData.role] || userData.role}`);
      return true;
    } catch (err) {
      toast.error(err || "بيانات الدخول غير صحيحة");
      return false;
    }
  }, [toast]);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("app_user");
  }, []);

  /**
   * Refresh user data from DB (e.g. after password change by admin)
   */
  const refreshUser = useCallback(async () => {
    if (!user) return;
    try {
      const users = await invoke("get_users");
      const updated = users.find((u) => u.id === user.id);
      if (updated) {
        const merged = { ...user, ...updated };
        setUser(merged);
        localStorage.setItem("app_user", JSON.stringify(merged));
      }
    } catch (_) {}
  }, [user]);

  const canEditHelper = useCallback(() => canEdit(user?.role), [user?.role]);
  const isAdminHelper = useCallback(() => isAdmin(user?.role), [user?.role]);
  const hasPermissionHelper = useCallback((requiredRole) => hasPermission(user?.role, requiredRole), [user?.role]);

  const value = React.useMemo(() => ({
    user,
    loading,
    login,
    logout,
    refreshUser,
    canEdit: canEditHelper,
    isAdmin: isAdminHelper,
    hasPermission: hasPermissionHelper,
  }), [user, loading, login, logout, refreshUser, canEditHelper, isAdminHelper, hasPermissionHelper]);

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
