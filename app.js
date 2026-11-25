const ST=['applied','interview','offer','closed','saved'];
const SL={saved:'Saved',applied:'Applied',interview:'In process',offer:'Offer',closed:'Closed'};
const SOURCES=['All','LinkedIn','Company site','Drushim','AllJobs'];
const DEMO_JOBS=[
 {id:1,co:'Wix',role:'Product Manager, Editor',loc:'Tel Aviv',src:'LinkedIn',status:'applied',days:10,tl:[['Nov 5','Applied via LinkedIn'],['Nov 4','Added from Found']]},
 {id:2,co:'Monday.com',role:'Senior PM, Automations',loc:'Tel Aviv',src:'Company site',status:'interview',days:14,replied:4,next:'Tue 10:00, 2nd round',tl:[['Nov 15','Moved to Interview from a Gmail invite'],['Nov 12','1st round with Noa, PM lead'],['Nov 1','Applied on company site']]},
 {id:3,co:'Riskified',role:'Product Manager, Payments',loc:'Tel Aviv',src:'Company site',status:'applied',days:3,tl:[['Nov 12','Applied on company site']]},
 {id:4,co:'Lemonade',role:'PM, Claims Experience',loc:'Tel Aviv',src:'LinkedIn',status:'saved',tl:[['Nov 10','Added from Found']]},
 {id:5,co:'Gong',role:'Product Manager, AI',loc:'Ramat Gan',src:'AllJobs',status:'saved',tl:[['Nov 13','Added by voice']]},
 {id:6,co:'Playtika',role:'Product Manager, LiveOps',loc:'Herzliya',src:'Drushim',status:'closed',days:21,replied:13,tl:[['Nov 9','Rejected by email'],['Oct 25','Applied']]},
];
const DEMO_ALERTS=[
 {id:'a1',co:'Similarweb',role:'Product Manager, Growth',loc:'Tel Aviv',hrs:1,src:'Company site',tag:'new'},
 {id:'a2',co:'Fiverr',role:'PM, Buyer Experience',loc:'Tel Aviv',hrs:2,src:'Company site',tag:'new'},
 {id:'a3',co:'Check Point',role:'PM, Cloud Security',loc:'Tel Aviv',hrs:3,src:'Drushim',tag:'new'},
 {id:'a4',co:'AppsFlyer',role:'PM, Data Platform',loc:'Herzliya',hrs:5,src:'LinkedIn',tag:'reposted',warn:'Posted 3 times since August. Others got no reply.'},
 {id:'a5',co:'Melio',role:'Product Manager, Payments',loc:'Tel Aviv',hrs:8,src:'LinkedIn',tag:'new'},
 {id:'a6',co:'Wix',role:'Product Manager, Editor',loc:'Tel Aviv',hrs:30,src:'LinkedIn',tag:'applied'},
 {id:'a7',co:'Taboola',role:'Product Manager, Ads',loc:'Tel Aviv',hrs:52,src:'AllJobs',tag:'new'},
];
const DEMO_RECS=[{id:'r1',co:'Monday.com',label:'1st round with Noa',date:'Nov 12',mins:42,score:74}];
let STEPS_LEFT=0,jobs=[],alerts=[],recordings=[],REAL=false,REPLY={},ME='',GOOGLE={},VER='',SETTINGS={closeDays:16};
const DEMO_REPLY={Wix:[4,6,8],Riskified:[3,5,7],'Monday.com':[2,4,6],Playtika:[8,12,16],Gong:[5,9,13],Lemonade:[3,6,9],Fiverr:[3,5,8],Similarweb:[3,5,7]};
let tlMode='Timeline';
let view='today',jobsMode='list',jobTab='applied',srcTab='All',curJob=null,scope='main',recMode=0;
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const av=(co,c='')=>`<div class="av ${c}">${esc(co[0])}</div>`;
const stl=s=>`<span class="st ${s}">${SL[s]}</span>`;
const jobBy=co=>jobs.find(j=>j.co===co);
const ago=h=>h<24?h+'h ago':h<48?'Yesterday':Math.floor(h/24)+'d ago';
const I=p=>`<svg class="i" viewBox="0 0 24 24">${p}</svg>`;
const SPARK='<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>';
function toast(t,undo){const el=$('#toast');el.innerHTML=esc(t)+(undo?' <button class="link" data-undo>Undo</button>':'');el.classList.toggle('act',!!undo);el.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('on','act'),undo?5000:2200)}

/* navigation */
function show(v,keepScope){
  view=v;closeModal();NOPEN=false;if(v==='settings'){LOGST.open=false;LOGST.rows=null;ALOG.open=false;ALOG.rows=null}
  document.querySelectorAll('.nv').forEach(b=>b.classList.toggle('on',b.dataset.v===(v==='job'?'jobs':v==='history'?'today':v)));
  $('#main').scrollTop=0;
  if(!keepScope)setScope(v==='job'?'j'+curJob.id:'main');
  render(true);
}
function render(anim){
  const p=$('#page');p.classList.toggle('wide',view==='jobs'&&jobsMode==='board');
  ({today:renderToday,alerts:renderAlerts,jobs:renderJobs,job:renderJob,interview:renderInterview,stats:renderStats,settings:renderSettings,history:renderHistory})[view]();
  if(anim){p.classList.remove('anim');void p.offsetWidth;p.classList.add('anim')}
  renderSide();renderSugg();
}
$('#nav').onclick=e=>{const b=e.target.closest('.nv');if(b)show(b.dataset.v)};
function renderSide(){
  $('#foundCt').textContent=alerts.filter(a=>a.tag!=='applied').length||'';
  $('#jobsCt').textContent=jobs.filter(j=>j.status!=='closed').length;
  const act=jobs.filter(j=>j.status==='interview'||j.status==='offer').sort((a,b)=>ST.indexOf(b.status)-ST.indexOf(a.status));
  $('#sjobs').innerHTML=act.map(j=>`<button class="sj${view==='job'&&curJob?.id===j.id?' on':''}" data-open="${j.id}" title="${SL[j.status]}"><span class="st ${j.status}"></span><span class="nm">${esc(j.co)}</span></button>`).join('');
}
document.addEventListener('click',e=>{const d=e.target.closest('[data-del]');if(d){e.stopPropagation();removeJob(+d.dataset.del);return}
  if(e.target.closest('[data-undo]')){const f=undoFn||undoRemove;undoFn=null;f();return}
  const o=e.target.closest('[data-open]');if(o){openJob(+o.dataset.open)}},true);

/* today */
const hrow=(ic,t1,t2,cmd)=>`<button class="row" data-cmd="${esc(cmd)}"><span class="mini">${I(ic)}</span><div class="txt"><div class="t1">${t1}</div><div class="t2">${t2}</div></div><span class="chev">›</span></button>`;
function renderToday(){
  if(REAL)return renderTodayReal();
  const nNew=alerts.filter(a=>a.tag==='new').length;
  $('#page').innerHTML=`<div class="hero"><div class="d">Monday, November 16</div><h2>Good morning, Gilad.</h2><p>Here’s what changed since yesterday.</p></div>
  <div class="kpis">
    <div class="kpi"><div class="l">New jobs</div><div class="v">${nNew}</div><div class="d">2 fake reposts hidden</div></div>
    <div class="kpi"><div class="l">Waiting on reply</div><div class="v">${jobs.filter(j=>j.status==='applied').length}</div><div class="d">1 is late</div></div>
    <div class="kpi"><div class="l">Interviews</div><div class="v">1</div><div class="d">Tuesday 10:00</div></div>
    <div class="kpi"><div class="l">Reply rate</div><div class="v">33%</div><div class="d">Average is 24%</div></div></div>
  <div class="grid2">
   <div><div class="lbl">Since yesterday</div><div class="list">
    ${hrow('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',nNew+' new jobs','Newest from Similarweb, 1h ago','go:alerts')}
    ${hrow('<path d="M5 12l5 5 9-10"/>','Monday.com moved to Interview','From an invite in your Gmail','go:open:2')}
    ${hrow('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>','Interview Tuesday, 10:00','Monday.com. Prep with the agent.','Prep Monday.com')}
    ${hrow('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>','Wix is quiet for 10 days','Later than usual. Send a follow-up?','Follow up Wix')}
   </div></div>
   <div><div class="lbl">Where you stand</div>${legend}
    ${jobs.filter(j=>j.status==='applied'&&j.days).map(j=>track(j)).join('')}${axis}</div>
  </div>`;
}

/* found */
function renderAlerts(){
  if(REAL){$('#page').innerHTML=`<div class="ph"><h1>Found today</h1></div><div class="empty">Job alerts are not set up for your account yet.<br>Your real jobs are in My jobs.</div>`;return}
  const list=alerts.filter(a=>srcTab==='All'||a.src===srcTab).sort((a,b)=>a.hrs-b.hrs);
  let h=`<div class="ph"><h1>Found today</h1></div>
  <div class="prefs"><span>Product Manager · Tel Aviv · Mid–Senior</span><button class="link" data-f>Edit filters</button></div>
  <div class="tabsline">${SOURCES.map(s=>`<button class="${s===srcTab?'on':''}" data-src="${s}">${s}<span class="n">${s==='All'?alerts.length:alerts.filter(a=>a.src===s).length}</span></button>`).join('')}</div>
  <div class="note">Newest first. Early applicants get more replies.</div>`;
  if(!list.length)h+=`<div class="empty">Nothing new from ${esc(srcTab)} today.</div>`;
  h+=`<div class="list">${list.map(a=>`<div class="row hov jr" id="${a.id}">${av(a.co)}<div class="txt"><div class="t1">${esc(a.role)}</div><div class="t2">${esc(a.co)} · ${esc(a.loc)}</div>${a.warn?`<div class="warn">${a.warn}</div>`:''}</div>
    <div class="meta"><span>${ago(a.hrs)}</span>${a.tag!=='new'?`<span class="st tag-${a.tag}">${a.tag==='reposted'?'Reposted':'You applied'}</span>`:'<span class="st tag-new">New</span>'}</div>
    <span class="src" style="flex:none">${a.src}</span>
    <div class="acts2">${a.tag==='applied'?`<button class="sbtn" data-add="${a.id}" title="Open" aria-label="Open">${I('<path d="M9 6l6 6-6 6"/>')}</button>`:`<button class="sbtn" data-skip="${a.id}" title="Skip" aria-label="Skip">${I('<path d="M6 6l12 12M18 6L6 18"/>')}</button><button class="sbtn add" data-add="${a.id}" title="Add to My jobs" aria-label="Add">${I('<path d="M12 5v14M5 12h14"/>')}</button>`}</div></div>`).join('')}</div>`;
  $('#page').innerHTML=h;
}
$('#page').addEventListener('click',e=>{
  if(view!=='alerts')return;
  if(e.target.closest('[data-f]')){toast('Filters only. No CV needed.');return}
  const sr=e.target.closest('[data-src]');if(sr){srcTab=sr.dataset.src;renderAlerts();return}
  const s=e.target.closest('[data-skip]');if(s){takeAlert(s.dataset.skip,false);return}
  const a=e.target.closest('[data-add]');if(a)takeAlert(a.dataset.add,true);
});
function takeAlert(id,add){
  const a=alerts.find(x=>x.id===id);if(!a)return;
  if(a.tag==='applied'&&add){openJob(jobBy(a.co).id);return}
  document.getElementById(id)?.classList.add('gone');
  setTimeout(()=>{alerts=alerts.filter(x=>x!==a);render()},240);
  toast(add?`${a.co} added to My jobs`:'Skipped');if(add)addJob(a,'Added from Found');
}
// The + button: add a job by hand. An email address (or a company domain) can be watched, so its emails join this job.
function addJobForm(){
  let st='applied',sp='hr';
  const chips=(id,list,val)=>`<div class="chips" id="${id}">${list.map(([k,l])=>`<button type="button" class="chip" data-v="${k}" aria-pressed="${k===val}">${l}</button>`).join('')}</div>`;
  openModal('Add a job',`<div class="edf"><div class="two"><label>Company<input id="ajCo" maxlength="80" placeholder="e.g. Wix"></label><label>Role<input id="ajRole" maxlength="120" placeholder="e.g. Product Manager"></label></div>
    <label>Job link (optional)<input id="ajLink" type="url" placeholder="https://"></label>
    <label>Email to watch (optional)<input id="ajMail" type="email" placeholder="recruiter@company.com or company.com"><span class="hint">Emails from or to this address are added to this job.</span></label>
    <div><div class="flab">Status</div>${chips('ajSt',ST.map(s=>[s,SL[s]]),st)}</div>
    <div id="ajSpBox" hidden><div class="flab">Current step</div>${chips('ajSp',BSTEPS.map(s=>[s,STEPL[s]]),sp)}</div>
    <button class="pbtn pri" id="ajGo">Add job</button></div>`);
  const pick=(id,fn)=>$('#'+id).onclick=e=>{const c=e.target.closest('.chip');if(!c)return;$('#'+id).querySelectorAll('.chip').forEach(x=>x.setAttribute('aria-pressed',x===c));fn(c.dataset.v)};
  pick('ajSt',v=>{st=v;$('#ajSpBox').hidden=v!=='interview'});pick('ajSp',v=>sp=v);
  setTimeout(()=>$('#ajCo')?.focus(),60);
  $('#ajGo').onclick=async()=>{
    const co=$('#ajCo').value.trim(),role=$('#ajRole').value.trim(),link=$('#ajLink').value.trim(),contact=$('#ajMail').value.trim();
    if(!co){toast('Company is needed');return}
    if(link&&!/^https?:\/\/\S+$/i.test(link)){toast('The link should start with https://');return}
    if(!REAL){const j=addJob({co,role:role||'Role not named',loc:'',src:'Manual'},'Added by you');j.status=st;if(st==='interview'){j.tl.unshift([dlab(TODAY),STEPL[sp],{s:'you',id:'',t:sp}])}
      closeModal();jobTab=st;render();toast(`${co} added`);return}
    try{$('#ajGo').disabled=true;
      const r=await api('/api/jobs',{op:'add',co,role,link,contact,status:st,step:st==='interview'?sp:null,stepText:STEPL[sp],day:localIso(TODAY)});
      closeModal();await pull(true);jobTab=st;const j=jobs.find(x=>x.id===r.id);if(j)openJob(j.id);else render();toast(`${co} added`)}
    catch(x){$('#ajGo').disabled=false;toast(x.message||'Could not add the job.')}};
}
function addJob(a,how){const j={id:Date.now(),co:a.co,role:a.role,loc:a.loc,src:a.src,status:'saved',tl:[['Today',how]]};jobs.unshift(j);return j}

