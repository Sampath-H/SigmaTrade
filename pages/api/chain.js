// pages/api/chain.js
const NSE_SYMBOL = {'NSE_INDEX|Nifty 50':'NIFTY','NSE_INDEX|Nifty Bank':'BANKNIFTY','NSE_INDEX|Nifty Fin Service':'FINNIFTY','NSE_INDEX|Nifty MidCap Select':'MIDCPNIFTY'};
const LOT_SIZE = {'NSE_INDEX|Nifty 50':75,'NSE_INDEX|Nifty Bank':30,'NSE_INDEX|Nifty Fin Service':65,'NSE_INDEX|Nifty MidCap Select':120,'BSE_INDEX|SENSEX':20,'BSE_INDEX|BANKEX':30};
function cookieHeaderFromResponse(resp){const getSetCookie=resp?.headers?.getSetCookie;if(typeof getSetCookie==='function'){const arr=getSetCookie();if(Array.isArray(arr)&&arr.length)return arr.map(c=>c.split(';')[0].trim()).filter(Boolean).join('; ');}const raw=resp?.headers?.get('set-cookie')||'';if(!raw)return'';return raw.split(/,(?=[^;,]+=[^;,]+)/).map(c=>c.split(';')[0].trim()).filter(Boolean).join('; ');}
function _s(d,k,dv=0){const v=d?.[k];return(v!==null&&v!==undefined)?parseFloat(v)||dv:dv;}
function fmtDate(d){try{const m={Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};const[day,mon,year]=d.split('-');if(m[mon])return`${year}-${m[mon]}-${day.padStart(2,'0')}`;return new Date(d).toISOString().split('T')[0];}catch{return d;}}
function nse_parse_option_chain(nse_data,instrument_key,expiry_date){
  if(!nse_data)return{data:[],spot:0,expiries:[]};
  const lot=LOT_SIZE[instrument_key]||75;
  const records=nse_data.records||{},filtered=nse_data.filtered||{};
  const spot=parseFloat(records.underlyingValue||filtered.underlyingValue||0);
  const expiries=(records.expiryDates||[]).map(fmtDate);
  const targetExpiry=fmtDate(expiry_date||'');
  const allRows=records.data||[],filteredRows=filtered.data||[];
  const symbolCode=(NSE_SYMBOL[instrument_key]||'NIFTY').replace('NIFTY 50','NIFTY');
  const byStrike={};
  for(const row of allRows){const K=parseFloat(row.strikePrice),exp=fmtDate(row.expiryDate||'');if(!byStrike[K])byStrike[K]={};if(!byStrike[K][exp])byStrike[K][exp]={ce:row.CE||{},pe:row.PE||{}};}
  for(const row of filteredRows){const K=parseFloat(row.strikePrice),exp=fmtDate(row.expiryDate||'');if(!byStrike[K])byStrike[K]={};if(!byStrike[K][exp]){byStrike[K][exp]={ce:row.CE||{},pe:row.PE||{}};}else{const prev=byStrike[K][exp],fce=row.CE||{},fpe=row.PE||{};byStrike[K][exp]={ce:{...prev.ce,...Object.fromEntries(Object.entries(fce).filter(([,v])=>v!==undefined&&v!==null&&v!==0&&v!==''))},pe:{...prev.pe,...Object.fromEntries(Object.entries(fpe).filter(([,v])=>v!==undefined&&v!==null&&v!==0&&v!==''))}};}}
  const data=[];
  for(const K of Object.keys(byStrike).map(Number).sort((a,b)=>a-b)){
    const expData=byStrike[K];if(!expData)continue;
    const selectedExpiry=(targetExpiry&&expData[targetExpiry])?targetExpiry:Object.keys(expData)[0];
    if(!selectedExpiry)continue;
    const{ce,pe}=expData[selectedExpiry];
    const ceOI=_s(ce,'openInterest')*lot,ceOIChgPct=_s(ce,'pchangeinOpenInterest'),cePrevOI=(ceOIChgPct!==0&&ceOI>0)?ceOI/(1+ceOIChgPct/100):ceOI;
    const peOI=_s(pe,'openInterest')*lot,peOIChgPct=_s(pe,'pchangeinOpenInterest'),pePrevOI=(peOIChgPct!==0&&peOI>0)?peOI/(1+peOIChgPct/100):peOI;
    data.push({strike_price:K,
      call_options:{instrument_key:ce.identifier||`NSE_FO|${symbolCode}${Math.round(K)}CE`,market_data:{ltp:_s(ce,'lastPrice'),oi:ceOI,prev_oi:cePrevOI,volume:_s(ce,'totalTradedVolume'),close_price:_s(ce,'prevClose'),lot_size:lot},option_greeks:{iv:_s(ce,'impliedVolatility'),delta:_s(ce,'delta'),theta:_s(ce,'theta'),gamma:_s(ce,'gamma'),vega:_s(ce,'vega')}},
      put_options:{instrument_key:pe.identifier||`NSE_FO|${symbolCode}${Math.round(K)}PE`,market_data:{ltp:_s(pe,'lastPrice'),oi:peOI,prev_oi:pePrevOI,volume:_s(pe,'totalTradedVolume'),close_price:_s(pe,'prevClose'),lot_size:lot},option_greeks:{iv:_s(pe,'impliedVolatility'),delta:_s(pe,'delta'),theta:_s(pe,'theta'),gamma:_s(pe,'gamma'),vega:_s(pe,'vega')}}});
  }
  return{data,spot,expiries};
}
async function nse_fetch_option_chain(sym){
  const h={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36','Accept':'application/json, text/plain, */*','Accept-Language':'en-US,en;q=0.9','Referer':'https://www.nseindia.com/'};
  const home=await fetch('https://www.nseindia.com',{headers:{...h,Accept:'text/html,application/xhtml+xml'}});
  const cookies=cookieHeaderFromResponse(home);
  await fetch('https://www.nseindia.com/option-chain',{headers:{...h,Cookie:cookies,Accept:'text/html'}});
  const r=await fetch(`https://www.nseindia.com/api/option-chain-indices?symbol=${sym}`,{headers:{...h,Cookie:cookies}});
  if(!r.ok)throw new Error(`NSE ${r.status}`);
  return r.json();
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const token=req.headers.authorization?.replace('Bearer ','');
  const{instrument_key,expiry_date}=req.query;
  if(!instrument_key||!expiry_date)return res.status(400).json({error:'Missing params'});
  if(instrument_key.startsWith('BSE_INDEX')&&(!token||token==='MOCK_TOKEN'))
    return res.json({source:'unavailable',data:[],message:'BSE option chain requires Upstox token.'});
  if(token&&token!=='MOCK_TOKEN'){
    try{
      const r=await fetch(`https://api.upstox.com/v2/option/chain?instrument_key=${encodeURIComponent(instrument_key)}&expiry_date=${expiry_date}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
      if(r.ok){const d=await r.json();const data=d.data||[];if(data.length>0)return res.json({source:'upstox',data});}
    }catch(e){console.error('Upstox chain exception:',e.message);}
  }
  const sym=NSE_SYMBOL[instrument_key];
  if(sym){
    try{
      const nse_raw=await nse_fetch_option_chain(sym);
      const parsed=nse_parse_option_chain(nse_raw,instrument_key,expiry_date);
      if(parsed.data.length>0)return res.json({source:'nse',data:parsed.data,spot:parsed.spot,expiries:parsed.expiries});
    }catch(e){console.error('NSE chain error:',e.message);}
  }
  return res.status(502).json({error:'Could not load option chain.',source:'none',data:[]});
}
