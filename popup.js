async function fetchLast3Posts() {
  const contentDiv = document.getElementById('content');
  contentDiv.innerHTML = '<div class="loading">Loading...</div>';
  
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if it's an Instagram profile page
    if (!tab.url || !tab.url.includes('instagram.com')) {
      contentDiv.innerHTML = '<div class="error">❌ Please open an Instagram profile page</div>';
      return;
    }
    
    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getLast3Posts' });
    
    if (response.error) {
      contentDiv.innerHTML = `<div class="error">⚠️ ${response.error}</div>`;
      return;
    }
    
    if (!response || response.length === 0) {
      contentDiv.innerHTML = '<div class="error">No posts found. Try scrolling down on the profile page first.</div>';
      return;
    }
    
    // Display results
    let html = '';
    response.forEach(post => {
      html += `
        <div class="post">
          <div class="post-number">Post #${post.postNumber}</div>
          <div class="days">${post.daysAgo} <span class="days-unit">day${post.daysAgo !== 1 ? 's' : ''} ago</span></div>
          <div class="date">📅 ${post.date}</div>
        </div>
      `;
    });
    contentDiv.innerHTML = html;
    
  } catch (error) {
    console.error(error);
    contentDiv.innerHTML = '<div class="error">⚠️ Error: Make sure the Instagram tab is active and reload the page if needed.</div>';
  }
}

// Initial load
fetchLast3Posts();

// Refresh button
document.getElementById('refresh').addEventListener('click', () => {
  fetchLast3Posts();
});