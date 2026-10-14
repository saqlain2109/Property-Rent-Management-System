export function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '₹0';
  return '₹' + Number(amount).toLocaleString('en-IN');
}

export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

export function formatMonthYear(monthYearStr) {
  if (!monthYearStr || monthYearStr === 'None' || monthYearStr === 'undefined' || monthYearStr === 'N/A') return 'No payments yet';
  if (typeof monthYearStr !== 'string' || !monthYearStr.includes('-')) return monthYearStr;
  const [y, m] = monthYearStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = parseInt(m, 10) - 1;
  const monthName = months[monthIdx] || m;
  if (!y || isNaN(monthIdx)) return monthYearStr;
  return `${monthName} ${y}`;
}
