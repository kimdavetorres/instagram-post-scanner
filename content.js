(function() {
    'use strict';

    // State
    let badgeElement = null;
    let observer = null;
    let currentUrl = window.location.href;
    let retryCount = 0;
    const MAX_RETRIES = 10;

    // Helper: Calculate days difference
    function getDaysAgo(postDate) {
        const now = new Date();
        const diffTime = now - postDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return '1 day ago';
        return `${diffDays} days ago`;
    }

    // Helper: Format output
    function formatOutput(daysAgoText) {
        return `Last post — ${daysAgoText}`;
    }

    // Extract date from various Instagram DOM structures
    function extractPostDate(postElement) {
        // Strategy 1: Look for <time> element with datetime attribute
        const timeElement = postElement.querySelector('time');
        if (timeElement && timeElement.getAttribute('datetime')) {
            return new Date(timeElement.getAttribute('datetime'));
        }

        // Strategy 2: Look for aria-label containing date
        const allElements = postElement.querySelectorAll('[aria-label]');
        for (const el of allElements) {
            const label = el.getAttribute('aria-label');
            if (label && (label.includes('posted') || label.match(/\d+\s+(day|week|month|year)/i))) {
                // Parse relative text like "2 days ago" or "Posted 3 weeks ago"
                const match = label.match(/(\d+)\s+(day|days|week|weeks|month|months|year|years)/i);
                if (match) {
                    const num = parseInt(match[1]);
                    const unit = match[2].toLowerCase();
                    const now = new Date();
                    if (unit.startsWith('day')) return new Date(now - num * 86400000);
                    if (unit.startsWith('week')) return new Date(now - num * 604800000);
                    if (unit.startsWith('month')) return new Date(now - num * 2592000000);
                    if (unit.startsWith('year')) return new Date(now - num * 31536000000);
                }
            }
        }

        // Strategy 3: Look for any element with datetime-like attribute
        const dateAttrs = postElement.querySelectorAll('[datetime], [data-timestamp], [data-time]');
        for (const el of dateAttrs) {
            const timestamp = el.getAttribute('datetime') || 
                             el.getAttribute('data-timestamp') || 
                             el.getAttribute('data-time');
            if (timestamp && !isNaN(Date.parse(timestamp))) {
                return new Date(timestamp);
            }
        }

        return null;
    }

    // Find the most recent post
    function findMostRecentPost() {
        // Instagram's post grid selectors (updated for current DOM)
        const selectors = [
            'article div[style*="position: relative"] a',  // Post links
            'article div[role="presentation"] a',
            'article > div > div > div a',
            'div[role="dialog"] article a',  // For modal views
            'div[class*="x1y332i5"] a[href*="/p/"]',  // Recent Instagram class patterns
            'div[class*="x9f619"] a[href*="/p/"]',
            'a[href*="/p/"]:not([href*="/reel/"])'  // Exclude reels
        ];

        let postElements = [];
        
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                postElements = Array.from(elements);
                break;
            }
        }

        if (postElements.length === 0) {
            // Try to find any clickable post container
            const possiblePosts = document.querySelectorAll('article > div > div > div > div > a');
            if (possiblePosts.length > 0) {
                postElements = Array.from(possiblePosts);
            }
        }

        if (postElements.length === 0) {
            return null;
        }

        // For each post, find its date
        const postsWithDates = [];
        
        for (const postLink of postElements) {
            // Try to find date relative to this post
            let parent = postLink.closest('article') || postLink.closest('div[role="presentation"]');
            if (!parent) parent = postLink.parentElement;
            
            const date = extractPostDate(parent);
            if (date && !isNaN(date.getTime())) {
                postsWithDates.push({ element: postLink, date });
            }
        }

        if (postsWithDates.length === 0) {
            return null;
        }

        // Sort by date (newest first)
        postsWithDates.sort((a, b) => b.date - a.date);
        return postsWithDates[0];
    }

    // Update the badge display
    function updateBadge() {
        if (!badgeElement) return;

        const mostRecent = findMostRecentPost();
        
        if (!mostRecent) {
            // Check if profile might be private or has no posts
            const isPrivate = document.body.innerText.includes('This Account is Private') ||
                              document.body.innerText.includes('Private account');
            const hasPosts = document.querySelector('article') !== null;
            
            if (isPrivate) {
                badgeElement.textContent = 'Cannot determine';
                badgeElement.classList.add('private');
            } else if (!hasPosts || document.querySelectorAll('article a').length === 0) {
                badgeElement.textContent = 'No posts found';
                badgeElement.classList.add('empty');
            } else {
                // Posts exist but dates not found yet - might be loading
                if (retryCount < MAX_RETRIES) {
                    badgeElement.textContent = 'Detecting...';
                    badgeElement.classList.add('loading');
                    setTimeout(() => {
                        retryCount++;
                        updateBadge();
                    }, 1000);
                    return;
                } else {
                    badgeElement.textContent = 'No posts found';
                    badgeElement.classList.add('empty');
                }
            }
            return;
        }

        const daysAgoText = getDaysAgo(mostRecent.date);
        badgeElement.textContent = formatOutput(daysAgoText);
        badgeElement.classList.remove('loading', 'private', 'empty');
        badgeElement.classList.add('visible');
        retryCount = 0;
    }

    // Create the floating badge UI
    function createBadge() {
        if (badgeElement) return;

        badgeElement = document.createElement('div');
        badgeElement.id = 'ig-last-post-badge';
        badgeElement.textContent = 'Checking...';
        
        // Add close button
        const closeBtn = document.createElement('span');
        closeBtn.innerHTML = '×';
        closeBtn.className = 'close-btn';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            badgeElement.style.display = 'none';
        };
        badgeElement.appendChild(closeBtn);
        
        document.body.appendChild(badgeElement);
        
        // Make draggable
        makeDraggable(badgeElement);
    }

    // Make badge draggable
    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        element.onmousedown = dragMouseDown;
        
        function dragMouseDown(e) {
            if (e.target.className === 'close-btn') return;
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
            
            // Keep within viewport
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

    // Handle SPA navigation (Instagram is React-based)
    function observeNavigation() {
        let lastUrl = location.href;
        
        const navigationObserver = new MutationObserver(() => {
            const newUrl = location.href;
            if (newUrl !== lastUrl) {
                lastUrl = newUrl;
                // Wait for page to render
                setTimeout(() => {
                    updateBadge();
                }, 1500);
            }
        });
        
        navigationObserver.observe(document, { subtree: true, childList: true });
        return navigationObserver;
    }

    // Observe dynamic content loading (infinite scroll)
    function observeContentLoading() {
        const contentObserver = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check if added nodes contain post elements
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && (node.matches('article') || node.querySelector('article'))) {
                                shouldUpdate = true;
                                break;
                            }
                        }
                    }
                }
            }
            
            if (shouldUpdate) {
                // Debounce to avoid too many updates
                clearTimeout(window.updateTimeout);
                window.updateTimeout = setTimeout(updateBadge, 500);
            }
        });
        
        contentObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        return contentObserver;
    }

    // Initialize the extension
    function init() {
        createBadge();
        
        // Initial detection with delay to allow page to load
        setTimeout(updateBadge, 2000);
        
        // Set up periodic checks (every 30 seconds, in case user stays on page)
        setInterval(updateBadge, 30000);
        
        // Observe navigation between profiles
        observeNavigation();
        
        // Observe content loading (infinite scroll)
        observeContentLoading();
        
        // Also update when window gains focus (user might have returned)
        window.addEventListener('focus', () => {
            setTimeout(updateBadge, 500);
        });
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();