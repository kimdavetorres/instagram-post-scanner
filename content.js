(function() {
    'use strict';

    let badgeElement = null;
    let isLoading = false;

    // Helper: Calculate days ago
    function getDaysAgo(postDate) {
        const now = new Date();
        const diffTime = now - postDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return '1 day ago';
        return `${diffDays} days ago`;
    }

    // Format output
    function formatOutput(daysAgoText) {
        return `📅 Last post — ${daysAgoText}`;
    }

    // Scroll grid to load all posts
    async function loadAllPosts() {
        return new Promise((resolve) => {
            const gridContainer = document.querySelector('main article div[role="presentation"]') || 
                                  document.querySelector('main') || 
                                  document.body;
            
            let previousHeight = 0;
            let stableCount = 0;
            let maxScrolls = 30; // Safety limit
            let scrollAttempts = 0;
            
            function getPostCount() {
                return document.querySelectorAll('a[href*="/p/"]').length;
            }
            
            function scroll() {
                scrollAttempts++;
                const currentHeight = gridContainer.scrollHeight;
                gridContainer.scrollTop = gridContainer.scrollHeight;
                
                // Wait for new content to load
                setTimeout(() => {
                    const newCount = getPostCount();
                    
                    // If height increased or new posts loaded, keep scrolling
                    if (currentHeight !== gridContainer.scrollHeight || newCount > previousHeight) {
                        previousHeight = newCount;
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

    // Extract date from a post link element (without clicking)
    function getPostDateFromGrid(postLink) {
        // Find the parent that contains the time element
        let parent = postLink.closest('article') || postLink.closest('div[role="presentation"]');
        if (!parent) parent = postLink.parentElement;
        
        // Look for <time> element inside this post's area
        const timeElement = parent.querySelector('time');
        if (timeElement && timeElement.getAttribute('datetime')) {
            return new Date(timeElement.getAttribute('datetime'));
        }
        
        // Fallback: look for any nearby element with aria-label containing date
        const allElements = parent.querySelectorAll('[aria-label]');
        for (const el of allElements) {
            const label = el.getAttribute('aria-label');
            const match = label?.match(/(\d+)\s+(day|days|week|weeks|month|months)/i);
            if (match) {
                const num = parseInt(match[1]);
                const now = new Date();
                if (match[2].toLowerCase().startsWith('day')) {
                    return new Date(now - num * 86400000);
                } else if (match[2].toLowerCase().startsWith('week')) {
                    return new Date(now - num * 604800000);
                }
            }
        }
        
        return null;
    }

    // Find the most recent post by scanning all loaded grid posts
    async function findMostRecentPost() {
        // First, load all posts by scrolling
        await loadAllPosts();
        
        // Get all post links in the grid
        const postLinks = document.querySelectorAll('a[href*="/p/"]');
        
        if (postLinks.length === 0) {
            return null;
        }
        
        let newestDate = null;
        let validDates = 0;
        
        // Scan each post link to find the newest date
        for (const link of postLinks) {
            const date = getPostDateFromGrid(link);
            if (date && !isNaN(date.getTime())) {
                validDates++;
                if (!newestDate || date > newestDate) {
                    newestDate = date;
                }
            }
        }
        
        // If no dates found but posts exist, assume recent
        if (!newestDate && postLinks.length > 0) {
            return { date: new Date(), fallback: true };
        }
        
        return newestDate ? { date: newestDate, fallback: false } : null;
    }

    // Update the badge
    async function updateBadge() {
        if (!badgeElement || isLoading) return;
        
        isLoading = true;
        badgeElement.textContent = '🔄 Loading posts...';
        badgeElement.classList.add('loading');
        
        const result = await findMostRecentPost();
        
        if (!result) {
            // Check for private account or no posts
            const isPrivate = document.body.innerText.includes('This Account is Private');
            const postCountMatch = document.body.innerText.match(/(\d+)\s+posts/i);
            const hasPosts = postCountMatch && parseInt(postCountMatch[1]) > 0;
            
            if (isPrivate) {
                badgeElement.textContent = '🔒 Cannot determine';
                badgeElement.classList.add('private');
            } else if (!hasPosts) {
                badgeElement.textContent = '📭 No posts found';
                badgeElement.classList.add('empty');
            } else {
                badgeElement.textContent = '⚠️ Could not read dates';
                badgeElement.classList.add('error');
            }
        } else {
            const daysAgoText = getDaysAgo(result.date);
            badgeElement.textContent = formatOutput(daysAgoText);
            if (result.fallback) {
                badgeElement.title = 'Approximate date (based on grid order)';
            }
            badgeElement.classList.remove('loading', 'private', 'empty', 'error');
            badgeElement.classList.add('visible');
        }
        
        isLoading = false;
    }

    // Create draggable badge
    function createBadge() {
        if (badgeElement) return;
        
        badgeElement = document.createElement('div');
        badgeElement.id = 'ig-last-post-badge';
        badgeElement.textContent = '✨ Ready';
        
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
        
        // Auto-update when clicked
        badgeElement.addEventListener('click', (e) => {
            if (e.target !== closeBtn) {
                updateBadge();
            }
        });
    }

    // Draggable functionality
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

    // Initialize
    function init() {
        createBadge();
        
        // Run initial scan after page loads
        setTimeout(() => {
            updateBadge();
        }, 2000);
        
        // Re-run when URL changes (SPA navigation)
        let lastUrl = location.href;
        new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(updateBadge, 2000);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();