# WTFIMM?! 💸

### *Where The F\*ck Is My Money?!*

> A brutally honest personal expense tracker. Because spreadsheets are boring and budgeting apps are ugly.

[![Live](https://img.shields.io/badge/live-wtfimm-ff4060?style=flat-square)](https://Undermoroz.github.io/wtfimm/)
[![Single file](https://img.shields.io/badge/architecture-single%20HTML%20file-9060ff?style=flat-square)](#architecture)
[![PWA](https://img.shields.io/badge/PWA-installable-6060ff?style=flat-square)](#pwa)
[![Supabase](https://img.shields.io/badge/backend-Supabase-3ECF8E?style=flat-square)](https://supabase.com)

---

## What is this?

WTFIMM?! is a **mobile-first personal finance tracker** built as a single self-contained HTML file. No build tools, no npm, no framework. Just one file you can host anywhere.

It tracks expenses and income in **mixed currencies** (UZS + USD), syncs to a Supabase database in real time, works offline, and can be installed as a PWA on your phone's home screen.

Built for personal use in Tashkent, Uzbekistan — where you spend in sums, and can earn in dollars.

---

## Features

### 💰 Money tracking
- **Expenses** — add, edit, delete; organized by category
- **Income** — add, edit, delete; exchange rate is **locked at the moment of entry** so historical records stay accurate
- **Mixed currency support** — enter amounts in UZS or USD; automatic conversion using live exchange rate
- **Live exchange rate** — fetched from open.er-api.com (fallback: exchangerate-api.com), cached for 7 days
- **Monthly navigation** — browse any month from 2026 onward; tap the month label for a quick 4×3 grid picker

### 📊 Overview tab
- Summary card: total expenses, income, balance for the month
- **SVG donut chart** — proportional breakdown of spending by category
- Category bars with amounts and percentages

### 📋 Log tab
- All expenses and income in a single chronological feed
- **iOS-style swipe-to-delete** on each entry
- Inline edit button on every record

### 📤 Summary tab
- Plain-text financial summary for the month
- One-tap copy to clipboard (for sharing in a chat or saving)

### ⚙️ Settings tab
- **17 default categories** with emoji + custom color
- Full **CRUD for categories**: create, rename, recolor, delete (entries migrate to "Other" automatically)
- Language toggle: 🇷🇺 Russian / 🇬🇧 English
- Theme selector: 3 themes

### 🌐 Internationalization
- Full **RU / EN** bilingual UI — every string, label, toast, and error message
- **Auto-detects system language** on first visit via `navigator.language`
- Language preference persisted to Supabase and localStorage
- Language toggle available on the **login screen** before signing in

### 🔐 Auth & Backend
- Email + password auth via **Supabase Auth**
- Row Level Security — each user sees only their own data
- Settings (language, theme, categories) synced to Supabase `user_data` table
- First login migrates any existing local data to the database

### 📡 Offline support
- All data cached in **localStorage** as a mirror of the database
- Failed writes go into an **offline queue** (`addPendingOp`)
- Queue auto-syncs when the connection comes back
- Visual sync indicator in the UI

### 📱 PWA & Mobile
- Installable on iOS and Android home screens
- **Swipe left/right on content** → switch tabs
- **Swipe left/right on month nav** → previous/next month
- **Swipe left on a log entry** → reveal delete button
- Safe area support (notch, Dynamic Island, home indicator)
- No 300ms tap delay (`touch-action: manipulation`)
- No pull-to-refresh (`overscroll-behavior: none`)
- Smart install hint — shown after 4 sessions, max 3 times

### 🎨 Design
- **3 themes**:
  - 😎 Gen Z — dark blue-purple
  - 👁️ Eyeball-friendly — near-black, zero blue bias
  - 🫠 Cataract — warm cream light mode
- **Animated logo** — gradient `#ff4060 → #ff8030 → #9060ff → #6060ff`, 5 fonts, 4 animations
  - Each tab triggers a different logo animation (breathe / wave / neon / rage)
  - Tap the logo to cycle through fonts with a glitch effect
- **Floating orbs** background — blurred color blobs, different palette per theme
- **Custom confirm modal** — no native `confirm()` (doesn't work in WebViews)

### 🥚 Easter egg
- Tap the logo 5 times to unlock a hidden profile card
- Includes photo, bio, and social links
- Raining 💸🔥💵 background animation
- Fully bilingual

---

## Tech Stack

| Layer | Tech |
|---|---|
| **Frontend** | Vanilla HTML + CSS + JS — zero frameworks, zero build step |
| **Backend** | [Supabase](https://supabase.com) (PostgreSQL + Auth + RLS) |
| **Auth** | Supabase Email/Password |
| **Fonts** | Inter, JetBrains Mono, Bebas Neue, Permanent Marker, Bangers, VT323 (Google Fonts) |
| **Exchange rate** | [open.er-api.com](https://open.er-api.com) + [exchangerate-api.com](https://exchangerate-api.com) |
| **Hosting** | GitHub Pages |
| **Offline** | localStorage + custom sync queue |
| **PWA** | Web App Manifest + iOS/Android meta tags |

---

## Architecture

```
index.html          ← entire app: HTML + CSS + JS in one file (~2600 lines)
manifest.json       ← PWA manifest
icon-192.png        ← app icon (PWA, favicon, iOS home screen)
icon-512.png        ← app icon (high-res for splash screens)
```

**No build process. No dependencies to install. No node_modules.**

### Data flow

```
User action
    │
    ▼
Update in-memory state (exps / incs / cats)
    │
    ├──▶ Write to localStorage (instant, offline-safe)
    │
    └──▶ Write to Supabase (async, fire-and-forget)
              │
              └── On error → addPendingOp() → retry on reconnect
```

### Supabase schema

```sql
-- One row per expense
expenses (id, user_id, month_id, cat_id, amount, usd, note, date)

-- One row per income entry
income   (id, user_id, month_id, amount, usd, note, date, rate)

-- One row per user (JSON blobs for categories + settings)
user_data (user_id, categories, settings)
```

All tables are protected by **Row Level Security** — users can only read and write their own rows.

### Month ID format

Data is partitioned by month: `"2026-05"`, `"2026-06"`, etc. Loaded lazily — each month is fetched from Supabase only when first navigated to, then cached in localStorage for the session.

---

## Keyboard & gesture reference

| Action | How |
|---|---|
| Switch tab | Swipe left / right on content |
| Previous / next month | Swipe left / right on month label |
| Delete entry | Swipe left on log item → tap 🗑️ |
| Edit income | Tap «edit» on any income row |
| Edit expense | Tap «edit» on any expense row |
| Month picker | Tap the month label |
| Easter egg | Tap logo 5× |
| Cycle logo font | Tap logo (1× per tap after the first 5) |

---

## License

All rights reserved. No reuse or distribution allowed. 
Built by [Alexander Morozov](https://t.me/it_is_morozov).