/* my jobs */
const IC_BOARD='<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M15 4v16"/>',IC_LIST='<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>';
let boardBy='status',stepFilter=null;
const IC_PLUS='<path d="M12 5v14M5 12h14"/>';
function renderJobs(){
  let h=`<div class="ph"><h1>My jobs</h1><button class="addj" data-addjob>${I(IC_PLUS)}Add job</button><div class="seg"><button class="${jobsMode==='list'?'on':''}" data-mode="list">${I(IC_LIST)}List</button><button class="${jobsMode==='board'?'on':''}" data-mode="board">${I(IC_BOARD)}Board</button></div></div>`;
  if(jobsMode==='board'){
    h+=`<div class="seg sm bby">${[['status','By status'],['step','By step']].map(([k,l])=>`<button class="${boardBy===k?'on':''}" data-bby="${k}">${l}</button>`).join('')}</div>`;
    if(boardBy==='step'){
      const act=jobs.filter(j=>j.status==='interview'||j.status==='offer');
      h+=`<div class="cols">${BSTEPS.map(s=>{const js=act.filter(j=>(curStep(j)||'hr')===s);return`<div class="col" data-drop="step:${s}"><h4>${STEPL[s]}<span class="c">${js.length}</span></h4>
       ${js.map(j=>{const g=jobSteps(j),c=curIdx(g);return`<button class="kc" data-open="${j.id}" data-drag="${j.id}"><div class="co">${esc(j.co)}</div><div class="rl">${esc(j.role)}</div>
       <div class="ft"><span class="acc">${esc(j.next?j.next.split(',')[0]:c>=0?g[c].name+' · '+g[c].date.split(' – ').pop():'')}</span></div></button>`}).join('')||'<div class="kempty">None yet</div>'}</div>`}).join('')}</div>
       <div class="note" style="margin-top:14px">Jobs in process, by the step they are at. Drag a card to fix its step. The Agent moves cards when new emails or invites come in.</div>`;
    }else{
    h+=`<div class="cols">${ST.map(s=>{const js=jobs.filter(j=>j.status===s);return`<div class="col" data-drop="${s}"><h4>${s==='saved'?`<span class="bm" title="Saved">${I(IC_BOOKMARK)}</span>`:`<span class="st ${s}">${SL[s]}</span>`}<span class="c">${js.length}</span></h4>
     ${js.map(j=>`<button class="kc" data-open="${j.id}" data-drag="${j.id}"><div class="co">${esc(j.co)}</div><div class="rl">${esc(j.role)}</div>
     <div class="ft"><span>${j.next?j.next.split(',')[0]:s==='interview'&&curStep(j)?STEPL[curStep(j)]:j.days!=null&&s!=='closed'?j.days+'d since applied':s==='saved'?'Not applied':closedWhy(j)}</span></div>${delBtn(j)}</button>`).join('')||'<div class="kempty">Empty</div>'}</div>`}).join('')}</div>
     <div class="note" style="margin-top:14px">Click a card to open it. Its agent opens on the right.</div>`;}
  }else{
    let js=jobs.filter(j=>j.status===jobTab);
    h+=`<div class="tabsline">${ST.map(s=>`<button class="${s===jobTab?'on':''}" data-s="${s}" data-drop="${s}"${s==='saved'?' title="Saved" aria-label="Saved"':''}>${s==='saved'?`<span class="bm">${I(IC_BOOKMARK)}</span>`:SL[s]}<span class="n">${jobs.filter(j=>j.status===s).length}</span></button>`).join('')}</div>`;
    if(jobTab==='interview'){
      const cnt={};js.forEach(j=>{const c=curStep(j)||'hr';cnt[c]=(cnt[c]||0)+1});
      if(stepFilter&&!cnt[stepFilter])stepFilter=null;
      h+=`<div class="lbl">Where they are now</div><div class="scount">${BSTEPS.map(s=>`<button class="${cnt[s]?'':'zero'}${stepFilter===s?' on':''}" data-sf="${s}"${cnt[s]?'':' disabled'}><b>${cnt[s]||0}</b><span>${STEPL[s]}</span></button>`).join('')}</div>`;
      if(stepFilter)js=js.filter(j=>(curStep(j)||'hr')===stepFilter);
    }
    h+=`${js.length?`<div class="list" style="margin-top:4px">${js.map(j=>`<button class="row" data-open="${j.id}" data-drag="${j.id}">${av(j.co)}<div class="txt"><div class="t1">${esc(j.co)}</div><div class="t2">${esc(j.role)}${j.loc?' · '+esc(j.loc):''}</div>${j.next?`<div class="next">${j.next}</div>`:''}</div>
     ${j.status==='interview'||j.status==='offer'?miniSteps(j)||`<span class="src">${j.src}</span>`:`<span class="src">${j.src}</span>`}
     ${j.status==='applied'&&j.days!=null?`<div class="days${j.days>=10?' hot':''}"><div class="n">${j.days}d</div><div class="l">applied</div></div>`:closedWhy(j)?`<div class="days why-c${closedWhy(j)==='Rejected'?' bad':''}">${closedWhy(j)}</div>`:j.status==='interview'?'':'<div class="days"></div>'}${delBtn(j)}<span class="chev">›</span></button>`).join('')}</div>`:`<div class="empty">Nothing here yet.</div>`}`;
  }
  $('#page').innerHTML=h;
}
$('#page').addEventListener('click',e=>{
  if(view!=='jobs')return;
  const m=e.target.closest('[data-mode]');if(m){jobsMode=m.dataset.mode;render(true);return}
  if(e.target.closest('[data-addjob]')){addJobForm();return}
  const bb=e.target.closest('[data-bby]');if(bb){boardBy=bb.dataset.bby;renderJobs();return}
  const sf=e.target.closest('[data-sf]');if(sf){stepFilter=stepFilter===sf.dataset.sf?null:sf.dataset.sf;renderJobs();return}
  const s=e.target.closest('[data-s]');if(s){jobTab=s.dataset.s;stepFilter=null;renderJobs()}
});

/* hiring steps: each timeline entry belongs to one stage. The Agent sets it; older entries are guessed from their text. */
const STEPS=['applied','hr','test','present','manager','references','offer'],BSTEPS=['hr','test','present','manager','references','offer'];
const STEPL={applied:'Applied',hr:'HR call',test:'Test',present:'Presentation',manager:'Manager',references:'References',offer:'Offer'};
const APP_LINE=/^(Moved to |Closed|Saved for later|Added |Role changed|Company changed)/;
function guessStep(x){x=String(x);
  if(APP_LINE.test(x)||/cancel|reschedul|remind|moved|confirm|shared|follow|thank|declin|withdr|replied|answer|asked|reject|unfortunately|no news|\bnot\b/i.test(x))return null;
  if(/offer|salary/i.test(x))return 'offer';
  if(/referen/i.test(x))return 'references';
  if(/presentation|simulation/i.test(x))return 'present';
  if(/assignment|home ?task|\btest|exercise|case study|homework|quiz|coding|technical/i.test(x))return 'test';
  if(/\bhr\b|recruit|screen|intro|first call|talent|phone/i.test(x))return 'hr';
  if(/manager|team|lead\b|founder|ceo|cto|vp\b|director|final/i.test(x))return 'manager';
  if(/interview|invited|meeting|\bcall\b|on-?site|round/i.test(x))return '?';
  if(/^(you )?appl/i.test(x))return 'applied';
  return null}
const stepOf=t=>{const m=t[2];if(m?.t)return m.t==='-'?null:m.t;return guessStep(t[1])};
const dlab=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
// Group the timeline into steps, oldest first. Repeats in a row join one step ("Manager ×3"); small updates ride along with the step before them.
function jobSteps(j){
  // Same day: earlier stages first (an HR call before the manager interview), small updates after the step.
  const rk=s=>s==null?99:s==='?'?2.5:STEPS.indexOf(s);
  const ev=j.tl.map((t,k)=>({t,k,d:t[2]?.d?new Date(t[2].d+'T00:00:00'):tlDate(t[0]),s:stepOf(t)})).filter(e=>e.d).sort((a,b)=>a.d-b.d||rk(a.s)-rk(b.s)||b.k-a.k);
  const g=[];let cur=null;const pre=[];
  for(const e of ev){
    let s=e.s;if(s==='?')s=g.some(x=>x.s!=='applied')?'manager':'hr';
    if(!s){(cur?cur.items:pre).push(e);continue}
    const n=!/^You\b/.test(e.t[1]);
    if(cur&&cur.s===s){cur.items.push(e);cur.end=e.d;if(n)cur.days.add(+e.d)}
    else{cur={s,start:e.d,end:e.d,items:[e],days:new Set(n?[+e.d]:[])};g.push(cur)}
  }
  if(g.length)g[0].items.unshift(...pre);
  g.forEach(x=>{x.name=STEPL[x.s];x.fut=x.start>TODAY;
    x.date=+x.start===+x.end?dlab(x.start):dlab(x.start)+' – '+dlab(x.end)});
  return g;
}
const curIdx=g=>{let c=-1;g.forEach((x,i)=>{if(!x.fut)c=i});return c<0&&g.length?0:c};
function curStep(j){if(j.status==='offer')return 'offer';const g=jobSteps(j),c=curIdx(g);return c>=0?g[c].s:null}
function miniSteps(j){
  const g=jobSteps(j).filter(x=>x.s!=='applied'),c=curIdx(g);if(!g.length)return '';
  const show=g.slice(-5),off=g.length-show.length;
  return `<span class="mini"><span class="mdots">${show.map((x,i)=>`${i?'<i></i>':''}<b class="${i+off===c?'cur':x.fut?'fut':''}" title="${esc(x.name+' · '+x.date)}"></b>`).join('')}</span><span class="mlab">${esc(c>=0?g[c].name:'')}</span></span>`;
}
// Steps you add, change or remove by hand.
function stepForm(t,del){
  const d=t?tlDate(t[0])||TODAY:TODAY,s=t?stepOf(t):'hr';
  return `<div class="edf"><label>Step<select id="spT">${STEPS.map(x=>`<option value="${x}"${x===s||(s==='?'&&x==='manager')?' selected':''}>${STEPL[x]}</option>`).join('')}<option value="-"${t&&!s?' selected':''}>Not a step (just an update)</option></select></label>
    <label>Date<input id="spD" type="date" value="${localIso(d)}"></label>
    <label>Note<input id="spX" maxlength="60" value="${t?esc(t[1].replace(/\s*\((done|today|coming up)\)$/,'')):''}" placeholder="e.g. Call with the team lead"></label>
    <button class="pbtn pri" id="spSave">Save</button>${del?`<button class="link danger" id="spDel">Remove this step</button>`:''}</div>`;
}
function readStep(old){
  const t=$('#spT').value,ds=$('#spD').value;const d=ds?new Date(ds+'T00:00:00'):TODAY;
  const x=$('#spX').value.trim()||(t==='-'?'Update':STEPL[t]);
  const m={...(old?.[2]||{s:'you',id:''}),t};if(m.s!=='you')m.u=1;delete m.d;return [dlab(d),x,m];
}
function sortTl(j){j.tl0.sort((a,b)=>(tlDate(b[0])||0)-(tlDate(a[0])||0))}
function afterStepEdit(j,msg){refreshTime();saveJob(j);render();toast(msg)}
function addStep(j){
  openModal('Add a step',stepForm(null,false));
  $('#spSave').onclick=()=>{const e=readStep(null);j.tl0=j.tl0||j.tl;j.tl0.unshift(e);sortTl(j);if(!REAL)j.tl=j.tl0;
    if(e[2].t!=='-'&&j.status!=='closed'&&j.status!=='offer')j.status=e[2].t==='offer'?'offer':'interview';closeModal();afterStepEdit(j,'Step added')};
}
function editStep(j,k){
  const tl=j.tl0||j.tl,t=tl[k];if(!t)return;
  openModal('Edit step',stepForm(t,true));
  $('#spSave').onclick=()=>{tl[k]=readStep(t);sortTl(j);if(!REAL)j.tl=tl;closeModal();afterStepEdit(j,'Saved')};
  $('#spDel').onclick=()=>{tl.splice(k,1);if(!REAL)j.tl=tl;closeModal();afterStepEdit(j,'Step removed')};
}
// A whole step (a dot on the timeline): change its name or date, or remove it with everything under it.
function editGroup(j,i){
  const x=jobSteps(j)[i];if(!x)return;const tl=j.tl0||j.tl;
  openModal('Edit step',`<div class="edf"><label>Step<select id="sgT">${STEPS.map(v=>`<option value="${v}"${v===x.s?' selected':''}>${STEPL[v]}</option>`).join('')}</select></label>
    <label>Date<input id="sgD" type="date" value="${localIso(x.start)}"></label>
    <div class="hint">${x.items.length>1?`Changes all ${x.items.length} emails and invites in this step.`:'Changes the email or invite in this step.'}</div>
    <button class="pbtn pri" id="sgSave">Save</button><button class="link danger" id="sgDel">Remove this step</button></div>`);
  $('#sgSave').onclick=()=>{const v=$('#sgT').value,d=$('#sgD').value,moved=d&&d!==localIso(x.start);
    x.items.forEach(e=>{const t=tl[e.k];if(!t||!stepOf(t))return;const m=t[2]={...(t[2]||{s:'you',id:''}),t:v};if(m.s!=='you')m.u=1;if(moved){if(m.s==='you')t[0]=dlab(new Date(d+'T00:00:00'));else m.d=d}});
    if(moved)sortTl(j);if(!REAL)j.tl=tl;closeModal();afterStepEdit(j,'Saved')};
  $('#sgDel').onclick=()=>{const ks=new Set(x.items.map(e=>e.k));const keep=tl.filter((t,k)=>!ks.has(k));tl.length=0;tl.push(...keep);if(!REAL)j.tl=tl;stepSel={id:j.id,i:null};closeModal();afterStepEdit(j,'Step removed')};
}
// Board "by step": dragging a card moves the job to that step today ("Moved to X by you").
// Dragging it back removes that move. Only the last move of a day is kept.
const isMove=t=>t[2]?.s==='you'&&/^(Moved to .+ by you|.+ \(set by you\))$/.test(String(t[1]));
function stepBefore(tl,t){const d=tlDate(t[0]);const g=jobSteps({tl:tl.filter(x=>x!==t)});let s=null;g.forEach(x=>{if(x.start<=d)s=x.s});return s}
function normalizeMoves(j){
  const tl=j.tl0||j.tl;let changed=false;const seen=new Set();
  for(let k=0;k<tl.length;k++){const t=tl[k];if(!isMove(t))continue;if(seen.has(t[0])){tl.splice(k--,1);changed=true}else seen.add(t[0])}
  for(let k=tl.length-1;k>=0;k--){const t=tl[k];if(isMove(t)&&stepBefore(tl,t)===t[2].t){tl.splice(k,1);changed=true}}
  return changed;
}
function setStep(j,s){
  const today=dlab(TODAY);j.tl0=j.tl0||j.tl;
  j.tl0=j.tl0.filter(t=>!(isMove(t)&&t[0]===today));
  if(stepBefore(j.tl0,[today,'',{}])!==s)j.tl0.unshift([today,`Moved to ${STEPL[s]} by you`,{s:'you',id:'',t:s}]);
  if(!REAL)j.tl=j.tl0;
  if(j.status!=='offer'||s==='offer')j.status=s==='offer'?'offer':'interview';
  refreshTime();saveJob(j);render();toast(`${j.co} moved to ${STEPL[s]}`);
}

/* why a job is closed: from its timeline */
const REJECT=/reject|turned (you )?down|not moving forward|not move forward|other candidates/i;
function closedWhy(j){
  if(j.status!=='closed')return '';
  // A rejection always wins over "no reply", whatever the order.
  const has=r=>j.tl.some(t=>r.test(String(t[1])));
  if(has(REJECT))return 'Rejected';
  if(has(/withdr/i))return 'You withdrew';
  if(has(/no news for/i))return 'No reply';
  if(has(/^closed$/i))return 'Closed by you';
  return 'Closed';
}
const IC_EDIT='<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>';
function editJob(){
  const j=curJob;if(!j)return;
  const others=jobs.filter(x=>x.id!==j.id).sort((a,b)=>(b.co.toLowerCase()[0]===j.co.toLowerCase()[0])-(a.co.toLowerCase()[0]===j.co.toLowerCase()[0])||a.co.localeCompare(b.co));
  openModal('Edit job',`<div class="edf"><label>Company<input id="edCo" value="${esc(j.co)}" maxlength="80"></label>
    <label>Role<input id="edRole" value="${esc(j.role||'')}" maxlength="120"></label>
    <label>Job link<input id="edLink" type="url" value="${esc(j.link||'')}" placeholder="https://"></label>
    <label>Email to watch<input id="edMail" value="${esc(j.contact||'')}" placeholder="recruiter@company.com or company.com"><span class="hint">Emails from or to this address are added to this job.</span></label>
    <button class="pbtn pri" id="edSave">Save</button></div>
    ${others.length?`<div class="lbl">Same job twice?</div><div class="t2" style="margin-bottom:10px">Merge this job into another one. Their timelines join and this copy goes away.</div>
    <div class="edf row2"><select id="edInto" aria-label="Merge into"><option value="">Choose the other job…</option>${others.map(x=>`<option value="${x.id}">${esc(x.co)} · ${esc(x.role||'')}</option>`).join('')}</select><button class="pbtn" id="edMerge">Merge</button></div>`:''}`);
  $('#edSave').onclick=async()=>{
    const co=$('#edCo').value.trim(),role=$('#edRole').value.trim(),link=$('#edLink').value.trim(),contact=$('#edMail').value.trim();if(!co){toast('Company is needed');return}
    if(link&&!/^https?:\/\/\S+$/i.test(link)){toast('The link should start with https://');return}
    if(!REAL){j.co=co;j.role=role;j.link=link;j.contact=contact;closeModal();render();return}
    try{await api('/api/jobs',{op:'edit',id:j.id,co,role,link,contact});closeModal();await pull(true);toast('Saved')}catch(x){toast(x.message||'Could not save.')}};
  const m=$('#edMerge');if(m)m.onclick=async()=>{
    const into=+$('#edInto').value,t=jobs.find(x=>x.id===into);if(!t){toast('Choose the other job first');return}
    if(!REAL){t.tl=[...t.tl,...j.tl];jobs=jobs.filter(x=>x!==j);curJob=t;closeModal();show('job');toast(`Merged into ${t.co}`);return}
    try{await api('/api/jobs',{op:'merge',from:j.id,into});closeModal();await pull(true);curJob=jobs.find(x=>x.id===into)||null;show(curJob?'job':'jobs');toast(`Merged into ${t.co}`)}catch(x){toast(x.message||'Could not merge.')}};
}

