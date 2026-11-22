const ST=['saved','applied','interview','offer','closed'];
const SL={saved:'Saved',applied:'Awaiting reply',interview:'Interview',offer:'Offer',closed:'Closed'};
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
let jobs=[],alerts=[],recordings=[],REAL=false,REPLY={};
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
  view=v;closeModal();
  document.querySelectorAll('.nv').forEach(b=>b.classList.toggle('on',b.dataset.v===(v==='job'?'jobs':v)));
  $('#main').scrollTop=0;
  if(!keepScope)setScope(v==='job'?'j'+curJob.id:'main');
  render(true);
}
function render(anim){
  const p=$('#page');p.classList.toggle('wide',view==='jobs'&&jobsMode==='board');
  ({today:renderToday,alerts:renderAlerts,jobs:renderJobs,job:renderJob,interview:renderInterview,stats:renderStats})[view]();
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
  if(e.target.closest('[data-undo]')){undoRemove();return}
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
function addJob(a,how){const j={id:Date.now(),co:a.co,role:a.role,loc:a.loc,src:a.src,status:'saved',tl:[['Today',how]]};jobs.unshift(j);return j}

/* my jobs */
const IC_BOARD='<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M15 4v16"/>',IC_LIST='<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>';
function renderJobs(){
  let h=`<div class="ph"><h1>My jobs</h1><div class="seg"><button class="${jobsMode==='list'?'on':''}" data-mode="list">${I(IC_LIST)}List</button><button class="${jobsMode==='board'?'on':''}" data-mode="board">${I(IC_BOARD)}Board</button></div></div>`;
  if(jobsMode==='board'){
    h+=`<div class="cols">${ST.map(s=>{const js=jobs.filter(j=>j.status===s);return`<div class="col"><h4><span class="st ${s}">${SL[s]}</span><span class="c">${js.length}</span></h4>
     ${js.map(j=>`<button class="kc" data-open="${j.id}"><div class="co">${esc(j.co)}</div><div class="rl">${esc(j.role)}</div>
     <div class="ft"><span>${j.next?j.next.split(',')[0]:j.days!=null&&s!=='closed'?j.days+'d since applied':s==='saved'?'Not applied':''}</span></div>${delBtn(j)}</button>`).join('')||'<div class="kempty">Empty</div>'}</div>`}).join('')}</div>
     <div class="note" style="margin-top:14px">Click a card to open it. Its agent opens on the right.</div>`;
  }else{
    const js=jobs.filter(j=>j.status===jobTab);
    h+=`<div class="tabsline">${ST.map(s=>`<button class="${s===jobTab?'on':''}" data-s="${s}">${SL[s]}<span class="n">${jobs.filter(j=>j.status===s).length}</span></button>`).join('')}</div>
    ${js.length?`<div class="list" style="margin-top:4px">${js.map(j=>`<button class="row" data-open="${j.id}">${av(j.co)}<div class="txt"><div class="t1">${esc(j.co)}</div><div class="t2">${esc(j.role)}${j.loc?' · '+esc(j.loc):''}</div>${j.next?`<div class="next">${j.next}</div>`:''}</div>
     <span class="src">${j.src}</span>
     ${(j.status==='applied'||j.status==='interview')&&j.days!=null?`<div class="days${j.days>=10&&j.status==='applied'?' hot':''}"><div class="n">${j.days}d</div><div class="l">applied</div></div>`:'<div class="days"></div>'}${delBtn(j)}<span class="chev">›</span></button>`).join('')}</div>`:`<div class="empty">Nothing here yet.</div>`}`;
  }
  $('#page').innerHTML=h;
}
$('#page').addEventListener('click',e=>{
  if(view!=='jobs')return;
  const m=e.target.closest('[data-mode]');if(m){jobsMode=m.dataset.mode;render(true);return}
  const s=e.target.closest('[data-s]');if(s){jobTab=s.dataset.s;renderJobs()}
});

/* job page */
function openJob(id){const j=jobs.find(x=>x.id===id);if(!j)return;curJob=j;show('job');openAgentMobile(false)}
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
  <div class="dh">${av(j.co,'lg')}<div style="flex:1"><h2>${esc(j.role)}</h2><div class="t2">${esc(j.co)}${j.loc?' · '+esc(j.loc):''} · <span class="src">${j.src}</span></div></div><button class="sbtn" data-del="${j.id}" title="Remove this job" aria-label="Remove this job">${I(IC_TRASH)}</button></div>
  <div class="tabsline" style="margin-top:26px">${ST.map(s=>`<button class="${s===j.status?'on':''}" data-st="${s}">${SL[s]}</button>`).join('')}</div>
  <div class="grid2" style="margin-top:26px">
    <div>${j.days!=null&&j.status!=='saved'?`<div class="count"><b>${j.days}</b>days since you applied</div><div style="margin-top:8px">${track(j,false)}${axis}</div>`:j.since?`<div class="count">In touch since ${esc(j.since)}. Apply date not in your email.</div>`:`<div class="count">Not applied yet. Apply early: replies drop after day 2.</div>`}
      <div class="tlh"><div class="lbl">Timeline</div><div class="seg sm">${['Timeline','List'].map(m=>`<button class="${tlMode===m?'on':''}" data-tlm="${m}">${m}</button>`).join('')}</div></div>
      ${tlMode==='List'?`<div class="list tl">${j.tl.map(t=>`<div class="row"><span class="d">${t[0]}</span><span class="x">${esc(t[1])}</span></div>`).join('')}</div>`:visualTimeline(j)}</div>
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
  const tm=e.target.closest('[data-tlm]');if(tm){tlMode=tm.dataset.tlm;renderJob();return}
  const s=e.target.closest('[data-st]');if(s){setStatus(curJob,s.dataset.st);toast(`Moved to ${SL[s.dataset.st]}`);render();renderABar()}
});
document.addEventListener('click',e=>{const r=e.target.closest('[data-recfor]');if(r){show('interview');$('#jobSel').value=r.dataset.recfor}});
function setStatus(j,s){if(j.status===s)return;j.status=s;if(s==='applied')j.days=0;j.tl.unshift(['Today',s==='closed'?'Closed':'Moved to '+SL[s]]);jobTab=s}

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
  if(e.key==='/'&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='SELECT'){e.preventDefault();openAgentMobile(true);$('#inp').focus()}});

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
function reply(sc,html,list,extra){const t=bubble(sc,'bot typing','<i></i><i></i><i></i>');setTimeout(()=>{t.remove();say(sc,html,list,extra);render()},600)}
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
function renderABar(){
  const j=jobOf(scope);
  $('#abar').innerHTML=j?`${av(j.co)}<div class="txt"><div class="t1">${esc(j.co)} agent</div><div class="t2">${esc(j.role)} · ${stl(j.status)}</div></div><button class="home" data-scope-main>Main agent</button><button class="done closeA" data-closeA>Close</button>`
    :`<div class="av spark">${I(SPARK)}</div><div class="txt"><div class="t1">Agent</div><div class="t2">Knows all your jobs <span class="kbd">/</span></div></div><button class="done closeA" data-closeA>Close</button>`;
}
document.addEventListener('click',e=>{
  if(e.target.closest('[data-scope-main]'))setScope('main');
  if(e.target.closest('[data-closeA]'))openAgentMobile(false);
});
function openAgentMobile(on){$('#agent').classList.toggle('open',on);if(on)$('#scrim').classList.add('on');else if(!$('#modal').classList.contains('on'))$('#scrim').classList.remove('on')}
$('#atoggle').onclick=()=>openAgentMobile(true);

