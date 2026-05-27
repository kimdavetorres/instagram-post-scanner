(function() {
    'use strict';

    let badgeElement = null;
    let panelElement = null;
    let isScanning = false;
    let stopScanning = false;
    let currentScanPosts = [];
    let totalPostsToScan = 30;
    let postLinksCache = [];

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
            }, 100);
        });
    }

    // Force close modal using multiple strategies
    async function forceCloseModal() {
        // Strategy 1: Escape key
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        await new Promise(r => setTimeout(r, 200));
        
        // Strategy 2: Click on background overlay
        const overlay = document.querySelector('div[role="presentation"]:last-child, div[class*="x1n2onr6"]');
        if (overlay) {
            overlay.click();
            await new Promise(r => setTimeout(r, 200));
        }
        
        // Strategy 3: Click close button (X)
        const closeBtn = document.querySelector('div[role="dialog"] svg[aria-label="Close"], div[role="dialog"] button');
        if (closeBtn) {
            closeBtn.click();
            await new Promise(r => setTimeout(r, 200));
        }
        
        // Strategy 4: Escape again
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        await new Promise(r => setTimeout(r, 300));
    }

    function extractExactDateFromModal() {
        const timeElement = document.querySelector('div[role="dialog"] time, article[role="presentation"] time, time');
        if (timeElement) {
            const datetime = timeElement.getAttribute('datetime');
            if (datetime) return new Date(datetime);
            const timeText = timeElement.textContent.trim();
            const absoluteMatch = timeText.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
            if (absoluteMatch) {
                return new Date(absoluteMatch[1] + ' ' + absoluteMatch[2] + ', ' + absoluteMatch[3]);
            }
            const relativeMatch = timeText.match(/(\d+)\s+(day|days)/i);
            if (relativeMatch) {
                const now = new Date();
                return new Date(now - parseInt(relativeMatch[1]) * 86400000);
            }
        }
        const ariaElements = document.querySelectorAll('div[role="dialog"] [aria-label], article[role="presentation"] [aria-label]');
        for (const el of ariaElements) {
            const label = el.getAttribute('aria-label');
            const dateMatch = label?.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
            if (dateMatch) return new Date(dateMatch[0]);
        }
        return null;
    }

    async function getExactPostDate(postLink, postIndex) {
        if (stopScanning) return null;
        
        try {
            updateScanProgress(postIndex, totalPostsToScan);
            
            postLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, 400));
            
            const postUrl = postLink.href;
            const postId = postUrl.split('/p/')[1]?.replace('/', '') || postUrl.split('/reel/')[1]?.replace('/', '');
            
            let previewImg = null;
            const imgElement = postLink.querySelector('img');
            if (imgElement && imgElement.src && !imgElement.src.includes('blob:')) {
                previewImg = imgElement.src;
            }
            
            postLink.click();
            await new Promise(r => setTimeout(r, 800));
            
            const modal = await waitForElement('div[role="dialog"], article[role="presentation"]', 6000);
            let postDate = null;
            if (modal) {
                postDate = extractExactDateFromModal();
                await forceCloseModal();
            } else {
                await forceCloseModal();
            }
            
            if (postDate && !isNaN(postDate.getTime())) {
                return {
                    url: postUrl,
                    id: postId,
                    date: postDate,
                    preview: previewImg,
                    index: postIndex
                };
            }
            return null;
        } catch (error) {
            console.error(`Error on post ${postIndex}:`, error);
            await forceCloseModal();
            return null;
        }
    }

    async function loadEnoughPosts() {
        const scrollableDiv = document.querySelector('main') || document.body;
        let previousCount = 0;
        let stalledCount = 0;
        const maxStalled = 8;
        
        while (!stopScanning && stalledCount < maxStalled) {
            const currentLinks = Array.from(document.querySelectorAll('a[href*="/p/"]'));
            const currentCount = currentLinks.length;
            
            if (currentCount >= totalPostsToScan) {
                break;
            }
            
            scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
            await new Promise(r => setTimeout(r, 700));
            
            if (currentCount === previousCount) {
                stalledCount++;
            } else {
                stalledCount = 0;
                previousCount = currentCount;
            }
        }
        
        postLinksCache = Array.from(document.querySelectorAll('a[href*="/p/"]'));
        return postLinksCache.slice(0, totalPostsToScan);
    }

    async function getAllPostsWithExactDates() {
        const postsToProcess = await loadEnoughPosts();
        if (postsToProcess.length === 0) return [];
        
        const results = [];
        for (let i = 0; i < postsToProcess.length; i++) {
            if (stopScanning) break;
            const delay = 300 + Math.random() * 400;
            const result = await getExactPostDate(postsToProcess[i], i + 1);
            if (result) results.push(result);
            await new Promise(r => setTimeout(r, delay));
        }
        
        results.sort((a, b) => b.date - a.date);
        return results;
    }

    // ================= UI COMPONENTS =================
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
                <div class="stats"><span id="scanStats">Ready to scan</span></div>
                <div class="buttons">
                    <button id="startScanBtn" class="control-btn start">▶ Start Scan</button>
                    <button id="stopScanBtn" class="control-btn stop" disabled>⏹ Stop</button>
                    <button id="clearResultsBtn" class="control-btn clear">🗑 Clear</button>
                </div>
                <div class="progress-container">
                    <div class="progress-bar"><div id="scanProgress" class="progress-fill" style="width: 0%"></div></div>
                    <div id="progressText" class="progress-text">0 / ${totalPostsToScan}</div>
                </div>
            </div>
            <div class="panel-content"><div class="info-message">📌 Click "Start Scan" to analyze last ${totalPostsToScan} posts<br><small>Posts will open briefly to read exact dates, then close automatically</small></div></div>
        `;
        document.body.appendChild(panelElement);
        panelElement.querySelector('.panel-close').onclick = () => panelElement.classList.remove('visible');
        panelElement.querySelector('#startScanBtn').onclick = () => startScan();
        panelElement.querySelector('#stopScanBtn').onclick = () => stopScan();
        panelElement.querySelector('#clearResultsBtn').onclick = () => clearResults();
    }

    function updateScanProgress(current, total) {
        const percent = (current / total) * 100;
        const progressBar = document.querySelector('#scanProgress');
        const progressText = document.querySelector('#progressText');
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressText) progressText.textContent = `${current} / ${total}`;
        if (badgeElement) badgeElement.innerHTML = `🔍 ${current}/${total}`;
        const stats = document.querySelector('#scanStats');
        if (stats) stats.textContent = `🔍 Scanning post ${current} of ${total}...`;
    }

    function updateScanComplete(results) {
        const progressBar = document.querySelector('#scanProgress');
        const progressText = document.querySelector('#progressText');
        const stats = document.querySelector('#scanStats');
        const startBtn = document.querySelector('#startScanBtn');
        const stopBtn = document.querySelector('#stopScanBtn');
        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = `✓ ${results.length} / ${totalPostsToScan}`;
        if (stats) stats.textContent = `✅ Complete! Found ${results.length} posts with exact dates`;
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
    }

    function updatePanelWithResults(results) {
        const contentDiv = panelElement.querySelector('.panel-content');
        if (results.length === 0) {
            contentDiv.innerHTML = `<div class="empty-panel">❌ No posts found<br><small>Make sure you're on a public profile and scroll down first</small></div>`;
            return;
        }
        let html = `<div class="results-header">📊 Last ${results.length} posts (newest first)</div>`;
        for (let i = 0; i < results.length; i++) {
            const post = results[i];
            const daysAgo = getDaysAgo(post.date);
            const dateStr = post.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '📌 ';
            html += `
                <div class="post-item" data-url="${post.url}">
                    ${post.preview ? `<img src="${post.preview}" class="post-preview" crossorigin="anonymous" loading="lazy">` : '<div class="post-preview-placeholder">📷</div>'}
                    <div class="post-info">
                        <div class="post-days">${medal}${daysAgo}</div>
                        <div class="post-date">📅 ${dateStr}</div>
                        <div class="post-link">🔗 <span class="clickable-link">Open post →</span></div>
                    </div>
                </div>
            `;
        }
        contentDiv.innerHTML = html;
        document.querySelectorAll('.post-item').forEach(item => {
            item.addEventListener('click', () => {
                const url = item.getAttribute('data-url');
                if (url) window.open(url, '_blank');
            });
        });
    }

    function updateBadgeWithResults(results) {
        if (results.length > 0) {
            const newestDays = getDaysAgo(results[0].date);
            badgeElement.innerHTML = `📅 ${newestDays} (${results.length})<span class="badge-arrow">▼</span>`;
            badgeElement.title = `Newest: ${newestDays} ago | Scanned ${results.length} posts`;
        } else {
            badgeElement.innerHTML = `⚠️ 0 posts<span class="badge-arrow">▼</span>`;
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
        contentDiv.innerHTML = '<div class="loading-panel">🔍 Loading posts and scanning...<br><small>Please wait, scanning up to 30 posts</small></div>';
        
        badgeElement.innerHTML = '🔍 0/30';
        badgeElement.classList.add('scanning');
        
        const startTime = Date.now();
        currentScanPosts = await getAllPostsWithExactDates();
        const scanTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        updatePanelWithResults(currentScanPosts);
        updateBadgeWithResults(currentScanPosts);
        updateScanComplete(currentScanPosts);
        
        const stats = document.querySelector('#scanStats');
        if (stats && currentScanPosts.length > 0) {
            stats.textContent = `✅ Complete! ${currentScanPosts.length} posts in ${scanTime}s`;
        }
        
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
        const progressText = document.querySelector('#progressText');
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (stats) stats.textContent = '⏹ Scan stopped by user';
        if (progressText) progressText.textContent = `⏹ ${currentScanPosts.length} / ${totalPostsToScan}`;
        badgeElement.innerHTML = `⏹ ${currentScanPosts.length}/30`;
        setTimeout(() => {
            if (!isScanning && currentScanPosts.length > 0) updateBadgeWithResults(currentScanPosts);
        }, 1500);
    }

    function clearResults() {
        currentScanPosts = [];
        const contentDiv = panelElement.querySelector('.panel-content');
        contentDiv.innerHTML = '<div class="info-message">Results cleared. Click "Start Scan" to analyze posts.</div>';
        const stats = document.querySelector('#scanStats');
        if (stats) stats.textContent = 'Ready to scan';
        const progressBar = document.querySelector('#scanProgress');
        const progressText = document.querySelector('#progressText');
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = `0 / ${totalPostsToScan}`;
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
        badgeElement.addEventListener('click', () => {
            if (panelElement) panelElement.classList.toggle('visible');
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
                background: rgba(0,0,0,0.85);
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
            #ig-last-post-badge:hover { background: rgba(0,0,0,0.95); }
            #ig-last-post-badge.scanning { background: rgba(0,149,246,0.9); animation: pulse 1s infinite; }
            @keyframes pulse { 0%,100% { opacity:0.7; } 50% { opacity:1; } }
            .badge-arrow { font-size: 10px; opacity: 0.7; margin-left: 6px; }
            .close-btn { margin-left: 8px; cursor: pointer; font-size: 18px; opacity: 0.7; }
            .close-btn:hover { opacity: 1; }
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
            #ig-posts-panel.visible { display: flex; }
            .panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                background: #262626;
                color: white;
                font-weight: 600;
            }
            .panel-close { background: none; border: none; color: white; font-size: 24px; cursor: pointer; }
            .panel-controls { padding: 12px 16px; background: #f0f0f0; border-bottom: 1px solid #dbdbdb; }
            .stats { font-size: 12px; color: #262626; margin-bottom: 10px; text-align: center; }
            .buttons { display: flex; gap: 10px; justify-content: center; margin-bottom: 12px; }
            .control-btn { padding: 6px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; }
            .control-btn.start { background: #0095f6; color: white; }
            .control-btn.start:hover:not(:disabled) { background: #0077cc; }
            .control-btn.stop { background: #ed4956; color: white; }
            .control-btn.stop:hover:not(:disabled) { background: #c93542; }
            .control-btn.clear { background: #8e8e8e; color: white; }
            .control-btn.clear:hover:not(:disabled) { background: #6e6e6e; }
            .control-btn:disabled { opacity: 0.5; cursor: not-allowed; }
            .progress-container { display: flex; align-items: center; gap: 10px; }
            .progress-bar { flex: 1; background: #dbdbdb; border-radius: 10px; overflow: hidden; height: 8px; }
            .progress-fill { background: #0095f6; width: 0%; height: 100%; transition: width 0.2s ease; }
            .progress-text { font-size: 11px; font-weight: 600; color: #262626; min-width: 45px; text-align: right; }
            .panel-content { flex: 1; overflow-y: auto; background: #fafafa; }
            .results-header { padding: 12px 16px; background: #fff; font-weight: 600; border-bottom: 1px solid #efefef; position: sticky; top: 0; z-index: 1; }
            .post-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #efefef; cursor: pointer; transition: background 0.1s; }
            .post-item:hover { background: #efefef; }
            .post-preview, .post-preview-placeholder { width: 52px; height: 52px; border-radius: 8px; object-fit: cover; background: #dbdbdb; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
            .post-info { flex: 1; }
            .post-days { font-weight: 700; font-size: 14px; color: #0095f6; }
            .post-date { font-size: 11px; color: #8e8e8e; margin-top: 4px; }
            .clickable-link { font-size: 11px; color: #0095f6; text-decoration: underline; cursor: pointer; }
            .loading-panel, .empty-panel, .info-message { text-align: center; padding: 30px; color: #8e8e8e; }
            small { font-size: 11px; color: #8e8e8e; display: block; margin-top: 8px; }
        `;
        document.head.appendChild(style);
    }

    function init() {
        createBadge();
        addStyles();
        createPanel();
        console.log('✅ Instagram Post Scanner ready — will reliably scan 30 posts.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();