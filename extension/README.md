# AI Job Hunter — Browser Extension (auto-scroll + auto-like)

## How it works
- Scans LinkedIn feed for internship/junior posts (English + Arabic keywords).
- Enable **Auto-scroll** — the page scrolls automatically, 1 second per post.
- Enable **Auto-like** — when a matching post is found, waits 10 seconds then clicks Like.
- Every matching post is sent to your local server at `http://localhost:3737` and appears on your dashboard.

## Keywords covered (~130 terms)
**English:** internship, intern, trainee, junior, entry level, fresh graduate, hiring, job opening, software engineer, backend, frontend, full stack, laravel, react, node.js, remote, visa sponsorship, etc.

**Arabic:** تدريب, متدرب, حديث التخرج, مطلوب, وظيفة شاغرة, مهندس برمجيات, مطور, عن بعد, دفعة 2027, and many more Arabic/Egyptian recruitment terms.

## Load in Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select: `extension/manifest.json`
4. (Temporary add-ons unload on Firefox restart — re-load each session.)

## Load in Chrome / Edge
1. Open `chrome://extensions/` → Developer mode → **Load unpacked**
2. Select the `extension/` folder

## Use it
1. Start server: `cd .. && npx tsx src/server.ts` (keep terminal open)
2. Open LinkedIn, log in normally
3. Click extension icon → toggle **Auto-scroll** and/or **Auto-like**
4. Scroll LinkedIn (or let auto-scroll do it)
5. Review jobs at `http://localhost:3737/` — click **Applied** when you apply

## ⚠️ Risk warning
Auto-scroll and auto-like generate automated actions on LinkedIn. This can trigger LinkedIn's spam detection and put your account at risk of restriction. Use sparingly, keep volume low, and prefer manual scrolling where possible.
