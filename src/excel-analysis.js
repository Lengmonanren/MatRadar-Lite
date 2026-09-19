/* Browser-local parsing and deterministic research. Also testable in Node. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MatRadarAnalysis=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const names={SOX:'费城半导体',SEMI:'申万半导体',MATERIAL:'申万半导体材料',DXI:'DXI',DRAM:'DRAM',NAND:'NAND',PACK_IMPORT:'进口金额',PACK_EXPORT:'出口金额'};
 const schemas={Market:{sox:'SOX',semiconductor:'SEMI',material_index:'MATERIAL'},Memory:{dxi:'DXI',dram:'DRAM',nand:'NAND'},Trade:{import_value:'PACK_IMPORT',export_value:'PACK_EXPORT'}};
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 function dateISO(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;const d=new Date(v+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v?v:null;}
 function shiftDays(v,n){const d=new Date(v+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
 function shiftMonths(v,n){const d=new Date(v+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);}
 function excelDate(value,XLSX,date1904){if(typeof value==='string')return dateISO(value.trim());if(!finite(value))return null;const d=XLSX.SSF.parse_date_code(value,{date1904});if(!d)return null;return dateISO(`${String(d.y).padStart(4,'0')}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`);}
 function parseWorkbook(wb,XLSX){
  const series=Object.fromEntries(Object.keys(names).map(id=>[id,[]])),issues=[],counts={};
  const warn=(kind,where)=>{counts[kind]=(counts[kind]||0)+1;if(issues.length<12)issues.push(where+'：'+kind);};
  const date1904=!!(wb.Workbook&&wb.Workbook.WBProps&&wb.Workbook.WBProps.date1904);
  function add(sheet,row,dateCell,valueCell,id,legacy=false){
   const d=excelDate(dateCell&&dateCell.v,XLSX,date1904),v=valueCell&&valueCell.v;
   if(!d){if(dateCell&&dateCell.v!==undefined)warn('日期无效',sheet+'第'+row+'行');return;}
   if(v===undefined||v===null||v===''){warn('空值已跳过',sheet+'第'+row+'行');return;}
   if(!finite(v)||(/%/.test(valueCell.z||''))||v<0||(!id.startsWith('PACK_')&&v===0)){warn('非有效原始数值已隔离',sheet+'第'+row+'行');return;}
   series[id].push({date:d,value:v});
  }
  function rows(sheet){const ref=sheet['!ref'];if(!ref)return 0;const range=XLSX.utils.decode_range(ref);if(range.e.r>100000||range.e.c>200)throw Error('表格过大，请只保留研究所需数据（每表最多100000行、201列）。');return range.e.r+1;}
  const standard=Object.keys(schemas).some(n=>wb.Sheets[n]);let mode='standard';let meta={};
  if(standard){
   if(wb.Sheets.Meta){const sh=wb.Sheets.Meta;if(sh.A1?.v!=='field'||sh.B1?.v!=='value')throw Error('Meta表第一行必须是field、value。');for(let r=2;r<=rows(sh);r++){const k=sh['A'+r]?.v,v=sh['B'+r]?.v;if(typeof k==='string'&&typeof v==='string')meta[k]=v.slice(0,200);}}
   const requiredUnits={Market:[['market_unit','index']],Memory:[['dram_unit','USD'],['nand_unit','USD']],Trade:[['trade_unit','USD_10k']]};
   for(const [sheet,fields] of Object.entries(schemas)){
    const sh=wb.Sheets[sheet];if(!sh){warn('未提供该模块',sheet);continue;}
    let badUnit=false;for(const [key,unit] of requiredUnits[sheet]){if(meta[key]&&meta[key]!==unit){warn('单位不兼容，模块已隔离',sheet);badUnit=true;}else if(!meta[key])warn('未声明单位，按标准模板'+unit+'解释',sheet);}
    if(badUnit)continue;
    const count=rows(sh),head={};for(let c=0;c<=XLSX.utils.decode_range(sh['!ref']||'A1').e.c;c++){const v=sh[XLSX.utils.encode_cell({r:0,c})]?.v;if(typeof v==='string'){if(head[v]!==undefined)throw Error(sheet+'存在重复字段名');head[v]=c;}}
    if(head.date===undefined){warn('缺少date字段，模块已隔离',sheet);continue;}
    for(const [field,id] of Object.entries(fields)){if(head[field]===undefined){warn('缺少字段'+field,sheet);continue;}for(let r=1;r<count;r++)add(sheet,r+1,sh[XLSX.utils.encode_cell({r,c:head.date})],sh[XLSX.utils.encode_cell({r,c:head[field]})],id);}
   }
  }else throw Error('暂无法识别该Excel结构，请使用MatRadar标准模板。');
  for(const [id,observations] of Object.entries(series)){
   if(observations.some((p,i)=>i&&p.date<observations[i-1].date))warn('日期已升序排序',names[id]);
   const grouped=new Map();for(const p of observations){if(!grouped.has(p.date))grouped.set(p.date,[]);grouped.get(p.date).push(p.value);}
   series[id]=[...grouped].sort(([a],[b])=>a.localeCompare(b)).flatMap(([date,values])=>{if(new Set(values).size>1){warn('冲突重复日期已隔离',names[id]+' '+date);return [];}if(values.length>1)warn('相同重复日期已合并',names[id]+' '+date);return [{date,value:values[0]}];});
  }
  const dates=[...new Set(Object.values(series).flat().map(p=>p.date))].sort();
  if(!dates.length)throw Error('未找到有效数据，请核对日期、数值及模板单位。');
  return {series,dates,mode,name:meta.dataset_name||'用户上传研究数据',sample:/\bSAMPLE\b/i.test((meta.sample||'')+' '+(meta.dataset_name||'')),issues,counts};
 }
 function quickDate(dataset,kind){const end=dataset.dates.at(-1),target=kind==='week'?shiftDays(end,-7):kind==='month'?shiftMonths(end,-1):end;return dataset.dates.filter(d=>d<=target).at(-1)||null;}
 function change(series,target,latest){const base=series.filter(p=>p.date<=target).at(-1);return base&&base.value>0&&base.date<latest.date?{value:(latest.value/base.value-1)*100,date:base.date}:null;}
 function metricsFor(series,asof,monthly=false){
  const g=series.filter(p=>p.date<=asof);if(!g.length)return null;const last=g.at(-1);const m={latest:last.value,date:last.date,age_days:Math.round((new Date(asof)-new Date(last.date))/86400000)};
  if(monthly){
   const byMonth=new Map();for(const p of g){const month=p.date.slice(0,7);if(!byMonth.has(month))byMonth.set(month,[]);byMonth.get(month).push(p);}
   const months=[...byMonth].filter(([,p])=>new Set(p.map(x=>x.value)).size===1).map(([month,p])=>({month,...p.at(-1)}));
   if(!months.length)return null;const latest=months.at(-1);Object.assign(m,{latest:latest.value,date:latest.date});
   for(const [key,n] of [['mom',-1],['yoy',-12]]){const base=months.find(p=>p.month===shiftMonths(latest.date,n).slice(0,7));m[key]=base&&base.value>0?(latest.value/base.value-1)*100:null;}
   m.conflicting_months=byMonth.size-months.length;return m;
  }
  for(const [key,target] of [['wow',shiftDays(asof,-7)],['four_week',shiftDays(asof,-28)],['three_month',shiftMonths(asof,-3)]]){const c=change(g,target,last);m[key]=c?c.value:null;m[key+'_base_date']=c?c.date:null;}
  const window=g.filter(p=>p.date>=shiftMonths(asof,-3));const values=window.map(p=>p.value);m.high=values.length?Math.max(...values):null;m.low=values.length?Math.min(...values):null;m.from_high=m.high===null?null:(last.value/m.high-1)*100;m.from_low=m.low===null?null:(last.value/m.low-1)*100;
  // Remove floating-point noise only at the classification threshold, not from source data.
  const trendValue=m.four_week===null?null:Math.round(m.four_week*1e10)/1e10;
  m.trend=trendValue===null?null:trendValue>2?'UP':trendValue< -2?'DOWN':'FLAT';return m;
 }
 const pct=(v,d=2)=>finite(v)?(v>=0?'+':'')+v.toFixed(d)+'%':'数据不足';
 const available=m=>Object.keys(m).filter(k=>m[k]);
 function marketState(m){const vals=available(m).map(k=>m[k].wow).filter(finite);return !vals.length?'比较基期不足':vals.every(v=>v>0)?'整体上涨':vals.every(v=>v<0)?'整体下跌':vals.every(v=>v===0)?'整体持平':'走势分化';}
 function generateMarketAnalysis(m){
  const ids=available(m);if(!ids.length)return '当前Excel未提供市场数据，不能据此判断板块表现。';
  const state=marketState(m),rank=ids.filter(k=>finite(m[k].wow)).sort((a,b)=>m[b].wow-m[a].wow);let compare='部分指数或比较基期不足，暂不形成完整强弱排序。';
  if(finite(m.MATERIAL?.wow)&&finite(m.SEMI?.wow))compare=m.MATERIAL.wow>m.SEMI.wow?'材料指数周度表现领先半导体整体，板块内部弹性更强。':m.MATERIAL.wow<m.SEMI.wow?'材料指数周度表现落后半导体整体，板块内部弹性偏弱。':'材料指数与半导体整体的周度变化基本一致。';
  const x=m.MATERIAL||m.SEMI||m[ids[0]];const horizon=finite(x.three_month)&&finite(x.wow)?x.wow>0&&x.three_month<0?'短期反弹但中期仍偏弱，修复的持续性尚需观察。':x.wow<0&&x.three_month>0?'短期回落但中期趋势仍强，应区分波动与趋势反转。':'短期变化与中期趋势仍需结合，避免单一窗口判断。':'中期比较基期尚不充分，不能外推趋势。';
  return `截至分析日，有效市场指数${state}，${rank.length?names[rank[0]]+'周变化'+pct(m[rank[0]].wow)+'相对领先。':'周度比较数据尚不足。'}${compare}${names[m.MATERIAL?'MATERIAL':m.SEMI?'SEMI':ids[0]]}近4周${pct(x.four_week)}。${horizon}指数表现主要反映市场定价，不直接代表材料企业订单或盈利同步变化。`;
 }
 function coMovement(m){return !m.DXI||!m.DRAM||!m.DXI.trend||!m.DRAM.trend?'数据不足':m.DXI.trend==='UP'&&m.DRAM.trend==='UP'?'同步改善':m.DXI.trend==='DOWN'&&m.DRAM.trend==='DOWN'?'同步走弱':'走势分化';}
 function generateMemoryAnalysis(m){
  if(!m.DXI&&!m.DRAM)return '当前Excel未提供DXI或DRAM数据，不能判断存储价格共振。';
  const co=coMovement(m),fact=['DXI','DRAM'].filter(id=>m[id]).map(id=>`${id}周变化${pct(m[id].wow,id==='DXI'?3:2)}、4周${pct(m[id].four_week)}`).join('；');
  return `存储价格端${co}。${fact}。该判断以4周趋势为主，周度波动用于识别短期节奏，缺少基期时不补算。传统DRAM/DXI价格变化不能直接等同于HBM需求变化，仍需结合HBM出货及存储厂商产能配置验证。`;
 }
 function nandState(m){if(!m)return '数据不足';if(!finite(m.wow)||!finite(m.four_week))return '比较基期不足';const four=Math.round(m.four_week*1e10)/1e10;return Math.abs(m.wow)<=0.5&&(four< -2||m.three_month< -2)?'阶段企稳':m.wow>0&&four>2?'持续上涨':m.wow<0&&four>2?'冲高回落':m.wow<0&&four< -2?'持续下行':'震荡';}
 function generateNandAnalysis(m){if(!m)return '当前Excel未提供NAND数据。';return `NAND呈${nandState(m)}特征，周变化${pct(m.wow)}、4周${pct(m.four_week)}、3月${pct(m.three_month)}。这反映所提供规格的现货走势，短期与中期方向应分别观察，不能据此代表全部存储需求；最后观察为${m.date}，未延伸报价。`;}
 function generateTradeAnalysis(m){
  if(!m.PACK_IMPORT&&!m.PACK_EXPORT)return '当前Excel未提供进出口数据。';
  const facts=['PACK_IMPORT','PACK_EXPORT'].filter(id=>m[id]).map(id=>`${names[id]}环比${pct(m[id].mom)}、${finite(m[id].yoy)?'同比'+pct(m[id].yoy):'同比数据不足'}`).join('；');
  const i=m.PACK_IMPORT,e=m.PACK_EXPORT;const compare=i&&e&&i.latest>0&&i.date.slice(0,7)===e.date.slice(0,7)?`出口规模约为进口的${(e.latest/i.latest*100).toFixed(1)}%。`:'进出口月份或数值不齐，暂不比较规模。';
  const boundary=!i?'进口数据尚未提供，不能由出口变化反推进口或国产替代。需要结合国内企业出货、库存与客户验证进一步判断，并区分数量与价格因素。':!finite(i.mom)&&!finite(i.yoy)?'进口比较基期不足，暂不能判断方向。需要结合下游需求、库存及月份因素，并与国内企业出货和客户验证交叉核对，不能单独判断国产替代。':((finite(i.mom)&&i.mom<0)||(finite(i.yoy)&&i.yoy<0))?'进口下降也可能受到下游需求、库存及月份因素影响，需要结合国内企业出货与客户验证进一步判断，不能直接认定国产替代成功。':'进口增长或平稳仍可能受需求回补、库存及月份因素影响，需要结合国内企业出货与客户验证判断，不能直接推导材料订单或国产替代进程。';
  return `${facts}。${compare}贸易金额还受价格和商品结构影响。${boundary}`;
 }
 function generateWeeklyView(market,memory,nand,trade){
  const state=marketState(market),co=coMovement(memory),n=nandState(nand);
  const opening=available(market).length?`资本市场方面，已提供指数${state}，板块定价与材料端基本面需要分开考察。`:'当前未提供有效市场指数，无法判断风险偏好或板块相对强弱。';
  const memoryText=available(memory).length?`存储端按4周趋势呈${co}，NAND为${n}，应区分周度节奏和中期方向，避免用单一价格窗口确认全面复苏。`:'存储数据未提供，无法据此验证需求变化，缺失本身也不代表需求走弱。';
  const i=trade.PACK_IMPORT,e=trade.PACK_EXPORT;
  const tradeText=i||e?`贸易端${i?'进口同比'+pct(i.yoy):'进口数据不足'}，${e?'出口同比'+pct(e.yoy):'出口数据不足'}，进出口金额变化还可能来自价格、库存和月份扰动。`:'封装材料进出口数据未提供，贸易渠道暂不能为国产替代判断提供证据。';
  return opening+memoryText+tradeText+'综合来看，现有数据适合识别市场与产业信号是否一致，尚不足以直接推导材料企业盈利。传统存储价格向HBM、先进封装扩产和材料订单的传导，还取决于产品结构、产能配置及客户认证。后续应沿材料规格升级、客户验证、小批量出货到收入贡献逐层核实，并与国内厂商实际出货交叉验证。对基期不足或观察滞后的指标，应保留判断边界，不把缺失值当作平稳信号。';
 }
 function chart(series,ids,asof,normalized=false){
  let start=shiftMonths(asof,-12);const groups=ids.filter(id=>series[id]?.some(p=>p.date<=asof&&p.date>=start));
  if(normalized&&groups.length){let common=new Set(series[groups[0]].filter(p=>p.date>=start&&p.date<=asof).map(p=>p.date));for(const id of groups.slice(1)){const dates=new Set(series[id].map(p=>p.date));common=new Set([...common].filter(d=>dates.has(d)));}if(!common.size)return {series:[],start,end:asof,normalized,reason:'所选系列没有共同有效起点，无法指数化比较。'};start=[...common].sort()[0];}
  return {start,end:asof,normalized,series:groups.map(id=>{const g=series[id].filter(p=>p.date>=start&&p.date<=asof);return {name:names[id],dates:g.map(p=>p.date),values:g.map(p=>normalized?p.value/g[0].value*100:p.value)};})};
 }
 function analyze(dataset,asof){
  if(!dateISO(asof))throw Error('请选择有效分析日期。');
  const cleanSeries=Object.fromEntries(Object.keys(names).map(id=>[id,(dataset.series[id]||[]).filter(p=>p.date<=asof)]));const monthWarnings=[];
  for(const id of ['PACK_IMPORT','PACK_EXPORT']){const byMonth=new Map();for(const p of cleanSeries[id]){const key=p.date.slice(0,7);if(!byMonth.has(key))byMonth.set(key,[]);byMonth.get(key).push(p);}cleanSeries[id]=[...byMonth].flatMap(([month,values])=>{if(new Set(values.map(p=>p.value)).size>1){monthWarnings.push(names[id]+month+'存在同月冲突，指标和图表均已隔离。');return [];}return [values.at(-1)];});}
  const metrics={};for(const id of Object.keys(names)){const m=metricsFor(cleanSeries[id],asof,id.startsWith('PACK_'));if(m)metrics[id]=m;}
  if(!Object.keys(metrics).length)throw Error('所选日期之前没有有效数据，请选择较晚的分析日期。');
  const pick=ids=>Object.fromEntries(ids.filter(id=>metrics[id]).map(id=>[id,metrics[id]]));const market=pick(['SOX','SEMI','MATERIAL']),memory=pick(['DXI','DRAM']),trade=pick(['PACK_IMPORT','PACK_EXPORT']);
  const analyses={market_analysis:generateMarketAnalysis(market),memory_analysis:generateMemoryAnalysis(memory),nand_analysis:generateNandAnalysis(metrics.NAND),trade_analysis:generateTradeAnalysis(trade),weekly_view:generateWeeklyView(market,memory,metrics.NAND,trade)};
  const ranking=Object.entries(market).filter(([,m])=>finite(m.wow)).sort(([,a],[,b])=>b.wow-a.wow).map(([id,m])=>({id,name:names[id],wow:m.wow}));
  const changes=[available(market).length?`有效市场指数${marketState(market)}，${ranking.length?ranking[0].name+'周度表现相对领先':'周度基期不足'}。`:'当前未提供市场数据，暂不形成市场判断。',`存储4周趋势${coMovement(memory)}，NAND${nandState(metrics.NAND)}。`,trade.PACK_IMPORT?`封装材料进口环比${pct(trade.PACK_IMPORT.mom)}，同比${pct(trade.PACK_IMPORT.yoy)}，不能单独确认国产替代。`:'当前未提供进口数据，贸易证据不完整。'];
  return {cutoff:asof,uploaded:true,dataset_name:dataset.name,sample:dataset.sample,metrics,analyses,ranking,ranking_date:asof,changes,
   charts:{market:chart(cleanSeries,['SOX','SEMI','MATERIAL'],asof,true),memory:chart(cleanSeries,['DXI','DRAM'],asof,true),nand:chart(cleanSeries,['NAND'],asof),imports:chart(cleanSeries,['PACK_IMPORT'],asof),exports:chart(cleanSeries,['PACK_EXPORT'],asof)},
   sources:['本次浏览器上传的MatRadar标准模板。','所有结果仅使用不晚于分析日期的有效观察，不生成缺失值。'],
   boundaries:['上传内容仅在当前页面内存中处理；刷新页面清除。','指数表现不直接代表订单或盈利；传统存储价格不等同HBM需求。','贸易金额变动不能单独证明国产替代，且商品范围以用户提供口径为准。',...monthWarnings,...Object.entries(metrics).filter(([id,m])=>!id.startsWith('PACK_')&&m.age_days>7).map(([id,m])=>`${names[id]}最后观察${m.date}，距分析日${m.age_days}天，不能视作当周报价。`)],
   methodology:['周/4周/3月基期分别是不晚于分析日减7日/28日/3个自然月的最近观察；月末减月按目标月末截断。','当前值与基期必须为不同观察，分母必须大于零；缺少有效基期不计算变化率。','存储4周变化大于2%为上行，小于-2%为下行，其他为震荡；缺少基期不分类。','贸易寻找上一自然月与上一年同月；同月冲突值隔离，不估算同比。','共同起点100仅用于图表比较。指标最后观察日分别标注，数据滞后时排名需谨慎解读。']};
 }
 return {names,dateISO,shiftDays,shiftMonths,parseWorkbook,quickDate,metricsFor,chart,analyze,generateMarketAnalysis,generateMemoryAnalysis,generateNandAnalysis,generateTradeAnalysis,generateWeeklyView};
});
