(function() {
    'use strict';

    let badgeElement = null;
    let isLoading = false;
    let panelElement = null; // For expanded view

    // Helper: Calculate days ago
    function getDaysAgo(postDate) {
        const now = new Date();
        const diffTime = now - postDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return '1 day ago';
        return `${diffDays} days ago`;
    }

    // Scroll grid to load all posts
    async function loadAllPosts() {
        return new Promise((resolve) => {
            const gridContainer = document.querySelector('main article div[role="presentation"]') || 
                                  document.querySelector('main') || 
                                  document.body;
            
            let previousCount = 0;
            let stableCount = 0;
            let maxScrolls = 30;
            let scrollAttempts = 0;
            
            function getPostCount() {
                return document.querySelectorAll('a[href*="/p/"]').length;
            }
            
            function scroll() {
                scrollAttempts++;
                gridContainer.scrollTop = gridContainer.scrollHeight;
                
                setTimeout(() => {
                    const newCount = getPostCount();
                    
                    if (newCount > previousCount) {
                        previousCount = newCount;
                        stableCount = 0;
                        if (scrollAttempts < maxScrolls) {
                            scroll();
                        } else {
                            resolve();
                        }
                    } else {
                        stableCount++;
                        if (stableCount >= 3 || scrollAttempts >= maxScrolls) {
                            resolve();
                        } else {
                            scroll();
                        }
                    }
                }, 800);
            }
            
            scroll();
        });
    }

    // Extract date and post info from a post link element
    function getPostInfoFromGrid(postLink) {
        let parent = postLink.closest('article') || postLink.closest('div[role="presentation"]');
        if (!parent) parent = postLink.parentElement;
        
        // Get post URL
        const postUrl = postLink.href;
        const postId = postUrl.split('/p/')[1]?.replace('/', '') || postUrl.split('/reel/')[1]?.replace('/', '');
        
        // Look for <time> element
        const timeElement = parent.querySelector('time');
        let postDate = null;
        
        if (timeElement && timeElement.getAttribute('datetime')) {
            postDate = new Date(timeElement.getAttribute('datetime'));
        }
        
        // Fallback: look for aria-label with relative date
        if (!postDate) {
            const allElements = parent.querySelectorAll('[aria-label]');
            for (const el of allElements) {
                const label = el.getAttribute('aria-label');
                const match = label?.match(/(\d+)\s+(day|days|week|weeks|month|months)/i);
                if (match) {
                    const num = parseInt(match[1]);
                    const now = new Date();
                    if (match[2].toLowerCase().startsWith('day')) {
                        postDate = new Date(now - num * 86400000);
                        break;
                    } else if (match[2].toLowerCase().startsWith('week')) {
                        postDate = new Date(now - num * 604800000);
                        break;
                    }
                }
            }
        }
        
        // Try to get image preview
        let previewImg = null;
        const imgElement = parent.querySelector('img');
        if (imgElement && imgElement.src) {
            previewImg = imgElement.src;
        }
        
        return {
            url: postUrl,
            id: postId,
            date: postDate,
            preview: previewImg
        };
    }

    // Find last 3 posts by date (newest first)
    async function findLast3Posts() {
        await loadAllPosts();
        
        const postLinks = document.querySelectorAll('a[href*="/p/"]');
        
        if (postLinks.length === 0) {
            return [];
        }
        
        const postsWithInfo = [];
        
        for (const link of postLinks) {
            const info = getPostInfoFromGrid(link);
            if (info.date && !isNaN(info.date.getTime())) {
                postsWithInfo.push(info);
            }
        }
        
        // Remove duplicates by post ID
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
        
        // Return last 3 posts
        return uniquePosts.slice(0, 3);
    }

    // Create expanded panel showing 3 posts
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
        
        // Close button
        panelElement.querySelector('.panel-close').onclick = () => {
            panelElement.classList.remove('visible');
        };
        
        // Add styles for panel
        const style = document.createElement('style');
        style.textContent = `
            #ig-posts-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.9);
                width: 360px;
                max-width: 90vw;
                background: white;
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                z-index: 10001;
                opacity: 0;
                visibility: hidden;
                transition: all 0.2s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                overflow: hidden;
            }
            
            #ig-posts-panel.visible {
                opacity: 1;
                visibility: visible;
                transform: translate(-50%, -50%) scale(1);
            }
            
            .panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                background: #262626;
                color: white;
                font-weight: 600;
                font-size: 14px;
            }
            
            .panel-close {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                line-height: 1;
                opacity: 0.7;
            }
            
            .panel-close:hover {
                opacity: 1;
            }
            
            .panel-content {
                max-height: 500px;
                overflow-y: auto;
                background: #fafafa;
            }
            
            .post-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 16px;
                border-bottom: 1px solid #efefef;
                text-decoration: none;
                color: #262626;
                transition: background 0.1s;
            }
            
            .post-item:hover {
                background: #efefef;
            }
            
            .post-preview {
                width: 48px;
                height: 48px;
                border-radius: 8px;
                object-fit: cover;
                background: #dbdbdb;
            }
            
            .post-info {
                flex: 1;
            }
            
            .post-days {
                font-weight: 700;
                font-size: 15px;
                color: #0095f6;
            }
            
            .post-date {
                font-size: 11px;
                color: #8e8e8e;
                margin-top: 4px;
            }
            
            .post-link {
                font-size: 12px;
                color: #8e8e8e;
                text-decoration: none;
                word-break: break-all;
            }
            
            .loading-panel {
                text-align: center;
                padding: 30px;
                color: #8e8e8e;
            }
            
            .empty-panel {
                text-align: center;
                padding: 30px;
                color: #ed4956;
            }
        `;
        document.head.appendChild(style);
    }

    // Update panel with 3 posts
    async function updatePanel() {
        if (!panelElement) createPanel();
        
        const contentDiv = panelElement.querySelector('.panel-content');
        contentDiv.innerHTML = '<div class="loading-panel">📡 Scanning posts...</div>';
        
        const last3Posts = await findLast3Posts();
        
        if (last3Posts.length === 0) {
            contentDiv.innerHTML = '<div class="empty-panel">❌ No posts found or unable to read dates</div>';
            return;
        }
        
        let html = '';
        for (let i = 0; i < last3Posts.length; i++) {
            const post = last3Posts[i];
            const daysAgo = getDaysAgo(post.date);
            const dateStr = post.date.toLocaleDateString();
            
            html += `
                <a href="${post.url}" target="_blank" class="post-item">
                    ${post.preview ? `<img src="${post.preview}" class="post-preview" onerror="this.style.display='none'">` : '<div class="post-preview" style="background:#dbdbdb; display:flex; align-items:center; justify-content:center;">📷</div>'}
                    <div class="post-info">
                        <div class="post-days">${daysAgo}</div>
                        <div class="post-date">📅 ${dateStr}</div>
                        <div class="post-link">instagram.com/p/${post.id?.slice(0, 15)}...</div>
                    </div>
                </a>
            `;
        }
        
        contentDiv.innerHTML = html;
    }

    // Update the main badge (compact view)
    async function updateBadge() {
        if (!badgeElement || isLoading) return;
        
        isLoading = true;
        badgeElement.textContent = '🔄 Loading...';
        badgeElement.classList.add('loading');
        
        const last3Posts = await findLast3Posts();
        
        if (last3Posts.length === 0) {
            const isPrivate = document.body.innerText.includes('This Account is Private');
            const postCountMatch = document.body.innerText.match(/(\d+)\s+posts/i);
            
            if (isPrivate) {
                badgeElement.textContent = '🔒 Cannot determine';
            } else if (postCountMatch && parseInt(postCountMatch[1]) === 0) {
                badgeElement.textContent = '📭 No posts';
            } else {
                badgeElement.textContent = '⚠️ No dates found';
            }
            badgeElement.classList.remove('loading');
            isLoading = false;
            return;
        }
        
        // Show summary on badge
        const newest = last3Posts[0];
        const newestDays = getDaysAgo(newest.date);
        badgeElement.innerHTML = `📅 Last: ${newestDays}<span class="badge-arrow">▼</span>`;
        badgeElement.title = `Click to see last 3 posts`;
        badgeElement.classList.remove('loading');
        badgeElement.classList.add('has-data');
        
        isLoading = false;
    }

    // Toggle panel when badge is clicked
    function togglePanel(e) {
        if (e.target.closest('.close-btn')) return;
        
        if (!panelElement) createPanel();
        
        if (panelElement.classList.contains('visible')) {
            panelElement.classList.remove('visible');
        } else {
            updatePanel();
            panelElement.classList.add('visible');
        }
    }

    // Create draggable badge
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
        
        // Click to show/hide panel
        badgeElement.addEventListener('click', togglePanel);
        
        // Auto-update after 2 seconds
        setTimeout(() => {
            updateBadge();
        }, 2000);
    }

    // Draggable functionality
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

    // Handle SPA navigation
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

    // Initialize
    function init() {
        createBadge();
        observeNavigation();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();