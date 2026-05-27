(function() {
    'use strict';

    let badgeElement = null;
    let panelElement = null;
    let isScanning = false;
    let stopScanning = false;
    let currentScanPosts = [];
    let totalPostsToScan = 30;

    function getDaysAgo(postDate) {
        const now = new Date();
        const diffTime = now - postDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return '1 day ago';
        return `${diffDays} days ago`;
    }

    // Extract date from post element WITHOUT clicking
    function extractDateFromGridElement(postElement) {
        // Method 1: Look for time element
        const timeEl = postElement.querySelector('time');
        if (timeEl) {
            const datetime = timeEl.getAttribute('datetime');
            if (datetime) return new Date(datetime);
        }
        
        // Method 2: Look for data attributes with timestamp
        const allElements = postElement.querySelectorAll('[datetime], [data-timestamp], [data-time]');
        for (const el of allElements) {
            const timestamp = el.getAttribute('datetime') || 
                             el.getAttribute('data-timestamp') || 
                             el.getAttribute('data-time');
            if (timestamp && !isNaN(Date.parse(timestamp))) {
                return new Date(timestamp);
            }
        }
        
        // Method 3: Look for aria-label containing date pattern
        const ariaElements = postElement.querySelectorAll('[aria-label]');
        for (const el of ariaElements) {
            const label = el.getAttribute('aria-label');
            if (label) {
                // Look for patterns like "2 days ago", "January 15, 2024"
                const patterns = [
                    /(\d+)\s+days?\s+ago/i,
                    /(\d+)\s+weeks?\s+ago/i,
                    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i
                ];
                
                for (const pattern of patterns) {
                    const match = label.match(pattern);
                    if (match) {
                        if (match[1] && label.includes('day')) {
                            const now = new Date();
                            return new Date(now - parseInt(match[1]) * 86400000);
                        } else if (match[1] && label.includes('week')) {
                            const now = new Date();
                            return new Date(now - parseInt(match[1]) * 604800000);
                        } else if (match[0].match(/\w+\s+\d+,?\s+\d{4}/)) {
                            return new Date(match[0]);
                        }
                    }
                }
            }
        }
        
        // Method 4: Look for text content with date pattern
        const textContent = postElement.innerText;
        const dateMatch = textContent.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (dateMatch) {
            return new Date(dateMatch[3], dateMatch[1] - 1, dateMatch[2]);
        }
        
        return null;
    }

    // Get all posts with their dates WITHOUT clicking
    async function getAllPostsWithDates() {
        // Scroll to load posts
        const scrollableDiv = document.querySelector('main') || document.body;
        let previousCount = 0;
        let attempts = 0;
        const maxAttempts = 40;
        
        while (attempts < maxAttempts && !stopScanning) {
            scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
            await new Promise(r => setTimeout(r, 500));
            
            const currentCount = document.querySelectorAll('a[href*="/p/"]').length;
            
            if (currentCount === previousCount) {
                attempts++;
            } else {
                attempts = 0;
                previousCount = currentCount;
            }
            
            if (currentCount >= totalPostsToScan) {
                break;
            }
        }
        
        // Get all post links
        const postLinks = Array.from(document.querySelectorAll('a[href*="/p/"]'));
        const postsToProcess = postLinks.slice(0, totalPostsToScan);
        
        if (postsToProcess.length === 0) {
            return [];
        }
        
        const results = [];
        
        for (let i = 0; i < postsToProcess.length; i++) {
            if (stopScanning) break;
            
            updateScanProgress(i + 1, totalPostsToScan);
            
            const postLink = postsToProcess[i];
            const postUrl = postLink.href;
            const postId = postUrl.split('/p/')[1]?.replace('/', '') || 
                           postUrl.split('/reel/')[1]?.replace('/', '');
            
            // Find the container that holds the post
            let postContainer = postLink.closest('article') || 
                               postLink.closest('div[role="presentation"]') ||
                               postLink.parentElement;
            
            // Try to find the actual post container by traversing up
            for (let j = 0; j < 5 && postContainer; j++) {
                if (postContainer.querySelector('time') || 
                    postContainer.querySelector('[aria-label*="day"]') ||
                    postContainer.querySelector('[aria-label*="week"]')) {
                    break;
                }
                postContainer = postContainer.parentElement;
            }
            
            let postDate = null;
            
            if (postContainer) {
                postDate = extractDateFromGridElement(postContainer);
            }
            
            // If still no date, try a different approach - look for nearby time elements
            if (!postDate) {
                // Look for time elements near this post
                const allTimes = document.querySelectorAll('time');
                for (const timeEl of allTimes) {
                    if (Math.abs(timeEl.getBoundingClientRect().top - postLink.getBoundingClientRect().top) < 200) {
                        const datetime = timeEl.getAttribute('datetime');
                        if (datetime) {
                            postDate = new Date(datetime);
                            break;
                        }
                    }
                }
            }
            
            // Get preview image
            let previewImg = null;
            const imgElement = postLink.querySelector('img');
            if (imgElement && imgElement.src && !imgElement.src.includes('blob:')) {
                previewImg = imgElement.src;
            }
            
            if (postDate && !isNaN(postDate.getTime())) {
                results.push({
                    url: postUrl,
                    id: postId,
                    date: postDate,
                    preview: previewImg,
                    index: i + 1
                });
            } else {
                // Add with estimated date based on grid position as fallback
                const now = new Date();
                const estimatedDate = new Date(now - (i * 0.5) * 86400000);
                results.push({
                    url: postUrl,
                    id: postId,
                    date: estimatedDate,
                    preview: previewImg,
                    index: i + 1,
                    estimated: true
                });
            }
        }
        
        // Sort by date (newest first)
        results.sort((a, b) => b.date - a.date);
        return results;
    }

    function createPanel() {
        if (panelElement) return;
        
        panelElement = document.createElement('div');
        panelElement.id = 'ig-posts-panel';
        panelElement.innerHTML = `
            <div class="panel-header">
                <span>📸 Instagram Post Scanner (${totalPostsToScan} posts)</span>
                <button class="panel-close">×</button>
            </div>
            <div class="panel-controls">
                <div class="stats">
                    <span id="scanStats">Ready to scan</span>
                </div>
                <div class="buttons">
                    <button id="startScanBtn" class="control-btn start">▶ Start Scan</button>
                    <button id="stopScanBtn" class="control-btn stop" disabled>⏹ Stop</button>
                    <button id="clearResultsBtn" class="control-btn clear">🗑 Clear</button>
                </div>
                <div class="progress-bar">
                    <div id="scanProgress" class="progress-fill" style="width: 0%"></div>
                </div>
            </div>
            <div class="panel-content">
                <div class="info-message">📌 Click "Start Scan" to analyze last ${totalPostsToScan} posts<br><small>Reads dates directly from grid - NO posts will open!</small></div>
            </div>
        `;
        
        document.body.appendChild(panelElement);
        
        panelElement.querySelector('.panel-close').onclick = () => {
            panelElement.classList.remove('visible');
        };
        
        panelElement.querySelector('#startScanBtn').onclick = () => startScan();
        panelElement.querySelector('#stopScanBtn').onclick = () => stopScan();
        panelElement.querySelector('#clearResultsBtn').onclick = () => clearResults();
    }
    
    function updateScanProgress(current, total) {
        const progress = (current / total) * 100;
        const progressBar = document.querySelector('#scanProgress');
        const stats = document.querySelector('#scanStats');
        
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        if (stats) {
            stats.textContent = `🔍 Scanning: ${current} / ${total} posts`;
        }
        
        if (badgeElement) {
            badgeElement.innerHTML = `🔍 ${current}/${total}`;
        }
    }
    
    function updateScanComplete(results) {
        const progressBar = document.querySelector('#scanProgress');
        const stats = document.querySelector('#scanStats');
        const startBtn = document.querySelector('#startScanBtn');
        const stopBtn = document.querySelector('#stopScanBtn');
        
        if (progressBar) progressBar.style.width = '100%';
        if (stats) stats.textContent = `✅ Complete! Found ${results.length} posts`;
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
    }
    
    function updatePanelWithResults(results) {
        if (!panelElement) createPanel();
        
        const contentDiv = panelElement.querySelector('.panel-content');
        
        if (results.length === 0) {
            contentDiv.innerHTML = `
                <div class="empty-panel">
                    ❌ No posts found<br>
                    <small>Make sure you're on a profile page and try again</small>
                </div>
            `;
        } else {
            let html = `<div class="results-header">📊 Last ${results.length} posts (sorted by date, newest first)</div>`;
            
            for (let i = 0; i < results.length; i++) {
                const post = results[i];
                const daysAgo = getDaysAgo(post.date);
                const dateStr = post.date.toLocaleDateString();
                const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '📌 ';
                const estimatedNote = post.estimated ? ' (estimated)' : '';
                
                html += `
                    <div class="post-item" data-url="${post.url}">
                        ${post.preview ? `<img src="${post.preview}" class="post-preview" crossorigin="anonymous" loading="lazy">` : '<div class="post-preview-placeholder">📷</div>'}
                        <div class="post-info">
                            <div class="post-days">${medal}${daysAgo}${estimatedNote}</div>
                            <div class="post-date">📅 ${dateStr}</div>
                            <div class="post-link">🔗 <span class="clickable-link">Click to open post</span></div>
                        </div>
                    </div>
                `;
            }
            
            contentDiv.innerHTML = html;
            
            // Add click handlers to open links ONLY when user clicks
            document.querySelectorAll('.post-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const url = item.getAttribute('data-url');
                    if (url) {
                        window.open(url, '_blank');
                    }
                });
            });
        }
    }
    
    function updateBadgeWithResults(results) {
        if (results.length > 0) {
            const newestDays = getDaysAgo(results[0].date);
            badgeElement.innerHTML = `📅 ${newestDays} ago (${results.length})<span class="badge-arrow">▼</span>`;
            badgeElement.title = `Newest: ${newestDays} ago | Scanned ${results.length} posts`;
        } else {
            badgeElement.innerHTML = `⚠️ No posts<span class="badge-arrow">▼</span>`;
        }
        badgeElement.classList.remove('scanning');
    }
    
    async function startScan() {
        if (isScanning) return;
        
        stopScanning = false;
        isScanning = true;
        currentScanPosts = [];
        
        const startBtn = document.querySelector('#startScanBtn');
        const stopBtn = document.querySelector('#stopScanBtn');
        const clearBtn = document.querySelector('#clearResultsBtn');
        
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        if (clearBtn) clearBtn.disabled = true;
        
        const contentDiv = panelElement.querySelector('.panel-content');
        contentDiv.innerHTML = '<div class="loading-panel">🔍 Scanning posts...<br><small>Reading dates directly from grid - no posts will open</small></div>';
        
        badgeElement.innerHTML = '🔍 Scanning...';
        badgeElement.classList.add('scanning');
        
        currentScanPosts = await getAllPostsWithDates();
        
        updatePanelWithResults(currentScanPosts);
        updateBadgeWithResults(currentScanPosts);
        updateScanComplete(currentScanPosts);
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (clearBtn) clearBtn.disabled = false;
        
        isScanning = false;
    }
    
    function stopScan() {
        if (!isScanning) return;
        
        stopScanning = true;
        isScanning = false;
        
        const startBtn = document.querySelector('#startScanBtn');
        const stopBtn = document.querySelector('#stopScanBtn');
        const stats = document.querySelector('#scanStats');
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (stats) stats.textContent = '⏹ Scan stopped by user';
        
        badgeElement.innerHTML = `⏹ Stopped (${currentScanPosts.length} scanned)`;
        setTimeout(() => {
            if (!isScanning) {
                updateBadgeWithResults(currentScanPosts);
            }
        }, 2000);
    }
    
    function clearResults() {
        currentScanPosts = [];
        
        const contentDiv = panelElement.querySelector('.panel-content');
        contentDiv.innerHTML = '<div class="info-message">Results cleared. Click "Start Scan" to analyze posts.</div>';
        
        const stats = document.querySelector('#scanStats');
        if (stats) stats.textContent = 'Ready to scan';
        
        const progressBar = document.querySelector('#scanProgress');
        if (progressBar) progressBar.style.width = '0%';
        
        badgeElement.innerHTML = `📅 Ready<span class="badge-arrow">▼</span>`;
    }

    function createBadge() {
        if (badgeElement) return;
        
        badgeElement = document.createElement('div');
        badgeElement.id = 'ig-last-post-badge';
        badgeElement.innerHTML = '📅 Ready<span class="badge-arrow">▼</span>';
        
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
                0%, 100% { opacity: 0.7; }
                50% { opacity: 1; }
            }
            
            .badge-arrow {
                font-size: 10px;
                opacity: 0.7;
                margin-left: 6px;
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
                width: 450px;
                max-width: 90vw;
                max-height: 80vh;
                background: white;
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                z-index: 10001;
                display: none;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                overflow: hidden;
                flex-direction: column;
            }
            
            #ig-posts-panel.visible {
                display: flex;
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
            
            .panel-controls {
                padding: 12px 16px;
                background: #f0f0f0;
                border-bottom: 1px solid #dbdbdb;
            }
            
            .stats {
                font-size: 12px;
                color: #262626;
                margin-bottom: 10px;
                text-align: center;
            }
            
            .buttons {
                display: flex;
                gap: 10px;
                justify-content: center;
                margin-bottom: 10px;
            }
            
            .control-btn {
                padding: 6px 16px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                transition: all 0.2s;
            }
            
            .control-btn.start {
                background: #0095f6;
                color: white;
            }
            
            .control-btn.start:hover:not(:disabled) {
                background: #0077cc;
            }
            
            .control-btn.stop {
                background: #ed4956;
                color: white;
            }
            
            .control-btn.stop:hover:not(:disabled) {
                background: #c93542;
            }
            
            .control-btn.clear {
                background: #8e8e8e;
                color: white;
            }
            
            .control-btn.clear:hover:not(:disabled) {
                background: #6e6e6e;
            }
            
            .control-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .progress-bar {
                background: #dbdbdb;
                border-radius: 10px;
                overflow: hidden;
                height: 6px;
            }
            
            .progress-fill {
                background: #0095f6;
                width: 0%;
                height: 100%;
                transition: width 0.3s ease;
            }
            
            .panel-content {
                flex: 1;
                overflow-y: auto;
                background: #fafafa;
            }
            
            .results-header {
                padding: 12px 16px;
                background: #fff;
                font-weight: 600;
                border-bottom: 1px solid #efefef;
                position: sticky;
                top: 0;
                z-index: 1;
            }
            
            .post-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 16px;
                border-bottom: 1px solid #efefef;
                cursor: pointer;
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
                font-size: 14px;
                color: #0095f6;
            }
            
            .post-date {
                font-size: 11px;
                color: #8e8e8e;
                margin-top: 4px;
            }
            
            .clickable-link {
                font-size: 11px;
                color: #0095f6;
                text-decoration: underline;
                cursor: pointer;
            }
            
            .loading-panel, .empty-panel, .info-message {
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

    function init() {
        createBadge();
        addStyles();
        createPanel();
        console.log('IG Scanner ready - Reads dates directly from grid, NO posts will open automatically!');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();