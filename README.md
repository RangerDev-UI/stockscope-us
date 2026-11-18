# StockScope 2.0 — US Stock Dashboard

StockScope is a Thai-language, responsive stock dashboard built with plain HTML, CSS, and JavaScript.

## Features
- US stock / ETF search and custom watchlist (NVDA, PLTR, MSFT, GOOGL, VOO, QQQM, and more)
- TradingView stock chart, market overview, heatmap, and news widgets
- Manual portfolio tracker and profit/loss calculator
- DCA projection tools
- Browser-local settings and JSON data backup

## Deploy via Netlify (GitHub integration)
1. Open https://app.netlify.com/start and sign in.
2. Select **Import an existing project** > **GitHub**.
3. Authorize Netlify for repository access, select **RangerDev-UI/stockscope-us**.
4. Branch: `main`, **Build command:** leave blank, **Publish directory:** `.` (repository root).
5. Click **Publish** or **Deploy** to finish.

The repository already contains `netlify.toml` so Netlify can use the root publish directory. Future commits to `main` will publish automatically after the repository is linked.

## Notes about live data and privacy
TradingView embeds require an internet connection and prices may be delayed. StockScope does not fetch portfolio prices directly into the calculator. Portfolio values depend on manually entered inputs.

Browser data are stored in `localStorage` on the current device and browser, not in GitHub or Netlify. **Do not put account passwords or API keys into the site or repo.** The site does not sync holdings between devices: use the built-in JSON backup if needed.

## Local use
Open `index.html` in a browser. No npm dependencies or build tools are required.
