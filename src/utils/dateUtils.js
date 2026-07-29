/**
 * Checks if a given month (YYYY-MM) is locked based on the 4-month rule.
 * A month is locked if it is 4 or more months before the current month.
 */
export const isMonthLocked = (monthStr) => {
  if (!monthStr) return false;
  
  const [year, month] = monthStr.split('-').map(Number);
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Calculate difference in months
  const diffMonths = (currentYear - year) * 12 + (currentMonth - (month - 1));
  
  return diffMonths >= 4;
};
