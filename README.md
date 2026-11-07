# AI Job Hunter — LinkedIn Job Discovery System

> **Automated multi-agent job discovery system** that scans LinkedIn feed for internship/junior roles, evaluates them against your profile using AI agents, and presents matched opportunities in a dashboard.

## 🎯 What It Does

- **Scans LinkedIn feed** in real-time for internship/junior/fresh graduate positions
- **Extracts job details** (title, company, location, description, URL) from LinkedIn feed posts
- **Runs 7 AI agents** to evaluate each post:
  1. **Classification** — Determines seniority level (rejects senior/mid roles)
  2. **Eligibility** — Checks country, remote, visa, student status, graduation year, experience
  3. **Matching** — AI-powered skill matching (0-100 score) against your profile
  4. **Verification** — Verifies post URL, company, title, active listing
  5. **Deduplication** — Prevents duplicates across scrolls/sessions
  6. **Auto-scroll** — Optional hands-free feed scanning
  7. **Auto-like** — Optional engagement with matching posts
- **Dashboard** — Web UI at `http://localhost:3737` with filtering, sorting, status tracking
- **Telegram/WhatsApp notifications** (optional)

## 🏗 Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌────────────────┐
│ Browser Ext     │────▶│ Local Server │────▶│ SQLite DB      │
│ (content.js)    │     │ (port 3737)  │     │ (jobs-discovered.json) │
└─────────────────┘     └──────────────┘     └────────────────┘
                              │
                              ▼
                        ┌────────────────┐
                        │ Dashboard      │
                        │ (review.html)  │
                        └────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- pnpm (or npm/yarn)
- Firefox or Chrome
- LinkedIn account

### Installation

```bash
# Clone the repository
git clone https://github.com/ahmedlol465/job_searching_tool.git
cd job_searching_tool

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials (see Configuration below)
# At minimum, set OPENAI_API_KEY for AI matching
nano .env
```

### Configuration (.env)

```env
# Database (auto-created as JSON files, no PostgreSQL needed for development)
DATABASE_URL="postgresql://user:pass@localhost:5432/job_hunter"

# Redis (for BullMQ queue - optional, only for production)
REDIS_URL="redis://localhost:6379"

# LLM Provider (OpenAI-compatible)
OPENAI_API_KEY="sk-..."          # Required for AI matching
AI_PROVIDER="openai"
AI_MODEL="gpt-4o-mini"

# Telegram Bot (optional)
TELEGRAM_BOT_TOKEN="123456:ABC..."
TELEGRAM_CHAT_ID="123456789"

# WhatsApp Business Cloud API (optional)
WHATSAPP_TOKEN=""
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_TO=""

# Server
PORT=3737
HOST=localhost
LOG_LEVEL=info
DISCOVERY_INTERVAL_MINUTES=120
```

### Running the System

**Terminal 1 — Start the server (keep open):**
```bash
pnpm dev
# or: npx tsx src/server.ts
```

**Terminal 2 — Build/Run extension (optional, for development):**
```bash
# Extension loads directly in browser, no build needed for Firefox
# For Chrome: load extension/ folder as unpacked extension
```

### Loading the Extension

**Firefox (recommended - supports Manifest V3 background scripts):**
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select `extension/manifest.json`
4. Pin the extension icon

**Chrome/Edge:**
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `extension/` folder

## 🎮 Usage Guide

### 1. Start the Server
```bash
npx tsx src/server.ts
```
Keep this terminal open. You'll see:
```
{"level":"info","message":"[server] listening","meta":{"url":"http://localhost:3737","dashboard":"http://localhost:3737/"}}
```

### 2. Open Dashboard
Visit `http://localhost:3737/` — you'll see the job review dashboard.

### 3. Load Extension & Browse LinkedIn
1. Go to `linkedin.com/feed/` and log in
2. Click extension icon → verify "Server online" (green)
3. **Toggle Auto-scroll ON** for hands-free scanning
4. **Toggle Auto-like ON** (optional) to auto-like matching posts
5. Scroll manually or let auto-scroll run

### 4. Review Jobs on Dashboard
- **Stats:** Total, High (≥85), Medium (70-84), Applied, Approved
- **Filters:** Search, Priority (High/Med/Low), Status
- **Job Cards:** Title, Company, Score, Eligibility, Matched/Missing Skills, Reasoning
- **Actions:** Approve / Applied / Reject (persists across reloads)

### 5. Apply & Track
1. Click **"Open on LinkedIn"** to view the original post
2. Apply on LinkedIn
3. Return to dashboard → click **"Applied"** button
4. Status persists across reloads (stored in `data/applications.json`)

## ⚙️ Key Features