function findCo(t){const all=[...new Set([...jobs.map(j=>j.co),...alerts.map(a=>a.co)])];return all.find(c=>t.includes(c.toLowerCase().split(/[ .]/)[0]))}
function statusIn(t){if(/reject|closed|delete/.test(t))return'closed';if(/reopen/.test(t))return'saved';if(/accept|offer/.test(t))return'offer';if(/interview/.test(t)&&/(move|mark|to )/.test(t))return'interview';if(/applied/.test(t)&&/(mark|move|i applied|to applied)/.test(t))return'applied';return null}
function handle(raw,sc){
  const t=raw.toLowerCase().trim();if(!t)return;
  if(sc!==scope)setScope(sc);
  if(matchMedia('(max-width:1240px)').matches)openAgentMobile(true);
  bubble(sc,'me',esc(raw));
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
  if(c.startsWith('go:')){const[,what,arg]=c.split(':');
    if(what==='alerts')show('alerts');else if(what==='insights')showInsights(recordings[0]);else if(what==='open')openJob(+arg);
    return}
  handle(c,b.closest('#page')&&view!=='job'?'main':scope);
});
$('#composer').onsubmit=e=>{e.preventDefault();const v=$('#inp').value;$('#inp').value='';handle(v,scope)};
$('#mic').onclick=e=>{const m=e.currentTarget;if(m.classList.contains('rec'))return;m.classList.add('rec');$('#inp').placeholder='Listening…';
  setTimeout(()=>{m.classList.remove('rec');$('#inp').placeholder='Ask or tell me anything';handle('Add Similarweb',scope)},1400)};


