/* Technical studies calculated locally from daily OHLC bars, without extra API credits. */
(function () {
  'use strict';
  function ema(values, period) {
    const result=Array(values.length).fill(null);
    if(values.length<period)return result;
    let sum=0;
    for(let i=0;i<period;i++)sum+=values[i];
    result[period-1]=sum/period;
    const k=2/(period+1);
    for(let i=period;i<values.length;i++)result[i]=values[i]*k+result[i-1]*(1-k);
    return result;
  }
  function rsi(values, period=14) {
    const result=Array(values.length).fill(null);
    if(values.length<=period)return result;
    let avgGain=0,avgLoss=0;
    for(let i=1;i<=period;i++){
      const d=values[i]-values[i-1];
      avgGain+=Math.max(0,d);avgLoss+=Math.max(0,-d);
    }
    avgGain/=period;avgLoss/=period;
    const compute=()=>avgLoss===0?(avgGain===0?50:100):100-100/(1+avgGain/avgLoss);
    result[period]=compute();
    for(let i=period+1;i<values.length;i++){
      const d=values[i]-values[i-1];
      avgGain=(avgGain*(period-1)+Math.max(d,0))/period;
      avgLoss=(avgLoss*(period-1)+Math.max(-d,0))/period;
      result[i]=compute();
    }
    return result;
  }
  function studies(bars) {
    const closes=bars.map(b=>Number(b.close));
    const ema20=ema(closes,20),ema50=ema(closes,50);
    const fast=ema(closes,12),slow=ema(closes,26);
    const macd=closes.map((_,i)=>fast[i]==null||slow[i]==null?null:fast[i]-slow[i]);
    const validMacd=macd.filter(v=>v!==null);
    const sigDense=ema(validMacd,9),signal=Array(closes.length).fill(null);
    let offset=0;
    macd.forEach((v,i)=>{if(v!==null){signal[i]=sigDense[offset];offset++;}});
    const histogram=macd.map((v,i)=>v==null||signal[i]==null?null:v-signal[i]);
    return {ema20,ema50,rsi14:rsi(closes),macd,signal,histogram};
  }
  window.StockScopeIndicators={ema,rsi,studies};
})();
