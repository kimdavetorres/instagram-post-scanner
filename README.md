# 📸 Instagram Post Scanner

![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/License-MIT-orange)

A lightweight Chrome extension that scans the last 30 posts from any Instagram profile and displays **exactly how many days ago** each post was published — with accurate dates and direct links to each post.

## ✨ Features

- 🔍 **Scans last 30 posts** from any public Instagram profile
- 📅 **Exact dates** — reads the real post date, not estimates
- 🏆 **Medal ranking** — 🥇🥈🥉 for newest posts
- 📊 **Real-time progress** — shows scan progress with percentage
- ⏹️ **Stop/Cancel** — you're in control, stop anytime
- 🔗 **Clickable links** — opens posts in new tab (only when you want)
- 🎯 **Sorted by date** — newest posts first
- 📱 **Clean UI** — floating badge + detailed panel
- 🚫 **No API key required** — works directly with Instagram

## 📸 Screenshots

### Badge (floating on Instagram profile)
<img width="224" height="76" alt="image" src="https://github.com/user-attachments/assets/ff42a437-f04b-45b0-8cc1-84aa944ee659" />


### Scanner Panel
<img width="480" height="586" alt="image" src="https://github.com/user-attachments/assets/4d34d824-d0d7-438b-b84b-d707bc12c44f" />



## 🚀 Installation

### From Source (Developer Mode)

1. **Download or clone** this repository
   ```bash
   git clone https://github.com/yourusername/instagram-post-scanner.git
2. **Open Chrome** and navigate to `chrome://extensions/`

3. **Enable "Developer mode"** (toggle in top-right corner)

4. **Click "Load unpacked"** and select the extension folder

5. **Done!** The extension is now installed

### From Chrome Web Store (Coming Soon)
_Link will be added once published_

### 🎮 How to Use
1. **Go to any Instagram profile** (e.g., `instagram.com/username/`)

2. **Click the floating badge** (top-right corner) to open the scanner panel

3. **Click "Start Scan"** — the extension will:
   - Scroll to load posts
   - Open each post briefly (to read the exact date)
   - Close it automatically
   - Show real-time progress

4. **View results** — all posts displayed with:
    - Days ago (exact)
    - Full date
    - Clickable link to open the post

5. **Stop anytime** — use the Stop button to cancel scanning

### ⚙️ How It Works

The extension works by:

1. **Scrolling** through the profile grid to load all posts
2. **Clicking each post** (opens Instagram's built-in modal)
3. **Reading the exact date** from the post page (not estimates)
4. **Closing the modal** automatically
5. **Storing and sorting** results by date
6. **Displaying** in a clean, interactive panel

> **Note:** Posts open briefly to read the exact date, then close automatically. This is the only reliable way to get accurate dates, as Instagram hides exact timestamps on the grid view.

### 📁 Project Structure
```bash
instagram-post-scanner/
├── manifest.json          # Extension configuration (Manifest V3)
├── content.js             # Main scanning logic
├── content.css            # Styles for badge and panel
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # This file
```

### 🔧 Configuration

You can adjust the number of posts to scan by changing the totalPostsToScan variable in content.js:

```bash
javascript

let totalPostsToScan = 30;  // Change to 10, 20, 50, etc.
```

### 🛡️ Permissions Explained
**Permission**	                           **Why it's needed**
`host_permissions: *.instagram.com/*`	      To run on Instagram profiles
`content_scripts`	                        To inject the scanner into the page

**No unnecessary permissions** — no tracking, no data collection, no external APIs.
