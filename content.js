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

    // Sort posts by visual grid position (top-left first) using absolute document coordinates
    function sortPostsByGridPosition(posts) {
        return posts.sort((a, b) => {
            const rectA = a.element.getBoundingClientRect();
            const rectB = b.element.getBoundingClientRect();
            const topA = rectA.top + window.scrollY;
            const topB = rectB.top + window.scrollY;
            const leftA = rectA.left + window.scrollX;
            const leftB = rectB.left + window.scrollX;
            
            // Row tolerance: typical Instagram post height ~250-350px, use 200px to group same row
            const rowTolerance = 200;
            const sameRow = Math.abs(topA - topB) < rowTolerance;
            if (sameRow) {
                return leftA - leftB; // left to right
            }
            return topA - topB; // top to bottom
        });
    }

    // Scroll until we have enough posts (or no more load)
    async function loadEnoughPosts() {
        const scrollableDiv = document.querySelector('main') || document.body;
        let lastCount = 0;
        let noChangeCount = 0;
        let maxScrollAttempts = 30;
        let scrollAttempts = 0;

        while (scrollAttempts < maxScrollAttempts && !stopScanning) {
            scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
            await new Promise(r => setTimeout(r, 600));
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise(r => setTimeout(r, 400));

            const currentLinks = document.querySelectorAll('a[href*="/p/"]');
            const currentCount = currentLinks.length;
            console.log(`Scrolled: found ${currentCount} posts`);

            if (currentCount === lastCount) {
                noChangeCount++;
                if (noChangeCount >= 5) break;
            } else {
                noChangeCount = 0;
                lastCount = currentCount;
            }
            scrollAttempts++;
            if (currentCount >= totalPostsToScan) break;
        }

        // Force reflow to ensure positions are accurate
        document.body.offsetHeight;
        await new Promise(r => setTimeout(r, 100));
    }

    // Extract all posts with dates directly from grid (no clicks)
    async function getAllPostsFast() {
        await loadEnoughPosts();

        const postLinks = Array.from(document.querySelectorAll('a[href*="/p/"]'));
        const postsToProcess = postLinks.slice(0, totalPostsToScan);
        
        if (postsToProcess.length === 0) return [];

        const postsWithData = [];
        
        for (const link of postsToProcess) {
            // Find the associated <time> element
            let timeEl = link.querySelector('time');
            if (!timeEl) {
                const parent = link.closest('article') || link.closest('div[role="presentation"]');
                if (parent) timeEl = parent.querySelector('time');
            }
            if (!timeEl) {
                // Approximate by finding any nearby time element
                const rect = link.getBoundingClientRect();
                const allTimes = document.querySelectorAll('time');
                for (const t of allTimes) {
                    const trect = t.getBoundingClientRect();
                    if (Math.abs(trect.top - rect.top) < 100) {
                        timeEl = t;
                        break;
                    }
                }
            }

            let postDate = null;
            if (timeEl) {
                const datetime = timeEl.getAttribute('datetime');
                if (datetime) postDate = new Date(datetime);
            }

            let previewImg = null;
            const img = link.querySelector('img');
            if (img && img.src && !img.src.includes('blob:')) previewImg = img.src;

            postsWithData.push({
                element: link,
                url: link.href,
                id: link.href.split('/p/')[1]?.replace('/', '') || '',
                date: postDate,
                preview: previewImg
            });
        }

        // Sort by visual grid position (top-left first)
        const sorted = sortPostsByGridPosition(postsWithData);
        console.log('Sorted posts (top-left to bottom-right):', sorted.map(p => p.url));

        // Convert to final results, estimate if date missing
        const results = [];
        for (let i = 0; i < sorted.length; i++) {
            let date = sorted[i].date;
            let estimated = false;
            if (!date) {
                // Fallback: estimate based on position (rare case)
                date = new Date();
                date.setDate(date.getDate() - i * 2);
                estimated = true;
            }
            results.push({
                url: sorted[i].url,
                id: sorted[i].id,
                date: date,
                preview: sorted[i].preview,
                index: i + 1,
                estimated: estimated
            });
        }

        // Final sort by actual date (newest first) for display
        results.sort((a, b) => b.date - a.date);
        return results;
    }

    // ========== UI (unchanged, but updated messages) ==========
    function createPanel() {
        if (panelElement) return;
        panelElement = document.createElement('div');
        panelElement.id = 'ig-posts-panel';
        panelElement.innerHTML = `
            <div class="panel-header"><span>📸 Instagram Post Scanner (${totalPostsToScan} posts)</span><button class="panel-close">×</button></div>
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
            <div class="panel-content"><div class="info-message">📌 Click "Start Scan" – reads dates directly from grid (no posts open). Very fast!</div></div>
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
        if (stats) stats.textContent = `🔍 Loading posts... ${current} of ${total} loaded`;
    }

    function updateScanComplete(results, loadedCount) {
        const progressBar = document.querySelector('#scanProgress');
        const progressText = document.querySelector('#progressText');
        const stats = document.querySelector('#scanStats');
        const startBtn = document.querySelector('#startScanBtn');
        const stopBtn = document.querySelector('#stopScanBtn');
        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = `✓ ${results.length} / ${loadedCount}`;
        if (stats) stats.textContent = `✅ Complete! Found ${results.length} posts with exact dates (loaded ${loadedCount} total)`;
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
    }

    function updatePanelWithResults(results, loadedCount) {
        const contentDiv = panelElement.querySelector('.panel-content');
        if (results.length === 0) {
            contentDiv.innerHTML = `<div class="empty-panel">❌ No posts found.<br><small>Make sure the profile is public and you are logged in.</small></div>`;
            return;
        }
        let html = `<div class="results-header">📊 Last ${results.length} posts (newest first) — loaded ${loadedCount} total from grid</div>`;
        for (let i = 0; i < results.length; i++) {
            const post = results[i];
            const daysAgo = getDaysAgo(post.date);
            const dateStr = post.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '📌 ';
            const estimatedNote = post.estimated ? ' (estimated)' : '';
            html += `
                <div class="post-item" data-url="${post.url}">
                    ${post.preview ? `<img src="${post.preview}" class="post-preview" crossorigin="anonymous" loading="lazy">` : '<div class="post-preview-placeholder">📷</div>'}
                    <div class="post-info">
                        <div class="post-days">${medal}${daysAgo}${estimatedNote}</div>
                        <div class="post-date">📅 ${dateStr}</div>
                        <div class="post-link">🔗 <span class="clickable-link">Open post →</span></div>
                    </div>
                </div>
            `;
        }
        if (loadedCount < totalPostsToScan) {
            html += `<div class="info-message" style="margin-top: 12px;">⚠️ Only ${loadedCount} posts were found in the grid. Instagram may require login to see more, or the profile has fewer posts.</div>`;
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
        contentDiv.innerHTML = '<div class="loading-panel">🔍 Loading posts and reading dates directly from grid...<br><small>No posts open. Very fast!</small></div>';

        badgeElement.innerHTML = '🔍 0/30';
        badgeElement.classList.add('scanning');

        const startTime = Date.now();
        const results = await getAllPostsFast();
        const loadedCount = document.querySelectorAll('a[href*="/p/"]').length;

        const scanTime = ((Date.now() - startTime) / 1000).toFixed(1);
        updatePanelWithResults(results, loadedCount);
        updateBadgeWithResults(results);

        const stats = document.querySelector('#scanStats');
        if (stats) stats.textContent = `✅ Complete! ${results.length} posts in ${scanTime}s (loaded ${loadedCount} total)`;
        updateScanComplete(results, loadedCount);

        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (clearBtn) clearBtn.disabled = false;
        isScanning = false;
        currentScanPosts = results;
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
        if (document.getElementById('ig-styles')) return;
        const style = document.createElement('style');
        style.id = 'ig-styles';
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
        console.log('✅ Optimized Instagram Scanner — reads dates directly from grid, super fast!');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();