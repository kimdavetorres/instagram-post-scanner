import { getLatestPostDate } from "./dom.js";
import { formatLabel } from "./time.js";
import { createOrUpdateBadge } from "./ui.js";

function update() {
  const date = getLatestPostDate();
  const label = formatLabel(date);

  createOrUpdateBadge(label);
}

// Initial run
update();

// Handle Instagram SPA navigation
const observer = new MutationObserver(() => {
  update();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});