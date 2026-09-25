/* eslint-disable react-refresh/only-export-components */

import React from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import PlaceholderPage from '../components/common/PlaceholderPage';
import { useAuth } from '../context/AuthContext';
import LoginPage from '../modules/auth/LoginPage';
import RoleGuard from '../components/common/RoleGuard';
import SafeSuspense from '../components/ui/SuspenseErrorBoundary';

// ═══════════════════════════════════════════════════════════════════════════
// SafeSuspense wrapper — catches chunk-load errors + shows loading state
// ═══════════════════════════════════════════════════════════════════════════
const Suspensed = ({ children, name }) => (
  <SafeSuspense name={name}>{children}</SafeSuspense>
);

// ═══════════════════════════════════════════════════════════════════════════
// Lazy-loaded Pages with Smart Preloading Engine
// ═══════════════════════════════════════════════════════════════════════════

const lazyWithPreload = (factory) => {
  const Component = React.lazy(factory);
  Component.preload = factory;
  return Component;
};

// Dashboard
const DashboardPage = lazyWithPreload(() => import('../modules/dashboard/DashboardPage'));

// Master Data — Hierarchy
const BranchesPage = lazyWithPreload(() => import('../modules/master-data/hierarchy/BranchesPage'));
const AreasPage = lazyWithPreload(() => import('../modules/master-data/hierarchy/AreasPage'));
const ClinicsPage = lazyWithPreload(() => import('../modules/master-data/hierarchy/ClinicsPage'));

// Master Data — Drugs & Supplies
const DrugsManagementPage = lazyWithPreload(() => import('../modules/master-data/drugs/DrugsManagementPage'));
const DrugGroupsManagementPage = lazyWithPreload(() => import('../modules/master-data/drugs/DrugGroupsManagementPage'));
const InsulinManagementPage = lazyWithPreload(() => import('../modules/master-data/insulin/InsulinManagementPage'));
const SuppliesManagementPage = lazyWithPreload(() => import('../modules/master-data/supplies/SuppliesManagementPage'));
const JudicialSetupPage = lazyWithPreload(() => import('../modules/master-data/judicial-setup/JudicialSetupPage'));
const LockManagementPage = lazyWithPreload(() => import('../modules/master-data/locks/LockManagementPage'));
const DataManagementPage = lazyWithPreload(() => import('../modules/master-data/backup/DataManagementPage'));

// Transactions
const MonthlyTotalsPage = lazyWithPreload(() => import('../modules/transactions/monthly-totals/MonthlyTotalsPage'));
const FreeDrugsTotalsPage = lazyWithPreload(() => import('../modules/transactions/monthly-totals/FreeDrugsTotalsPage'));
const SupportedDrugsTotalsPage = lazyWithPreload(() => import('../modules/transactions/monthly-totals/SupportedDrugsTotalsPage'));
const SuppliesTotalsPage = lazyWithPreload(() => import('../modules/transactions/monthly-totals/SuppliesTotalsPage'));
const DetailedDrugDispensingPage = lazyWithPreload(() => import('../modules/transactions/drug-dispensing/DetailedDrugDispensingPage'));
const MedicalTicketsPage = lazyWithPreload(() => import('../modules/transactions/medical-tickets/MedicalTicketsPage'));
const InsulinDispensingPage = lazyWithPreload(() => import('../modules/transactions/insulin-dispensing/InsulinDispensingPage'));
const JudicialDispensingPage = lazyWithPreload(() => import('../modules/transactions/judicial-dispensing/JudicialDispensingPage'));
const GroupCostsPage = lazyWithPreload(() => import('../modules/transactions/group-costs/GroupCostsPage'));
const QuickTicketsPage = lazyWithPreload(() => import('../modules/transactions/QuickTicketsPage'));

// Reports — General
const AnalyticalReportsPage = lazyWithPreload(() => import('../modules/reports/analytical/AnalyticalReportsPage'));
const FinancialReportsPage = lazyWithPreload(() => import('../modules/reports/financial/FinancialReportsPage'));
const ComparisonReportsPage = lazyWithPreload(() => import('../modules/reports/comparison/ComparisonReportsPage'));
const ExecutiveReportPage = lazyWithPreload(() => import('../modules/reports/executive/ExecutiveReportPage'));
const AnomalyDetectionPage = lazyWithPreload(() => import('../modules/reports/anomaly/AnomalyDetectionPage'));
const DemographicReportPage = lazyWithPreload(() => import('../modules/reports/demographic/DemographicReportPage'));
const PivotReportsPage = lazyWithPreload(() => import('../modules/reports/pivot/PivotReportsPage'));
const DataQualityPage = lazyWithPreload(() => import('../modules/reports/data-quality/DataQualityPage'));
const JudicialAnalyticsPage = lazyWithPreload(() => import('../modules/reports/judicial-analytics/JudicialAnalyticsPage'));
const ComplianceReportPage = lazyWithPreload(() => import('../modules/reports/compliance/ComplianceReportPage'));
const ReconciliationPage = lazyWithPreload(() => import('../modules/reports/ReconciliationPage'));

