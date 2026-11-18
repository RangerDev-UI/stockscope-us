/*
 * StockScope 2.2 — market data viewer
 * Quotes and daily bars are retrieved via Netlify Function; the Twelve Data
 * key stays on Netlify and is never sent to this browser script.
 */
(function () {
  'use strict';
  const endpoint='/.netlify/functions/market-data';
  const quoteEl=document.getElementById('quoteWidget');
  const chartEl=document.getElementById('chartWidget');
  const statusEl=document.getElementById('apiStatus');
  const reloadBtn=document.getElementById('refreshApiBtn');
  const rangeBtns=[...document.querySelectorAll('#chartRanges button')];
  let currentTicker='',requestToken=0,currentBars=[],dayRange=260;
  const quoteCache=new Map();
  const historyCache=new Map();
  const usd=n=>n==null||!Number.isFinite(Number(n))?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n));
  const percent=n=>n==null||!Number.isFinite(Number(n))?'—':(Number(n)>0?'+':'')+Number(n).toFixed(2)+'%';
  function showText(root,message) {
    root.replaceChildren();
    const paragraph=document.createElement('p');
    paragraph.className='api-notice';
    paragraph.textContent=message;
    root.appendChild(paragraph);
  }
  async function api(params) {
    const url=new URL(endpoint,location.origin);
    for(const [name,value] of Object.entries(params))url.searchParams.set(name,String(value));
    const response=await fetch(url.toString(),{headers:{Accept:'application/json'},cache:'no-store'});
    let data={};
    try { data=await response.json(); }catch(_) {}
    if(!response.ok)throw Error(data.message||'API ตอบ HTTP '+response.status);
    return data;
  }
  async function checkStatus() {
    if(!statusEl)return;
    statusEl.textContent='กำลังตรวจสอบ API…';
    try {
      const result=await api({type:'status'});
      statusEl.textContent=result.configured?'● Netlify พบ Twelve Data API Key แล้ว':'● Netlify ยังไม่พบ API Key — ตั้งค่า TWELVE_DATA_API_KEY และ Deploy ใหม่';
      statusEl.dataset.ready=result.configured?'true':'false';
    } catch(err) {
      statusEl.textContent='● ตรวจสอบไม่ได้: '+err.message;
      statusEl.dataset.ready='false';
    }
  }
  function svgEl(name,attrs={}) {
    const element=document.createElementNS('http://www.w3.org/2000/svg',name);
    Object.entries(attrs).forEach(([k,v])=>element.setAttribute(k,String(v)));
    return element;
  }
  function drawChart() {
    if(!chartEl)return;
    chartEl.replaceChildren();
    const values=currentBars.slice(-dayRange).filter(d=>d&&Number.isFinite(Number(d.close))&&Number(d.close)>0);
    if(values.length<2){showText(chartEl,'ไม่มีข้อมูลราคาย้อนหลังสำหรับกราฟช่วงนี้');return;}
    const prices=values.map(d=>Number(d.close));
    const low=Math.min(...prices),high=Math.max(...prices);
    const pad=Math.max((high-low)*.09,high*.003,0.01);
    const ymin=low-pad,ymax=high+pad;
    const X=i=>15+i*(885/Math.max(1,values.length-1));
    const Y=p=>20+(ymax-p)/(ymax-ymin)*270;
    const svg=svgEl('svg',{viewBox:'0 0 1000 325',preserveAspectRatio:'none',role:'img','aria-label':'กราฟราคาปิด '+currentTicker});
    for(let i=0;i<=4;i++){
      const price=ymax-(ymax-ymin)*i/4;
      const yy=Y(price);
      svg.appendChild(svgEl('line',{x1:15,x2:900,y1:yy,y2:yy,stroke:'var(--line)','stroke-width':1}));
      const label=svgEl('text',{x:910,y:yy+6,fill:'var(--text2)','font-size':18});
      label.textContent=price.toFixed(2);svg.appendChild(label);
    }
    let d='';
    prices.forEach((price,i)=>{d+=(i===0?'M':'L')+X(i).toFixed(2)+','+Y(price).toFixed(2)+' ';});
    svg.appendChild(svgEl('path',{d,fill:'none',stroke:'var(--accent)','stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round'}));
    const holder=document.createElement('div');holder.className='api-chart';
    holder.appendChild(svg);
    const caption=document.createElement('div');caption.className='api-chart-label';
    const start=document.createElement('span');start.textContent=values[0].date;
    const end=document.createElement('span');end.textContent=values[values.length-1].date+' · '+usd(values[values.length-1].close);
    caption.append(start,end);holder.appendChild(caption);
    chartEl.appendChild(holder);
  }
  function displayQuote(q) {
    quoteEl.replaceChildren();
    const container=document.createElement('div');container.className='api-quote';
    const primary=document.createElement('div');
    const value=document.createElement('div');value.className='api-price';value.textContent=usd(q.last);
    const delta=document.createElement('div');delta.className='api-delta';
    const change=q.change;
    delta.textContent=(change==null?'—':(change>0?'+':'')+usd(change))+' ('+percent(q.percentChange)+')';
    delta.classList.toggle('positive',change>0);delta.classList.toggle('negative',change<0);
    const meta=document.createElement('div');meta.className='api-meta';
    meta.textContent='Twelve Data · '+(q.currency||'USD')+' · เวลาในข้อมูลราคา: '+(q.datetime||'ไม่ระบุ')+' · อาจล่าช้า';
    primary.append(value,delta,meta);
    const stats=document.createElement('div');stats.className='api-stats';
    for(const [label,v] of [['เปิด',q.open],['สูงสุด',q.high],['ต่ำสุด',q.low],['ปิดก่อนหน้า',q.previousClose]]) {
      const stat=document.createElement('div'),name=document.createElement('span'),number=document.createElement('strong');
      name.textContent=label;number.textContent=usd(v);
      stat.append(name,number);stats.appendChild(stat);
    }
    container.append(primary,stats);quoteEl.appendChild(container);
  }
  async function loadQuote(ticker,token,force) {
    showText(quoteEl,'กำลังโหลดราคา '+ticker+' จาก Twelve Data…');
    try {
      let q=quoteCache.get(ticker);
      if(force||!q||q.expires<Date.now()){
        const data=await api({type:'quotes',symbols:ticker});
        q=data.quotes&&data.quotes[ticker];
        if(!q)throw Error('ไม่พบราคาหุ้นหรือแพ็กเกจ API ไม่รองรับ '+ticker);
        quoteCache.set(ticker,{...q,expires:Date.now()+120000});
      }
      if(token===requestToken)displayQuote(q);
    } catch(err){
      if(token===requestToken)showText(quoteEl,'ราคาหุ้น '+ticker+': '+err.message);
    }
  }
  async function loadChart(ticker,token,force) {
    showText(chartEl,'กำลังโหลดกราฟรายวันของ '+ticker+'…');
    try {
      let info=historyCache.get(ticker);
      if(force||!info||info.expires<Date.now()){
        info=await api({type:'history',symbol:ticker});
        historyCache.set(ticker,{...info,expires:Date.now()+900000});
      }
      if(token!==requestToken)return;
      currentBars=Array.isArray(info.values)?info.values:[];drawChart();
    } catch(err){
      if(token===requestToken)showText(chartEl,'กราฟหุ้น '+ticker+': '+err.message);
    }
  }
  function refresh(force=false) {
    const ticker=selected&&selected.ticker;
    if(!ticker)return;
    currentTicker=ticker;
    const token=++requestToken;
    loadQuote(ticker,token,force);
    loadChart(ticker,token,force);
  }
  window.stockscopeApiRefresh=()=>refresh(false);
  rangeBtns.forEach(button=>button.addEventListener('click',()=>{
    dayRange=Number(button.dataset.range);
    rangeBtns.forEach(b=>b.classList.toggle('active',b===button));
    if(currentBars.length)drawChart();
  }));
  if(reloadBtn)reloadBtn.addEventListener('click',()=>{
    checkStatus();refresh(true);
  });
  checkStatus();
  refresh();
})();
