import React, { useState, useEffect, useCallback } from "react";
import {
  Users, UserPlus, Trash2, Edit3, Key, RefreshCw,
  Shield, Eye, Pencil, CheckCircle2, XCircle, AlertTriangle
} from "lucide-react";
import invoke from "../../api/tauriApi";
import { useAuth, ROLE_LABELS, ROLE_COLORS } from "../../context/AuthContext";
import { useToast } from "../../components/ui/Toast";
import PageHeader from "../../components/ui/PageHeader";
import Breadcrumb from "../../components/ui/Breadcrumb";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Table from "../../components/ui/Table";

// ─── Role Badge ───────────────────────────────────────────────────────────────

const RoleBadge = ({ role }) => {
  const label = ROLE_LABELS[role] || role;
  const color = ROLE_COLORS[role] || "bg-gray-100 text-gray-600";
  const Icon = role === "admin" ? Shield : role === "data_entry" ? Pencil : Eye;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black ${color}`}>
      <Icon size={12} />
      {label}
    </span>
  );
};

// ─── User Form Modal ──────────────────────────────────────────────────────────

const UserFormModal = ({ open, onClose, editUser, onSaved }) => {
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const isEdit = !!editUser;

  const [form, setForm] = useState({ username: "", password: "", role: "data_entry" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editUser) {
      setForm({ username: editUser.username, password: "", role: editUser.role });
    } else {
      setForm({ username: "", password: "", role: "data_entry" });
    }
  }, [editUser, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) {
        await invoke("update_user", {
          payload: { id: editUser.id, username: form.username, role: form.role },
        });
        toast.success("تم تحديث بيانات المستخدم بنجاح");
      } else {
        await invoke("add_user", {
          payload: { username: form.username, password: form.password, role: form.role },
        });
        toast.success(`تم إنشاء المستخدم '${form.username}' بنجاح`);
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err || "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isEdit ? `تعديل المستخدم: ${editUser?.username}` : "إضافة مستخدم جديد"}
    >
      <form onSubmit={handleSubmit} className="space-y-5 pt-2" dir="rtl">
        <Input
          label="اسم المستخدم"
          icon={Users}
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          placeholder="أدخل اسم المستخدم"
          required
        />

        {!isEdit && (
          <Input
            label="كلمة المرور"
            type="password"
            icon={Key}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="4 أحرف على الأقل"
            required
          />
        )}

        <div>
          <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">
            الصلاحية
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "admin", label: "مدير النظام", icon: Shield, desc: "كل الصلاحيات" },
              { key: "data_entry", label: "مدخل بيانات", icon: Pencil, desc: "إدخال وتعديل" },
              { key: "viewer", label: "مشاهد فقط", icon: Eye, desc: "قراءة فقط" },
            ].map((r) => {
              // Non-admins cannot create admins
              const disabled = r.key === "admin" && currentUser?.role !== "admin";
              return (
                <button
                  key={r.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setForm({ ...form, role: r.key })}
                  className={`p-3 rounded-xl border-2 text-right transition-all ${
                    form.role === r.key
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                      : "border-[var(--color-border)] hover:border-[var(--color-primary)]/50"
                  } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <r.icon size={18} className={form.role === r.key ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"} />
                  <p className="font-black text-sm mt-1">{r.label}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">{r.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" variant="primary" loading={loading} className="flex-1">
            {isEdit ? "حفظ التعديلات" : "إنشاء المستخدم"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ─── Change Password Modal ────────────────────────────────────────────────────

const ChangePasswordModal = ({ open, onClose, targetUser }) => {
  const toast = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setNewPassword("");
    setConfirm("");
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    setLoading(true);
    try {
      await invoke("change_user_password", {
        payload: { user_id: targetUser.id, new_password: newPassword },
      });
      toast.success(`تم تغيير كلمة مرور '${targetUser.username}' بنجاح`);
      onClose();
    } catch (err) {
      toast.error(err || "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Modal isOpen={open} onClose={onClose} title={`تغيير كلمة مرور: ${targetUser?.username}`}>
      <form onSubmit={handleSubmit} className="space-y-5 pt-2" dir="rtl">
        <Input
          label="كلمة المرور الجديدة"
          type="password"
          icon={Key}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="4 أحرف على الأقل"
          required
        />
        <Input
          label="تأكيد كلمة المرور"
          type="password"
          icon={Key}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="أعد كتابة كلمة المرور"
          required
        />
        <div className="flex gap-3 pt-2">
          <Button type="submit" variant="primary" loading={loading} className="flex-1">
            تغيير كلمة المرور
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const UserManagementPage = () => {
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [changePassUser, setChangePassUser] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke("get_users");
      setUsers(data);
    } catch (err) {
      toast.error("فشل تحميل قائمة المستخدمين");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleResetAdminPassword = async () => {
    const confirmed = window.confirm(
      "هل أنت متأكد من إعادة تعيين كلمة مرور المدير إلى القيمة الافتراضية؟\n\n" +
      "اسم المستخدم: admin\n" +
      "كلمة المرور: admin\n\n" +
      "يمكنك تغييرها لاحقاً من أيقونة المفتاح 🔑 بجانب المستخدم."
    );
    if (!confirmed) return;

    try {
      const response = await invoke('reset_admin_password');
      toast.success(response);
    } catch (err) {
      toast.error(err);
    }
  };

  const handleDelete = async (u) => {
    if (u.id === currentUser?.id) {
      toast.error("لا يمكنك حذف حسابك الشخصي");
      return;
    }
    if (!window.confirm(`هل تريد حذف المستخدم '${u.username}'؟`)) return;
    setDeletingId(u.id);
    try {
      await invoke("delete_user", { userId: u.id });
      toast.success(`تم حذف المستخدم '${u.username}'`);
      loadUsers();
    } catch (err) {
      toast.error(err || "فشل الحذف");
    } finally {
      setDeletingId(null);
    }
  };

  // Stats
  const adminCount = users.filter((u) => u.role === "admin").length;
  const dataEntryCount = users.filter((u) => u.role === "data_entry").length;
  const viewerCount = users.filter((u) => u.role === "viewer").length;

  const columns = [
    {
      header: "#",
      accessor: "id",
      cell: (val) => <span className="text-[var(--color-text-muted)] font-black text-xs">{val}</span>,
    },
    {
      header: "اسم المستخدم",
      accessor: "username",
      cell: (val, row) => (
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black bg-gradient-to-br ${
            row.role === "admin" ? "from-red-500 to-rose-600" :
            row.role === "data_entry" ? "from-blue-500 to-indigo-600" :
            "from-gray-400 to-gray-500"
          }`}>
            {val?.[0]?.toUpperCase() || "U"}
          </div>
          <div>
            <p className="font-black text-sm text-[var(--color-text)]">{val}</p>
            {row.id === currentUser?.id && (
              <span className="text-[10px] text-[var(--color-primary)] font-bold">أنت</span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: "الصلاحية",
      accessor: "role",
      cell: (val) => <RoleBadge role={val} />,
    },
    {
      header: "تاريخ الإنشاء",
      accessor: "created_at",
      cell: (val) =>
        val ? new Date(val).toLocaleDateString("ar-EG") : "-",
    },
    {
      header: "الإجراءات",
      accessor: "_actions",
      cell: (_, row) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setEditUser(row)}
            className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
            title="تعديل"
          >
            <Edit3 size={15} />
          </button>
          <button
            onClick={() => setChangePassUser(row)}
            className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 transition-colors"
            title="تغيير كلمة المرور"
          >
            <Key size={15} />
          </button>
          <button
            onClick={() => handleDelete(row)}
            disabled={deletingId === row.id || row.id === currentUser?.id}
            className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="حذف"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fadeIn" dir="rtl">
      <Breadcrumb
        items={[
          { label: "الإدارة المتقدمة" },
          { label: "إدارة المستخدمين" },
        ]}
      />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader
          title="إدارة المستخدمين"
          icon={Users}
          description="إضافة وتعديل وحذف حسابات المستخدمين وتحديد صلاحياتهم"
        />
        <div className="flex gap-2">
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={loadUsers}
            loading={loading}
          >
            تحديث
          </Button>
          <Button
            variant="danger"
            className="gap-2 text-xs font-bold"
            onClick={handleResetAdminPassword}
          >
            <Key size={14} />
            إعادة تعيين كلمة سر admin
          </Button>
          <Button
            variant="primary"
            icon={UserPlus}
            onClick={() => setShowAddModal(true)}
          >
            إضافة مستخدم
          </Button>
        </div>
      </div>

      {/* Stats cards — with min-h to prevent layout shift/shaking */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي المستخدمين", value: users.length, icon: Users, color: "from-slate-500 to-slate-600" },
          { label: "مديرو النظام", value: adminCount, icon: Shield, color: "from-red-500 to-rose-600" },
          { label: "مدخلو البيانات", value: dataEntryCount, icon: Pencil, color: "from-blue-500 to-indigo-600" },
          { label: "المشاهدون", value: viewerCount, icon: Eye, color: "from-gray-400 to-gray-500" },
        ].map((stat) => (
          <Card key={stat.label} className="p-4 flex items-center gap-3 min-h-[88px]">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-white flex-shrink-0`}>
              <stat.icon size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-black text-[var(--color-text)] leading-none mb-1">{stat.value}</p>
              <p className="text-xs font-bold text-[var(--color-text-muted)]">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Warning: only 1 admin */}
      {adminCount <= 1 && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
          <p className="text-sm font-bold text-amber-700">
            يوجد مدير نظام واحد فقط. لا يمكن حذفه أو تغيير دوره حتى يتم إضافة مدير آخر.
          </p>
        </div>
      )}

      {/* Users table */}
      <Card className="p-0 border-none shadow-xl overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="font-black text-[var(--color-text)]">قائمة المستخدمين</h3>
          <span className="text-xs font-bold text-[var(--color-text-muted)] bg-[var(--color-bg)] px-3 py-1 rounded-full">
            {users.length} مستخدم
          </span>
        </div>
        {loading ? (
          <div className="p-12 text-center text-[var(--color-text-muted)]">
            <RefreshCw className="animate-spin mx-auto mb-4" size={32} />
            <p>جاري التحميل...</p>
          </div>
        ) : (
          <Table columns={columns} data={users} />
        )}
      </Card>

      {/* Permissions Legend */}
      <Card className="p-5">
        <h4 className="font-black text-[var(--color-text)] mb-4 flex items-center gap-2">
          <Shield size={18} className="text-[var(--color-primary)]" />
          دليل الصلاحيات
        </h4>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              role: "admin",
              label: "مدير النظام",
              icon: Shield,
              color: "red",
              perms: ["إضافة/تعديل/حذف كل البيانات", "إدارة المستخدمين", "النسخ الاحتياطي", "جميع التقارير", "إقفال الشهور"],
            },
            {
              role: "data_entry",
              label: "مدخل البيانات",
              icon: Pencil,
              color: "blue",
              perms: ["إضافة وتعديل بيانات الصرف", "عرض جميع التقارير", "تصدير البيانات", "لا يمكن حذف المستخدمين"],
            },
            {
              role: "viewer",
              label: "مشاهد فقط",
              icon: Eye,
              color: "gray",
              perms: ["عرض التقارير فقط", "تصدير البيانات", "لا يمكن إدخال أو تعديل"],
            },
          ].map((r) => (
            <div key={r.role} className={`p-4 rounded-2xl border-2 border-${r.color}-100 bg-${r.color}-50/30`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-xl bg-${r.color}-500 flex items-center justify-center text-white`}>
                  <r.icon size={16} />
                </div>
                <span className="font-black text-sm text-[var(--color-text)]">{r.label}</span>
              </div>
              <ul className="space-y-1.5">
                {r.perms.map((p) => (
                  <li key={p} className="flex items-start gap-1.5 text-xs text-[var(--color-text-muted)]">
                    <CheckCircle2 size={12} className={`text-${r.color}-500 mt-0.5 flex-shrink-0`} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {/* Modals */}
      <UserFormModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        editUser={null}
        onSaved={loadUsers}
      />
      <UserFormModal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        editUser={editUser}
        onSaved={loadUsers}
      />
      <ChangePasswordModal
        open={!!changePassUser}
        onClose={() => setChangePassUser(null)}
        targetUser={changePassUser}
      />
    </div>
  );
};

export default UserManagementPage;
