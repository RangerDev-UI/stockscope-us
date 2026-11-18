// StockScope server-only proxy for Twelve Data.
// Never expose TWELVE_DATA_API_KEY in browser code or commit it to Git.
const QUOTE_TTL_MS = 3 * 60_000;
// Process-local guard for basic-plan API usage; not a globally distributed rate limit.
const API_BUDGET_PER_MINUTE = 7;
let creditWindowStart = 0;
let spentCredits = 0;
function reserveCredits(credits) {
  const now = Date.now();
  if (now - creditWindowStart >= 60_000) { creditWindowStart = now; spentCredits = 0; }
  if (spentCredits + credits > API_BUDGET_PER_MINUTE) return false;
  spentCredits += credits;
  return true;
}
const HISTORY_TTL_MS = 4 * 60 * 60 * 1000;
const quoteCache = new Map();
const historyCache = new Map();
const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

function respond(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const v = Number(value);
  return Number.isFinite(v) ? v : null;
}
function isSymbol(s) { return SYMBOL_RE.test(s); }
function normalizeQuote(raw, fallbackSymbol) {
  if (!raw || raw.status === "error" || raw.code >= 400) return null;
  const last = num(raw.close ?? raw.price);
  if (last === null || last <= 0) return null;
  return {
    symbol: fallbackSymbol,
    name: typeof raw.name === "string" ? raw.name.slice(0, 120) : fallbackSymbol,
    exchange: typeof raw.exchange === "string" ? raw.exchange.slice(0, 45) : null,
    currency: typeof raw.currency === "string" ? raw.currency : "USD",
    last,
    open: num(raw.open),
    high: num(raw.high),
    low: num(raw.low),
    previousClose: num(raw.previous_close),
    change: num(raw.change),
    percentChange: num(raw.percent_change),
    volume: num(raw.volume),
    datetime: typeof raw.datetime === "string" ? raw.datetime : null,
    timestamp: num(raw.timestamp)
  };
}
async function upstream(endpoint, params, key) {
  const url = new URL("https://api.twelvedata.com/" + endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  let resp;
  try {
    resp = await fetch(url, {
      headers: { Authorization: "apikey " + key, Accept: "application/json" },
      signal: AbortSignal.timeout(9000)
    });
  } catch {
    return { error: "upstream_unavailable", message: "เชื่อมต่อผู้ให้บริการข้อมูลไม่สำเร็จ", status: 502 };
  }
  let data;
  try { data = await resp.json(); }
  catch { return { error: "invalid_response", message: "รูปแบบคำตอบของ API ไม่ถูกต้อง", status: 502 }; }
  if (!resp.ok || data?.status === "error" || Number(data?.code) >= 400) {
    const code = Number(data?.code) || resp.status;
    const status = code === 429 ? 429 : code === 401 || code === 403 ? 502 : 502;
    const message = code === 429 ? "เกินโควตา API กรุณารอสักครู่แล้วลองใหม่" :
      "API ไม่สามารถให้ข้อมูลได้ (ตรวจสอบสิทธิ์ แพ็กเกจ หรือสัญลักษณ์หุ้น)";
    return { error: "provider_error", message, status };
  }
  return { data };
}
export default async function handler(request) {
  if (request.method !== "GET") return respond({ error: "method_not_allowed" }, 405);
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "status";
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (type === "status") return respond({
    configured: Boolean(apiKey), provider: "Twelve Data",
    mode: "server-side", message: apiKey ? "พร้อมเรียก API" : "โปรดตั้งค่า TWELVE_DATA_API_KEY ใน Netlify Environment variables"
  });
  if (!apiKey) return respond({
    error: "not_configured",
    message: "ยังไม่ได้ตั้ง TWELVE_DATA_API_KEY ใน Netlify → Project configuration → Environment variables"
  }, 503);
  if (type === "quotes") {
    const symbols = [...new Set((url.searchParams.get("symbols") || "")
      .toUpperCase().split(",").map(x => x.trim()))];
    if (!symbols.length || symbols.length > 6 || symbols.some(x => !isSymbol(x))) {
      return respond({ error: "invalid_symbols", message: "เลือกหุ้น 1–6 ตัวที่มีสัญลักษณ์ถูกต้อง" }, 400);
    }
    const now = Date.now();
    const missing = symbols.filter(s => !quoteCache.has(s) || quoteCache.get(s).expires < now);
    if (missing.length) {
      if (!reserveCredits(missing.length)) return respond({ error: "local_rate_limit", message: "จำกัดการใช้โควตาชั่วคราว กรุณารอประมาณหนึ่งนาทีแล้วลองใหม่" }, 429);
      const result = await upstream("quote", { symbol: missing.join(",") }, apiKey);
      if (result.error && missing.every(s => !quoteCache.has(s))) {
        return respond({ error: result.error, message: result.message }, result.status);
      }
      if (!result.error) {
        const raw = result.data;
        for (const symbol of missing) {
          const item = missing.length === 1 ? raw : raw?.[symbol];
          const quote = normalizeQuote(item, symbol);
          if (quote) quoteCache.set(symbol, { data: quote, expires: now + QUOTE_TTL_MS });
        }
      }
    }
    const quotes = {};
    for (const s of symbols) if (quoteCache.has(s)) quotes[s] = quoteCache.get(s).data;
    const missingSymbols = symbols.filter(s => !quotes[s]);
    return respond({
      provider: "Twelve Data", attribution: "Data provided by Twelve Data", fetchedAt: new Date().toISOString(),
      quotes, missingSymbols,
      note: "ข้อมูลอาจล่าช้า ไม่รับประกันความเป็นเรียลไทม์ และอาจไม่ครอบคลุมทุกตลาด"
    });
  }
  if (type === "history") {
    const symbol = (url.searchParams.get("symbol") || "").toUpperCase().trim();
    if (!isSymbol(symbol)) return respond({ error: "invalid_symbol" }, 400);
    const cached = historyCache.get(symbol);
    if (cached && cached.expires > Date.now()) return respond(cached.data);
    if (!reserveCredits(1)) return respond({ error: "local_rate_limit", message: "จำกัดการใช้โควตาชั่วคราว กรุณารอประมาณหนึ่งนาทีแล้วลองใหม่" }, 429);
    const result = await upstream("time_series", { symbol, interval: "1day", outputsize: "260", order: "asc" }, apiKey);
    if (result.error) return respond({ error: result.error, message: result.message }, result.status);
    const raw = result.data;
    if (!Array.isArray(raw?.values) || raw.values.length === 0) {
      return respond({ error: "no_history", message: "ไม่มีข้อมูลกราฟรายวันสำหรับหุ้นนี้" }, 404);
    }
    const values = raw.values.map(r => ({
      date: String(r.datetime || "").slice(0, 10),
      open: num(r.open), high: num(r.high), low: num(r.low),
      close: num(r.close), volume: num(r.volume)
    })).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.close !== null && r.close > 0)
      .sort((a,b) => a.date.localeCompare(b.date));
    const data = {
      symbol, provider: "Twelve Data", attribution: "Data provided by Twelve Data", interval: "1day", fetchedAt: new Date().toISOString(),
      values, note: "กราฟรายวันเป็นข้อมูลย้อนหลัง ไม่ใช่ราคาซื้อขายทันที"
    };
    historyCache.set(symbol, { data, expires: Date.now() + HISTORY_TTL_MS });
    return respond(data);
  }
  return respond({ error: "invalid_type", message: "รองรับ status, quotes และ history" }, 400);
}
