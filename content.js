(function() {
    'use strict';

    let badgeElement = null;
    let panelElement = null;
    let isScanning = false;
    let scanCompleted = false;

    function getDaysAgo(postDate) {
        const now = new Date();
        const diffTime = now - postDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return '1 day ago';
        return `${diffDays} days ago`;
    }

    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(checkInterval);
                    resolve(element);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    resolve(null);
                }
            }, 200);
        });
    }

    function extractDateFromModal() {
        const timeElement = document.querySelector('article time, div[role="dialog"] time, [role="presentation"] time');
        if (timeElement) {
            const datetime = timeElement.getAttribute('datetime');
            if (datetime) return new Date(datetime);
            
            const text = timeElement.textContent;
            const match = text.match(/(\d+)\s+(day|days)/i);
            if (match) {
                const now = new Date();
                return new Date(now - parseInt(match[1]) * 86400000);
            }
        }
        
        const allElements = document.querySelectorAll('[aria-label]');
        for (const el of allElements) {
            const label = el.getAttribute('aria-label');
            if (label && (label.includes('posted') || label.match(/\d+\s+(day|week|month)/i))) {
                const match = label.match(/(\d+)\s+(day|days|week|weeks)/i);
                if (match) {
                    const now = new Date();
                    const num = parseInt(match[1]);
                    if (match[2].toLowerCase().startsWith('week')) {
                        return new Date(now - num * 604800000);
                    }
                    return new Date(now - num * 86400000);
                }
            }
        }
        
        return null;
    }

    async function getPostDateFromClick(postLink, postIndex) {
        return new Promise(async (resolve) => {
            try {
                postLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(r => setTimeout(r, 300));
                
                const postUrl = postLink.href;
                const postId = postUrl.split('/p/')[1]?.replace('/', '') || 
                               postUrl.split('/reel/')[1]?.replace('/', '');
                
                postLink.click();
                await new Promise(r => setTimeout(r, 600));
                
                const modal = await waitForElement('div[role="dialog"], article[role="presentation"]', 3000);
                
                if (!modal) {
                    resolve(null);
                    return;
                }
                
                let postDate = extractDateFromModal();
                
                if (!postDate) {
                    const timeEl = document.querySelector('time');
                    if (timeEl && timeEl.getAttribute('datetime')) {
                        postDate = new Date(timeEl.getAttribute('datetime'));
                    }
                }
                
                let previewImg = null;
                const imgElement = modal.querySelector('img[alt*="photo"], img[decoding="async"]');
                if (imgElement && imgElement.src) {
                    previewImg = imgElement.src;
                }
                
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
                await new Promise(r => setTimeout(r, 300));
                
                resolve({
                    url: postUrl,
                    id: postId,
                    date: postDate,
                    preview: previewImg,
                    index: postIndex
                });
                
            } catch (error) {
                console.error(`Error getting post ${postIndex}:`, error);
                resolve(null);
            }
        });
    }

    async function getLast3PostsAutomatically() {
        // Scroll to load posts
        const scrollableDiv = document.querySelector('main') || document.body;
        for (let i = 0; i < 6; i++) {
            scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
            await new Promise(r => setTimeout(r, 600));
        }
        
        const postLinks = Array.from(document.querySelectorAll('a[href*="/p/"]'));
        
        if (postLinks.length === 0) {
            return [];
        }
        
        const topPosts = postLinks.slice(0, 3);
        const results = [];
        
        for (let i = 0; i < topPosts.length; i++) {
            const result = await getPostDateFromClick(topPosts[i], i + 1);
            if (result && result.date) {
                results.push(result);
            }
            await new Promise(r => setTimeout(r, 400));
        }
        
        results.sort((a, b) => b.date - a.date);
        return results;
    }

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
                <div class="loading-panel">Loading...</div>
            </div>
        `;
        
        document.body.appendChild(panelElement);
        
        panelElement.querySelector('.panel-close').onclick = () => {
            panelElement.classList.remove('visible');
        };
    }

    async function updatePanelWithResults(last3Posts) {
        if (!panelElement) createPanel();
        
        const contentDiv = panelElement.querySelector('.panel-content');
        
        if (last3Posts.length === 0) {
            contentDiv.innerHTML = `
                <div class="empty-panel">
                    ❌ No posts found<br>
                    <small>Make sure you're on a profile page</small>
                </div>
            `;
        } else {
            let html = '';
            for (let i = 0; i < last3Posts.length; i++) {
                const post = last3Posts[i];
                const daysAgo = getDaysAgo(post.date);
                const dateStr = post.date.toLocaleDateString();
                
                html += `
                    <a href="${post.url}" target="_blank" class="post-item">
                        ${post.preview ? `<img src="${post.preview}" class="post-preview" crossorigin="anonymous">` : '<div class="post-preview-placeholder">📷</div>'}
                        <div class="post-info">
                            <div class="post-days">📆 ${daysAgo}</div>
                            <div class="post-date">📅 ${dateStr}</div>
                            <div class="post-link">🔗 Open post →</div>
                        </div>
                    </a>
                `;
            }
            contentDiv.innerHTML = html;
        }
    }

    async function autoScan() {
        if (isScanning || scanCompleted) return;
        
        isScanning = true;
        
        // Update badge to show scanning
        badgeElement.innerHTML = '🔍 Scanning...';
        badgeElement.classList.add('scanning');
        
        // Create and show panel with loading state
        createPanel();
        panelElement.classList.add('visible');
        panelElement.querySelector('.panel-content').innerHTML = '<div class="loading-panel">🔍 Scanning posts...<br><small>Opening posts to get dates...</small></div>';
        
        // Get the 3 posts
        const last3Posts = await getLast3PostsAutomatically();
        
        // Update panel with results
        await updatePanelWithResults(last3Posts);
        
        // Update badge with result
        if (last3Posts.length > 0) {
            const newestDays = getDaysAgo(last3Posts[0].date);
            badgeElement.innerHTML = `📅 Last: ${newestDays}<span class="badge-arrow">▼</span>`;
            badgeElement.title = 'Click to see last 3 posts';
        } else {
            badgeElement.innerHTML = `⚠️ No posts found`;
        }
        
        badgeElement.classList.remove('scanning');
        scanCompleted = true;
        isScanning = false;
    }

    function createBadge() {
        if (badgeElement) return;
        
        badgeElement = document.createElement('div');
        badgeElement.id = 'ig-last-post-badge';
        badgeElement.innerHTML = '⏳ Loading...';
        
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
        
        // Toggle panel on click (after scan is done)
        badgeElement.addEventListener('click', async (e) => {
            if (e.target.className === 'close-btn') return;
            
            if (panelElement) {
                if (panelElement.classList.contains('visible')) {
                    panelElement.classList.remove('visible');
                } else {
                    panelElement.classList.add('visible');
                }
            }
        });
    }

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

    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #ig-last-post-badge {
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 10000;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(8px);
                color: white;
                padding: 8px 16px;
                border-radius: 40px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                user-select: none;
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                border: 1px solid rgba(255,255,255,0.2);
                display: flex;
                align-items: center;
                gap: 8px;
                transition: all 0.2s ease;
            }
            
            #ig-last-post-badge:hover {
                background: rgba(0, 0, 0, 0.95);
            }
            
            #ig-last-post-badge.scanning {
                background: rgba(0, 149, 246, 0.9);
                animation: pulse 1s infinite;
            }
            
            @keyframes pulse {
                0% { opacity: 0.7; }
                50% { opacity: 1; }
                100% { opacity: 0.7; }
            }
            
            .badge-arrow {
                font-size: 10px;
                opacity: 0.7;
            }
            
            .close-btn {
                margin-left: 8px;
                cursor: pointer;
                font-size: 18px;
                opacity: 0.7;
            }
            
            .close-btn:hover {
                opacity: 1;
            }
            
            #ig-posts-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 380px;
                max-width: 90vw;
                background: white;
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                z-index: 10001;
                display: none;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                overflow: hidden;
            }
            
            #ig-posts-panel.visible {
                display: block;
            }
            
            .panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                background: #262626;
                color: white;
                font-weight: 600;
            }
            
            .panel-close {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
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
            
            .post-preview, .post-preview-placeholder {
                width: 52px;
                height: 52px;
                border-radius: 8px;
                object-fit: cover;
                background: #dbdbdb;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                flex-shrink: 0;
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
                margin-top: 4px;
            }
            
            .loading-panel, .empty-panel {
                text-align: center;
                padding: 30px;
                color: #8e8e8e;
            }
            
            small {
                font-size: 11px;
                color: #8e8e8e;
                display: block;
                margin-top: 8px;
            }
        `;
        document.head.appendChild(style);
    }

    // Function to check if profile page is ready
    function waitForProfilePage() {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const postCount = document.querySelectorAll('a[href*="/p/"]').length;
                const header = document.querySelector('header');
                
                if (postCount > 0 || (header && window.location.pathname !== '/')) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 500);
            
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
            }, 8000);
        });
    }

    // Handle Instagram SPA navigation
    function observeNavigation() {
        let lastUrl = location.href;
        const observer = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                scanCompleted = false;
                isScanning = false;
                
                // Reset badge
                if (badgeElement) {
                    badgeElement.innerHTML = '⏳ Loading...';
                }
                
                // Wait for new page to load, then auto-scan
                setTimeout(() => {
                    waitForProfilePage().then(() => {
                        setTimeout(autoScan, 1500);
                    });
                }, 2000);
            }
        });
        
        observer.observe(document, { subtree: true, childList: true });
    }

    // Initialize
    async function init() {
        createBadge();
        addStyles();
        observeNavigation();
        
        // Wait for profile to load, then auto-scan
        await waitForProfilePage();
        
        // Extra delay for posts to render
        setTimeout(() => {
            autoScan();
        }, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();