// Reports — Cost & Temporal
const CostAnalysisPage = lazyWithPreload(() => import('../modules/reports/cost-analysis/CostAnalysisPage'));
const TemporalAnalysisHub = lazyWithPreload(() => import('../modules/reports/temporal/TemporalAnalysisHub'));

// Reports — Specialized
const DrugsReportPage = lazyWithPreload(() => import('../modules/reports/specialized/DrugsReportPage'));
const InsulinReportPage = lazyWithPreload(() => import('../modules/reports/specialized/InsulinReportPage'));
const TicketsReportPage = lazyWithPreload(() => import('../modules/reports/specialized/TicketsReportPage'));
const JudicialReportPage = lazyWithPreload(() => import('../modules/reports/specialized/JudicialReportPage'));
const SuppliesReportPage = lazyWithPreload(() => import('../modules/reports/specialized/SuppliesReportPage'));
const FreeDrugsReportPage = lazyWithPreload(() => import('../modules/reports/specialized/FreeDrugsReportPage'));
const SupportedDrugsReportPage = lazyWithPreload(() => import('../modules/reports/specialized/SupportedDrugsReportPage'));
const DrugGroupsReportPage = lazyWithPreload(() => import('../modules/reports/specialized/DrugGroupsReportPage'));

// Admin
const AuditLogPage = lazyWithPreload(() => import('../modules/admin/AuditLogPage'));
const UserManagementPage = lazyWithPreload(() => import('../modules/admin/UserManagementPage'));
const SystemPerformancePage = lazyWithPreload(() => import('../modules/admin/SystemPerformancePage'));
const ScheduledReportsPage = lazyWithPreload(() => import('../modules/admin/ScheduledReportsPage'));

// Help
const UserGuidePage = lazyWithPreload(() => import('../modules/help/UserGuidePage'));
const AboutDesignerPage = lazyWithPreload(() => import('../modules/help/AboutDesignerPage'));



// ═══════════════════════════════════════════════════════════════════════════

const AuthGuard = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout />;
};

