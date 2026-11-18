# StockScope 3.0 — US Stock Dashboard

StockScope is a Thai-language, responsive stock dashboard built with plain HTML, CSS, and JavaScript.

## Features
- US stock / ETF search and custom watchlist (NVDA, PLTR, MSFT, GOOGL, VOO, QQQM, and more)
- TradingView stock chart, market overview, heatmap, and news widgets
- Company profile for selected individual stocks, US stock screener, economic calendar, and US earnings calendar link
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

## Release notes — StockScope 2.1
- New **Research** section with company profiles, stock screener, and economic calendar widgets.
- Dynamic profile and stock detail link follow the selected ticker; ETF selections show a helpful note in place of a company profile.
- No API key or backend needed. Widget data may be delayed; this site does not provide trade execution or price alerts.

## Release notes — StockScope 2.2: Direct market data
- Prices and selected-ticker daily history chart now use Twelve Data API via `netlify/functions/market-data.mjs`.
- Public API status check: `/.netlify/functions/market-data?type=status`. `configured: true` means the server can see a key **but does not prove it is valid**.
- For an API functionality test visit `/.netlify/functions/market-data?type=quotes&symbols=NVDA`. A populated `quotes.NVDA` indicates the upstream quote request worked.
- Netlify project → Environment variables: set `TWELVE_DATA_API_KEY` with **Functions** scope and redeploy.
- Keep your API key private: never paste it in chat or commit it. Use Netlify secret environment variables.
- Basic API data can be delayed and is subject to the Twelve Data plan quota. Prices and charts are API-backed; TradingView widgets are **still used** for heatmap, news, screeners, market tiles, and technical analysis.
- Please check your Twelve Data agreement before publicly displaying market data; some plans may not include redistribution rights.

## StockScope 3.0 — API watchlist, candlesticks, and portfolio

- The main selected-stock quote, favorites watchlist, and portfolio pricing use Twelve Data through `/.netlify/functions/market-data`.
- Favorite symbols and up to six portfolio tickers are requested per refresh, to respect entry-level API credits. Other tickers can be loaded by selecting them; a process-local rate limiter is not a globally coordinated quota.
- The daily OHLC candlestick chart calculates EMA20, EMA50, RSI14 and MACD(12,26,9) in the browser, using `stockscope-indicators.js`. No fabricated sample prices.
- Portfolio valuations prefer a cached API quote for each symbol, falling back to the user's manually entered price when unavailable. If a position has neither, the total value and P/L are intentionally left blank rather than silently omitting holdings.
- Portfolio holdings and favorites remain in localStorage; original CSV/JSON backup and restore, DCA calculator, heatmap, economic calendar and TradingView research widgets are retained.
- Quotes may be delayed and are not guaranteed executable prices. Public redistribution rights must be checked against the Twelve Data agreement.

### Setup
1. In Netlify Project configuration → Environment variables, set the secret `TWELVE_DATA_API_KEY` for Functions and redeploy.
2. Check `/.netlify/functions/market-data?type=status` for `configured:true` (configuration only).
3. Check `/.netlify/functions/market-data?type=quotes&symbols=NVDA` for a populated quote (validates the upstream call).
4. Visit the site, hard refresh, and try the favorite Watchlist, candle chart, and portfolio buttons.

Note: The free plan can exhaust its API credits. Repeated refreshes may return HTTP 429; wait before trying again. Netlify builds from `main` when GitHub continuous deployment is enabled.
