function getLast3PostDays() {
  // Find all post time elements
  const timeElements = document.querySelectorAll('time');
  
  if (!timeElements || timeElements.length === 0) {
    return { error: "No posts found — scroll down or check if page loaded" };
  }
  
  const results = [];
  
  for (let i = 0; i < Math.min(3, timeElements.length); i++) {
    const datetime = timeElements[i].getAttribute('datetime');
    if (!datetime) continue;
    
    const postDate = new Date(datetime);
    const now = new Date();
    const daysDiff = Math.floor((now - postDate) / (1000 * 60 * 60 * 24));
    
    results.push({
      postNumber: i + 1,
      daysAgo: daysDiff,
      date: postDate.toLocaleDateString()
    });
  }
  
  return results;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getLast3Posts') {
    const result = getLast3PostDays();
    sendResponse(result);
  }
  return true;
});