let badge;

export function createOrUpdateBadge(text) {
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "ig-last-post-badge";
    document.body.appendChild(badge);
  }

  badge.textContent = text;
}