### Multi-Agent Pipeline
| Agent | Purpose | Output |
|-------|---------|--------|
| Classification | Rejects senior/mid roles; keeps internship/junior/entry | `experienceLevel` |
| Eligibility | Egypt/remote/visa/student/grad-year/experience/deadline | `ELIGIBLE` / `LIKELY_ELIGIBLE` / `UNCERTAIN` / `NOT_ELIGIBLE` |
| Matching | LLM skill match (0-100) with reasoning | `matchScore`, `matchedSkills`, `missingSkills`, `explanation` |
| Verification | URL reachable, company/title present, listing active | `VERIFIED` / `FAILED` / `UNVERIFIED` |
| Deduplication | By URN, URL, content hash, company+title similarity | Prevents duplicates |

### Duplicate Prevention
- **Normalized hashing** — strips "… more", "see more", normalizes whitespace before hashing
- **Multiple keys** — URN, canonical URL, content hash, company+title similarity
- **Cross-session** — persisted in `data/jobs-discovered.json`

### Auto-Scroll (Optional)
- **Toggle in popup** — starts/stops automatically
- **1 second pause** per scroll step
- **Stops at bottom** after 3 consecutive scrolls with no new content
- **Pauses on scroll/tab switch** — resumes when tab focused

### Auto-Like (Optional)
- **Only on high-score matches** (≥90 match score)
- **Max 3 likes/session** with 4-7 min random gaps
- **Only when tab focused** — no background activity

## 🛠 Development

### Project Structure
```
job_searching_tool/
├── src/
│   ├── index.ts              # CLI discovery pipeline
│   ├── server.ts             # HTTP server (port 3737)
│   ├── agents/               # 7 AI agents
│   │   ├── classification.ts
│   │   ├── eligibility.ts
│   │   ├── matching.ts
│   │   ├── verification.ts
│   │   ├── deduplication.ts
│   │   ├── orchestration.ts
│   │   └── schemas.ts
│   ├── lib/
│   │   ├── db.ts             # Prisma client
│   │   ├── logger.ts
│   │   └── file-store.ts     # JSON file storage
│   ├── notifications/        # Telegram, WhatsApp
│   ├── queue/                # BullMQ queue
│   └── sources/              # JobSpy, career pages
├── extension/
│   ├── manifest.json         # Manifest V3
│   ├── background.js         # Service worker (proxy to localhost)
│   ├── content.js            # LinkedIn DOM scraper
│   ├── popup.html/js         # Extension popup UI
│   └── README.md
├── data/
│   ├── review.html           # Dashboard UI
│   ├── jobs-discovered.json  # Job storage
│   └── applications.json     # Status tracking
├── prisma/
│   └── schema.prisma         # Full DB schema (PostgreSQL)
├── package.json
├── tsconfig.json
└── docker-compose.yml        # Postgres + Redis
```

### Running Tests
```bash
pnpm test
# Runs 16 unit tests for agents (classification, eligibility, dedup, verification, matching)
```

### Type Checking
```bash
pnpm lint
# or: npx tsc --noEmit
```

### Database (Production)
```bash
# Start PostgreSQL + Redis
docker compose up -d

# Apply migrations
pnpm db:migrate

# Generate Prisma client
pnpm db:generate
```

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Server offline" in extension | Start `npx tsx src/server.ts`; check terminal for errors |
| "SyntaxError: unexpected token )" in dashboard | Hard refresh: `Ctrl+Shift+R` (Firefox) / `Cmd+Shift+R` (Mac) |
| "Content-Security-Policy blocked" | Background script proxy handles this; ensure `background.js` is loaded |
| Extension shows "Stopped" | Click **Reload** in `about:debugging` (Firefox) or `chrome://extensions` |
| No jobs found | Check console for `[ajh] selector "..." found X nodes`; LinkedIn DOM changes often |
| Jobs not on dashboard | Check `http://localhost:3737/api/jobs` — if empty, server not receiving data |
| Auto-scroll not working | Must be on `linkedin.com/feed/` (not `/feed/foryou/`); check console for `[ajh] Auto-scroll STARTED` |

## ⚠️ Important Notes

### LinkedIn ToS & Safety
- **Auto-scroll/auto-like violate LinkedIn ToS** — use at your own risk
- **Use a secondary account** to avoid restrictions on your main profile
- **Keep volume low** — don't run 24/7; manual scrolling is safest
- **No evasion techniques** — this extension uses your logged-in session only

### Data Privacy
- All data stays **local** (JSON files in `data/`)
- No external APIs except OpenAI (for matching) and LinkedIn (your session)
- Telegram/WhatsApp tokens stored locally in `.env`

### LinkedIn DOM Changes
LinkedIn updates their DOM frequently. If jobs stop being detected:
1. Check console for `[ajh] selector "..." found 0 nodes`
2. Update selectors in `extension/content.js` → `findPostNodes()`
3. Use LinkedIn's "Inspect Element" to find new selectors

## 📄 License

MIT License — feel free to use, modify, and distribute.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `pnpm test`
4. Run type check: `pnpm lint`
5. Submit a PR

## 📞 Support

- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions
- **Security:** Report via GitHub Security Advisories

---

**Built with:** TypeScript, Node.js, Prisma, Chrome/Firefox Extension APIs, LinkedIn DOM scraping