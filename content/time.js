export function calculateDaysAgo(date) {
  const now = new Date();
  const diff = now - date;

  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function formatLabel(date) {
  if (!date) return "Last post — Cannot determine";

  const days = calculateDaysAgo(date);

  if (days <= 0) return "Last post — Today";

  return `Last post — ${days} days ago`;
}