/*
 * StockScope 3.0 — Twelve Data quotes, favorite watchlist and portfolio
 * valuation. OHLC / EMA / RSI / MACD are rendered client-side. The API key
 * remains exclusively in the Netlify Function.
 */
(function () {
  'use strict';
  const endpoint='/.netlify/functions/market-data';
  const quotes=new Map();
  const history=new Map();
  window.stockscopeQuoteCache=quotes;
  const quoteEl=document.getElementById('quoteWidget');
  const chartEl=document.getElementById('chartWidget');
  const apiStatus=document.getElementById('apiStatus');
  const watchStatus=document.getElementById('watchlistStatus');
  const portfolioStatus=document.getElementById('portfolioApiStatus');
  const chartStats=document.getElementById('chartStats');
  const refreshBtn=document.getElementById('refreshApiBtn');
  const watchBtn=document.getElementById('refreshWatchlistBtn');
  const portfolioBtn=document.getElementById('refreshPortfolioBtn');
  const ranges=[...document.querySelectorAll('#chartRanges [data-range]')];
  let requestToken=0,barSymbol='',bars=[],range=90;
  let loadingQuotes=null;
  let isRefreshing=false;
  const maxWatchlist=6,quoteTtl=180000,historyTtl=4*3600*1000;
  const fmt=n=>n==null||!Number.isFinite(Number(n))?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n));
  const signed=(n,suffix='')=>n==null||!Number.isFinite(Number(n))?'—':(Number(n)>0?'+':'')+Number(n).toFixed(2)+suffix;
  const n2=n=>n==null||!Number.isFinite(Number(n))?'—':Number(n).toFixed(2);
  const prettyTime=time=>{try{return new Date(time).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});}catch{return '—';}};
  async function callApi(params) {
    const url=new URL(endpoint,location.origin);
    Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,String(v)));
    const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(typeof data.message==='string'?data.message:'API HTTP '+response.status);
    return data;
  }
  function notice(root,message) {
    if(!root)return;
    root.replaceChildren();
    const p=document.createElement('p');p.className='api-notice';p.textContent=message;
    root.appendChild(p);
  }
  function getTicker() {return selected&&selected.ticker?selected.ticker:null;}
  function validQuote(q) {return q&&Number.isFinite(Number(q.last))&&Number(q.last)>0;}
  function getCached(symbol) {return quotes.get(symbol)||null;}
  function fresh(symbol){const q=getCached(symbol);return validQuote(q)&&Date.now()-q.receivedAt<quoteTtl;}
  function redrawShared() {
    if(typeof renderList==='function')renderList();
    if(typeof renderHoldings==='function')renderHoldings();
    renderSelectedQuote();
  }
  async function fetchQuotes(symbols,force=false) {
    const deduped=[...new Set(symbols.map(s=>String(s).toUpperCase()).filter(s=>/^[A-Z][A-Z0-9.-]{0,9}$/.test(s)))];
    const pending=deduped.filter(t=>force||!fresh(t)).slice(0,maxWatchlist);
    if(!pending.length){redrawShared();return {updated:0,skipped:0};}
    if(loadingQuotes) {
      try {await loadingQuotes;}catch(_){}
      return fetchQuotes(deduped,false);
    }
    let done=0;
    loadingQuotes=(async()=>{
      const data=await callApi({type:'quotes',symbols:pending.join(',')});
      for(const t of pending) {
        const q=data.quotes&&data.quotes[t];
        if(validQuote(q)){quotes.set(t,{...q,receivedAt:Date.now(),fetchedAt:data.fetchedAt||null});done++;}
      }
      redrawShared();
    })();
    try {await loadingQuotes;}finally{loadingQuotes=null;}
    return {updated:done,skipped:Math.max(0,deduped.length-pending.length)};
  }
  function favoriteList() {
    return [...favorites].filter(t=>stocks.some(s=>s.ticker===t));
  }
  function initialSymbols() {
    return [...new Set([getTicker(),...holdings.slice(0,2).map(h=>h.ticker),...favoriteList()].filter(Boolean))].slice(0,maxWatchlist);
  }
  function showSelectionMeta(ticker) {
    const q=getCached(ticker);
    if(!validQuote(q)){notice(quoteEl,'ยังไม่มีราคา '+ticker+' · คลิกรีเฟรชเพื่อขอข้อมูลจาก Twelve Data');return;}
    quoteEl.replaceChildren();
    const body=document.createElement('div');body.className='api-quote';
    const head=document.createElement('div');
    const price=document.createElement('div');price.className='api-price';price.textContent=fmt(q.last);
    const change=document.createElement('div');change.className='api-delta';
    change.textContent=(q.change==null?'—':signed(q.change))+' USD ('+signed(q.percentChange,'%')+')';
    change.classList.toggle('positive',q.change>0);change.classList.toggle('negative',q.change<0);
    const caption=document.createElement('div');caption.className='api-meta';
    caption.textContent='Twelve Data · ข้อมูลราคา '+(q.datetime||'ไม่ระบุเวลา')+' · ดึงข้อมูล '+prettyTime(q.receivedAt)+' · อาจล่าช้า';
    head.append(price,change,caption);
    const info=document.createElement('div');info.className='api-stats';
    for(const [name,value] of [['เปิด',q.open],['สูงสุด',q.high],['ต่ำสุด',q.low],['ปิดก่อนหน้า',q.previousClose]]) {
      const item=document.createElement('div');const key=document.createElement('span');const val=document.createElement('strong');
      key.textContent=name;val.textContent=fmt(value);item.append(key,val);info.appendChild(item);
    }
    body.append(head,info);quoteEl.appendChild(body);
  }
  function renderSelectedQuote(){const ticker=getTicker();if(ticker)showSelectionMeta(ticker);}
  function svgNode(tag,attrs={}) {
    const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));
    return e;
  }
  function svgText(svg,str,attrs={}) {
    const el=svgNode('text',attrs);el.textContent=str;svg.appendChild(el);return el;
  }
  function linePath(values,xx,yy,start) {
    let path='',drawing=false;
    for(let i=0;i<values.length;i++){
      const val=values[i+start];
      if(val==null||!Number.isFinite(val)){drawing=false;continue;}
      path+=(drawing?'L':'M')+xx(i).toFixed(2)+','+yy(val).toFixed(2)+' ';
      drawing=true;
    }
    return path.trim();
  }
  function plotLine(svg,values,xx,yy,start,color,width=2.2) {
    const d=linePath(values,xx,yy,start);
    if(d)svg.appendChild(svgNode('path',{d,fill:'none',stroke:color,'stroke-width':width,'stroke-linejoin':'round','stroke-linecap':'round'}));
  }
  function drawCandles() {
    if(!chartEl)return;
    chartEl.replaceChildren();
    if(!Array.isArray(bars)||bars.length<30) {
      notice(chartEl,'ยังไม่มีข้อมูลย้อนหลังเพียงพอสำหรับกราฟและ RSI/MACD');
      if(chartStats)chartStats.textContent='—';return;
    }
    const I=window.StockScopeIndicators;
    if(!I){notice(chartEl,'โหลดเครื่องมือวิเคราะห์ไม่ได้ กรุณารีเฟรชหน้าเว็บ');return;}
    const s=I.studies(bars);
    const offset=Math.max(0,bars.length-range);
    const values=bars.slice(offset);
    const W=1000,L=57,R=89,chartTop=34,chartBottom=348,rsiTop=384,rsiBottom=472,macdTop=502,macdBottom=596;
    const xx=i=>L+(i+(0.5))*(W-L-R)/values.length;
    const candleWidth=Math.max(1.8,Math.min(13,(W-L-R)/values.length*0.62));
    let lo=Math.min(...values.map(v=>v.low)),hi=Math.max(...values.map(v=>v.high));
    const pad=Math.max((hi-lo)*0.06,Math.abs(hi)*0.003,0.01);lo-=pad;hi+=pad;
    const py=price=>chartBottom-(price-lo)/(hi-lo)*(chartBottom-chartTop);
    const ry=value=>rsiBottom-value/100*(rsiBottom-rsiTop);
    const macdVals=[...s.macd.slice(offset),...s.signal.slice(offset),...s.histogram.slice(offset)].filter(x=>x!=null&&Number.isFinite(x));
    const mm=Math.max(0.00001,...macdVals.map(Math.abs))*1.2;
    const my=value=>(macdTop+macdBottom)/2-value/mm*(macdBottom-macdTop)/2;
    const svg=svgNode('svg',{viewBox:'0 0 1000 640',role:'img','aria-label':'กราฟแท่งเทียน ราคา EMA20 EMA50 RSI14 และ MACD ของ '+barSymbol});
    const grid=(y,x1=L,x2=W-R)=>svg.appendChild(svgNode('line',{x1,y1:y,x2,y2:y,stroke:'var(--line)','stroke-width':1}));
    for(let j=0;j<=4;j++){
      const price=lo+(hi-lo)*j/4,yy=py(price);
      grid(yy);svgText(svg,price.toFixed(price<5?3:2),{x:W-R+10,y:yy+5,fill:'var(--text2)','font-size':15});
    }
    svgText(svg,'ราคา / USD',{x:L,y:20,fill:'var(--text2)','font-size':17});
    values.forEach((v,i)=>{
      const x=xx(i),up=v.close>=v.open,color=up?'var(--accent)':'#f16a78';
      svg.appendChild(svgNode('line',{x1:x,x2:x,y1:py(v.high),y2:py(v.low),stroke:color,'stroke-width':1.2}));
      const top=Math.min(py(v.open),py(v.close)),height=Math.max(1.3,Math.abs(py(v.open)-py(v.close)));
      const rectangle=svgNode('rect',{x:x-candleWidth/2,y:top,width:candleWidth,height,fill:color,rx:0.5});
      const tip=svgNode('title');tip.textContent=v.date+' O '+n2(v.open)+' H '+n2(v.high)+' L '+n2(v.low)+' C '+n2(v.close);
      rectangle.appendChild(tip);svg.appendChild(rectangle);
    });
    plotLine(svg,s.ema20,xx,py,offset,'#73b9ff',2);
    plotLine(svg,s.ema50,xx,py,offset,'#ffbf69',2);
    grid(ry(70));grid(ry(30));
    svgText(svg,'RSI 14',{x:L,y:rsiTop-9,fill:'var(--text2)','font-size':17});
    svgText(svg,'70',{x:W-R+12,y:ry(70)+5,fill:'var(--text2)','font-size':15});
    svgText(svg,'30',{x:W-R+12,y:ry(30)+5,fill:'var(--text2)','font-size':15});
    plotLine(svg,s.rsi14,xx,ry,offset,'#b6a3ff',2.3);
    grid(my(0));
    svgText(svg,'MACD 12/26/9',{x:L,y:macdTop-9,fill:'var(--text2)','font-size':17});
    values.forEach((_,i)=>{
      const hist=s.histogram[i+offset];
      if(hist==null)return;
      const zero=my(0),end=my(hist);
      svg.appendChild(svgNode('rect',{x:xx(i)-candleWidth/2,y:Math.min(zero,end),width:candleWidth,height:Math.max(1,Math.abs(zero-end)),fill:hist>=0?'#3dad84':'#d56371',opacity:0.7}));
    });
    plotLine(svg,s.macd,xx,my,offset,'#73b9ff',2.1);
    plotLine(svg,s.signal,xx,my,offset,'#ffbf69',2.1);
    for(let k=0;k<=4;k++){
      const index=Math.min(values.length-1,Math.floor((values.length-1)*k/4));
      svgText(svg,values[index].date.slice(5),{x:xx(index),y:629,fill:'var(--text2)','font-size':16,'text-anchor':'middle'});
    }
    const shell=document.createElement('div');shell.className='api-chart';shell.appendChild(svg);
    const legend=document.createElement('div');legend.className='api-chart-legend';
    const recent=bars.length-1;
    legend.textContent='ล่าสุด '+bars[recent].date+' · EMA20 '+n2(s.ema20[recent])+' · EMA50 '+n2(s.ema50[recent])+' · RSI14 '+n2(s.rsi14[recent])+' · MACD '+n2(s.macd[recent])+' / Signal '+n2(s.signal[recent]);
    shell.appendChild(legend);chartEl.appendChild(shell);
    if(chartStats)chartStats.textContent='เขียวขึ้น · แดงลง · ข้อมูลรายวันจาก Twelve Data (อาจล่าช้า)';
  }
  async function loadHistory(ticker,token) {
    const cache=history.get(ticker);
    if(cache&&cache.expires>Date.now()) {
      if(token===requestToken){bars=cache.values;barSymbol=ticker;drawCandles();}
      return;
    }
    notice(chartEl,'กำลังโหลดกราฟแท่งเทียน '+ticker+'…');
    try {
      const data=await callApi({type:'history',symbol:ticker});
      if(!Array.isArray(data.values))throw Error('ไม่พบข้อมูลกราฟ');
      const safe=data.values.filter(v=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v.date)&&[v.open,v.high,v.low,v.close].every(n=>Number.isFinite(Number(n))&&Number(n)>0))
        .map(v=>({date:v.date,open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close),volume:Number(v.volume)||0}))
        .sort((a,b)=>a.date.localeCompare(b.date));
      history.set(ticker,{values:safe,expires:Date.now()+historyTtl});
      if(token===requestToken){bars=safe;barSymbol=ticker;drawCandles();}
    }catch(err){if(token===requestToken){notice(chartEl,'กราฟ '+ticker+': '+err.message);if(chartStats)chartStats.textContent='—';}}
  }
  async function loadSelection() {
    const ticker=getTicker();
    if(!ticker)return;
    const token=++requestToken;
    renderSelectedQuote();
    const job=(!fresh(ticker)?fetchQuotes([ticker]):Promise.resolve());
    job.then(()=>{if(token===requestToken)renderSelectedQuote();}).catch(err=>{if(token===requestToken)notice(quoteEl,'ราคา '+ticker+': '+err.message);});
    await loadHistory(ticker,token);
  }
  async function loadWatchlist(mode='watchlist') {
    const desired=mode==='portfolio'
      ?[...new Set([...holdings.map(h=>h.ticker),getTicker()].filter(Boolean))].slice(0,maxWatchlist)
      :initialSymbols();
    const el=mode==='portfolio'?portfolioStatus:watchStatus;
    if(el)el.textContent='กำลังดึงราคา '+desired.length+' ตัว…';
    if(!desired.length){if(el)el.textContent='ยังไม่มีหุ้นสำหรับดึงราคา';return;}
    try {
      const result=await fetchQuotes(desired);
      if(el)el.textContent='ข้อมูล API '+desired.filter(t=>validQuote(getCached(t))).length+'/'+desired.length+' ตัว · อาจล่าช้า · สูงสุด 6 ตัวต่อรอบ';
      if(mode==='portfolio'&&holdings.length>maxWatchlist&&el)el.textContent+=' · หุ้นที่เหลือใช้ราคาที่กรอกเอง';
      if(result.updated===0&&desired.some(t=>!fresh(t))&&el)el.textContent+=' · บางตัวไม่มีข้อมูล';
    }catch(err){if(el)el.textContent='ดึงราคาไม่ได้: '+err.message;}
  }
  async function checkStatus() {
    if(apiStatus)apiStatus.textContent='กำลังตรวจสอบ API…';
    try {
      const data=await callApi({type:'status'});
      if(apiStatus){
        apiStatus.textContent=data.configured?'● พบ API Key บน Netlify (ยังต้องตรวจว่าดึงราคาได้)':'● ยังไม่พบ API Key บน Netlify';
        apiStatus.dataset.ready=data.configured?'true':'false';
      }
    }catch(err){if(apiStatus)apiStatus.textContent='● ตรวจสอบ API ไม่ได้: '+err.message;}
  }
  function refreshPortfolioValues(){if(typeof renderHoldings==='function')renderHoldings();}
  window.stockscopeApiRefresh=()=>{void loadSelection();};
  window.stockscopePortfolioChanged=()=>{refreshPortfolioValues();void loadWatchlist('portfolio');};
  if(refreshBtn)refreshBtn.addEventListener('click',()=>{void checkStatus();void loadSelection();});
  if(watchBtn)watchBtn.addEventListener('click',()=>{void loadWatchlist('watchlist');});
  if(portfolioBtn)portfolioBtn.addEventListener('click',()=>{void loadWatchlist('portfolio');});
  ranges.forEach(btn=>btn.addEventListener('click',()=>{
    range=Number(btn.dataset.range);
    ranges.forEach(b=>b.classList.toggle('active',b===btn));
    if(bars.length)drawCandles();
  }));
  void checkStatus();
  void loadWatchlist('watchlist').then(()=>loadSelection()).catch(()=>loadSelection());
})();
