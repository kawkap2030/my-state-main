/**
 * Preload utilities for lazy-loaded route components.
 * Separated from router/index.jsx to satisfy react-refresh/only-export-components.
 */

export const routePreloaders = {
  '/': () => import('../modules/dashboard/DashboardPage'),
  '/master-data/hierarchy/branches': () => import('../modules/master-data/hierarchy/BranchesPage'),
  '/master-data/hierarchy/areas': () => import('../modules/master-data/hierarchy/AreasPage'),
  '/master-data/hierarchy/clinics': () => import('../modules/master-data/hierarchy/ClinicsPage'),
  '/master-data/drugs': () => import('../modules/master-data/drugs/DrugsManagementPage'),
  '/master-data/drug-groups': () => import('../modules/master-data/drugs/DrugGroupsManagementPage'),
  '/master-data/insulin': () => import('../modules/master-data/insulin/InsulinManagementPage'),
  '/master-data/supplies': () => import('../modules/master-data/supplies/SuppliesManagementPage'),
  '/master-data/judicial-setup': () => import('../modules/master-data/judicial-setup/JudicialSetupPage'),
  '/master-data/locks': () => import('../modules/master-data/locks/LockManagementPage'),
  '/master-data/data-management': () => import('../modules/master-data/backup/DataManagementPage'),

  '/transactions/monthly-totals': () => import('../modules/transactions/monthly-totals/MonthlyTotalsPage'),
  '/transactions/free-drugs': () => import('../modules/transactions/monthly-totals/FreeDrugsTotalsPage'),
  '/transactions/supported-drugs': () => import('../modules/transactions/monthly-totals/SupportedDrugsTotalsPage'),
  '/transactions/supplies': () => import('../modules/transactions/monthly-totals/SuppliesTotalsPage'),
  '/transactions/drug-dispensing': () => import('../modules/transactions/drug-dispensing/DetailedDrugDispensingPage'),
  '/transactions/medical-tickets': () => import('../modules/transactions/medical-tickets/MedicalTicketsPage'),
  '/transactions/insulin-dispensing': () => import('../modules/transactions/insulin-dispensing/InsulinDispensingPage'),
  '/transactions/judicial-dispensing': () => import('../modules/transactions/judicial-dispensing/JudicialDispensingPage'),
  '/transactions/group-costs': () => import('../modules/transactions/group-costs/GroupCostsPage'),
  '/transactions/branch-batch-summary': () => import('../modules/transactions/BranchBatchSummaryPage'),
  '/transactions/quick-tickets': () => import('../modules/transactions/QuickTicketsPage'),

  '/reports/analytical': () => import('../modules/reports/analytical/AnalyticalReportsPage'),
  '/reports/financial': () => import('../modules/reports/financial/FinancialReportsPage'),
  '/reports/comparison': () => import('../modules/reports/comparison/ComparisonReportsPage'),
  '/reports/cost-analysis': () => import('../modules/reports/cost-analysis/CostAnalysisPage'),
  '/reports/temporal': () => import('../modules/reports/temporal/TemporalAnalysisHub'),
  '/reports/executive': () => import('../modules/reports/executive/ExecutiveReportPage'),
  '/reports/anomaly': () => import('../modules/reports/anomaly/AnomalyDetectionPage'),
  '/reports/demographic': () => import('../modules/reports/demographic/DemographicReportPage'),
  '/reports/pivot': () => import('../modules/reports/pivot/PivotReportsPage'),
  '/reports/data-quality': () => import('../modules/reports/data-quality/DataQualityPage'),
  '/reports/judicial-analytics': () => import('../modules/reports/judicial-analytics/JudicialAnalyticsPage'),
  '/reports/compliance': () => import('../modules/reports/compliance/ComplianceReportPage'),
  '/reports/reconciliation': () => import('../modules/reports/ReconciliationPage'),

  '/admin/audit-log': () => import('../modules/admin/AuditLogPage'),
  '/admin/user-management': () => import('../modules/admin/UserManagementPage'),
  '/admin/system-performance': () => import('../modules/admin/SystemPerformancePage'),
  '/admin/scheduled-reports': () => import('../modules/admin/ScheduledReportsPage'),

  '/help/user-guide': () => import('../modules/help/UserGuidePage'),
  '/help/about-designer': () => import('../modules/help/AboutDesignerPage'),
};

export const preloadRoute = (path) => {
  if (routePreloaders[path]) {
    try {
      routePreloaders[path]();
    } catch (_) {}
  }
};

export const preloadCoreRoutes = () => {
  const corePaths = [
    '/',
    '/transactions/drug-dispensing',
    '/transactions/monthly-totals',
    '/transactions/free-drugs',
    '/reports/analytical',
  ];
  corePaths.forEach(path => {
    preloadRoute(path);
  });
};
