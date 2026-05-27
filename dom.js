export function getLatestPostDate() {
  const selectors = [
    "article time",
    "div[role='dialog'] time",
    "time"
  ];

  let timeElement = null;

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      timeElement = el;
      break;
    }
  }

  if (!timeElement) return null;

  const datetime = timeElement.getAttribute("datetime");
  if (!datetime) return null;

  return new Date(datetime);
}