/* job page */
let actOpen=false,stepSel={id:null,i:null},stepList=false; // stepList: false (closed) | 'all' | 'one' (the tapped step)
// The step line: main steps left to right. Tap (or hover) a dot to see its emails and invites.
function stepsBox(j){
  const g=jobSteps(j),c=curIdx(g);
  if(stepSel.id!==j.id||stepSel.i==null||stepSel.i>=g.length){stepSel={id:j.id,i:c>=0?c:null};if(stepList==='one')stepList=false}
  const end=j.status==='closed'?{name:closedWhy(j)||'Closed',cls:'bad'}:j.status==='offer'&&!g.some(x=>x.s==='offer')?{name:'Offer',cls:'cur'}:j.status==='saved'?null:{name:'Next',cls:'fut'};
  const n=g.length+1+(end?1:0); // steps, the "+", the end
  const ln=(i,first)=>`<span class="ln"><i class="${first?'':i<=c?'s':'g'}"></i><span class="d"></span><i class="${i<n-1?i<c?'s':'g':''}"></i></span>`;
  const dots=g.map((x,i)=>`<div class="sdw${i===stepSel.i&&stepList?' on':''}"><button class="sd${i===c?' cur':''}${x.fut?' up':''}${i===stepSel.i&&stepList?' on':''}" data-si="${i}" aria-label="${esc(x.name+', '+x.date)}: show its emails and invites">${ln(i,!i)}<span class="n">${esc(x.name)}</span><small>${esc(x.date)}</small></button><button class="sbtn xs sdp" data-edgrp="${i}" title="Edit this step" aria-label="Edit the ${esc(x.name)} step">${I(IC_EDIT)}</button></div>`).join('')
    +`<div class="sdw"><button class="sd add" data-addstep title="Add a step" aria-label="Add a step"><span class="ln"><i class="${g.length?'g':''}"></i><span class="d">+</span><i class="${end?'g':''}"></i></span><span class="n">Add</span><small></small></button></div>`
    +(end?`<div class="sdw"><div class="sd ${end.cls} endm"><span class="ln"><i class="g"></i><span class="d"></span><i></i></span><span class="n">${esc(end.name)}</span><small></small></div></div>`:'');
  const cols=[...g.map(()=>'minmax(96px,1fr)'),'64px',...(end?['minmax(96px,1fr)']:[])].join(' ');
  // Emails and invites behind each step. Closed at first; tapping a step shows just that step's.
  const row=e=>{const t=e.t,tap=stepTap(t[1],t[2]);return`<div class="sdi"><span class="d">${esc(t[0])}</span><span class="x">${esc(t[1])}${t[2]?.f?`<span class="clip">${I(IC_CLIP)}</span>`:''}</span>${tap?`<button class="link" data-step="${e.k}">${t[2]?.s==='calendar'?'Invite':'Email'} ›</button>`:''}<button class="sbtn xs" data-edstep="${e.k}" title="Edit" aria-label="Edit this item">${I(IC_EDIT)}</button></div>`};
  const grp=(x,i)=>`<div class="sdg${i===stepSel.i&&stepList==='all'?' on':''}" id="sdg${i}"><div class="sdh"><b>${esc(x.name)}</b><span>${esc(x.date)}</span></div>${x.items.map(row).join('')}</div>`;
  const total=g.reduce((a,x)=>a+x.items.length,0),one=stepList==='one'&&g[stepSel.i];
  const det=!g.length?`<div class="sdh"><span>No steps yet. They appear as emails and invites come in, or tap + to add one.</span></div>`
    :`<div class="sdtog"><button class="link" data-slist="${stepList?'close':'all'}" aria-expanded="${!!stepList}">${stepList?(one?`${esc(one.name)}: emails and invites`:'All emails and invites'):`Emails and invites (${total})`} <span class="chev${stepList?' up':''}">›</span></button>${one?`<button class="link" data-slist="all">Show all steps</button>`:''}</div>
      <div class="coll${stepList?' open':''}"><div>${stepList?(one?grp(one,stepSel.i):g.map(grp).join('')):''}</div></div>`;
  return `<div class="steps"><div class="strack"><div style="grid-template-columns:${cols}">${dots}</div></div><div class="sdet">${det}</div></div>`;
}
function openJob(id){const j=jobs.find(x=>x.id===id);if(!j)return;curJob=j;actOpen=false;stepList=false;show('job');openAgentMobile(false)}
function renderJob(){
  const j=curJob;let n;
  if(REAL)n=realNudge(j);
  else if(j.status==='applied'&&j.days>=7)n=`No reply in ${j.days} days. ${esc(j.co)} usually replies in 6. A short follow-up could help.`;
  else if(j.status==='applied')n=`${esc(j.co)} usually replies in 5 days. I'll tell you if nothing comes.`;
  else if(j.status==='interview')n=`2nd round Tuesday at 10:00. Last time you talked 68% of the time.`;
  else if(j.status==='saved')n=`Not applied yet. Want me to tailor your CV keywords first?`;
  else if(j.status==='closed')n=`I can show what to change for similar roles.`;
  else n=`I can compare this offer with market pay.`;
  $('#page').innerHTML=`<button class="back" data-back>‹ My jobs</button>
  <div class="dh">${av(j.co,'lg')}<div style="flex:1"><h2>${esc(j.role)}</h2><div class="t2">${esc(j.co)}${j.loc?' · '+esc(j.loc):''} · <span class="src">${j.src}</span>${closedWhy(j)?` · <span class="why-c${closedWhy(j)==='Rejected'?' bad':''}">${closedWhy(j)}</span>`:''}</div></div><button class="sbtn ed" data-edit title="Edit or merge" aria-label="Edit or merge this job">${I(IC_EDIT)}</button><button class="sbtn" data-del="${j.id}" title="Remove this job" aria-label="Remove this job">${I(IC_TRASH)}</button></div>
  <div class="tabsline" style="margin-top:26px">${ST.map(s=>`<button class="${s===j.status?'on':''}" data-st="${s}"${s==='saved'?' title="Saved" aria-label="Saved"':''}>${s==='saved'?`<span class="bm">${I(IC_BOOKMARK)}</span>`:SL[s]}</button>`).join('')}</div>
  ${stepsBox(j)}
  <div class="grid2" style="margin-top:26px">
    <div>${j.days!=null&&j.status!=='saved'?`<div class="count"><b>${j.days}</b>days since you applied</div><div style="margin-top:8px">${track(j,false)}${axis}</div>`:j.since?`<div class="count">In touch since ${esc(j.since)}. Apply date not in your email.</div>`:`<div class="count">Not applied yet. Apply early: replies drop after day 2.</div>`}
      ${j.link?`<a class="link jlink" href="${esc(j.link)}" target="_blank" rel="noopener">Job post ↗</a>`:''}
      <button class="pbtn sm actt" data-act aria-expanded="${actOpen}">${actOpen?'Hide all activity':`Show all activity (${j.tl.length})`}</button>
      <div class="coll${actOpen?' open':''}" id="actColl"><div>
      <div class="tlh"><div class="lbl">All activity</div><div class="seg sm">${['Timeline','List'].map(m=>`<button class="${tlMode===m?'on':''}" data-tlm="${m}">${m}</button>`).join('')}</div></div>
      ${tlMode==='List'?`<div class="list tl">${j.tl.map((t,k)=>`<div class="row${stepTap(t[1],t[2])?' tap':''}"${stepTap(t[1],t[2])?` data-step="${k}" role="button" tabindex="0"`:''}><span class="d">${t[0]}</span><span class="x">${esc(t[1])}${t[2]?.f?`<span class="clip">${I(IC_CLIP)}</span>`:''}</span></div>`).join('')}</div>`:visualTimeline(j)}</div></div></div>
    <div><button class="nudge" data-cmd="${esc(jobChips(j)[0])}"><span class="spark">${I(SPARK)}</span><div class="txt">${n}<div class="more">${esc(jobChips(j)[0])} →</div></div></button>
      <div class="lbl">Actions</div><div class="list">
      <button class="row" data-recfor="${esc(j.co)}"><span class="txt t1" style="font-weight:400">Record an interview</span><span class="chev">›</span></button>
      <button class="row" data-cmd="Tailor my CV"><span class="txt t1" style="font-weight:400">Tailor CV keywords</span><span class="chev">›</span></button>
      <button class="row" data-cmd="Draft a follow-up"><span class="txt t1" style="font-weight:400">Draft a follow-up email</span><span class="chev">›</span></button></div></div>
  </div>`;
}
$('#page').addEventListener('click',e=>{
  if(view!=='job')return;
  if(e.target.closest('[data-back]')){show('jobs');return}
  if(e.target.closest('[data-edit]')){editJob();return}
  const st=e.target.closest('[data-step]');if(st){openStep(curJob,+st.dataset.step);return}
  const si=e.target.closest('[data-si]');if(si){const i=+si.dataset.si;stepList=stepList==='one'&&stepSel.i===i?false:'one';stepSel={id:curJob.id,i};renderJob();return}
  const sl=e.target.closest('[data-slist]');if(sl){stepList=sl.dataset.slist==='close'?false:'all';renderJob();return}
  const eg=e.target.closest('[data-edgrp]');if(eg){editGroup(curJob,+eg.dataset.edgrp);return}
  if(e.target.closest('[data-addstep]')){addStep(curJob);return}
  const es=e.target.closest('[data-edstep]');if(es){editStep(curJob,+es.dataset.edstep);return}
  if(e.target.closest('[data-act]')){actOpen=!actOpen;const b=e.target.closest('[data-act]');b.setAttribute('aria-expanded',actOpen);b.textContent=actOpen?'Hide all activity':`Show all activity (${curJob.tl.length})`;$('#actColl').classList.toggle('open',actOpen);return}
  const tm=e.target.closest('[data-tlm]');if(tm){tlMode=tm.dataset.tlm;renderJob();return}
  const s=e.target.closest('[data-st]');if(s){setStatus(curJob,s.dataset.st);toast(`Moved to ${SL[s.dataset.st]}`);render();renderABar()}
});
document.addEventListener('click',e=>{const r=e.target.closest('[data-recfor]');if(r){show('interview');$('#jobSel').value=r.dataset.recfor}});
function setStatus(j,s,keepTab){if(j.status===s)return null;const prev=j.status;j.status=s;if(!REAL&&s==='applied')j.days=0;
  const note=[TODAY.toLocaleDateString('en-US',{month:'short',day:'numeric'}),s==='closed'?'Closed':s==='saved'?'Saved for later':'Moved to '+SL[s]];
  j.tl.unshift(note);if(j.tl0)j.tl0.unshift(note);if(!keepTab)jobTab=s;saveMove(j,prev,note);return{prev,note}}

/* interviews */
let recT=null,recS=0;
function renderInterview(){
  const opts=jobs.filter(j=>j.status!=='closed').map(j=>`<option${j.co===(REAL?'':'Monday.com')?' selected':''}>${esc(j.co)}</option>`).join('');
  $('#page').innerHTML=`<div class="ph"><h1>Interviews</h1></div>
  <div class="grid2"><div class="recbox">
    <div class="recopts"><select id="jobSel" aria-label="Job">${opts}</select><span style="color:var(--faint)">·</span>${['In person','Zoom'].map((m,i)=>`<button class="${i===recMode?'on':''}" data-rm="${i}">${m}</button>`).join('')}</div>
    <div class="timer" id="timer">00:00</div>
    <div class="wave" id="wave">${Array.from({length:32},(_,i)=>`<i style="animation-delay:${(i%9)*.08}s"></i>`).join('')}</div>
    <button class="recbtn" id="recBtn" aria-label="Start recording"><i></i></button>
    <div class="reclbl" id="recLbl">Click to record</div>
    <div class="consent">Tell the interviewer you're recording. Only text is saved.</div></div>
  <div><div class="lbl" style="margin-top:0">Past interviews</div>
  <div class="list">${recordings.map(r=>`<button class="row" data-r="${r.id}">${av(r.co)}<div class="txt"><div class="t1">${esc(r.co)}</div><div class="t2">${esc(r.label)} · ${r.date}</div></div><span class="score">${r.score}</span><span class="chev">›</span></button>`).join('')}</div></div></div>`;
}
$('#page').addEventListener('click',e=>{
  if(view!=='interview')return;
  const m=e.target.closest('[data-rm]');if(m&&!recT){recMode=+m.dataset.rm;const v=$('#jobSel').value;renderInterview();$('#jobSel').value=v;return}
  if(e.target.closest('#recBtn')){toggleRec();return}
  const r=e.target.closest('[data-r]');if(r)showInsights(recordings.find(x=>x.id===r.dataset.r));
});
function toggleRec(){
  const b=$('#recBtn');
  if(!recT){recS=0;b.classList.add('on');$('#recLbl').textContent='Recording · click to stop';$('#recLbl').classList.add('on');$('#wave').classList.add('on');
    recT=setInterval(()=>{recS+=37;$('#timer').textContent=String(Math.floor(recS/60)).padStart(2,'0')+':'+String(recS%60).padStart(2,'0')},250);
    toast('Recording. Sped up for the demo.');
  }else{clearInterval(recT);recT=null;const co=$('#jobSel').value;
    const r={id:'r'+Date.now(),co,label:'New interview',date:'Today',mins:Math.max(1,Math.round(recS/60)),score:81,fresh:1};
    recordings.unshift(r);openModal('Analyzing',`<div class="loading"><div class="spin"></div>Finding insights</div>`);
    setTimeout(()=>{showInsights(r);renderInterview();say('main',`Your ${esc(co)} interview insights are ready. Score 81, up from 74.`,[['Open insights','go:insights']])},1600);
  }
}
function showInsights(r){
  const f=r.fresh,jid=jobBy(r.co)?.id;
  openModal(esc(r.co),`<div class="t2" style="margin-bottom:16px">${esc(r.label)} · ${r.date} · ${r.mins} min · score ${r.score}</div>
  <div class="metrics">
    <div class="metric"><div class="l">You talked</div><div class="v">${f?'57%':'68%'}</div><div class="h">${f?'Good':'Aim for 50–60%'}</div></div>
    <div class="metric"><div class="l">Filler words</div><div class="v">${f?'12':'31'}</div><div class="h">${f?'Down from 31':'Mostly "basically"'}</div></div>
    <div class="metric"><div class="l">Pace</div><div class="v">148</div><div class="h">Words a minute</div></div></div>
  <div class="lbl">Went well</div><div class="ins">Clear story on the onboarding redesign, with a number.</div><div class="ins">Strong answer on saying no to a big customer.</div>
  <div class="lbl">Fix next time</div><div class="ins">${f?'Ask about next steps at the end.':'Keep the prioritization answer under 2 minutes.'}</div><div class="ins">Ask about team size and your manager.</div>
  <div class="lbl">Questions they asked</div><ol class="qlist"><li>Tell me about a product you launched from zero.</li><li>How do you pick what to build next?</li><li>A metric dropped 20%. What do you do?</li></ol>
  <div style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap"><button class="pbtn pri" data-share>Share questions, unlock others'</button>${jid?`<button class="pbtn" data-prep="${jid}">Prep with the agent</button>`:''}</div>`);
}
document.addEventListener('click',e=>{
  if(e.target.closest('[data-share]')){closeModal();toast('Shared. 23 questions unlocked.')}
  const p=e.target.closest('[data-prep]');if(p){closeModal();curJob=jobs.find(j=>j.id===+p.dataset.prep);show('job');setTimeout(()=>handle('Prep me for the next round','j'+curJob.id),200)}
});
function openModal(t,h){$('#mTitle').innerHTML=t;$('#mBody').innerHTML=h;$('#modal').classList.add('on');$('#scrim').classList.add('on')}
function closeModal(){$('#modal').classList.remove('on');if(!$('#agent').classList.contains('open'))$('#scrim').classList.remove('on')}
document.addEventListener('click',e=>{if(e.target.closest('[data-close]'))closeModal()});
$('#scrim').onclick=()=>{closeModal();openAgentMobile(false)};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();openAgentMobile(false)}
  if(e.key==='/'&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='SELECT'){e.preventDefault();setCol('r',false);openAgentMobile(true);$('#inp').focus()}});

/* where you stand */
const MAXD=16,pc=d=>Math.min(d,MAXD)/MAXD*100;
function track(j,name){
  const r=REPLY[j.co]||[4,7,10];let cls='',d=j.days;
  if(j.replied){d=j.replied;cls='done'}else if(d>r[2])cls='over';
  const who=name===false?'':esc(j.co)+' · ';
  let txt=j.replied?`${who}replied on day ${j.replied}`:`${who}day ${d} of ${r[0]}–${r[2]}`;
  if(!j.replied&&d>r[2])txt+=', later than usual';
  txt=txt[0].toUpperCase()+txt.slice(1);
  return`<div class="wt"><div class="wh"><span class="${cls?'ws '+cls:''}">${txt}</span></div>
  <div class="track" title="${esc(j.co)} usually replies in ${r[0]}–${r[2]} days"><i class="band" style="left:${pc(r[0])}%;width:${pc(r[2])-pc(r[0])}%"></i><i class="you ${cls}" style="left:${pc(d)}%"></i></div></div>`;
}
const axis=`<div class="axis"><span>Applied</span><span>Day 4</span><span>Day 8</span><span>Day 12</span><span>Day 16+</span></div>`;
const legend=`<div class="legend"><span><i style="width:10px;height:4px;border-radius:2px;background:color-mix(in srgb,var(--accent) 32%,transparent)"></i>Usual reply days</span><span><i style="width:6px;height:6px;border-radius:50%;background:var(--ink)"></i>Today</span></div>`;