const router = createHashRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AuthGuard />,
    children: [
      // ── Dashboard ──────────────────────────────────────────────────────
      { index: true, element: <Suspensed><DashboardPage /></Suspensed> },

      // ── Master Data Layer ──────────────────────────────────────────────
      { path: 'master-data/hierarchy', element: <Navigate to="/master-data/hierarchy/branches" replace /> },
      { path: 'master-data/hierarchy/branches', element: <Suspensed><RoleGuard requiredRole="admin"><BranchesPage /></RoleGuard></Suspensed> },
      { path: 'master-data/hierarchy/areas', element: <Suspensed><RoleGuard requiredRole="admin"><AreasPage /></RoleGuard></Suspensed> },
      { path: 'master-data/hierarchy/clinics', element: <Suspensed><RoleGuard requiredRole="admin"><ClinicsPage /></RoleGuard></Suspensed> },
      { path: 'master-data/drugs', element: <Suspensed><RoleGuard requiredRole="admin"><DrugsManagementPage /></RoleGuard></Suspensed> },
      { path: 'master-data/drug-groups', element: <Suspensed><RoleGuard requiredRole="admin"><DrugGroupsManagementPage /></RoleGuard></Suspensed> },
      { path: 'master-data/insulin', element: <Suspensed><RoleGuard requiredRole="admin"><InsulinManagementPage /></RoleGuard></Suspensed> },
      { path: 'master-data/supplies', element: <Suspensed><RoleGuard requiredRole="admin"><SuppliesManagementPage /></RoleGuard></Suspensed> },
      { path: 'master-data/judicial-setup', element: <Suspensed><RoleGuard requiredRole="admin"><JudicialSetupPage /></RoleGuard></Suspensed> },
      { path: 'master-data/locks', element: <Suspensed><RoleGuard requiredRole="admin"><LockManagementPage /></RoleGuard></Suspensed> },
      { path: 'master-data/data-management', element: <Suspensed><RoleGuard requiredRole="admin"><DataManagementPage /></RoleGuard></Suspensed> },

      // ── Transaction Layer ──────────────────────────────────────────────
      { path: 'transactions/monthly-totals', element: <Suspensed><RoleGuard requiredRole="data_entry"><MonthlyTotalsPage /></RoleGuard></Suspensed> },
      { path: 'transactions/free-drugs', element: <Suspensed><RoleGuard requiredRole="data_entry"><FreeDrugsTotalsPage /></RoleGuard></Suspensed> },
      { path: 'transactions/supported-drugs', element: <Suspensed><RoleGuard requiredRole="data_entry"><SupportedDrugsTotalsPage /></RoleGuard></Suspensed> },
      { path: 'transactions/supplies', element: <Suspensed><RoleGuard requiredRole="data_entry"><SuppliesTotalsPage /></RoleGuard></Suspensed> },
      { path: 'transactions/drug-dispensing', element: <Suspensed><RoleGuard requiredRole="data_entry"><DetailedDrugDispensingPage /></RoleGuard></Suspensed> },
      { path: 'transactions/medical-tickets', element: <Suspensed><RoleGuard requiredRole="data_entry"><MedicalTicketsPage /></RoleGuard></Suspensed> },
      { path: 'transactions/insulin-dispensing', element: <Suspensed><RoleGuard requiredRole="data_entry"><InsulinDispensingPage /></RoleGuard></Suspensed> },
      { path: 'transactions/judicial-dispensing', element: <Suspensed><RoleGuard requiredRole="data_entry"><JudicialDispensingPage /></RoleGuard></Suspensed> },
      { path: 'transactions/group-costs', element: <Suspensed><RoleGuard requiredRole="data_entry"><GroupCostsPage /></RoleGuard></Suspensed> },
      { path: 'transactions/quick-tickets', element: <Suspensed><RoleGuard requiredRole="data_entry"><QuickTicketsPage /></RoleGuard></Suspensed> },

      // ── Reporting Layer ────────────────────────────────────────────────
      { path: 'reports/analytical', element: <Suspensed><AnalyticalReportsPage /></Suspensed> },
      { path: 'reports/financial', element: <Suspensed><FinancialReportsPage /></Suspensed> },
      { path: 'reports/comparison', element: <Suspensed><ComparisonReportsPage /></Suspensed> },
      { path: 'reports/cost-analysis', element: <Suspensed><CostAnalysisPage /></Suspensed> },
      { path: 'reports/executive', element: <Suspensed><ExecutiveReportPage /></Suspensed> },
      { path: 'reports/anomaly', element: <Suspensed><AnomalyDetectionPage /></Suspensed> },
      { path: 'reports/demographic', element: <Suspensed><DemographicReportPage /></Suspensed> },
      { path: 'reports/pivot', element: <Suspensed><PivotReportsPage /></Suspensed> },
      { path: 'reports/data-quality', element: <Suspensed><DataQualityPage /></Suspensed> },
      { path: 'reports/judicial-analytics', element: <Suspensed><JudicialAnalyticsPage /></Suspensed> },
      { path: 'reports/compliance', element: <Suspensed><ComplianceReportPage /></Suspensed> },
      { path: 'reports/reconciliation', element: <Suspensed><ReconciliationPage /></Suspensed> },

      // ── Admin Layer ────────────────────────────────────────────────────
      { path: 'admin/audit-log', element: <Suspensed><RoleGuard requiredRole="admin"><AuditLogPage /></RoleGuard></Suspensed> },
      { path: 'admin/user-management', element: <Suspensed><RoleGuard requiredRole="admin"><UserManagementPage /></RoleGuard></Suspensed> },
      { path: 'admin/system-performance', element: <Suspensed><RoleGuard requiredRole="admin"><SystemPerformancePage /></RoleGuard></Suspensed> },
      { path: 'admin/scheduled-reports', element: <Suspensed><RoleGuard requiredRole="admin"><ScheduledReportsPage /></RoleGuard></Suspensed> },

      // ── Specialized Reports ────────────────────────────────────────────
      { path: 'reports/specialized/drugs', element: <Suspensed><DrugsReportPage /></Suspensed> },
      { path: 'reports/specialized/insulin', element: <Suspensed><InsulinReportPage /></Suspensed> },
      { path: 'reports/specialized/tickets', element: <Suspensed><TicketsReportPage /></Suspensed> },
      { path: 'reports/specialized/judicial', element: <Suspensed><JudicialReportPage /></Suspensed> },
      { path: 'reports/specialized/supplies', element: <Suspensed><SuppliesReportPage /></Suspensed> },
      { path: 'reports/specialized/free-drugs', element: <Suspensed><FreeDrugsReportPage /></Suspensed> },
      { path: 'reports/specialized/supported-drugs', element: <Suspensed><SupportedDrugsReportPage /></Suspensed> },
      { path: 'reports/specialized/drug-groups', element: <Suspensed><DrugGroupsReportPage /></Suspensed> },
      { path: 'reports/temporal-hub', element: <Suspensed><TemporalAnalysisHub /></Suspensed> },

      // ── Help ───────────────────────────────────────────────────────────
      { path: 'help/user-guide', element: <Suspensed><UserGuidePage /></Suspensed> },
      { path: 'help/about-designer', element: <Suspensed><AboutDesignerPage /></Suspensed> },

      // ── Fallback for old links ─────────────────────────────────────────
      { path: 'monthly-dispensed', element: <Navigate to="/transactions/monthly-totals" replace /> },
      { path: 'insulin', element: <Navigate to="/transactions/insulin-dispensing" replace /> },
      { path: 'drug-groups', element: <Navigate to="/transactions/drug-dispensing" replace /> },
      { path: 'judicial', element: <Navigate to="/transactions/judicial-dispensing" replace /> },
      { path: 'reports', element: <Navigate to="/reports/analytical" replace /> },

      // ── Fallback ───────────────────────────────────────────────────────
      { path: '*', element: <PlaceholderPage /> },
    ],
  },
]);

export default router;
