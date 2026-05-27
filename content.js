(function() {
    'use strict';

    let badgeElement = null;
    let isLoading = false;
    let panelElement = null;

    function getDaysAgo(postDate) {
        const now = new Date();
        const diffTime = now - postDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return '1 day ago';
        return `${diffDays} days ago`;
    }

    // Force scroll to load all posts
    async function loadAllPosts() {
        return new Promise((resolve) => {
            const scrollableDiv = document.querySelector('main') || document.body;
            let lastCount = 0;
            let attempts = 0;
            
            function getPostCount() {
                return document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').length;
            }
            
            function scroll() {
                attempts++;
                scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
                
                setTimeout(() => {
                    const newCount = getPostCount();
                    if (newCount > lastCount) {
                        lastCount = newCount;
                        if (attempts < 25) scroll();
                        else resolve();
                    } else if (attempts < 25) {
                        scroll();
                    } else {
                        resolve();
                    }
                }, 600);
            }
            
            scroll();
        });
    }

    // METHOD 1: Extract date from time element
    function extractFromTimeElement(element) {
        const timeEl = element.querySelector('time');
        if (timeEl) {
            const datetime = timeEl.getAttribute('datetime');
            if (datetime) return new Date(datetime);
            
            const dateText = timeEl.textContent;
            // Try to parse relative text like "2 days ago"
            const match = dateText.match(/(\d+)\s+(day|days)/i);
            if (match) {
                const now = new Date();
                return new Date(now - parseInt(match[1]) * 86400000);
            }
        }
        return null;
    }

    // METHOD 2: Extract from aria-label (Instagram often hides dates here)
    function extractFromAriaLabel(element) {
        const allElements = element.querySelectorAll('[aria-label]');
        for (const el of allElements) {
            const label = el.getAttribute('aria-label');
            if (!label) continue;
            
            // Pattern: "2 days ago" or "Posted 3 weeks ago"
            const patterns = [
                /(\d+)\s+days?\s+ago/i,
                /(\d+)\s+weeks?\s+ago/i,
                /(\d+)\s+months?\s+ago/i,
                /(\d+)\s+years?\s+ago/i,
                /posted\s+(\d+)\s+(day|week|month)/i
            ];
            
            for (const pattern of patterns) {
                const match = label.match(pattern);
                if (match) {
                    const num = parseInt(match[1]);
                    const now = new Date();
                    if (label.includes('week')) return new Date(now - num * 604800000);
                    if (label.includes('month')) return new Date(now - num * 2592000000);
                    if (label.includes('year')) return new Date(now - num * 31536000000);
                    return new Date(now - num * 86400000);
                }
            }
        }
        return null;
    }

    // METHOD 3: Extract from nearby span with specific class patterns
    function extractFromSpanText(element) {
        const spans = element.querySelectorAll('span, div[class*="time"], div[class*="date"]');
        for (const span of spans) {
            const text = span.textContent;
            const match = text.match(/(\d+)\s+(day|days|week|weeks)/i);
            if (match) {
                const now = new Date();
                const num = parseInt(match[1]);
                if (match[2].toLowerCase().startsWith('week')) {
                    return new Date(now - num * 604800000);
                }
                return new Date(now - num * 86400000);
            }
        }
        return null;
    }

    // METHOD 4: If all else fails, estimate by grid position
    function estimateByGridPosition(index, totalPosts) {
        // This is a fallback - assumes posts are roughly chronological
        // Newer posts are at the beginning of the grid
        const now = new Date();
        const estimatedDaysAgo = Math.floor(index * 0.5); // Rough estimate
        return new Date(now - estimatedDaysAgo * 86400000);
    }

    // Get post info using all methods
    function getPostInfoFromGrid(postLink, index, totalPosts) {
        let parent = postLink.closest('article') || postLink.closest('div[role="presentation"]');
        if (!parent) parent = postLink.parentElement;
        
        const postUrl = postLink.href;
        const postId = postUrl.split('/p/')[1]?.replace('/', '') || 
                       postUrl.split('/reel/')[1]?.replace('/', '') ||
                       `post-${index}`;
        
        // Try extraction methods in order
        let postDate = extractFromTimeElement(parent);
        if (!postDate) postDate = extractFromAriaLabel(parent);
        if (!postDate) postDate = extractFromSpanText(parent);
        
        // If still no date, try looking at the post link's parent chain
        if (!postDate) {
            let walker = postLink.parentElement;
            for (let i = 0; i < 5 && walker; i++) {
                postDate = extractFromTimeElement(walker);
                if (postDate) break;
                postDate = extractFromAriaLabel(walker);
                if (postDate) break;
                walker = walker.parentElement;
            }
        }
        
        // Last resort: estimate based on position
        const isEstimated = !postDate;
        if (!postDate) {
            postDate = estimateByGridPosition(index, totalPosts);
        }
        
        // Get preview image
        let previewImg = null;
        const imgElement = parent.querySelector('img');
        if (imgElement && imgElement.src && !imgElement.src.includes('blob:')) {
            previewImg = imgElement.src;
        }
        
        return {
            url: postUrl,
            id: postId,
            date: postDate,
            preview: previewImg,
            isEstimated: isEstimated
        };
    }

    // Find last 3 posts
    async function findLast3Posts() {
        await loadAllPosts();
        
        // Wait a bit for any lazy-loaded content
        await new Promise(r => setTimeout(r, 1000));
        
        // Get all post links
        const postLinks = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
        
        console.log(`Found ${postLinks.length} post links`); // Debug
        
        if (postLinks.length === 0) {
            return [];
        }
        
        const postsWithInfo = [];
        
        for (let i = 0; i < postLinks.length; i++) {
            const info = getPostInfoFromGrid(postLinks[i], i, postLinks.length);
            if (info.date) {
                postsWithInfo.push(info);
            }
        }
        
        // Remove duplicates
        const uniquePosts = [];
        const seenIds = new Set();
        for (const post of postsWithInfo) {
            if (!seenIds.has(post.id)) {
                seenIds.add(post.id);
                uniquePosts.push(post);
            }
        }
        
        // Sort by date (newest first)
        uniquePosts.sort((a, b) => b.date - a.date);
        
        console.log(`Found ${uniquePosts.length} unique posts with dates`); // Debug
        
        return uniquePosts.slice(0, 3);
    }

    // Create panel
    function createPanel() {
        if (panelElement) return;
        
        panelElement = document.createElement('div');
        panelElement.id = 'ig-posts-panel';
        panelElement.innerHTML = `
            <div class="panel-header">
                <span>📸 Last 3 Posts</span>
                <button class="panel-close">×</button>
            </div>
            <div class="panel-content">
                <div class="loading-panel">Loading posts...</div>
            </div>
        `;
        
        document.body.appendChild(panelElement);
        
        panelElement.querySelector('.panel-close').onclick = () => {
            panelElement.classList.remove('visible');
        };
    }

    // Update panel
    async function updatePanel() {
        if (!panelElement) createPanel();
        
        const contentDiv = panelElement.querySelector('.panel-content');
        contentDiv.innerHTML = '<div class="loading-panel">📡 Scanning posts...</div>';
        
        const last3Posts = await findLast3Posts();
        
        if (last3Posts.length === 0) {
            contentDiv.innerHTML = `
                <div class="empty-panel">
                    ❌ No posts found<br>
                    <small>Try scrolling down manually first, then refresh</small>
                </div>
            `;
            return;
        }
        
        let html = '';
        for (let i = 0; i < last3Posts.length; i++) {
            const post = last3Posts[i];
            const daysAgo = getDaysAgo(post.date);
            const dateStr = post.date.toLocaleDateString();
            const estimatedNote = post.isEstimated ? ' (estimated)' : '';
            
            html += `
                <a href="${post.url}" target="_blank" class="post-item">
                    ${post.preview ? `<img src="${post.preview}" class="post-preview" crossorigin="anonymous">` : '<div class="post-preview-placeholder">📷</div>'}
                    <div class="post-info">
                        <div class="post-days">${daysAgo}${estimatedNote}</div>
                        <div class="post-date">📅 ${dateStr}</div>
                        <div class="post-link">instagram.com/p/${post.id?.slice(0, 12)}...</div>
                    </div>
                </a>
            `;
        }
        
        contentDiv.innerHTML = html;
    }

    // Update badge
    async function updateBadge() {
        if (!badgeElement || isLoading) return;
        
        isLoading = true;
        badgeElement.innerHTML = '🔄 Loading...';
        badgeElement.classList.add('loading');
        
        const last3Posts = await findLast3Posts();
        
        if (last3Posts.length === 0) {
            // Show helpful message
            const postCount = document.querySelectorAll('a[href*="/p/"]').length;
            if (postCount > 0) {
                badgeElement.innerHTML = `⚠️ Found ${postCount} posts but no dates`;
                badgeElement.title = 'Try scrolling down manually, then click refresh';
            } else {
                badgeElement.innerHTML = '📭 Scroll to load posts';
                badgeElement.title = 'Scroll down on the profile page first';
            }
            badgeElement.classList.remove('loading');
            isLoading = false;
            return;
        }
        
        const newest = last3Posts[0];
        const newestDays = getDaysAgo(newest.date);
        badgeElement.innerHTML = `📅 Last: ${newestDays}<span class="badge-arrow">▼</span>`;
        badgeElement.title = 'Click to see last 3 posts';
        badgeElement.classList.remove('loading');
        badgeElement.classList.add('has-data');
        
        isLoading = false;
    }

    // Create badge
    function createBadge() {
        if (badgeElement) return;
        
        badgeElement = document.createElement('div');
        badgeElement.id = 'ig-last-post-badge';
        badgeElement.innerHTML = '✨ Ready';
        
        const closeBtn = document.createElement('span');
        closeBtn.innerHTML = '×';
        closeBtn.className = 'close-btn';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            badgeElement.style.display = 'none';
        };
        badgeElement.appendChild(closeBtn);
        
        document.body.appendChild(badgeElement);
        makeDraggable(badgeElement);
        
        badgeElement.addEventListener('click', async (e) => {
            if (e.target.className === 'close-btn') return;
            if (!panelElement) createPanel();
            
            if (panelElement.classList.contains('visible')) {
                panelElement.classList.remove('visible');
            } else {
                await updatePanel();
                panelElement.classList.add('visible');
            }
        });
        
        // Initial scan
        setTimeout(() => {
            updateBadge();
        }, 3000);
    }

    // Make draggable
    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        element.onmousedown = dragMouseDown;
        
        function dragMouseDown(e) {
            if (e.target.className === 'close-btn' || e.target.classList?.contains('badge-arrow')) return;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
        
        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            let top = element.offsetTop - pos2;
            let left = element.offsetLeft - pos1;
            
            top = Math.min(Math.max(0, top), window.innerHeight - element.offsetHeight);
            left = Math.min(Math.max(0, left), window.innerWidth - element.offsetWidth);
            
            element.style.top = top + 'px';
            element.style.left = left + 'px';
            element.style.bottom = 'auto';
            element.style.right = 'auto';
        }
        
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    // Navigation observer
    function observeNavigation() {
        let lastUrl = location.href;
        new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(() => {
                    if (panelElement) panelElement.classList.remove('visible');
                    updateBadge();
                }, 2000);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    // Add CSS for placeholder
    function addExtraStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .post-preview-placeholder {
                width: 48px;
                height: 48px;
                border-radius: 8px;
                background: #dbdbdb;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        createBadge();
        observeNavigation();
        addExtraStyles();
        
        // Debug: log to console
        console.log('IG Last Post Tracker loaded - scroll down and click the badge');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();