/* stats */
function barChart(){
  const d=[['9/22',1],['9/29',3],['10/6',2],['10/13',4],['10/20',3],['10/27',5],['11/3',2],['11/10',4]];
  const W=380,H=150,y0=122,max=6,bw=18,step=W/d.length,y=v=>y0-(v/max)*(y0-12);
  let g=`<line class="grid" x1="0" x2="${W}" y1="${y0}" y2="${y0}"/>`;
  d.forEach(([l,v],i)=>{const cx=step*i+step/2,top=y(v);
    g+=`<path class="bar" d="M${cx-bw/2},${y0} V${top+3} q0,-3 3,-3 h${bw-6} q3,0 3,3 V${y0}Z"><title>Week of ${l}: ${v} applications</title></path>`;
    g+=`<text x="${cx}" y="${y0+16}" text-anchor="middle">${l}</text>`;
    if(i===d.length-1)g+=`<text class="vl" x="${cx}" y="${top-7}" text-anchor="middle">${v}</text>`});
  return`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Applications per week">${g}</svg>`;
}
function renderStats(){
  if(REAL)return renderStatsReal();
  $('#page').innerHTML=`<div class="ph"><h1>Stats</h1></div><div class="kpis" style="margin-top:0">
    <div class="kpi"><div class="l">Applied this month</div><div class="v">12</div><div class="d">4 more than October</div></div>
    <div class="kpi"><div class="l">Reply rate</div><div class="v">33%</div><div class="d">Average is 24%</div></div>
    <div class="kpi"><div class="l">Days to reply</div><div class="v">6.2</div><div class="d">Median</div></div>
    <div class="kpi"><div class="l">Interview score</div><div class="v">81</div><div class="d">Up from 61</div></div></div>
  <div style="margin-top:24px"><button class="nudge" data-cmd="Best time to apply"><span class="spark">${I(SPARK)}</span><div class="txt">You get 3× more replies when you apply in the first 2 days.<div class="more">Ask why →</div></div></button></div>
  <div class="grid2"><div><div class="lbl">Applications per week</div>${barChart()}</div>
  <div><div class="lbl">Where you stand</div>${legend}
  ${jobs.filter(j=>j.days&&(j.status==='applied'||j.replied)).sort((a,b)=>(a.replied?1:0)-(b.replied?1:0)).map(j=>track(j)).join('')}${axis}</div></div>
  <div class="foot">Reply times come from other JobImp users. Sample data.</div>`;
}

/* agent */
const threads={};
function thread(sc){if(!threads[sc]){const d=document.createElement('div');d.className='msgs';d.dataset.scope=sc;threads[sc]=d;intro(sc)}return threads[sc]}
function jobOf(sc){return sc&&sc[0]==='j'?jobs.find(j=>'j'+j.id===sc):null}
function bubble(sc,cls,html){const t=thread(sc);const d=document.createElement('div');d.className='msg '+cls;d.innerHTML=html;t.appendChild(d);t.scrollTop=t.scrollHeight;return d}
function acts(list){return list?`<div class="acts">${list.map((a,i)=>`<button class="act${i===0?' pri':''}" data-cmd="${esc(a[1])}">${esc(a[0])}</button>`).join('')}</div>`:''}
function say(sc,html,list,extra){bubble(sc,'bot',html+(extra||'')+acts(list))}
const fadeOut=el=>new Promise(r=>{el.classList.add('out');setTimeout(()=>{el.remove();r()},180)});
function reply(sc,html,list,extra){const t=bubble(sc,'bot typing','<i></i><i></i><i></i>');setTimeout(async()=>{await fadeOut(t);say(sc,html,list,extra);render()},600)}
const REAL_CHIPS={today:['What needs my attention?','Which companies reply fastest?'],alerts:[],jobs:['What needs my attention?','Which companies reply fastest?'],interview:['What needs my attention?'],stats:['Which companies reply fastest?']};
const CHIPS={today:['What needs my attention?','Which companies reply fastest?'],alerts:['Which job fits me best?','Why is AppsFlyer flagged?','Skip all reposts','Add Similarweb'],
  jobs:['What needs my attention?','Move Riskified to interview'],interview:['Prep Monday.com','What do I repeat most?'],stats:['Best time to apply','Which companies reply fastest?']};
function jobChips(j){return{saved:['Tailor my CV','I applied','Who’s hiring there?'],applied:['Draft a follow-up','Move to interview','Mark rejected'],
  interview:['Prep me for the next round','Salary range?','Move to offer'],offer:['Is this a good offer?','Help me negotiate'],closed:['What went wrong?','Find similar jobs','Reopen']}[j.status]}
function renderSugg(){const j=jobOf(scope);const l=j?jobChips(j):(REAL?REAL_CHIPS[view]:CHIPS[view])||[];$('#sugg').innerHTML=l.slice(0,4).map(c=>`<button data-cmd="${esc(c)}">${esc(c)}</button>`).join('')}
function intro(sc){
  const j=jobOf(sc);
  say(sc,j?`I'm following ${esc(j.co)} for you. ${SL[j.status]}${j.days&&j.status!=='saved'?`, ${j.days} days since you applied`:''}. Ask anything, or tell me what to do.`
   :REAL?`I read your Gmail and calendar to track your jobs. Read only: I never send, edit or delete anything.`:`I watch your search all day. Ask anything, or tell me what to do. I always ask before I send anything.`);
}
function setScope(sc){scope=sc;const box=$('#threadBox');box.innerHTML='';box.appendChild(thread(sc));thread(sc).scrollTop=1e5;$('#composer').dataset.scope=sc;renderABar();renderSugg()}
function modePill(){return REAL?`<button class="amode" data-amode data-tip="${amode()==='plan'?'Ask first: the Agent shows its plan before changing anything. Click for Auto':'Auto: the Agent just does what you ask. Click for Ask first'}">${amode()==='plan'?'Ask first':'Auto'}</button>`:''}
function aIcons(){return `<div class="aicons"><button class="colb" data-aclear title="Clear chat" aria-label="Clear chat"><svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/></svg></button><button class="colb" id="rTog" data-rtog title="Collapse the Agent" aria-label="Collapse the Agent"><svg class="i" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div>`}
/* hover labels: a small dark note that fades in over icon buttons */
const tipEl=document.createElement('div');tipEl.className='tip';document.body.appendChild(tipEl);let tipFor=null;
document.addEventListener('mouseover',e=>{
  const el=e.target.closest('[data-tip],button[title],a[title]');if(!el){if(tipFor){tipEl.classList.remove('on');tipFor=null}return}
  if(el===tipFor)return;
  if(el.title){el.dataset.tip=el.title;el.removeAttribute('title')}
  const r=el.getBoundingClientRect();tipFor=el;tipEl.textContent=el.dataset.tip;tipEl.classList.remove('on');tipEl.style.left='0px';tipEl.style.top='0px';
  const w=tipEl.offsetWidth,h=tipEl.offsetHeight;let x=r.left+r.width/2-w/2,y=r.bottom+8;
  if(y+h>innerHeight-8)y=r.top-h-8;x=Math.max(8,Math.min(innerWidth-w-8,x));
  if(el.closest('.side')&&$('.app').classList.contains('lcol')){x=r.right+10;y=r.top+r.height/2-h/2}
  tipEl.style.left=x+'px';tipEl.style.top=y+'px';requestAnimationFrame(()=>{if(tipFor===el)tipEl.classList.add('on')});
});
document.addEventListener('mousedown',()=>{tipEl.classList.remove('on');tipFor=null});
/* collapse / expand the left menu and the Agent (remembered) */
function setCol(side,on){$('.app').classList.toggle(side==='l'?'lcol':'rcol',on);store.set('jobimp-col-'+side,on?'1':'');
  if(side==='l'){const b=$('#lTog');b.dataset.tip=b.ariaLabel=on?'Expand menu':'Collapse menu';b.removeAttribute('title');document.querySelectorAll('#nav .nv').forEach(n=>{if(on)n.dataset.tip=n.textContent.replace(/\d+$/,'').trim();else delete n.dataset.tip})}}
function clearChat(sc){
  openModal('Clear chat?','<div class="t2" style="margin-bottom:18px">This clears the messages in this chat. Your jobs and the Agent log stay as they are.</div><button class="pbtn pri" id="clrGo">Clear</button>');
  $('#clrGo').onclick=()=>{closeModal();const t=threads[sc];if(t){t.innerHTML='';intro(sc)}hist[sc]=[];for(const k in plans)if(plans[k].sc===sc)delete plans[k];toast('Chat cleared')}}
document.addEventListener('click',e=>{
  if(e.target.closest('[data-aclear]'))clearChat(scope);
  if(e.target.closest('[data-rtog]'))setCol('r',true);
  if(e.target.closest('#rOpen,#rOpen2'))setCol('r',false);
  if(e.target.closest('#lTog'))setCol('l',!$('.app').classList.contains('lcol'));
});
function renderABar(){
  const j=jobOf(scope);
  $('#abar').innerHTML=j?`${av(j.co)}<div class="txt"><div class="t1">${esc(j.co)} agent</div><div class="t2">${esc(j.role)} · ${stl(j.status)}</div></div>${modePill()}<button class="home" data-scope-main>Main agent</button>${aIcons()}<button class="done closeA" data-closeA>Close</button>`
    :`<div class="av spark">${I(SPARK)}</div><div class="txt"><div class="t1">Agent</div><div class="t2">Knows all your jobs <span class="kbd">/</span></div></div>${modePill()}${aIcons()}<button class="done closeA" data-closeA>Close</button>`;
}
document.addEventListener('click',e=>{
  if(e.target.closest('[data-scope-main]'))setScope('main');
  if(e.target.closest('[data-closeA]'))openAgentMobile(false);
});
function openAgentMobile(on){$('#agent').classList.toggle('open',on);if(on)$('#scrim').classList.add('on');else if(!$('#modal').classList.contains('on'))$('#scrim').classList.remove('on')}
$('#atoggle').onclick=()=>openAgentMobile(true);

function findCo(t){const all=[...new Set([...jobs.map(j=>j.co),...alerts.map(a=>a.co)])];return all.find(c=>t.includes(c.toLowerCase().split(/[ .]/)[0]))}
function statusIn(t){if(/reject|closed|delete/.test(t))return'closed';if(/reopen/.test(t))return'saved';if(/accept|offer/.test(t))return'offer';if(/interview/.test(t)&&/(move|mark|to )/.test(t))return'interview';if(/applied/.test(t)&&/(mark|move|i applied|to applied)/.test(t))return'applied';return null}
const hist={},plans={};let planN=0,AMODE=null;
const agentFmt=t=>esc(t).replace(/\[([^\]\n]{1,90})\]\(((?:job|step|mail|event|page|point):[\w:.\-]+|https?:\/\/[^\s)]+)\)/g,(m,txt,u)=>/^https?:/.test(u)
    ?`<a class="alink" href="${u.replace(/&amp;/g,'&').replace(/"/g,'%22')}" target="_blank" rel="noopener">${txt}</a>`
    :`<a class="alink" href="#" data-alink="${u}">${txt}</a>`).replace(/\n/g,'<br>');
// Agent links: open the job, a step's email, an email or an event. The chat stays as it is.
async function openALink(u){
  const [k,a,b]=u.split(':');
  const narrow=matchMedia('(max-width:1240px)').matches;
  if(k==='job'){const j=jobs.find(x=>x.id===+a);if(!j){toast('That job is not in My jobs.');return}curJob=j;show('job',true);if(narrow)openAgentMobile(false);setTimeout(()=>flashRecent(j.id),80);return}
  if(k==='page'){const v={found:'alerts',myjobs:'jobs',interviews:'interview'}[a]||a;if(!['today','alerts','jobs','interview','stats','settings'].includes(v))return;show(v,true);if(narrow)openAgentMobile(false);setTimeout(()=>flashRecent(v),80);return}
  if(k==='point'){const el=document.querySelector(`[data-aref="${+a}"]`);if(!el){toast('That is no longer on the screen.');return}if(narrow)openAgentMobile(false);glow(el);return}
  if(k==='step'){const j=jobs.find(x=>x.id===+a),t0=j&&(j.tl0||j.tl)[+b];if(!t0){toast('Could not find that step.');return}openStep(j,null,t0);return}
  openModal(k==='event'?'Calendar event':'Email','<div class="t2 logpad">Opening…</div>');
  try{if(k==='event'){const {event:e}=await api('/api/jobs?event='+encodeURIComponent(a));$('#mBody').innerHTML=eventHtml(e)}
    else{const {mail,account}=await api('/api/jobs?mail='+encodeURIComponent(a));$('#mBody').innerHTML=mailHtml(mail,account)}}
  catch(x){$('#mBody').innerHTML=`<div class="t2 logpad">${esc(x.message||'Could not open it.')}</div>`}
}
/* Show the Agent's changes: a soft blink if you can see them, else a small pop-up at the bottom left. */
function flash(el){if(!el)return;el.classList.remove('aflash');void el.offsetWidth;el.classList.add('aflash');setTimeout(()=>el.classList.remove('aflash'),3000)}
function glow(el){el.scrollIntoView({block:'center',behavior:'smooth'});el.classList.remove('aglow');void el.offsetWidth;el.classList.add('aglow');setTimeout(()=>el.classList.remove('aglow'),4200)}
const RECENT=new Map(); // job id or page -> changed fields, kept 10 minutes so "View" can blink them
// Where a change shows on the current screen (empty if not on screen).
function changeEls(c){
  const out=[];
  if(c.f==='settings'){if(view==='settings'){const r=$('#page .setrow');if(r)out.push(r)}return out}
  if(!c.job)return out;
  document.querySelectorAll(`#page [data-open="${c.job}"]`).forEach(e=>out.push(e));
  if(view==='job'&&curJob?.id===c.job){
    out.push($('#page .dh'));
    const tl=$('#page .tlh')?.parentElement;
    ({role:[$('#page .dh h2')],company:[$('#page .dh .t2')],applied:[$('#page .dh .t2')],status:[$('#page .tabsline button.on'),tl],note:[tl],added:[tl],merged:[tl]})[c.f]?.forEach(e=>out.push(e));
  }
  return out.filter(Boolean);
}
function flashRecent(key){
  const list=RECENT.get(key);if(!list)return;RECENT.delete(key);
  list.filter(c=>Date.now()-c.t<6e5).forEach(c=>changeEls(c).forEach(flash));
}
// What the user sees now, sent with each question. Clickable things get a number the Agent can point to.
function screenCtx(){
  document.querySelectorAll('[data-aref]').forEach(e=>e.removeAttribute('data-aref'));
  const modal=$('#modal').classList.contains('on');
  const roots=modal?[$('#modal')]:[$('#page'),$('#nav'),$('#sjobs')];
  const refs=[];let n=0;
  roots.filter(Boolean).forEach(r=>r.querySelectorAll('button,a,input,select,[data-open],[data-step]').forEach(el=>{
    if(n>=80||!el.offsetParent||el.closest('[data-aref]'))return;
    const label=(el.getAttribute('aria-label')||el.innerText||el.placeholder||el.title||'').replace(/\s+/g,' ').trim();if(!label)return;
    el.dataset.aref=++n;refs.push({n,label:el.tagName==='INPUT'?'Box: '+label:label});
  }));
  const text=(modal?$('#modal').innerText:$('#page').innerText).replace(/\n{3,}/g,'\n\n').slice(0,5000);
  return {view:modal?'popup':view,job:view==='job'&&curJob?curJob.id:null,text,refs};
}
const popOn=()=>store.get('jobimp-agent-pop')!=='off';
function showChanges(list){
  list=(list||[]).filter(c=>c&&c.text);if(!list.length)return;
  const unseen=[];
  for(const c of list){
    const els=changeEls(c);
    if(els.length)els.forEach(flash);
    else{unseen.push(c);const key=c.f==='settings'?'settings':c.job;if(key){const l=RECENT.get(key)||[];l.push({...c,t:Date.now()});RECENT.set(key,l)}}
  }
  if(!unseen.length||!popOn())return;
  const link=c=>c.f==='settings'?'page:settings':c.job&&jobs.some(j=>j.id===c.job)?'job:'+c.job:'';
  const box=$('#apop');box.innerHTML=`<div class="t3">Agent</div>`+unseen.slice(0,4).map(c=>`<div class="apr"><span>${esc(c.text)}</span>${link(c)?`<a href="#" class="alink" data-alink="${link(c)}">View</a>`:''}</div>`).join('');
  box.classList.remove('in','out');void box.offsetWidth;box.classList.add('in');
  clearTimeout(showChanges.t);const hide=()=>{showChanges.t=setTimeout(()=>{box.classList.add('out');box.classList.remove('in')},1300)};
  box.onmouseenter=()=>clearTimeout(showChanges.t);box.onmouseleave=hide;hide();
}
// One time: find the email behind older log rows and timeline steps, so everything can be linked. Read only.
let linking=false;
async function linkOldMail(){if(linking||!GOOGLE.connected||store.get('jobimp-linked-v1'))return;linking=true;
  try{for(let i=0;i<120;i++){if(importing)break;
      let r;try{r=await api('/api/agent',{op:'linkold'})}catch(x){if(x.status===429){await sleep(30e3);continue}throw x}
      if(r.wait)break;if(!r.left){store.set('jobimp-linked-v1','1');break}await sleep(1500)}
    await pull(true)}catch{}finally{linking=false}}
