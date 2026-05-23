# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Server

```bash
python -m http.server 5000
```

Preview is configured in `.claude/launch.json` as "fintrack" on port 5000. The app is served as static files — no build step required.

## Deployment

Hosted on GitHub Pages. Push to `main` branch deploys automatically. After any JS/CSS/HTML change, **bump the SW cache version** in `sw.js` (`fintrack-vN`) or users won't see updates.

## Architecture

Single-page PWA with no framework — vanilla ES5 JavaScript, direct Supabase backend.

### Key Files
- **app.js** (~5000 lines) — All frontend logic: API layer, UI rendering, state management, financial calculators
- **index.html** — HTML structure with inline modal templates
- **style.css** — Dark/light theme via CSS custom properties (`--bg0`..`--bg5`, `--fg0`..`--fg3`, `--green`, `--red`, etc.)
- **sw.js** — Service Worker: network-first for HTML/JS/CSS, cache-first for fonts/images
- **supabase-schema.sql / supabase-functions.sql** — Database schema and RPC functions (Yahoo Finance proxy)

### Data Flow
- **Supabase** is the sole backend (PostgreSQL + Edge Functions for Yahoo Finance)
- `api(method, url, body)` is a compatibility wrapper that translates REST-style calls to Supabase queries
- All data is scoped by `st.userId` — multi-user support with per-user isolation
- Global state lives in `var st = {...}` and `var data = {liquid, invest, fixed, recv, debt}`
- `allAccounts[]` is a flat array of all accounts; `txs[]` holds current month's transactions

### Important Patterns
- **`_skipBal` flag**: When creating transactions for stock buys, initial balances, or loan disbursements, pass `_skipBal: true` to prevent the auto-balance-update in `POST /api/transactions` (balance is set directly on the account instead)
- **`acctVal(it)`**: Always use this helper for stock account values — returns `shares × curPrice × fxRate` instead of stale `it.bal`
- **`nextDot(items)`**: Picks the first unused color from DOTS array to avoid duplicate dot colors
- **`fundSources`**: Per-loan tracking of which shares were bought with which loan. Use `_getFundSources()`, `_addFundSource()`, `_reduceFundSources()`
- **Balance updates in POST /api/transactions**: Now awaited via `Promise.all` (was fire-and-forget, caused race conditions)
- **localStorage keys** include `st.userId` for per-user isolation (net worth history, calc history)

### Page Structure
Three top-level pages controlled by `navTo()`:
1. `mainContent` — Overview with tabs: 總覽, 明細, 分析, 股票
2. `leveragePage` — Leverage analysis (credit + pledge)
3. `devPage` — Financial calculator hub (6 calculators + history)

### Account Categories
`liquid` (流動資金), `invest` (投資), `fixed` (固定資產), `recv` (應收款), `debt` (負債)

Loan types: 信用貸款, 股票質押, 房貸, 車貸, 其他貸款

## Code Style
- Compact single-line style with short variable names
- Traditional Chinese (zh-TW) UI — all labels, toasts, and category names are in Chinese
- `$('id')` is shorthand for `document.getElementById`
- `fmtN(n)` formats numbers with locale separators; `fmtAmt(n)` adds minus sign
- `cvt(n)` converts TWD↔USD based on `st.ccy`