/* accounts: demo (sample data) or Gilad (real data from Gmail + calendar, read only) */
const DAY=864e5;let TODAY=new Date(new Date().toDateString());
const localIso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dt=d=>new Date(d+'T00:00:00');
const fmt=d=>dt(d).toLocaleDateString('en-US',{month:'short',day:'numeric'});
const daysBetween=(a,b)=>Math.round((dt(b)-dt(a))/DAY);
const median=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
function loadReal(data){
  REAL=true;alerts=[];recordings=[];
  const iso=localIso(TODAY);
  jobs=data.jobs.map((j,i)=>({id:i+1,co:j.co,role:j.role,loc:j.loc||'',src:j.src||'Email',status:j.status,next:null,nextRaw:j.next||null,
    applied:j.applied,firstReply:j.firstReply,tl0:j.tl.map(t=>[...t]),tl:j.tl.map(t=>[...t]),
    days:j.applied?daysBetween(j.applied,iso):null,
    replied:j.applied&&j.firstReply?daysBetween(j.applied,j.firstReply):null,
    since:!j.applied&&j.firstReply?fmt(j.firstReply):null}));
  const r=jobs.filter(j=>j.replied!=null).map(j=>j.replied).sort((a,b)=>a-b);
  const q=f=>r.length?r[Math.min(r.length-1,Math.floor(f*r.length))]:7;
  const band=[q(.25),median(r)??7,q(.75)];REPLY={};jobs.forEach(j=>REPLY[j.co]=band);
  jobTab='interview';applyHidden();refreshTime();
}
function loadDemo(){REAL=false;jobs=DEMO_JOBS.map(j=>({...j,tl:[...j.tl]}));alerts=DEMO_ALERTS.map(a=>({...a}));recordings=[...DEMO_RECS];REPLY=DEMO_REPLY;jobTab='applied';applyHidden()}
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
function renderTodayReal(){
  const S=realStats(),att=attentionList();
  const nx=S.inter.find(j=>j.next);
  $('#page').innerHTML=`<div class="hero"><div class="d">${TODAY.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div><h2>Hi, Gilad.</h2><p>Your real job search, from Gmail and calendar.</p></div>
  <div class="kpis">${kpi('In interviews',S.inter.length,nx?esc(nx.co)+' '+esc(nx.next.split(',')[0]):'')}${kpi('Waiting on reply',S.waiting.length,'No answer yet')}
  ${kpi('Reply rate',S.rate+'%',`${S.ap.filter(j=>j.firstReply).length} of ${S.ap.length} applications`)}${kpi('Days to reply',S.med??'–','Median')}</div>
  <div class="grid2"><div><div class="lbl">Needs attention</div><div class="list">
   ${att.map(a=>hrow('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',esc(a[0]),'Open the job',a[1])).join('')||'<div class="empty">Nothing urgent.</div>'}</div></div>
  <div><div class="lbl">Where you stand</div>${legend}${S.waiting.filter(j=>j.days!=null).sort((a,b)=>a.days-b.days).map(j=>track(j)).join('')}${axis}
  <div class="foot">Band = when companies usually answered you.</div></div></div>`;
}
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
  $('#login').hidden=true;$('#meName').textContent=REAL?'Gilad':'Demo account';
  view='today';curJob=null;for(const k in threads)delete threads[k];
  setScope('main');show('today');
}
function showLogin(){$('#login').hidden=false;$('#pwRow').hidden=true;$('#loginErr').textContent='';}
$('#login').addEventListener('click',async e=>{
  if(e.target.closest('[data-acc="demo"]')){loadDemo();startApp();return}
  if(e.target.closest('[data-acc="gilad"]')){$('#pwRow').hidden=false;$('#pw').focus();return}
});
$('#pwRow').onsubmit=async e=>{
  e.preventDefault();const err=$('#loginErr');err.textContent='Checking…';
  try{const r=await fetch('/api/my-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#pw').value})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){err.textContent=d.error||'Could not sign in.';return}
    $('#pw').value='';loadReal(d);startApp();
  }catch{err.textContent='Could not reach the backend.'}
};
document.addEventListener('click',e=>{if(e.target.closest('[data-switch]')){closeModal();openAgentMobile(false);showLogin()}});
showLogin();

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
  let ev=j.tl.map(t=>({d:tlDate(t[0]),label:t[0],x:t[1]})).filter(e=>e.d).sort((a,b)=>a.d-b.d);
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
    else h+=`<div class="ve${e.d>t0?' fut':''}${/reject|closed/i.test(e.x)?' bad':''}"><i></i><span class="vd">${esc(e.label)}</span><span class="vx">${esc(e.x)}</span></div>`;
  });
  return `<div class="vtl">${h}</div>`;
}