// Claude puts each job's steps in order (all its emails together). Runs for jobs it has not done yet, one at a time.
let ordering=false;
async function orderSteps(){if(ordering||!GOOGLE.connected||importing||!(STEPS_LEFT>0))return;ordering=true;
  try{for(let i=0;i<300;i++){let r;try{r=await api('/api/jobs',{op:'order'})}catch(x){if(x.status===429){await sleep(30e3);continue}throw x}
      if(r.wait)break;if(i%3===2||!r.left)await pull(true);if(!r.left)break;await sleep(800)}}catch{}finally{ordering=false;STEPS_LEFT=0}}
async function afterChange(d){if(!d.changed)return;await pull(true);setTimeout(()=>showChanges(d.changes),60)}
const amode=()=>AMODE||(AMODE=store.get('jobimp-agent-mode')==='auto'?'auto':'plan');
function undoBtn(id){return id?`<div class="acts"><button class="act" data-aundo="${id}">Undo</button></div>`:''}
async function askAgent(raw,sc){
  const h=hist[sc]||(hist[sc]=[]);h.push({role:'user',content:raw});
  const t=bubble(sc,'bot typing','<i></i><i></i><i></i>');const j=jobOf(sc);
  try{const d=await api('/api/agent',{messages:h.slice(-20),jobId:j?j.id:null,mode:amode(),screen:screenCtx()});await fadeOut(t);h.push({role:'assistant',content:d.text});
    if(d.plan){const k=++planN;plans[k]={calls:d.plan,sc,ask:raw};say(sc,agentFmt(d.text),null,`<div class="acts"><button class="act pri" data-aplan="${k}">Do it</button><button class="act" data-acancel="${k}">Cancel</button></div>`)}
    else say(sc,agentFmt(d.text),null,undoBtn(d.undoId));
    const pts=[...d.text.matchAll(/\]\(point:(\d+)\)/g)].map(m=>document.querySelector(`[data-aref="${m[1]}"]`)).filter(Boolean);if(pts.length&&!matchMedia('(max-width:1240px)').matches)pts.forEach(glow);
    afterChange(d)}
  catch(e){await fadeOut(t);h.pop();say(sc,esc(e.status===503?'The AI key is not set yet, so I can’t answer.':'Sorry, I couldn’t answer just now. Try again.'))}
}
document.addEventListener('click',async e=>{
  const p=e.target.closest('[data-aplan],[data-acancel]'),u=e.target.closest('[data-aundo]');
  if(p){const k=p.dataset.aplan||p.dataset.acancel,pl=plans[k];if(!pl)return;delete plans[k];p.parentElement.remove();const h=hist[pl.sc]||(hist[pl.sc]=[]);
    if(p.dataset.acancel){h.push({role:'user',content:'Cancel that plan.'},{role:'assistant',content:'OK, I changed nothing.'});say(pl.sc,'OK, I changed nothing.');return}
    const t=bubble(pl.sc,'bot typing','<i></i><i></i><i></i>');
    try{const d=await api('/api/agent',{op:'apply',calls:pl.calls,ask:pl.ask});await fadeOut(t);h.push({role:'user',content:'Do it.'},{role:'assistant',content:d.text});say(pl.sc,agentFmt(d.text),null,undoBtn(d.undoId));afterChange(d)}
    catch(x){await fadeOut(t);say(pl.sc,esc(x.message||'Could not do it. Try again.'))}}
  if(u){const id=u.dataset.aundo;u.parentElement.remove();const sc=scope;
    try{const d=await api('/api/agent',{op:'undo',id});(hist[sc]||(hist[sc]=[])).push({role:'user',content:'Undo that.'},{role:'assistant',content:'Undone.'});say(sc,'Undone.');afterChange(d)}
    catch(x){say(sc,esc(x.status===409?'That was already undone.':'Could not undo. Try again.'))}}
  const al=e.target.closest('[data-alink]');if(al){e.preventDefault();openALink(al.dataset.alink);return}
  const m=e.target.closest('[data-amode]');if(m){AMODE=amode()==='plan'?'auto':'plan';store.set('jobimp-agent-mode',AMODE);renderABar();toast(AMODE==='plan'?'Ask first: I’ll show my plan before I change anything':'Auto: I’ll just do what you ask')}
});
function handle(raw,sc){
  const t=raw.toLowerCase().trim();if(!t)return;
  if(sc!==scope)setScope(sc);
  if(matchMedia('(max-width:1240px)').matches)openAgentMobile(true);
  bubble(sc,'me',esc(raw));
  if(REAL){askAgent(raw,sc);return}
  const ctxJob=jobOf(sc);const co=findCo(t)||ctxJob?.co;const job=co&&jobBy(co);const st=statusIn(t);
  if(st&&/(mark|move|i applied|reopen|delete|rejected)/.test(t)&&job){setStatus(job,st);
    reply(sc,`Done. ${esc(job.co)} is now ${SL[st]}.${st==='closed'?' I’ll note what we learned.':st==='applied'?' I’ll nudge you in 7 days.':''}`,sc[0]==='j'?null:[['Open','go:open:'+job.id]]);setTimeout(renderABar,650);return}
  if(/^add|save /.test(t)){const a=alerts.find(x=>x.co===co&&x.tag!=='applied');
    if(a){alerts=alerts.filter(x=>x!==a);const j=addJob(a,'Added by agent');reply(sc,`Added ${esc(a.co)} to My jobs.`,[['Open','go:open:'+j.id]]);return}
    if(job){reply(sc,`${esc(co)} is already in My jobs.`);return}
    reply(sc,'Name a company from Found, or paste a job link.');return}
  if(/skip all reposts/.test(t)){alerts=alerts.filter(a=>a.tag!=='reposted');reply(sc,'Skipped. I’ll hide reposts from now on.');return}
  if(/flagged|repost/.test(t)){reply(sc,'AppsFlyer posted the same job 3 times since August. 9 users applied and none got a reply.');return}
  if(/fits me best/.test(t)){reply(sc,'Similarweb, Growth. Posted 1 hour ago on their own site, and they reply in about 5 days.',[['Add it','Add Similarweb']]);return}
  if(/follow/.test(t)&&job){reply(sc,`A follow-up for ${esc(job.co)}. I'll send it only when you approve.`,[['Approve and send','send follow-up '+job.co],['Shorter','shorter']],
    `<div class="draft">Hi${REAL?'':' Maya'},\nI applied for the ${esc(job.role)} role and wanted to check in. I'm still very interested.\nThanks,\nGilad</div>`);return}
  if(/^send follow-up/.test(t)&&job&&REAL){reply(sc,'I never send from your Gmail. Copy the draft and send it yourself.');return}
  if(/^send follow-up/.test(t)&&job){job.tl.unshift(['Today','Follow-up sent']);reply(sc,'Sent from your Gmail. I’ll tell you when they reply.');return}
  if(/shorter/.test(t)){reply(sc,'Shorter:',null,'<div class="draft">Hi Maya, checking in on my application. Still very interested. Thanks, Gilad</div>');return}
  if(REAL&&/(prep|salary|cv|negotiate|good offer|hiring there|went wrong|similar|repeat most|best time|^mock$|flagged|repost|fits me best|^add|save )/.test(t)){reply(sc,'That part still runs on sample data, so I won’t guess for your real account yet.');return}
  if(/prep/.test(t)){const c=job?job.co:'Monday.com';reply(sc,`For ${esc(c)} on Tuesday:<br>1. Pause after each answer. You talked 68% last time.<br>2. Others were asked: "A metric dropped 20%. What do you do?"<br>3. Ask about team size.`,[['Practice a question','mock']]);return}
  if(t==='mock'){reply(sc,'"How do you pick what to build next?" Answer by voice or text.');return}
  if(/cv/.test(t)){reply(sc,`For ${esc(co||'this job')} I'd add: A/B testing, B2B SaaS, SQL. I'll show you the changes first.`);return}
  if(/salary/.test(t)){reply(sc,`About ₪34K–40K a month, from 14 users. Don’t name a number first.`);return}
  if(/negotiate|good offer/.test(t)){reply(sc,'It’s near the middle of the range. Ask for 8% more base.');return}
  if(/hiring there|who/.test(t)){reply(sc,`${esc(co||'They')} hired 3 PMs this year. I can find the hiring manager.`);return}
  if(/went wrong/.test(t)){reply(sc,'You talked 74% of the time and skipped a metrics question. Practice that.');return}
  if(/similar/.test(t)){reply(sc,'2 similar jobs in Found: Similarweb and Check Point.',[['Show me','go:alerts']]);return}
  if(REAL&&/attention/.test(t)){reply(sc,attentionList().map((a,i)=>`${i+1}. ${esc(a[0])}`).join('<br>')||'Nothing urgent right now.');return}
  if(REAL&&/fastest/.test(t)){reply(sc,fastest());return}
  if(/attention/.test(t)){reply(sc,'1. Wix is quiet for 10 days.<br>2. Monday.com interview on Tuesday.<br>3. Lemonade saved 5 days, not applied.',[['Follow up Wix','Follow up Wix']]);return}
  if(/repeat most/.test(t)){reply(sc,'You say "basically" a lot and start with background. Lead with the result.');return}
  if(/best time/.test(t)){reply(sc,'In the first 2 days after a post. Your reply rate: 41% then, 12% after a week.');return}
  if(/fastest/.test(t)){reply(sc,'Monday.com in 4 days, Riskified 5, Wix 6. Playtika is slowest at 12.');return}
  reply(sc,ctxJob?`I can move ${esc(ctxJob.co)}, write emails, prep you, or answer questions.`:'I can add jobs, move them, write follow-ups, and prep interviews.');
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-cmd]');if(!b)return;
  const c=b.dataset.cmd;
  if(c.startsWith('link:')){openALink(c.slice(5));return}
  if(c.startsWith('go:')){const[,what,arg]=c.split(':');
    if(what==='alerts')show('alerts');else if(what==='jobs'||what==='settings')show(what);else if(what==='insights')showInsights(recordings[0]);else if(what==='open')openJob(+arg);
    return}
  handle(c,b.closest('#page')&&view!=='job'?'main':scope);
});
$('#composer').onsubmit=e=>{e.preventDefault();const v=$('#inp').value;$('#inp').value='';handle(v,scope)};
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null;
$('#mic').onclick=e=>{const m=e.currentTarget;
  if(!SR){if(REAL){toast('Voice needs Chrome, Edge or Safari.');return}
    if(m.classList.contains('rec'))return;m.classList.add('rec');$('#inp').placeholder='Listening…';
    setTimeout(()=>{m.classList.remove('rec');$('#inp').placeholder='Ask or tell me anything';handle('Add Similarweb',scope)},1400);return}
  if(rec){rec.stop();return}
  rec=new SR();rec.lang=store.get('jobimp-voice-lang')||navigator.language||'en-US';rec.interimResults=true;rec.continuous=false;
  const base=$('#inp').value;let fin='';
  rec.onresult=ev=>{let f='',tmp='';for(const r of ev.results){if(r.isFinal)f+=r[0].transcript;else tmp+=r[0].transcript}fin=f;$('#inp').value=(base?base+' ':'')+(f+tmp)};
  rec.onerror=ev=>{if(ev.error==='not-allowed')toast('Allow the microphone to talk to the Agent.');else if(ev.error!=='no-speech'&&ev.error!=='aborted')toast('Could not hear you. Try again.')};
  rec.onend=()=>{m.classList.remove('rec');$('#inp').placeholder='Ask or tell me anything';rec=null;const v=$('#inp').value.trim();if(fin&&v){$('#inp').value='';handle(v,scope)}};
  m.classList.add('rec');$('#inp').placeholder='Listening… tap the mic to stop';if(matchMedia('(max-width:1240px)').matches)openAgentMobile(true);rec.start()};


