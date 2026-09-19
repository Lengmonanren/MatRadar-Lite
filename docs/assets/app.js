'use strict';
(() => {
 const history=window.RESEARCH_SNAPSHOT,A=window.MatRadarAnalysis;
 let current=history,dataset=null,revision=0,active='market';const rendered=new Set();
 const $=id=>document.getElementById(id),text=(id,v)=>{$(id).textContent=v;},finite=v=>typeof v==='number'&&Number.isFinite(v);
 const num=(v,d=2)=>v.toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
 const pct=(v,d=2)=>finite(v)?(v>=0?'+':'')+num(v,d)+'%':'数据不足';
 const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
 const list=(id,items)=>{const n=$(id);n.replaceChildren(...items.map(item=>el('li','',item)));};
 function kpi(target,label,value,unit,meta,date){const n=el('div','kpi');n.append(el('div','kpi-label',label));const v=el('div','kpi-value',value);if(unit)v.append(el('small','',unit));n.append(v,el('div','kpi-meta',meta));if(date)n.append(el('div','kpi-date',date));$(target).append(n);}
 const colors=['#426b97','#4d8b85','#aa8b62'];
 async function plot(id,chart,unit,offset=0){
  const n=$(id);if(!chart?.series.length){Plotly.purge(n);n.replaceChildren(el('p','empty-data',chart?.reason||'当前分析日期下没有可绘制的有效数据。'));return;}
  const small=innerWidth<650;
  const dates=chart.series.flatMap(s=>s.dates),span=(new Date(dates.reduce((a,b)=>a>b?a:b))-new Date(dates.reduce((a,b)=>a<b?a:b)))/86400000;
  const traces=chart.series.map((line,i)=>({x:line.dates,y:line.values,name:line.name,type:'scatter',mode:'lines',connectgaps:false,line:{color:colors[(i+offset)%colors.length],width:2.3},hovertemplate:'%{x|%Y-%m-%d}<br>'+line.name+'：%{y:,.3f} '+unit+'<extra></extra>'}));
  n.replaceChildren();
  await Plotly.newPlot(n,traces,{paper_bgcolor:'#fff',plot_bgcolor:'#fff',font:{family:'Microsoft YaHei, sans-serif',size:small?10:12,color:'#758295'},margin:{l:small?52:65,r:12,t:44,b:38},hovermode:'x unified',legend:{orientation:'h',x:0,y:1.16,font:{size:small?10:12}},showlegend:chart.series.length>1,xaxis:{type:'date',showgrid:false,zeroline:false,tickformat:span<180?'%m-%d':'%Y-%m',hoverformat:'%Y年%m月%d日',nticks:small?4:7,fixedrange:true},yaxis:{gridcolor:'#edf0f4',zeroline:false,tickformat:unit==='美元'?'.2f':',.0f',title:{text:unit,font:{size:11}},fixedrange:true},hoverlabel:{bgcolor:'#fff',bordercolor:'#dbe2eb',font:{size:12}},dragmode:false},{responsive:true,displayModeBar:false,scrollZoom:false});
 }
 async function renderCharts(panel){if(rendered.has(panel)){document.querySelectorAll('#'+panel+' .js-plotly-plot').forEach(n=>Plotly.Plots.resize(n));return;}const c=current.charts;if(panel==='market')await plot('market-chart',c.market,'起点100');if(panel==='industry')await Promise.all([plot('memory-chart',c.memory,'起点100'),plot('nand-chart',c.nand,'美元',1),plot('import-chart',c.imports,'万美元'),plot('export-chart',c.exports,'万美元',1)]);rendered.add(panel);}
 async function display(s){
  current=s;rendered.clear();const m=s.metrics;
  for(const id of ['market-chart','memory-chart','nand-chart','import-chart','export-chart']){Plotly.purge($(id));$(id).replaceChildren();}
  for(const id of ['market-kpis','memory-kpis','nand-kpis','trade-kpis','audit-metrics'])$(id).replaceChildren();
  text('cutoff',s.cutoff);text('dataset-label',s.uploaded?(s.sample?'SAMPLE · 虚构样例':'用户上传数据')+' · '+s.dataset_name:'历史案例（SAMPLE）');
  document.querySelector('.edition').textContent=s.uploaded?(s.sample?'SAMPLE · 虚构样例':'本地Excel · 自选日期'):'SAMPLE · 虚构演示';
  document.querySelector('.datestamp span').textContent=s.uploaded?'分析日期 · 各指标观察日另列':'各指标观察日分别标注';
  document.querySelector('footer span').textContent='MatRadar Lite · '+(s.uploaded?(s.sample?'SAMPLE 虚构样例分析':'本地Excel分析'):'公开演示');
  ['SOX','SEMI','MATERIAL'].forEach(id=>{const x=m[id];if(x)kpi('market-kpis',A.names[id],num(x.latest),'点',(s.uploaded?'周变化 ':'最近有效周 ')+pct(x.wow),'观察日 '+x.date);});
  if(!$('market-kpis').children.length)$('market-kpis').append(el('p','empty-data','当前Excel未提供市场数据。'));
  ['DXI','DRAM'].forEach(id=>{const x=m[id];if(x)kpi('memory-kpis',id==='DXI'?'DXI · 原表点位':s.uploaded?'DRAM':'DRAM DDR3 4Gb',num(x.latest),id==='DXI'?'点':'美元','周变化 '+pct(x.wow,id==='DXI'?3:2),'观察日 '+x.date);});
  if(m.NAND){const x=m.NAND;kpi('nand-kpis','最新价格',num(x.latest,3),'美元',s.sample?'SAMPLE 虚构价格':'上传的NAND价格','观察日 '+x.date);kpi('nand-kpis','周变化',pct(x.wow),'','基准日 '+(x.wow_base_date||'数据不足'),'按'+(s.uploaded?'分析日':'最后观察日')+'确定基期');kpi('nand-kpis','近4周变化',pct(x.four_week),'','基准日 '+(x.four_week_base_date||'数据不足'),'观察日 '+x.date);}
  ['PACK_IMPORT','PACK_EXPORT'].forEach(id=>{const x=m[id];if(x)kpi('trade-kpis',A.names[id],num(x.latest),'万美元','环比'+pct(x.mom)+' · '+(finite(x.yoy)?'同比'+pct(x.yoy):'同比数据不足'),'最新月份 '+x.date.slice(0,7));});
  document.querySelector('#nand-chart + .caption').textContent=m.NAND?'最后有效观察 '+m.NAND.date+'；不延伸报价。':'当前Excel未提供NAND数据。';
  document.querySelector('#industry .module:nth-of-type(2) .module-heading p').textContent=s.sample?'SAMPLE 示例规格 · 美元':'上传规格 · 美元';
  document.querySelector('#industry .module:last-child .module-heading p').textContent=s.sample?'SAMPLE 示例商品范围 · 万美元':'用户提供商品范围 · 万美元';
  document.querySelector('.evidence-body h4:nth-of-type(2) + p').textContent='分析截止 '+s.cutoff+'；各指标使用截至该日的最后有效观察，具体日期见指标卡。';
  Object.entries({'market-analysis':'market_analysis','memory-analysis':'memory_analysis','nand-analysis':'nand_analysis','trade-analysis':'trade_analysis','weekly-view':'weekly_view'}).forEach(([id,key])=>text(id,s.analyses[key]));
  for(const id of ['changes','sources','boundaries','methodology'])list(id,s[id]);list('followups',s.followups||history.followups);text('risks',s.risks||history.risks);text('signals',s.changes.join(' '));
  text('market-caption',(s.sample?'SAMPLE虚构演示数据':'本次上传数据')+'。区间 '+s.charts.market.start+' 至 '+s.charts.market.end+'；起点100仅比较累计变化。'+(s.uploaded?'周变化统一按分析日期确定基期；缺失观察不填充。':'周变化以各自最近有效日计算。'));
  text('memory-caption','共同起点 '+s.charts.memory.start+' = 100；不同量纲只比较累计变化。'+(s.uploaded?'原始点位和价格均未缩放。':'演示值未缩放。'));
  text('ranking',s.ranking.length?'比较日期 '+s.ranking_date+'；周度排名：'+s.ranking.map((x,i)=>(i+1)+'．'+x.name+' '+pct(x.wow)).join('；')+'。':'比较基期不足，暂不形成排名。');
  Object.entries(m).filter(([id])=>!id.startsWith('PACK')).forEach(([id,x])=>{const tr=el('tr');[A.names[id],pct(x.four_week),pct(x.three_month),pct(x.from_high),pct(x.from_low),s.uploaded?x.date:x.last_direction+' '+x.consecutive_observations+' 次',s.uploaded?({UP:'上行',DOWN:'下行',FLAT:'震荡'}[x.trend]||'基期不足'):x.momentum].forEach(v=>tr.append(el('td','',v)));$('audit-metrics').append(tr);});
  document.querySelector('#conclusion table th:last-child').textContent=s.uploaded?'4周趋势':'周变化速度';
  await renderCharts(active);
 }
 document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{active=b.dataset.panel;document.querySelectorAll('nav button').forEach(n=>n.setAttribute('aria-selected',String(n===b)));document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==active);renderCharts(active);}));
 const setReady=ready=>{$('analysis-date').disabled=!ready;$('generate-analysis').disabled=!ready;document.querySelectorAll('[data-quick]').forEach(b=>b.disabled=!ready);};
 const status=v=>text('processing-status',v);
 $('data-mode').addEventListener('change',async()=>{revision++;dataset=null;$('excel-file').value='';$('analysis-date').value='';setReady(false);$('upload-controls').hidden=$('data-mode').value!=='upload';$('validation-details').hidden=true;status('请选择Excel文件。');await display(history);});
 const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
 $('excel-file').addEventListener('change',async()=>{
  const token=++revision;dataset=null;setReady(false);$('validation-details').hidden=true;await display(history);const file=$('excel-file').files[0];if(!file){status('请选择Excel文件。');return;}
  try{if(!/\.(xlsx|xls)$/i.test(file.name)||file.size>15*1024*1024)throw Error('请选择不超过15MB的.xlsx或.xls文件。');status('正在读取数据……');await pause();const bytes=await file.arrayBuffer();if(token!==revision)return;const wb=XLSX.read(bytes,{type:'array',cellDates:false,cellNF:true,cellFormula:false});const parsed=A.parseWorkbook(wb,XLSX);if(token!==revision)return;dataset=parsed;
   $('analysis-date').min=dataset.dates[0];$('analysis-date').max=dataset.dates.at(-1);$('analysis-date').value=dataset.dates.at(-1);setReady(true);
   text('validation-summary',Object.entries(dataset.counts).map(([k,v])=>k+'：'+v).join('；')||'日期与数值检查通过。');list('validation-issues',dataset.issues);$('validation-details').hidden=false;
   status((dataset.sample?'SAMPLE虚构样例已读取。':'数据已读取。')+'已选最新数据日期 '+dataset.dates.at(-1)+'，点击“生成分析”。');
  }catch(error){if(token===revision){dataset=null;status(error.message||'读取失败，请使用标准模板。');}}
 });
 document.querySelectorAll('[data-quick]').forEach(b=>b.addEventListener('click',()=>{if(!dataset)return;const d=A.quickDate(dataset,b.dataset.quick);if(d){$('analysis-date').value=d;status('分析日期已选择 '+d+'，点击生成分析。');}else status('目标日期之前没有有效观察，未改变分析日期。');}));
 $('analysis-date').addEventListener('change',()=>status('分析日期已改变，点击生成分析更新三卡。'));
 $('generate-analysis').addEventListener('click',async()=>{if(!dataset)return;const token=revision;setReady(false);try{status('正在计算指标……');await pause();const result=A.analyze(dataset,$('analysis-date').value);result.followups=history.followups;result.risks=history.risks;status('正在形成研究摘要……');await pause();if(token!==revision)return;status('正在生成图表……');await display(result);if(token===revision)status('完成。当前分析日期 '+result.cutoff+'，'+(dataset.sample?'SAMPLE虚构样例。':'上传数据仅保存在当前页面内存中。'));}catch(e){status(e.message||'分析失败，请检查数据。');}finally{if(token===revision)setReady(!!dataset);}});
 $('export-analysis').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({analysis_date:current.cutoff,metrics:current.metrics,generated_analysis:current.analyses},null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='matradar_analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 $('data-mode').value='history';$('excel-file').value='';$('analysis-date').value='';$('upload-controls').hidden=true;setReady(false);
 display(history);
})();