/* remove a job (trash). Saved per account in this browser only. */
const IC_TRASH='<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>';
const delBtn=j=>`<span class="del" role="button" tabindex="0" data-del="${j.id}" title="Remove this job" aria-label="Remove ${esc(j.co)}">${I(IC_TRASH)}</span>`;
const jkey=j=>j.co+'|'+j.role;
const hidKey=()=>'jobimp-removed-'+(REAL?'gilad':'demo');
function hidList(){try{return JSON.parse(localStorage.getItem(hidKey())||'[]')}catch{return[]}}
function hidSave(l){try{localStorage.setItem(hidKey(),JSON.stringify(l))}catch{}}
function applyHidden(){const h=new Set(hidList());jobs=jobs.filter(j=>!h.has(jkey(j)))}
let lastRemoved=null;
function removeJob(id){
  const i=jobs.findIndex(j=>j.id===id);if(i<0)return;const j=jobs[i];
  jobs.splice(i,1);lastRemoved={j,i};hidSave([...new Set([...hidList(),jkey(j)])]);
  if(view==='job'&&curJob?.id===id)show('jobs');else render();
  toast(`${j.co} removed`,true);
}
function undoRemove(){
  if(!lastRemoved)return;const{j,i}=lastRemoved;lastRemoved=null;
  jobs.splice(Math.min(i,jobs.length),0,j);hidSave(hidList().filter(k=>k!==jkey(j)));
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
    j.tl=j.tl0.map(([d,x])=>{if(!/\(coming up\)/.test(x))return[d,x];const dd=tlDate(d);
      if(!dd||dd>TODAY)return[d,x];
      if(dd.getTime()===TODAY.getTime()&&!j.doneAt)return[d,x.replace('(coming up)','(today)')];
      return[d,x.replace(/^Next /,'').replace(/\s*\(coming up\)/,'').replace(/^./,c=>c.toUpperCase())+' (done)']});
  });
  return before!==JSON.stringify(jobs.map(j=>[j.next,j.days,j.tl]));
}
setInterval(()=>{if(REAL&&$('#login').hidden&&refreshTime()){const keep=$('#main').scrollTop;render();$('#main').scrollTop=keep}},60e3);