/* accounts: demo (sample data) or Gilad (real data from Gmail + calendar, read only) */
const DAY=864e5;let TODAY=new Date(new Date().toDateString());
const localIso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dt=d=>new Date(d+'T00:00:00');
const fmt=d=>dt(d).toLocaleDateString('en-US',{month:'short',day:'numeric'});
const daysBetween=(a,b)=>Math.round((dt(b)-dt(a))/DAY);
const median=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
function loadReal(data){
  REAL=true;alerts=[];recordings=[];ME=data.name||'You';GOOGLE=data.google||{};VER=data.v||'';STEPS_LEFT=data.stepsLeft||0;SETTINGS=data.settings||SETTINGS;
  const iso=localIso(TODAY);
  jobs=data.jobs.map((j,i)=>({id:j.id??i+1,co:j.co,role:j.role,loc:j.loc||'',src:j.src||'Email',status:j.status,next:null,nextRaw:j.next||null,
    applied:j.applied,firstReply:j.firstReply,tl0:j.tl.map(t=>[...t]),tl:j.tl.map(t=>[...t]),link:j.link||'',contact:j.contact||'',
    days:j.applied?daysBetween(j.applied,iso):null,
    replied:j.applied&&j.firstReply?daysBetween(j.applied,j.firstReply):null,
    since:!j.applied&&j.firstReply?fmt(j.firstReply):null}));
  const r=jobs.filter(j=>j.replied!=null).map(j=>j.replied).sort((a,b)=>a-b);
  const q=f=>r.length?r[Math.min(r.length-1,Math.floor(f*r.length))]:7;
  const band=[q(.25),median(r)??7,q(.75)];REPLY={};jobs.forEach(j=>REPLY[j.co]=band);
  jobs.forEach(j=>{if(normalizeMoves(j)){j.tl=j.tl0.map(t=>[...t]);saveJob(j)}});
  if(!jobs.some(j=>j.status===jobTab))jobTab=jobs.some(j=>j.status==='interview')?'interview':'applied';migrateLocal();refreshTime();
}
function loadDemo(){REAL=false;jobs=DEMO_JOBS.map(j=>({...j,tl:[...j.tl]}));alerts=DEMO_ALERTS.map(a=>({...a}));recordings=[...DEMO_RECS];REPLY=DEMO_REPLY;jobTab='applied';applyHidden();applyMoves()}
function realStats(){
  const ap=jobs.filter(j=>j.applied),rep=ap.filter(j=>j.firstReply);
  return{ap,rate:ap.length?Math.round(rep.length/ap.length*100):0,med:median(rep.map(j=>j.replied)),
    waiting:jobs.filter(j=>j.status==='applied'),inter:jobs.filter(j=>j.status==='interview'),
    everInter:jobs.filter(j=>j.tl.some(t=>/interview|first call/i.test(t[1]))).length};
}
function attentionList(){
  const out=[];
  jobs.filter(j=>j.next).forEach(j=>out.push([`${j.co} interview ${j.next}`,'go:open:'+j.id]));
  jobs.filter(j=>j.status==='interview'&&!j.next).forEach(j=>{const last=j.tl[0][0];out.push([j.doneAt&&(TODAY-j.doneAt)/DAY<=7?`${j.co}: interview done ${last}. Waiting for result`:`${j.co} is quiet since ${last}. Follow up?`,'go:open:'+j.id])});
  realStats().waiting.filter(j=>j.days>=21).sort((a,b)=>b.days-a.days).forEach(j=>out.push([`${j.co}: no reply in ${j.days} days`,'go:open:'+j.id]));
  return out;
}
function fastest(){
  const r=jobs.filter(j=>j.replied!=null).sort((a,b)=>a.replied-b.replied);
  return r.slice(0,4).map(j=>`${esc(j.co)} in ${j.replied} day${j.replied===1?'':'s'}`).join(', ')+'.'+(r.length>4?` Slowest: ${esc(r.at(-1).co)}, ${r.at(-1).replied} days.`:'');
}
function realNudge(j){
  if(j.status==='interview'){
    if(j.next)return /^Today/.test(j.next)?`Interview today at ${esc(j.next.split(', ')[1]||'')}. Good luck! Want a quick prep?`:`Next: ${esc(j.next)}. Want help to prep?`;
    if(j.doneAt&&(TODAY-j.doneAt)/DAY<=7)return `Interview done on ${esc(j.tl[0][0])}. Waiting for their answer. I'll nudge you if it takes long.`;
    return `No news since ${esc(j.tl[0][0])}. A short follow-up could help.`;}
  if(j.status==='applied')return `No reply in ${j.days} days.${j.days>=21?' Half the companies that answered you did it within '+(median(jobs.filter(x=>x.replied!=null).map(x=>x.replied))??7)+' days.':''}`;
  if(j.status==='closed')return j.replied!=null?`They answered on day ${j.replied}.`:`Closed. I can show what to change for similar roles.`;
  return 'Ask me anything about this job.';
}
function kpi(l,v,d){return`<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`}
let ATT_ALL=false;
// This week: calendar events for the next 7 days (one upcoming event per job, from Gmail and calendar)
function weekEvents(){
  const end=new Date(TODAY.getTime()+7*DAY),out=[];
  jobs.forEach(j=>{const at=parseNext(j.nextRaw);if(!at||at<TODAY||at>=end||j.status==='closed')return;
    const t=(j.tl0||j.tl).find(x=>/\(coming up\)/.test(x[1]));const s=t&&stepOf(t);
    out.push({j,at,what:s&&STEPL[s]&&s!=='applied'?STEPL[s]+(s==='test'||s==='present'?'':' interview'):'Interview'})});
  return out.sort((a,b)=>a.at-b.at);
}
function nextAfterWeek(){
  const end=new Date(TODAY.getTime()+7*DAY);let best=null;
  jobs.forEach(j=>{const at=parseNext(j.nextRaw);if(at&&at>=end&&j.status!=='closed'&&(!best||at<best.at))best={j,at}});return best;
}
function renderTodayReal(){
  const S=realStats(),att=attentionList();
  const notes=notifList().filter(i=>!CLEARED.has(i.key)),atts=att.map(a=>({kind:'att',key:'a:'+a[0],text:a[0],link:/^go:open:/.test(a[1])?'job:'+a[1].split(':')[2]:'',cmd:a[1],sub:'Open the job'})).filter(i=>!CLEARED.has(i.key));
  setTimeout(()=>markSeen([...notes,...atts]),0);
  const first=(ME||'').split(/\s+/)[0]||'there';
  // This week
  const ev=weekEvents(),hm=d=>d.toTimeString().slice(0,5);
  let week;
  if(ev.length){
    week='<div class="wk">';
    for(let i=0;i<7;i++){const d=new Date(TODAY.getTime()+i*DAY),ds=d.toDateString();
      week+=`<div class="wday${i===0?' on':''}"><div class="wdh"><span>${i===0?'Today':d.toLocaleDateString('en-US',{weekday:'short'})}</span><b>${d.getDate()}</b></div>`+
      ev.filter(e=>e.at.toDateString()===ds).map(e=>`<button class="wev" data-cmd="go:open:${e.j.id}" title="${esc(e.j.co+' · '+e.what+' · '+hm(e.at))}"><b>${hm(e.at)}</b><em>${esc(e.j.co)}</em><span>${esc(e.what)}</span></button>`).join('')+'</div>'}
    week+='</div>';
  }else{
    const nx=nextAfterWeek();
    week=`<div class="wempty"><div class="wet">Nothing scheduled this week.</div><div class="t2">${nx?`Next: ${esc(nx.j.co)}, ${nx.at.toLocaleDateString('en-US',{month:'short',day:'numeric'})}.`:'No interviews coming up yet.'}</div></div>`;
  }
  // Needs attention: top 3, one main button each
  const btn=t=>/interview (Today|Tomorrow)/.test(t)?['Prep',1]:/interview /.test(t)?['Open',0]:/quiet|Follow up/.test(t)?['Follow up',0]:/no reply/.test(t)?['Open',0]:/done .*Waiting/.test(t)?['Open',0]:['Open',0];
  // Interviews later this week already show in This week; keep only today/tomorrow here (prep).
  const attsT=atts.filter(i=>!(/ interview /.test(i.text)&&/ in \d+ days$/.test(i.text)));
  const shown=ATT_ALL?attsT:attsT.slice(0,3);shown.forEach(i=>TITEMS[i.key]=i);
  const attH=shown.map(i=>{const [l,p]=btn(i.text);return`<div class="rowx tw"><button class="twr" data-cmd="${esc(i.cmd)}"><div class="t1">${esc(i.text)}</div></button><button class="tbtn${p?' p':''}" data-cmd="${esc(i.cmd)}">${l}</button><button class="xclr" data-clr="${esc(i.key)}" data-tip="Clear" aria-label="Clear">${I('<path d="M6 6l12 12M18 6L6 18"/>')}</button></div>`}).join('')||'<div class="empty sm">Nothing urgent.</div>';
  const newH=notes.slice(0,3).map(n=>`<button class="tnew" data-cmd="link:${esc(n.link)}"><i class="${n.bad?'bad':''}"></i><div class="txt"><div class="t1">${esc(n.text)}</div><div class="t2">${esc(n.sub)}</div></div></button>`).join('')||'<div class="empty sm">Nothing new.</div>';
  // My jobs
  const cnt=s=>jobs.filter(j=>j.status===s).length,cd=SETTINGS.closeDays||0;
  const soon=cd?jobs.filter(j=>(j.status==='applied'||j.status==='interview')&&!j.next&&j.tl[0]&&(()=>{const d=tlDate(j.tl[0][0]);if(!d)return false;const n=Math.round((TODAY-d)/DAY);return n>=cd-2&&n<cd})()).length:0;
  $('#page').innerHTML=`<div class="hero"><div class="d">${TODAY.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}${bellHtml(notes)}</div><h2>Hi, ${esc(first)}.</h2></div>
  <div class="tdash">
  <section class="tw-card"><div class="twl"><span>This week</span></div>${week}</section>
  <div class="tw-two">
    <section class="tw-card"><div class="twl"><span>Needs attention${attsT.length?` · ${attsT.length}`:''}</span>${attsT.length>3?`<button class="link" data-attall>${ATT_ALL?'Show less':'See all '+attsT.length}</button>`:''}</div><div class="list" data-sec="att">${attH}</div></section>
    <section class="tw-card"><div class="twl"><span>What's new</span><button class="link" data-bell>All notifications</button></div><div class="list">${newH}</div></section>
  </div>
  <section class="tw-card"><div class="twl"><span>My jobs</span><button class="link" data-cmd="go:jobs">Open My jobs</button></div>
    <div class="tjobs"><div><b>${cnt('applied')}</b><span><i style="background:var(--s-applied)"></i>Applied</span></div><div><b>${cnt('interview')}</b><span><i style="background:var(--s-interview)"></i>In process</span></div><div><b>${cnt('offer')}</b><span><i style="background:var(--s-offer)"></i>Offers</span></div><div><b>${S.rate}%</b><span>Reply rate · ${S.ap.filter(j=>j.firstReply).length} of ${S.ap.length}</span></div></div>
    ${cd?`<div class="t2 tfoot">${soon?`${soon} job${soon>1?'s':''} will close soon (no news for ${cd} days). `:`Jobs with no news for ${cd} days close automatically. `}<button class="link" data-cmd="go:settings">Settings</button></div>`:''}
  </section>
  </div>`;
}
document.addEventListener('click',e=>{if(e.target.closest('[data-attall]')){ATT_ALL=!ATT_ALL;render()}});
/* Today: notifications (news from your email and calendar), clear buttons, and history */
let CLEARED=new Set();const SEEN=new Set(),TITEMS={};
const MONS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function stepDay(l){const m=/^([A-Z][a-z]{2}) (\d{1,2})$/.exec(String(l));if(!m)return null;let d=new Date(TODAY.getFullYear(),MONS.indexOf(m[1]),+m[2]);if(d-TODAY>60*DAY)d=new Date(TODAY.getFullYear()-1,MONS.indexOf(m[1]),+m[2]);return d}
function notifList(){
  const out=[];
  jobs.forEach(j=>(j.tl0||j.tl).forEach(t=>{
    const m=t[2]||{};if(m.s!=='gmail'&&m.s!=='calendar')return;if(/\(coming up\)|reminder/i.test(t[1]))return;
    const d=stepDay(t[0]);if(!d||d>TODAY||TODAY-d>14*DAY)return;
    const text=`${j.co}: ${t[1]}`;out.push({kind:'note',key:`n:${j.id}:${t[0]}:${t[1]}`,text,d,link:'job:'+j.id,sub:`${t[0]} · ${m.s==='calendar'?'Calendar':'Gmail'}`,bad:REJECT.test(t[1])});
  }));
  return out.sort((a,b)=>b.d-a.d).slice(0,10);
}
const IC_BELL='<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',IC_CLOCK='<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
/* bell: notifications in a small panel at the top right of Today */
let NOPEN=false;
const readSet=()=>{try{return new Set(JSON.parse(store.get('jobimp-notes-read')||'[]'))}catch{return new Set()}};
function bellHtml(notes){
  const rd=readSet(),fresh=notes.filter(n=>!rd.has(n.key)).length;
  return `<div class="bellw"><button class="bell${NOPEN?' on':''}" data-bell data-tip="Notifications" aria-label="Notifications" aria-expanded="${NOPEN}">${I(IC_BELL)}${fresh?`<span class="bdot">${fresh}</span>`:''}</button>
    <div class="npanel${NOPEN?' open':''}" role="dialog" aria-label="Notifications"><div class="nph"><span class="t1">Notifications</span><span class="npa">${notes.length>1?'<button class="link" data-clrall="note">Clear all</button>':''}<button class="link" data-hist>History</button></span></div>
    <div class="npl">${todaySection('note','',notes,'Nothing new.',true)}</div></div></div>`;
}
function setBell(on){NOPEN=on;const w=$('.bellw');if(!w)return;w.querySelector('.bell').classList.toggle('on',on);w.querySelector('.bell').setAttribute('aria-expanded',on);w.querySelector('.npanel').classList.toggle('open',on);
  if(on){const keys=Object.values(TITEMS).filter(i=>i.kind==='note').map(i=>i.key);store.set('jobimp-notes-read',JSON.stringify([...new Set([...readSet(),...keys])].slice(-300)));const d=w.querySelector('.bdot');if(d)d.remove()}}
document.addEventListener('click',e=>{
  if(e.target.closest('[data-bell]')){setBell(!NOPEN);return}
  if(NOPEN&&!e.target.closest('.npanel'))setBell(false);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&NOPEN)setBell(false)});
function todaySection(kind,title,items,empty,bare){
  items.forEach(i=>TITEMS[i.key]=i);
  return `${bare?'':`<div class="lblrow"><div class="lbl">${title}</div>${items.length>1?`<button class="link clrall" data-clrall="${kind}">Clear all</button>`:''}</div>`}
  <div class="list" data-sec="${kind}">${items.map(i=>`<div class="rowx${i.bad?' bad':''}">${hrow(kind==='note'?IC_BELL:IC_CLOCK,esc(i.text),esc(i.sub),i.cmd||'link:'+i.link)}<button class="xclr" data-clr="${esc(i.key)}" data-tip="Clear" aria-label="Clear">${I('<path d="M6 6l12 12M18 6L6 18"/>')}</button></div>`).join('')||`<div class="empty sm">${empty}</div>`}</div>`;
}
const pack=i=>({key:i.key,kind:i.kind,text:i.text,link:i.link||''});
function markSeen(items){const fresh=items.filter(i=>!SEEN.has(i.key));if(!fresh.length||!REAL)return;fresh.forEach(i=>SEEN.add(i.key));api('/api/today',{op:'seen',items:fresh.map(pack)}).catch(()=>{})}
async function loadCleared(){try{const r=await api('/api/today',{op:'cleared'});CLEARED=new Set(r.keys||[]);if(view==='today')render()}catch{}}
function clearItems(keys){
  const items=keys.map(k=>TITEMS[k]).filter(Boolean);if(!items.length)return;
  keys.forEach(k=>CLEARED.add(k));
  const rows=[...document.querySelectorAll('.xclr')].filter(b=>keys.includes(b.dataset.clr)).map(b=>b.closest('.rowx'));
  rows.forEach(r=>r.animate?r.animate([{opacity:1,height:r.offsetHeight+'px'},{opacity:0,height:'0px'}],{duration:260,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'}):0);
  setTimeout(()=>{if(view==='today')render()},270);
  api('/api/today',{op:'clear',items:items.map(pack)}).catch(()=>toast('Could not save. Check your connection.'));
  toast(items.length>1?`Cleared ${items.length}. See them in History`:'Cleared. See it in History');
}
document.addEventListener('click',e=>{
  const x=e.target.closest('[data-clr]');if(x){e.stopPropagation();clearItems([x.dataset.clr]);return}
  const all=e.target.closest('[data-clrall]');if(all){clearItems([...document.querySelectorAll(`[data-sec="${all.dataset.clrall}"] [data-clr]`)].map(b=>b.dataset.clr));return}
  if(e.target.closest('[data-hist]')){show('history',true);return}
  const r=e.target.closest('[data-restore]');if(r){const k=r.dataset.restore;CLEARED.delete(k);r.closest('.hrow2').classList.remove('off');r.remove();api('/api/today',{op:'restore',key:k}).catch(()=>{});toast('Back on Today')}
  const o=e.target.closest('[data-hopen]');if(o&&!e.target.closest('[data-restore]')){openALink(o.dataset.hopen)}
},true);
async function renderHistory(){
  $('#page').innerHTML=`<button class="back" data-v-today>‹ Today</button><div class="ph"><h1>History</h1></div><div class="t2" style="margin-top:-8px">Everything that showed up on Today, newest first. Cleared items can be brought back.</div><div class="list" id="histList" style="margin-top:18px"><div class="t2 logpad">Loading…</div></div>`;
  try{const r=await api('/api/today',{op:'history',limit:100});if(view!=='history')return;
    $('#histList').innerHTML=(r.items||[]).map(i=>`<div class="hrow2${i.cleared_at?' off':''}"${i.link?` data-hopen="${esc(i.link)}" role="button" tabindex="0"`:''}><span class="mini">${I(i.kind==='note'?IC_BELL:IC_CLOCK)}</span><div class="txt"><div class="t1">${esc(i.text)}</div><div class="t2">${i.kind==='note'?'Notification':'Needs attention'} · ${esc(fmtWhen(i.first_seen))}${i.cleared_at?' · Cleared':''}</div></div>${i.cleared_at?`<button class="link" data-restore="${esc(i.key)}">Bring back</button>`:''}</div>`).join('')||'<div class="empty sm">Nothing yet.</div>'}
  catch(x){$('#histList').innerHTML=`<div class="t2 logpad">${esc(x.message||'Could not load.')}</div>`}
}
document.addEventListener('click',e=>{if(e.target.closest('[data-v-today]'))show('today',true)});
function renderStatsReal(){
  const S=realStats();
  const wk=[];for(let i=7;i>=0;i--){const end=new Date(TODAY-i*7*DAY),start=new Date(end-6*DAY);
    wk.push([`${start.getMonth()+1}/${start.getDate()}`,S.ap.filter(j=>{const d=dt(j.applied);return d>=start&&d<=end}).length])}
  const W=380,H=150,y0=122,max=Math.max(3,...wk.map(w=>w[1])),bw=18,step=W/wk.length,y=v=>y0-(v/max)*(y0-12);
  let g=`<line class="grid" x1="0" x2="${W}" y1="${y0}" y2="${y0}"/>`;
  wk.forEach(([l,v],i)=>{const cx=step*i+step/2,top=y(v);
    if(v)g+=`<path class="bar" d="M${cx-bw/2},${y0} V${top+3} q0,-3 3,-3 h${bw-6} q3,0 3,3 V${y0}Z"><title>Week of ${l}: ${v} applications</title></path><text class="vl" x="${cx}" y="${top-7}" text-anchor="middle">${v}</text>`;
    g+=`<text x="${cx}" y="${y0+16}" text-anchor="middle">${l}</text>`});
  const replied=jobs.filter(j=>j.replied!=null).sort((a,b)=>a.replied-b.replied);
  $('#page').innerHTML=`<div class="ph"><h1>Stats</h1></div><div class="kpis" style="margin-top:0">
    ${kpi('Applications',S.ap.length,'With a known date')}${kpi('Reply rate',S.rate+'%','Any answer, yes or no')}${kpi('Days to reply',S.med??'–','Median')}${kpi('Got interviews',S.everInter,'Companies')}</div>
  <div class="grid2"><div><div class="lbl">Applications per week</div><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Applications per week">${g}</svg></div>
  <div><div class="lbl">How fast they answered</div>${legend}${replied.map(j=>track(j)).join('')}${axis}</div></div>
  <div class="foot">From your Gmail and calendar. Read only. Nothing was changed.</div>`;
}

/* login */
function startApp(){
  $('#login').hidden=true;$('#meName').textContent=REAL?ME:'Demo account';$('#meAv').textContent=(REAL?ME:'D')[0]||'G';renderGoogle();
  view='today';curJob=null;for(const k in threads)delete threads[k];
  setScope('main');show('today');
}
function showLogin(){$('#login').hidden=false;$('#pwColl').classList.remove('open');$('#loginErr').textContent='';$('#gBtn').hidden=!GOOGLE_ON}
setTimeout(()=>{const app=$('.app');app.style.transition='none';if(store.get('jobimp-col-l'))setCol('l',true);if(store.get('jobimp-col-r'))setCol('r',true);requestAnimationFrame(()=>requestAnimationFrame(()=>app.style.transition=''))},0);
const store={get:k=>{try{return localStorage.getItem(k)}catch{return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch{}},del:k=>{try{localStorage.removeItem(k)}catch{}}};
let GOOGLE_ON=false;
async function api(path,body){
  const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||'Could not reach the backend.'),{status:r.status});return d;
}
function signOut(){store.del('jobimp-token');store.del('jobimp-account');api('/api/login',{logout:true}).catch(()=>{})}
async function openReal(){
  const d=await api('/api/jobs');loadReal(d);startApp();
  try{api('/api/jobs',{op:'tz',tz:Intl.DateTimeFormat().resolvedOptions().timeZone})}catch{}
  loadCleared();
  if(GOOGLE.importing&&GOOGLE.ai!==false)runImport();else{linkOldMail();orderSteps()}
}
$('#login').addEventListener('click',async e=>{
  if(e.target.closest('[data-acc="demo"]')){if($('#rem').checked)store.set('jobimp-account','demo');loadDemo();startApp();return}
  if(e.target.closest('[data-acc="gilad"]')){$('#pwColl').classList.add('open');setTimeout(()=>$('#pw').focus(),60);return}
});
$('#pwRow').onsubmit=async e=>{
  e.preventDefault();const err=$('#loginErr');err.textContent='Checking…';
  try{const d=await api('/api/login',{password:$('#pw').value,remember:$('#rem').checked});
    $('#pw').value='';if(d.token)store.set('jobimp-token',d.token);store.set('jobimp-account','gilad');err.textContent='';await openReal();
  }catch(x){err.textContent=x.message||'Could not sign in.'}
};
document.addEventListener('click',e=>{if(e.target.closest('[data-switch]')){signOut();REAL=false;closeModal();openAgentMobile(false);showLogin()}});
(async function autoLogin(){
  const msg={connected:'',denied:'Google sign-in was canceled.',failed:'Google sign-in did not work. Try again.',taken:'That Google account is already used by another JobImp account.',off:'Google sign-in is not set up yet.'};
  const gq=new URLSearchParams(location.search).get('google');if(gq)history.replaceState(null,'',location.pathname);
  let me=null;try{const d=await api('/api/login');me=d.user;GOOGLE_ON=!!d.google}catch{}
  if(gq&&msg[gq])toast(msg[gq]);
  try{
    if(me){await openReal();if(gq==='connected')toast('Gmail connected. Reading your job emails…');return}
    const acc=store.get('jobimp-account'),tok=store.get('jobimp-token');
    if(acc==='demo'){loadDemo();startApp();return}
    if(acc==='gilad'&&tok){await api('/api/login',{token:tok});await openReal();return}
  }catch(x){if(x.status===401)signOut()}
  showLogin();
})();

/* saving the real account's changes in the database */
function saveJob(j,removed){
  if(!REAL)return;
  api('/api/jobs',{op:'save',id:j.id,status:j.status,tl:j.tl0||j.tl,removed:!!removed}).then(d=>{if(d.v)VER=d.v}).catch(x=>toast(x.status===401?'Please sign in again.':'Could not save. Check your connection.'));
}
// One time: moves and removals made before the database are copied to it, then cleared from this browser.
function migrateLocal(){
  let hid=[],mov={};try{hid=JSON.parse(localStorage.getItem('jobimp-removed-gilad')||'[]');mov=JSON.parse(localStorage.getItem('jobimp-moves-gilad')||'{}')}catch{}
  if(!hid.length&&!Object.keys(mov).length)return;
  jobs.forEach(j=>{const c=mov[jkey(j)];if(!c)return;if(j.tl0.some(t=>c.notes.some(n=>n[0]===t[0]&&n[1]===t[1])))return;
    j.status=c.status;j.tl0=[...c.notes.map(x=>[...x]),...j.tl0];j.tl=j.tl0.map(x=>[...x]);saveJob(j)});
  const h=new Set(hid);jobs.filter(j=>h.has(jkey(j))).forEach(j=>saveJob(j,true));jobs=jobs.filter(j=>!h.has(jkey(j)));
  store.del('jobimp-removed-gilad');store.del('jobimp-moves-gilad');
}

/* Gmail connection: status in the sidebar, first import, and live updates */
const agoMin=t=>{if(!t)return'';const m=Math.round((Date.now()-new Date(t))/60e3);return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' d ago'};
let importing=false;
function renderGoogle(){
  const el=$('#gsync');if(!el)return;
  if(!REAL){el.hidden=true;return}
  el.hidden=false;
  if(!GOOGLE.available){el.innerHTML=`<span class="gdot off"></span>Gmail not linked yet`;return}
  if(!GOOGLE.connected){el.innerHTML=`<a class="glink" href="/api/google?start=1">Connect Gmail &amp; Calendar</a>`;return}
  if(GOOGLE.ai===false){el.innerHTML=`<span class="gdot off"></span>Gmail linked · waiting for AI key`;el.title=`Read only: ${GOOGLE.email||''}`;return}
  el.innerHTML=importing||GOOGLE.importing?`<span class="gdot busy"></span>Reading your Gmail…`:`<span class="gdot"></span>Gmail live · ${esc(agoMin(GOOGLE.lastSync)||'waiting')}`;
  el.title=`Read only: ${GOOGLE.email||''}`;
}
async function runImport(){
  if(importing)return;importing=true;renderGoogle();
  const note=t=>{const el=$('#gsync');if(el)el.innerHTML=`<span class="gdot busy"></span>${esc(t)}`};
  let fails=0,ok=false;
  for(let k=0;k<400;k++){
    try{const r=await api('/api/jobs',{op:'sync'});fails=0;if(r.waiting){importing=false;renderGoogle();return}await pull(true);if(r.done){ok=true;break}note(`Reading… ${r.read||0} checked`)}
    catch(x){
      // Google's per-minute limit: wait and keep going. Other errors: retry a few times, then stop.
      if(x.status===429||/quota|rate limit/i.test(x.message||'')){note('Google asked us to slow down. Continuing in a moment…');await sleep(30e3);continue}
      if(x.status===401){toast('Please sign in again.');break}
      if(++fails<=((x.status||500)>=500?8:3)){note('Lost the connection. Trying again in a moment…');await sleep(10e3);continue}
      toast('Could not finish reading Gmail. It will continue next time you open the app.');break}
  }
  if(ok)toast('Done reading your Gmail and calendar');
  importing=false;await pull(true);renderGoogle();
  if(ok){linkOldMail();orderSteps()}
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function pull(force,fresh){
  if(!REAL||!$('#login').hidden)return;
  try{const d=await api('/api/jobs?'+new URLSearchParams(force?(fresh?{fresh:1}:{}):{v:VER,...(fresh?{fresh:1}:{})}));
    if(d.same){return}
    GOOGLE=d.google||GOOGLE;VER=d.v;
    const keepView=view,keepJob=curJob?.id,keepTab=jobTab,keep=$('#main').scrollTop;
    loadReal(d);jobTab=keepTab;
    if(keepView==='job'){curJob=jobs.find(j=>j.id===keepJob)||null;view=curJob?'job':'jobs'}else view=keepView;
    render();renderGoogle();$('#main').scrollTop=keep;
    if(GOOGLE.importing&&GOOGLE.ai!==false&&!importing)runImport();else orderSteps();
  }catch(x){if(x.status===401){signOut();showLogin()}}
}
// Check for news every 20 s while the app is open (asks Gmail directly every 2 min, in case a ping was missed).
let pullN=0;setInterval(()=>{if(document.hidden||importing||drag)return;pullN++;pull(false,pullN%6===0);renderGoogle()},20e3);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!importing)pull(false,true)});

/* visual timeline: one vertical line, dots spaced by the days between events, a "today" marker, future steps hollow */
const MON={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
function tlDate(label){
  const t0=new Date(new Date().toDateString());
  if(/^today$/i.test(label))return t0;
  const m=/^([A-Z][a-z]{2})\s+(\d{1,2})$/.exec(label.trim());if(!m||!(m[1] in MON))return null;
  let d=new Date(t0.getFullYear(),MON[m[1]],+m[2]);
  if(d-t0>120*864e5)d=new Date(t0.getFullYear()-1,MON[m[1]],+m[2]);
  return d;
}
function visualTimeline(j){
  const t0=new Date(new Date().toDateString());
  let ev=j.tl.map((t,k)=>({d:tlDate(t[0]),label:t[0],x:t[1],k,m:t[2]})).filter(e=>e.d).sort((a,b)=>a.d-b.d);
  if(!ev.length)return '<div class="empty">No dates yet.</div>';
  const items=[];let todayIn=false;
  ev.forEach(e=>{if(!todayIn&&e.d>t0){items.push({today:true,d:t0});todayIn=true}items.push(e)});
  if(!todayIn)items.push({today:true,d:t0});
  const dn=(a,b)=>Math.round((b-a)/864e5);
  let h='';
  items.forEach((e,i)=>{
    if(i){const g=dn(items[i-1].d,e.d),px=Math.round(Math.min(64,6+Math.sqrt(g)*9));
      h+=`<div class="vg" style="height:${px}px">${g>0?`<span>${g} day${g===1?'':'s'}</span>`:''}</div>`}
    if(e.today)h+=`<div class="ve today"><i></i><span class="vd">Today</span><span class="vx"></span></div>`;
    else h+=`<div class="ve${e.d>t0?' fut':''}${/reject|closed/i.test(e.x)?' bad':''}${stepTap(e.x,e.m)?' tap':''}"${stepTap(e.x,e.m)?` data-step="${e.k}" role="button" tabindex="0"`:''}><i></i><span class="vd">${esc(e.label)}</span><span class="vx">${esc(e.x)}${e.m?.f?`<span class="clip" title="${e.m.f} file${e.m.f>1?'s':''}">${I(IC_CLIP)}</span>`:''}</span></div>`;
  });
  return `<div class="vtl">${h}</div>`;
}

/* tap a timeline step: see its email or calendar event, with files. Read only. */
const IC_CLIP='<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15 7"/>';
// Steps made inside the app (moves, auto-close) have no email behind them.
const stepTap=(x,m)=>REAL&&m?.s!=='agent'&&m?.s!=='none'&&m?.s!=='you'&&(m?.id||!/^(Moved to |Closed|Saved for later|Added |Interview \(coming up\))/.test(String(x)));
const fsize=n=>n>=1e6?(n/1e6).toFixed(1)+' MB':n>=1e3?Math.round(n/1e3)+' KB':n?n+' B':'';
const fmtWhen=t=>{const d=new Date(t);return isNaN(d)?'':d.toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})};
const nameOf=s=>String(s||'').replace(/\s*<[^>]*>/g,'').replace(/"/g,'').trim()||String(s||'');
async function openStep(j,k,raw){
  const t=raw||j?.tl[k];if(!t)return;
  openModal(esc(t[1]),`<div class="t2 logpad">Opening…</div>`);
  try{
    let m=t[2];
    if(!m?.id){
      const t0=raw||j.tl0?.[k]||t; // the saved step (its text can differ on screen, e.g. "(done)")
      const r=await api('/api/jobs',{op:'findmail',id:j.id,label:t0[0],text:t0[1]});m=r.meta;
      if(!m){$('#mBody').innerHTML=`<div class="t2 logpad">No email found for ${esc(j.co)} on ${esc(t[0])}.</div>`;return}
      t[2]=m;t0[2]=m;
    }
    if(m.s==='calendar'){const {event:e}=await api('/api/jobs?event='+encodeURIComponent(m.id));$('#mBody').innerHTML=eventHtml(e);return}
    const {mail,account}=await api('/api/jobs?mail='+encodeURIComponent(m.id));$('#mBody').innerHTML=mailHtml(mail,account);
  }catch(x){$('#mBody').innerHTML=`<div class="t2 logpad">${esc(x.message||'Could not open this email.')}</div>`}
}
function filesHtml(files,mk){return files.length?`<div class="files">${files.map(f=>`<a class="fchip" href="${mk(f)}" target="_blank" rel="noopener">${I(IC_CLIP)}<span class="fn">${esc(f.name)}</span>${f.size?`<span class="fs">${fsize(f.size)}</span>`:''}</a>`).join('')}</div>`:''}
function mailHtml(m,acc){
  const q=f=>`/api/jobs?${new URLSearchParams({mail:m.id,att:f.id,name:f.name,type:f.type})}`;
  return `<div class="mail"><div class="t1">${esc(m.subject||'(no subject)')}</div>
    <div class="t3">${m.sent?'You sent this':'From '+esc(nameOf(m.from))} · ${esc(fmtWhen(m.at))}</div>
    ${m.sent?`<div class="t3">To ${esc(nameOf(m.to))}</div>`:''}
    ${filesHtml(m.files||[],q)}
    <div class="mtext">${esc(m.text||'')}</div>
    <a class="link" href="https://mail.google.com/mail/?${new URLSearchParams({authuser:acc||''})}#all/${encodeURIComponent(m.thread||m.id)}" target="_blank" rel="noopener">Open in Gmail ↗</a></div>`;
}
function eventHtml(e){
  return `<div class="mail"><div class="t1">${esc(e.title||'(no title)')}</div>
    <div class="t3">${esc(fmtWhen(e.start))}${e.status==='cancelled'?' · Canceled':''}${e.organizer?' · '+esc(e.organizer):''}</div>
    ${filesHtml(e.files||[],f=>f.url)}
    ${/^https:/.test(e.meet||'')?`<a class="link" href="${esc(e.meet)}" target="_blank" rel="noopener">Join the video call ↗</a>`:''}
    ${e.text?`<div class="mtext">${esc(e.text)}</div>`:''}
    ${/^https:/.test(e.link||'')?`<a class="link" href="${esc(e.link)}" target="_blank" rel="noopener">Open in Calendar ↗</a>`:''}</div>`;
}

/* settings: auto-close days, and the email log (what Claude decided for each email) */

function renderSettings(){
  const d=REAL?SETTINGS.closeDays:(+store.get('jobimp-close-demo')||16);
  $('#page').innerHTML=`<div class="ph"><h1>Settings</h1></div>
    <div class="lbl" style="margin-top:0">Auto-close</div>
    <div class="setrow">Move a job to Closed after <input id="closeDays" type="number" min="0" max="365" value="${d}"> days with no news.<button class="pbtn" id="saveClose">Save</button></div>
    <div class="foot" style="margin-top:6px">Counts from the last email, interview or move. 0 means never.</div>
    ${REAL?`<div class="lbl">Agent</div>
      <div class="logh"><div class="t2">Show a small pop-up when the Agent changes something on another page.</div>
      <button class="tgl${popOn()?' on':''}" id="popTog" role="switch" aria-checked="${popOn()}" aria-label="Agent pop-ups"><i></i></button></div>
      <div class="logh"><div class="t2">Agent log: everything the Agent changed for you.</div>
      <button class="pbtn sm" id="alogTog" aria-expanded="${ALOG.open}">${ALOG.open?'Hide log':'Show log'}</button></div>
      <div class="coll${ALOG.open?' open':''}" id="alogColl"><div><div id="alogBody">${alogHtml()}</div></div></div>`:''}
    ${REAL?`<div class="lbl">Email log</div>
      <div class="logh"><div class="t2">What the Agent read in your email, what it changed in your jobs, and why. Nothing is changed in Gmail.</div>
      <button class="pbtn sm" id="logTog" aria-expanded="${LOGST.open}">${LOGST.open?'Hide log':'Show log'}</button></div>
      <div class="coll${LOGST.open?' open':''}" id="logColl"><div><div id="logBody">${logHtml()}</div></div></div>
`:''}`;
  $('#saveClose').onclick=saveClose;
  if(REAL)$('#logTog').onclick=toggleLog;
  if(REAL){$('#alogTog').onclick=toggleALog;$('#popTog').onclick=e=>{const on=!popOn();store.set('jobimp-agent-pop',on?'on':'off');e.currentTarget.classList.toggle('on',on);e.currentTarget.setAttribute('aria-checked',on);toast(on?'Pop-ups on':'Pop-ups off')}}
}
/* Agent log: every change the Agent made, newest first, with Undo */
const ALOG={open:false,rows:null,total:0,page:0};
function alogHtml(){
  const L=ALOG;if(L.rows===null)return '<div class="t2 logpad">Loading…</div>';
  if(!L.rows.length)return '<div class="t2 logpad">The Agent hasn’t changed anything yet.</div>';
  const rows=L.rows.map(r=>`<div class="logr"><div class="t3">${esc(fmtWhen(r.at))}${r.undone&&r.can_undo?' · Undone':''}</div>
    ${r.ask?`<div class="why"><b>You asked:</b> ${esc(r.ask)}</div>`:''}
    ${(r.items||[{text:r.label}]).map(i=>`<div class="did${r.undone&&r.can_undo?' off':''}">${esc(i.text)}${i.job&&jobs.some(j=>j.id===i.job)?` <a href="#" class="alink" data-alink="job:${i.job}">View</a>`:''}</div>`).join('')}
    ${r.can_undo&&!r.undone?`<button class="link" data-alundo="${r.id}" style="font-size:13.6px;margin-top:4px">Undo</button>`:''}</div>`).join('');
  const from=L.page*15+1,to=Math.min(L.total,from+L.rows.length-1);
  return rows+(L.total>15?`<div class="logf"><button class="link" data-alg="newer"${L.page?'':' disabled'}>Newer</button><span>${from}–${to} of ${L.total}</span><button class="link" data-alg="older"${to<L.total?'':' disabled'}>Older</button></div>`:'');
}
async function loadALog(){try{const r=await api('/api/agent',{op:'log',limit:15,offset:ALOG.page*15});ALOG.rows=r.log||[];ALOG.total=r.total||0}catch{ALOG.rows=[];ALOG.total=0}}
function swapALog(){const box=$('#alogBody');if(!box)return;const h0=box.offsetHeight;box.innerHTML=alogHtml();const h1=box.offsetHeight;
  if(h0!==h1&&$('#alogColl').classList.contains('open')&&box.animate)box.animate([{height:h0+'px'},{height:h1+'px'}],{duration:300,easing:'cubic-bezier(.2,.7,.2,1)'})}
async function toggleALog(){const L=ALOG,c=$('#alogColl'),b=$('#alogTog');L.open=!L.open;b.textContent=L.open?'Hide log':'Show log';b.setAttribute('aria-expanded',L.open);
  if(L.open){L.page=0;L.rows=null;$('#alogBody').innerHTML=alogHtml();c.classList.add('open');await loadALog();if(L.open)swapALog()}else c.classList.remove('open')}
document.addEventListener('click',async e=>{
  const g=e.target.closest('[data-alg]');if(g&&!g.disabled){ALOG.page=g.dataset.alg==='older'?ALOG.page+1:Math.max(0,ALOG.page-1);await loadALog();swapALog();return}
  const u=e.target.closest('[data-alundo]');if(u){u.disabled=true;try{const d=await api('/api/agent',{op:'undo',id:u.dataset.alundo});toast('Undone');await afterChange(d);await loadALog();swapALog()}catch(x){toast(x.status===409?'Already undone':'Could not undo.');u.disabled=false}}
});
/* email log: closed by default; open shows the last 5, "Show more" shows 15 per page with Older / Newer */
const LOGST={open:false,mode:'peek',page:0,rows:null,total:0};
const LOG_PAGE=15,LOG_PEEK=5;
function logHtml(){
  const L=LOGST;
  if(L.rows===null)return '<div class="t2 logpad">Loading…</div>';
  if(!L.rows.length)return `<div class="t2 logpad">${GOOGLE.connected?(GOOGLE.ai===false?'Waiting for the AI key. Nothing was read yet.':'Nothing read yet.'):'Connect Gmail to see what the Agent reads.'}</div>`;
  const rows=L.rows.map(l=>{const r={...(l.result||{})};r.did=oldDid(r);const off=/^(Ignored|Skipped|No change)/.test(r.did||'');
    return `<div class="logr"><div class="t1">${esc(l.subject||'(no subject)')}</div><div class="t3">${l.src==='calendar'?'Calendar':'Gmail'} · ${esc(l.item_at?new Date(l.item_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'')} · ${esc(String(l.sender||'').replace(/\s*<[^>]*>/,'').replace(/^"|"$/g,'')||'')}</div>
      <div class="did${off?' off':''}"><b>Decision:</b> ${esc(r.did||'')}</div>${r.why?`<div class="why"><b>Why:</b> ${esc(r.why)}</div>`:''}</div>`}).join('');
  let foot='';
  if(L.mode==='peek'){if(L.total>LOG_PEEK)foot=`<button class="link" data-lg="more">Show more</button>`}
  else{const from=L.page*LOG_PAGE+1,to=Math.min(L.total,from+L.rows.length-1);
    foot=`<button class="link" data-lg="newer"${L.page?'':' disabled'}>Newer</button><span>${from}–${to} of ${L.total}</span><button class="link" data-lg="older"${to<L.total?'':' disabled'}>Older</button>`}
  return rows+(foot?`<div class="logf">${foot}</div>`:'');
}
async function loadLog(){
  const L=LOGST,limit=L.mode==='peek'?LOG_PEEK:LOG_PAGE,offset=L.mode==='peek'?0:L.page*LOG_PAGE;
  try{const r=await api(`/api/jobs?log=1&limit=${limit}&offset=${offset}`);L.rows=r.log||[];L.total=r.total||0}catch{L.rows=[];L.total=0}
}
// Changes the log's content and animates its height to the new size.
function swapLog(){
  const box=$('#logBody');if(!box)return;
  const h0=box.offsetHeight;box.innerHTML=logHtml();const h1=box.offsetHeight;
  if(h0!==h1&&$('#logColl').classList.contains('open')&&box.animate)box.animate([{height:h0+'px'},{height:h1+'px'}],{duration:300,easing:'cubic-bezier(.2,.7,.2,1)'});
}
async function toggleLog(){
  const L=LOGST,c=$('#logColl'),b=$('#logTog');L.open=!L.open;
  b.textContent=L.open?'Hide log':'Show log';b.setAttribute('aria-expanded',L.open);
  if(L.open){L.mode='peek';L.page=0;L.rows=null;$('#logBody').innerHTML=logHtml();c.classList.add('open');await loadLog();if(L.open)swapLog()}
  else c.classList.remove('open');
}
document.addEventListener('click',async e=>{
  const g=e.target.closest('[data-lg]');if(!g||g.disabled)return;
  const L=LOGST,k=g.dataset.lg;
  if(k==='more'){L.mode='pages';L.page=0}else if(k==='older')L.page++;else if(k==='newer')L.page=Math.max(0,L.page-1);
  g.disabled=true;await loadLog();swapLog();
});
// Log rows saved before the clearer wording.
const SLAB=SL;
function oldDid(r){const d=r.did||'';let m;
  if(m=/^Updated (.+) \((\w+)\)$/.exec(d))return `${m[1]}: added "${r.note||'Update'}" to timeline`;
  if(m=/^New job: (.+) \((\w+)\)$/.exec(d))return `${m[1]}: new job added (${SLAB[m[2]]||m[2]})`;
  if(/^Ignored: not about/.test(d))return 'Skipped: not about a job application';
  if(/^Ignored: company unclear/.test(d))return "Skipped: couldn't tell which company";
  return d;}
async function saveClose(){
  const v=Math.round(+$('#closeDays').value);
  if(!(v>=0&&v<=365)){toast('Pick 0 to 365 days');return}
  if(!REAL){store.set('jobimp-close-demo',String(v));toast('Saved');return}
  try{await api('/api/jobs',{op:'settings',closeDays:v});SETTINGS.closeDays=v;toast('Saved');await pull(true)}catch(x){toast(x.message||'Could not save.')}
}

/* remove a job (trash). Saved per account in this browser only. */
const IC_TRASH='<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>';
const delBtn=j=>`<span class="del" role="button" tabindex="0" data-del="${j.id}" title="Remove this job" aria-label="Remove ${esc(j.co)}">${I(IC_TRASH)}</span>`;
const jkey=j=>j.co+'|'+j.role;
const hidKey=()=>'jobimp-removed-'+(REAL?'gilad':'demo');
function hidList(){try{return JSON.parse(localStorage.getItem(hidKey())||'[]')}catch{return[]}}
function hidSave(l){try{localStorage.setItem(hidKey(),JSON.stringify(l))}catch{}}
function applyHidden(){const h=new Set(hidList());jobs=jobs.filter(j=>!h.has(jkey(j)))}
let lastRemoved=null,undoFn=null;
function removeJob(id){
  const i=jobs.findIndex(j=>j.id===id);if(i<0)return;const j=jobs[i];
  jobs.splice(i,1);lastRemoved={j,i};if(REAL)saveJob(j,true);else hidSave([...new Set([...hidList(),jkey(j)])]);
  if(view==='job'&&curJob?.id===id)show('jobs');else render();
  toast(`${j.co} removed`,true);
}
function undoRemove(){
  if(!lastRemoved)return;const{j,i}=lastRemoved;lastRemoved=null;
  jobs.splice(Math.min(i,jobs.length),0,j);if(REAL)saveJob(j);else hidSave(hidList().filter(k=>k!==jkey(j)));
  render();toast(`${j.co} is back`);
}
document.addEventListener('keydown',e=>{const d=e.target.closest?.('[data-del]');if(d&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();removeJob(+d.dataset.del)}},true);

/* time: labels follow the clock. Re-checks every minute, re-renders when something changes. */
function parseNext(str){
  const m=/([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{1,2}):(\d{2})/.exec(str||'');if(!m)return null;
  const d=tlDate(m[1]+' '+m[2]);if(!d)return null;d.setHours(+m[3],+m[4],0,0);return d;
}
function refreshTime(){
  if(!REAL)return false;
  const now=new Date();TODAY=new Date(now.toDateString());const iso=localIso(TODAY);
  const before=JSON.stringify(jobs.map(j=>[j.next,j.days,j.tl]));
  const tmr=new Date(TODAY.getTime()+DAY);
  jobs.forEach(j=>{
    if(j.applied)j.days=daysBetween(j.applied,iso);
    const at=parseNext(j.nextRaw);j.next=null;j.doneAt=null;
    if(at){const hm=at.toTimeString().slice(0,5),end=new Date(at.getTime()+90*60e3);
      if(now>end)j.doneAt=new Date(at.toDateString());
      else if(at.toDateString()===TODAY.toDateString())j.next=`Today, ${hm}`;
      else if(at.toDateString()===tmr.toDateString())j.next=`Tomorrow, ${hm}`;
      else{const n=Math.round((new Date(at.toDateString())-TODAY)/DAY);j.next=`${j.nextRaw} · in ${n} days`}}
    // m = which email or event the step came from (kept so the step opens it)
    j.tl=j.tl0.map(([d,x,m])=>{const w=(a,b)=>m?[a,b,m]:[a,b];if(!/\(coming up\)/.test(x))return w(d,x);const dd=tlDate(d);
      if(!dd||dd>TODAY)return w(d,x);
      if(dd.getTime()===TODAY.getTime()&&!j.doneAt)return w(d,x.replace('(coming up)','(today)'));
      return w(d,x.replace(/^Next /,'').replace(/\s*\(coming up\)/,'').replace(/^./,c=>c.toUpperCase())+' (done)')});
  });
  return before!==JSON.stringify(jobs.map(j=>[j.next,j.days,j.tl]));
}
setInterval(()=>{if(REAL&&$('#login').hidden&&refreshTime()){const keep=$('#main').scrollTop;render();$('#main').scrollTop=keep}},60e3);

/* status moves: saved per account in this browser until we have the database */
const IC_BOOKMARK='<path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-4.2L6 21V4.5a1 1 0 0 1 1-1z"/>';
const movKey=()=>'jobimp-moves-'+(REAL?'gilad':'demo');
function movGet(){try{return JSON.parse(localStorage.getItem(movKey())||'{}')}catch{return{}}}
function movSet(o){try{localStorage.setItem(movKey(),JSON.stringify(o))}catch{}}
function saveMove(j,prev,note){if(REAL){saveJob(j);return}const o=movGet(),k=jkey(j);const c=o[k]||{orig:prev,notes:[]};c.status=j.status;c.notes=[note,...c.notes];o[k]=c;movSet(o)}
function applyMoves(){const o=movGet();jobs.forEach(j=>{const c=o[jkey(j)];if(!c)return;j.status=c.status;const n=c.notes.map(x=>[...x]);j.tl=[...n,...j.tl];if(j.tl0)j.tl0=[...n.map(x=>[...x]),...j.tl0]})}
function undoMove(j,r,tab){
  j.status=r.prev;j.tl=j.tl.filter(t=>t!==r.note);if(j.tl0)j.tl0=j.tl0.filter(t=>t!==r.note);
  if(REAL)saveJob(j);
  const o=REAL?{}:movGet(),k=jkey(j),c=o[k];if(c){c.notes.shift();c.status=r.prev;if(!c.notes.length&&c.status===c.orig)delete o[k];movSet(o)}
  if(tab)jobTab=tab;refreshTime();render();renderABar();toast(`${j.co} moved back`);
}
function moveJob(j,s){
  const tab=jobTab,r=setStatus(j,s,true);if(!r)return;refreshTime();render();renderABar();
  undoFn=()=>undoMove(j,r,tab);toast(`${j.co} moved to ${s==='saved'?'Saved':SL[s]}`,true);
}

/* drag and drop: board cards to columns, list rows to phase tabs. Mouse: drag. Touch: press and hold, then drag. */
let drag=null,eatClick=false;
function dragTarget(x,y){const el=document.elementFromPoint(x,y);return el&&el.closest('[data-drop]')}
function dragStart(){
  if(!drag||drag.on)return;drag.on=true;const r=drag.el.getBoundingClientRect();
  const g=drag.el.cloneNode(true);g.classList.add('ghost');g.style.width=r.width+'px';g.removeAttribute('data-open');
  drag.dx=drag.x-r.left;drag.dy=drag.y-r.top;drag.g=g;document.body.appendChild(g);drag.el.classList.add('dragging');document.body.classList.add('is-dragging');
  dragMove(drag.x,drag.y);if(navigator.vibrate&&drag.touch)navigator.vibrate(15);
}
function dragMove(x,y){
  drag.g.style.transform=`translate(${x-drag.dx}px,${y-drag.dy}px) rotate(1.5deg)`;
  const t=dragTarget(x,y);if(t!==drag.t){drag.t?.classList.remove('drop-on');drag.t=t;const j=jobs.find(q=>q.id===drag.id);if(t&&t.dataset.drop!==j?.status)t.classList.add('drop-on')}
}
function dragEnd(drop){
  if(!drag)return;clearTimeout(drag.timer);const d=drag;drag=null;
  if(!d.on)return;d.g.remove();d.el.classList.remove('dragging');document.body.classList.remove('is-dragging');d.t?.classList.remove('drop-on');
  eatClick=true;setTimeout(()=>eatClick=false,0);
  if(drop&&d.t){const j=jobs.find(q=>q.id===d.id),s=d.t.dataset.drop;if(j&&s.startsWith('step:'))setStep(j,s.slice(5));else if(j&&s!==j.status)moveJob(j,s)}
}
document.addEventListener('pointerdown',e=>{
  const it=e.target.closest('[data-drag]');if(!it||(e.pointerType==='mouse'&&e.button!==0)||e.target.closest('[data-del]'))return;
  drag={el:it,id:+it.dataset.drag,x:e.clientX,y:e.clientY,on:false,touch:e.pointerType!=='mouse'};
  if(drag.touch)drag.timer=setTimeout(dragStart,380);
});
document.addEventListener('pointermove',e=>{
  if(!drag)return;const mv=Math.hypot(e.clientX-drag.x,e.clientY-drag.y);
  if(!drag.on){if(drag.touch){if(mv>8){clearTimeout(drag.timer);drag=null}}else if(mv>6){dragStart()}return}
  e.preventDefault();dragMove(e.clientX,e.clientY);
});
document.addEventListener('pointerup',()=>dragEnd(true));
document.addEventListener('pointercancel',()=>dragEnd(false));
document.addEventListener('touchmove',e=>{if(drag?.on)e.preventDefault()},{passive:false});
document.addEventListener('contextmenu',e=>{if(drag)e.preventDefault()});
window.addEventListener('click',e=>{if(eatClick){e.stopPropagation();e.preventDefault();eatClick=false}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag?.on){drag.t?.classList.remove('drop-on');drag.t=null;dragEnd(false)}});
