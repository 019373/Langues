'use strict';
// LexiCycle : aucun appel API, compte, analytique, traceur ni synchronisation.
// Les cartes et les réponses sont conservées UNIQUEMENT dans IndexedDB.
const DB_NAME = 'lexicycle-db';
const DB_VERSION = 1;
const STATE_KEY = 'state';
const SCHEMA = 1;
const LANG = {en:'Anglais',it:'Italien'};
let db, state, screen = 'home', langFilter = 'all', studyCardId = null;
let revealed = false, typedAnswer = '', searchText = '', editId = null, flash = null;
const root = document.getElementById('app');
const stamp = () => new Date().toISOString();
const now = () => Date.now();
const idGen = () => globalThis.crypto?.randomUUID?.() || `card-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localDay = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
function monday(d=new Date()) { const x=new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate()-(x.getDay()+6)%7); return x; }
const daysTo = ts => ts <= now() ? 'À revoir' : new Date(ts).toLocaleDateString('fr-CH',{day:'2-digit',month:'short'});
function startupTimeout(promise, ms, operation) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() =>
        reject(new Error(operation + ' : délai dépassé.')),
        ms
      )
    )
  ]);
}
function openDB() { return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains('storage')) req.result.createObjectStore('storage'); };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
}); }
function dbGet(key) { return new Promise((resolve,reject)=>{
  const req=db.transaction('storage','readonly').objectStore('storage').get(key);
  req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
}); }
let writeQueue=Promise.resolve();
function save() {
  const snapshot=structuredClone(state);
  writeQueue=writeQueue.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
    const tx=db.transaction('storage','readwrite'); tx.objectStore('storage').put(snapshot,STATE_KEY);
    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
  }));
  return writeQueue.catch(e=>{ tell(`Échec de sauvegarde : ${e.message}`,true); throw e; });
}
function createCard(x, created=stamp()) {
  return {id:x.id||idGen(),language:x.language,front:x.front.trim(),back:x.back.trim(),example:(x.example||'').trim(),topic:(x.topic||'Général').trim(),
    createdAt:created,dueAt:0,intervalDays:0,ease:2.5,repetitions:0,lapses:0,lastReviewedAt:null,suspended:false};
}
const starter = [
  ['en','J’avais l’habitude de…','I used to…','I used to play football.','Expressions'],
  ['en','J’aimerais…','I would like to…','I would like to learn Italian.','Expressions'],
  ['en','Ça dépend de…','It depends on…','It depends on the situation.','Expressions'],
  ['en','À mon avis…','In my opinion…','In my opinion, practice matters.','Argumentation'],
  ['en','Même si…','Even though…','Even though it is difficult, I will try.','Connecteurs'],
  ['en','En revanche…','However…','However, there is another problem.','Connecteurs'],
  ['en','Travailler dur','To work hard','You have to work hard.','Expressions'],
  ['en','S’améliorer grâce à la pratique','To improve through practice','You can improve through practice.','Expressions'],
  ['en','Je fais du sport','I do sports','I do sports in my free time.','Vie quotidienne'],
  ['en','J’ai étudié','I have studied','I have studied English for years.','Grammaire'],
  ['it','À mon avis…','Secondo me…','Secondo me, è una buona idea.','Argumentation'],
  ['it','J’aime faire…','Mi piace fare…','Mi piace fare sport.','Vie quotidienne'],
  ['it','Je joue d’un instrument','Suono uno strumento','Suono uno strumento musicale.','Vie quotidienne'],
  ['it','Quand j’étais petit…','Quando ero piccolo…','Quando ero piccolo, giocavo a calcio.','Grammaire'],
  ['it','Même si…','Anche se…','Anche se sono stanco, studio.','Connecteurs'],
  ['it','Cependant…','Tuttavia…','Tuttavia, ci sono dei problemi.','Connecteurs'],
  ['it','J’aimerais…','Vorrei…','Vorrei imparare una lingua.','Expressions'],
  ['it','Je dois étudier','Devo studiare','Domani devo studiare.','Vie quotidienne'],
  ['it','Je préfère…','Preferisco…','Preferisco studiare da solo.','Expressions'],
  ['it','J’ai besoin de…','Ho bisogno di…','Ho bisogno di più tempo.','Expressions']
];
function initialState() { return {
  schemaVersion:SCHEMA,createdAt:stamp(),lastPlanWeek:localDay(monday()),
  cards:starter.map((c,i)=>createCard({id:`starter-${c[0]}-${i}`,language:c[0],front:c[1],back:c[2],example:c[3],topic:c[4]})),
  history:[],requests:[],planHistory:[],tasks:[],preferences:{dailyTarget:15}
}; }
// LexiCycle V1.4
let lc14Session={
 lastId:null,turn:0,seen:{},retry:{}
};

function lc14Reset(){
 lc14Session={
  lastId:null,turn:0,seen:{},retry:{}
 };
}

function lc14Pick(){
 const active=selectedCards().filter(
  c=>!c.suspended
 );
 if(!active.length)return null;

 const candidates=active.filter(
  c=>active.length===1||
  c.id!==lc14Session.lastId
 );

 const ready=candidates.filter(c=>
  lc14Session.retry[c.id]!==undefined &&
  lc14Session.retry[c.id]<=lc14Session.turn
 );

 const unseen=candidates.filter(c=>
  !lc14Session.seen[c.id] &&
  lc14Session.retry[c.id]===undefined
 );

 let group=ready.length?ready:
  unseen.length?unseen:
  candidates.filter(
   c=>lc14Session.retry[c.id]===undefined
  );

 if(!group.length)group=candidates;

 const weights=group.map(c=>
  1/Math.pow(
   1+(lc14Session.seen[c.id]||0),1.3
  )
 );

 let draw=Math.random()*
  weights.reduce((a,b)=>a+b,0);

 let card=group[group.length-1];

 for(let i=0;i<group.length;i++){
  draw-=weights[i];
  if(draw<=0){
   card=group[i];
   break;
  }
 }

 delete lc14Session.retry[card.id];

 lc14Session.seen[card.id]=
  (lc14Session.seen[card.id]||0)+1;

 lc14Session.lastId=card.id;
 lc14Session.turn++;

 return card;
}

function selectedCards() { return state.cards.filter(c=>langFilter==='all'||c.language===langFilter); }
function dueCards() { return selectedCards().filter(c=>!c.suspended && Number(c.dueAt||0)<=now()).sort((a,b)=>{
  // Les cartes déjà étudiées dues aujourd'hui passent avant les nouvelles.
  const aNew=a.repetitions===0 ? 1:0, bNew=b.repetitions===0 ? 1:0;
  return aNew-bNew || a.dueAt-b.dueAt || a.createdAt.localeCompare(b.createdAt);
}); }
const mastered = c => c.repetitions>=3 && c.intervalDays>=21;
function weeklyHistory() { const start=monday().getTime(); return state.history.filter(h=>Date.parse(h.at)>=start); }
function statsFor(code='all') {
  const cards=state.cards.filter(c=>code==='all'||c.language===code);
  const h=weeklyHistory().filter(e=>code==='all'||e.language===code);
  const success=h.filter(e=>e.rating>=2).length;
  return {cards:cards.filter(c=>!c.suspended).length,due:cards.filter(c=>!c.suspended&&c.dueAt<=now()).length,
    mastered:cards.filter(c=>!c.suspended&&mastered(c)).length,reviews:h.length,success,successRate:h.length?Math.round(100*success/h.length):0,
    newCards:cards.filter(c=>c.repetitions===0&&!c.suspended).length};
}
function tell(message,error=false) { flash={message,error}; render(); }
function eWeek() { const x=monday(); x.setDate(x.getDate()+6); return localDay(x); }
// lexi-v13-custom
const iconPath = {
 school:'<path d="M3 5h18v14H3zM8 5v14M12 9h6M12 13h6"/>',
 home:'<path d="m3 10 9-7 9 7v10H3zM9 20v-8h6v8"/>',
 book:'<path d="M12 6v15M12 6C9 4 6 4 3 5v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1"/>',
 study:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h7"/>',
 cards:'<rect x="5" y="3" width="16" height="18" rx="2"/><path d="M8 8h10M8 12h7M3 7v12"/>',
 stats:'<path d="M4 20v-8M9 20V5m6 15v-6m5 6V9"/>',
 settings:'<circle cx="12" cy="12" r="4"/><path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15-6-2 2M8 16l-2 2m12 0-2-2M8 8 6 6"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4M4 18v3h16v-3"/>',
 upload:'<path d="M12 17V5m-4 4 4-4 4 4M4 19v2h16v-2"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 repeat:'<path d="M20 7v5h-5M4 17v-5h5M6 9a7 7 0 0 1 12 0"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
 star:'<path d="m12 2 3 6.3 7 1-5 5 .9 7-5.9-3.3-5.9 3.3.9-7-5-5 7-1z"/>',
 wifi:'<path d="M3 9a15 15 0 0 1 18 0M6 13a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0"/>',
 offline:'<path d="m3 3 18 18M3 9a15 15 0 0 1 10-3m5 2 3 2M7 13a10 10 0 0 1 8-2"/>'
};

const lcIcon = (name,size=19) =>
 `<svg class="lc-icon" width="${size}" height="${size}"
 viewBox="0 0 24 24" fill="none"
 stroke="currentColor" stroke-width="1.8"
 stroke-linecap="round" stroke-linejoin="round"
 aria-hidden="true">${iconPath[name]||iconPath.cards}</svg>`;

const iconFor = code =>
 `<span class="lc-lang ${code==='en'?'lc-en':'lc-it'}">
 ${code==='en'?'EN':'IT'}</span>`;

const lcWeek = () => localDay(monday());

const lcTodo = () =>
 (state.tasks||[]).filter(
  t=>t.weekStart===lcWeek()&&!t.completedAt
 );

function lcHomework(){
 const todo=lcTodo();
 if(!todo.length)return '';
 return `<section class="card lc-work">
 <div class="row">
 <h2>${lcIcon('book')} Travail de la semaine</h2>
 <span class="badge">${todo.length} à faire</span>
 </div>
 <div class="lc-task-list">
 ${todo.map(t=>`<div class="lc-task">
 <button type="button" class="lc-done"
 data-finish-task="${esc(t.id)}">
 ${lcIcon('check',17)}</button>
 <div class="lc-task-text">
 <div class="caption">
 ${iconFor(t.language)} ${LANG[t.language]}
 ${t.day?'· '+esc(t.day):''}
 </div>
 <strong>${esc(t.title)}</strong>
 ${t.description?`<p>${esc(t.description)}</p>`:''}
 </div></div>`).join('')}
 </div></section>`;
}

// LC_SCHOOL_V15 : école séparée des cartes B2
let schoolPackId=null,schoolCardId=null,schoolRevealed=false;
let schoolSession={last:null,turn:0,seen:{},retry:{}};

function schoolReset(){
 schoolCardId=null;
 schoolRevealed=false;
 schoolSession={last:null,turn:0,seen:{},retry:{}};
}
function schoolData(){
 if(!state.school)state.school={packs:[],reviews:[]};
 return state.school;
}
function schoolPick(pack){
 const cards=pack.cards;
 if(!cards.length)return null;
 const possible=cards.filter(c=>cards.length===1||c.id!==schoolSession.last);
 const ready=possible.filter(c=>schoolSession.retry[c.id]!=null&&schoolSession.retry[c.id]<=schoolSession.turn);
 const unseen=possible.filter(c=>!schoolSession.seen[c.id]&&schoolSession.retry[c.id]==null);
 let group=ready.length?ready:unseen.length?unseen:possible.filter(c=>schoolSession.retry[c.id]==null);
 if(!group.length)group=possible;
 const weights=group.map(c=>1/Math.pow(1+(schoolSession.seen[c.id]||0),1.3));
 let n=Math.random()*weights.reduce((x,y)=>x+y,0),picked=group[group.length-1];
 for(let i=0;i<group.length;i++){
  n-=weights[i];
  if(n<=0){picked=group[i];break;}
 }
 delete schoolSession.retry[picked.id];
 schoolSession.seen[picked.id]=(schoolSession.seen[picked.id]||0)+1;
 schoolSession.last=picked.id;
 schoolSession.turn++;
 return picked;
}
function schoolView(){
 const data=schoolData(),pack=data.packs.find(p=>p.id===schoolPackId);
 const input='<input class="file-input" type="file" id="schoolInput" accept=".json,application/json">';
 if(pack){
  let card=pack.cards.find(c=>c.id===schoolCardId);
  if(!card){
   card=schoolPick(pack);
   schoolCardId=card?.id||null;
   schoolRevealed=false;
  }
  return `<div class="row mb"><button class="btn small ghost" data-school-back>Retour à École</button><span class="badge">${esc(pack.subject)}</span></div>
   <h1>${esc(pack.title)}</h1><p class="sub">Révision illimitée et aléatoire. Les erreurs reviennent plus souvent.</p>
   ${card?`<div class="study-front school-front"><div><div class="caption mb">QUESTION</div><div class="prompt">${esc(card.front)}</div>
    ${schoolRevealed?`<hr class="thin"><div class="answer">${esc(card.back)}</div>${card.note?`<p class="example">${esc(card.note)}</p>`:''}`:''}</div></div>
    ${schoolRevealed?`<div class="rating">
      ${[['0','repeat','Oublié'],['1','clock','Difficile'],['2','check','Correct'],['3','star','Facile']].map(([n,ico,t])=>`<button class="btn r${n}" data-school-rate="${n}">${lcIcon(ico,18)}<span>${t}</span></button>`).join('')}
     </div>`:`<button class="btn primary full" data-school-reveal>Voir la réponse</button>`}
    <div class="caption mt">${pack.cards.length} cartes · réponses enregistrées sur ton appareil.</div>`:'<div class="card empty">Ce paquet est vide.</div>'}
   ${input}`;
 }
 return `<h1>École</h1><p class="sub">Vocabulaire de cours, conjugaisons, terminaisons et autres notions à apprendre. Séparé de ton programme B2.</p>
 <div class="card accent"><h2>${lcIcon('upload',18)} Importer un cours</h2>
 <p class="caption">Envoie-moi tes mots ou tes règles dans ChatGPT. Je te prépare un fichier JSON à importer ici.</p>
 <div class="stack mt"><button class="btn primary full" data-school-import>${lcIcon('upload',17)} Importer un fichier école</button>
 <button class="btn ghost full" data-school-example>Exemple du format JSON</button></div></div>
 <div class="card"><div class="row"><h2>Mes cours</h2><span class="pill">${data.packs.length}</span></div>
 ${data.packs.length?data.packs.map(p=>{
 const reviews=data.reviews.filter(r=>r.packId===p.id);
 const fails=reviews.filter(r=>r.rating<=1).length;
 return `<div class="school-pack"><div class="school-pack-content"><strong>${esc(p.title)}</strong><div class="caption">${esc(p.subject)} · ${p.cards.length} cartes · ${reviews.length} révisions${fails?' · '+fails+' difficultés':''}</div></div>
 <button class="btn small" data-school-open="${esc(p.id)}">Réviser</button></div>`;
 }).join(''):'<div class="empty">Aucun cours importé pour le moment.</div>'}</div>${input}`;
}
function validateSchoolPack(x){
 if(!x||x.kind!=='lexicycle-school-pack'||x.schemaVersion!==1||!isString(x.packId,100)||!isString(x.title,140)||!isString(x.subject,80)||!Array.isArray(x.cards)||x.cards.length<1||x.cards.length>500)throw Error('Fichier École invalide.');
 const ids=new Set();
 for(const c of x.cards){
  if(!c||!isString(c.id,100)||ids.has(c.id)||!isString(c.front,500)||!isString(c.back,500)||(c.note!=null&&(typeof c.note!=='string'||c.note.length>600)))throw Error('Carte école invalide.');
  ids.add(c.id);
 }
 return x;
}
async function schoolImport(raw){
 const x=validateSchoolPack(raw),data=schoolData();
 let pack=data.packs.find(p=>p.id===x.packId),added=0,changed=0;
 if(!pack){
  pack={id:x.packId,title:x.title.trim(),subject:x.subject.trim(),cards:[],createdAt:stamp()};
  data.packs.push(pack);
 }
 pack.title=x.title.trim();
 pack.subject=x.subject.trim();
 pack.updatedAt=stamp();
 for(const incoming of x.cards){
  const old=pack.cards.find(c=>c.id===incoming.id);
  if(old){
   old.front=incoming.front.trim();
   old.back=incoming.back.trim();
   old.note=(incoming.note||'').trim();
   changed++;
  }else{
   pack.cards.push({
    id:incoming.id,front:incoming.front.trim(),
    back:incoming.back.trim(),note:(incoming.note||'').trim(),
    dueAt:0,repetitions:0,intervalDays:0,ease:2.5,lapses:0
   });
   added++;
  }
 }
 await save();
 schoolPackId=null;
 schoolReset();
 tell(`Cours importé : ${added} nouvelle(s) carte(s), ${changed} mise(s) à jour. Progression conservée.`);
}
function schoolRate(rating){
 const pack=schoolData().packs.find(p=>p.id===schoolPackId);
 const c=pack?.cards.find(c=>c.id===schoolCardId);
 if(!schoolRevealed||!c||![0,1,2,3].includes(rating))return;
 const t=now(),due=c.dueAt<=t,prev=c.intervalDays;
 if(rating===0){
  c.lapses++;c.repetitions=0;
  c.ease=Math.max(1.3,c.ease-.2);
  c.intervalDays=0;c.dueAt=t+600000;
 }
 if(rating===1){
  c.ease=Math.max(1.3,c.ease-.12);
  if(due){
   c.repetitions++;
   c.intervalDays=1;c.dueAt=t+86400000;
  }else{
   c.intervalDays=Math.min(prev||1,1);
   c.dueAt=Math.min(c.dueAt,t+86400000);
  }
 }
 if(rating>=2&&due){
  c.repetitions++;
  if(rating===3)c.ease=Math.min(3.1,c.ease+.12);
  c.intervalDays=prev===0?(rating===3?4:1):Math.max(rating===3?4:2,Math.round(prev*(c.ease+(rating===3?.3:0))));
  c.dueAt=t+c.intervalDays*86400000;
 }
 schoolData().reviews.push({
  packId:pack.id,cardId:c.id,rating,at:stamp(),freePractice:!due
 });
 if(rating<=1)schoolSession.retry[c.id]=schoolSession.turn+(rating===0?1:3);
 else delete schoolSession.retry[c.id];
 schoolCardId=null;
 schoolRevealed=false;
 save();
 render();
}
function schoolExample(){
 return {
  kind:'lexicycle-school-pack',
  schemaVersion:1,
  packId:'italien-terminaisons-01',
  title:'Italien · Présent',
  subject:'Italien',
  cards:[
   {id:'it-present-are-noi',front:'Terminaison des verbes en -are avec noi',back:'-iamo',note:'Parlare → noi parliamo'},
   {id:'it-present-are-voi',front:'Terminaison des verbes en -are avec voi',back:'-ate',note:'Parlare → voi parlate'}
  ]
 };
}

function segment() { return `<div class="seg" role="group" aria-label="Langue">
  <button data-language="all" class="${langFilter==='all'?'active':''}">Toutes</button>
  <button data-language="en" class="${langFilter==='en'?'active':''}">Anglais</button>
  <button data-language="it" class="${langFilter==='it'?'active':''}">Italien</button></div>`; }
function layout(content) {
  root.innerHTML=`<div class="shell"><header class="top"><div class="brand"><div class="mark">${lcIcon("book",25)}</div><div><div class="brand-name">LexiCycle</div><div class="small">Anglais & italien</div></div></div><span class="pill ${navigator.onLine?'online':'offline'}" id="networkStatus">${lcIcon(navigator.onLine?'wifi':'offline',14)} ${navigator.onLine?'En ligne':'Hors ligne'}</span></header>
  ${flash?`<div class="notice ${flash.error?'error':'success'}">${esc(flash.message)}</div>`:''}
  ${content}</div><nav class="nav"><div class="nav-inner">
  ${[['home','home','Accueil'],['study','study','Réviser'],['school','school','École'],['stats','stats','Bilan']].map(([name,ico,label])=>`<button data-screen="${name}" class="${screen===name?'active':''}" aria-label="${label}"><span class="ni">${lcIcon(ico,21)}</span>${label}</button>`).join('')}
  </div></nav>`;
}
function render() {
  if (!state) return;
  const content=screen==='editor' ? editorView(state.cards.find(x=>x.id===editId)) : ({home:homeView,study:studyView,library:libraryView,school:schoolView,stats:statsView,settings:settingsView}[screen]?.()||homeView());
  layout(content);
}
function homeView() {
  const en=statsFor('en'),it=statsFor('it'),all=statsFor();
  return `<h1>Prêt à réviser ?</h1><p class="sub">Quelques minutes suffisent. Les cartes sont disponibles même sans réseau.</p>
  <div class="grid2">
    ${[['en',en],['it',it]].map(([code,s])=>`<div class="card"><div class="row"><strong>${iconFor(code)} ${LANG[code]}</strong><span class="badge">${s.cards} cartes</span></div><div class="metric">${s.due}</div><div class="caption">cartes à revoir</div><div class="progress"><div style="width:${s.cards?Math.round(s.mastered/s.cards*100):0}%"></div></div><div class="tiny mt">${s.mastered} maîtrisées</div><button class="btn full mt" data-start="${code}" ${s.cards?'':'disabled'}>Réviser ${LANG[code].toLowerCase()}</button></div>`).join('')}
  </div>
  <div class="card accent"><div class="row"><div><h2>Cette semaine</h2><div class="caption">${esc(localDay(monday()))} → ${esc(eWeek())}</div></div><span class="pill">${all.reviews} réponses</span></div>
  <div class="grid2 mt"><div><div class="metric">${all.successRate} %</div><div class="caption">réponses « correct » ou « facile »</div></div><div><div class="metric">${all.mastered}</div><div class="caption">cartes maîtrisées au total</div></div></div></div>
  ${lcHomework()}
  <div class="card"><h2>Une expression difficile ?</h2><p class="sub">Ajoute-la ici. Elle apparaîtra dans le bilan que tu m'enverras.</p>
    <form id="quickRequest"><div class="field"><label for="requestLanguage">Langue</label><select name="language" id="requestLanguage"><option value="en">Anglais</option><option value="it">Italien</option></select></div>
    <div class="field"><label for="requestText">Mot ou idée que tu voudrais savoir exprimer</label><input id="requestText" name="text" maxlength="300" required placeholder="Ex. : avoir hâte de quelque chose"></div>
    <button class="btn full" type="submit">Ajouter à mes difficultés</button></form></div>
  <div class="actions"><button class="btn ghost" data-screen="settings">${lcIcon('settings',17)} Paramètres & imports</button><button class="btn ghost" data-action="downloadReport">${lcIcon('download',17)} Exporter le bilan JSON</button></div>`;
}
function studyView() {
  const options=selectedCards().filter(c=>!c.suspended);
  let card=state.cards.find(c=>c.id===studyCardId);
  if (!card || card.suspended || (langFilter!=='all'&&card.language!==langFilter)) { card=lc14Pick();studyCardId=card?.id||null;revealed=false;typedAnswer=''; }
  return `<h1>Réviser</h1><p class="sub">Révision libre et illimitée, dans un ordre aléatoire. Les cartes oubliées ou difficiles reviennent rapidement.</p>${segment()}
  ${card?`<div class="row mb"><span class="pill">${iconFor(card.language)} ${LANG[card.language]}</span><span class="pill">${options.length} carte${options.length>1?'s':''} disponible${options.length>1?'s':''} · sans limite</span></div>
    <div class="study-front"><div><div class="caption mb">FRANÇAIS → ${card.language==='en'?'ANGLAIS':'ITALIEN'}</div><div class="prompt">${esc(card.front)}</div>
    ${revealed?`<hr class="thin"><div class="answer">${esc(card.back)}</div>${card.example?`<p class="example">${esc(card.example)}</p>`:''}`:''}</div></div>
    ${!revealed?`<div class="field"><label for="attempt">Ta proposition (facultatif, non envoyée)</label><input autocomplete="off" autocapitalize="sentences" id="attempt" placeholder="Écris ou formule ta réponse mentalement…" value="${esc(typedAnswer)}"></div>
    <button class="btn primary full" data-action="reveal">Voir la réponse</button>`:
    `${typedAnswer?`<div class="notice">Ta proposition : <strong>${esc(typedAnswer)}</strong></div>`:''}
     <div class="caption mb">Évalue ta réponse. Une faute importante = « difficile » ou « à revoir ».</div>
     <div class="rating">
       <button class="btn r0" data-rate="0">${lcIcon('repeat',18)}<span>Oublié</span></button>
       <button class="btn r1" data-rate="1">${lcIcon('clock',18)}<span>Difficile</span></button>
       <button class="btn r2" data-rate="2">${lcIcon('check',18)}<span>Correct</span></button>
       <button class="btn r3" data-rate="3">${lcIcon('star',18)}<span>Facile</span></button>
     </div>`}
    <div class="caption mt">${esc(card.topic)} · ${card.repetitions?'Déjà revue':'Nouvelle carte'}. Raccourcis clavier : espace, puis touches 1–4.</div>`:
   `<div class="card empty"><div class="lc-empty">${lcIcon('check',29)}</div><strong>Aucune carte active</strong>Ajoute une carte ou réactive une carte suspendue pour commencer.<div class="mt"><button class="btn" data-screen="home">Retour à l’accueil</button></div></div>`}`;
}
function libraryView() {
  let cards=selectedCards().filter(c=>`${c.front} ${c.back} ${c.topic}`.toLocaleLowerCase().includes(searchText.toLocaleLowerCase())).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return `<h1>Bibliothèque</h1><p class="sub">Tes cartes ne disparaissent pas après une semaine. Elles restent disponibles pour les prochaines révisions.</p>
  ${segment()}<div class="field"><label for="search">Rechercher une carte</label><input id="search" placeholder="Mot, traduction ou thème…" value="${esc(searchText)}"></div>
  <div class="actions mb"><button class="btn primary" data-action="newCard">${lcIcon('plus',17)} Ajouter une carte</button><button class="btn ghost" data-screen="settings">Importer des cartes</button></div>
  <div class="card"><div class="row"><h2>Mes cartes</h2><span class="pill">${cards.length}</span></div>
  ${cards.length?cards.map(c=>`<div class="list-card"><div style="min-width:0"><strong>${iconFor(c.language)} ${esc(c.front)}</strong><div class="caption">${esc(c.back)}</div><div class="caption">${esc(c.topic)} · ${c.suspended?'Suspendue':mastered(c)?'Maîtrisée':c.repetitions?'Prochaine : '+daysTo(c.dueAt):'Nouvelle'}</div></div><button class="btn small ghost" data-edit="${esc(c.id)}">Modifier</button></div>`).join(''):'<div class="empty">Aucune carte trouvée.</div>'}</div>`;
}
function statsView() {
  const all=statsFor(), en=statsFor('en'),it=statsFor('it');
  const top=state.cards.map(c=>{
    const h=state.history.filter(x=>x.cardId===c.id);
    const fail=h.filter(x=>x.rating===0||x.rating===1).length;
    return {c,fail,total:h.length};
  }).filter(x=>x.fail>=2).sort((a,b)=>b.fail-a.fail || b.total-a.total).slice(0,8);
  const dayCounts=Array.from({length:7},(_,i)=>{const x=monday();x.setDate(x.getDate()+i);return {day:['L','M','M','J','V','S','D'][i],count:weeklyHistory().filter(h=>localDay(h.at)===localDay(x)).length};});
  return `<h1>Résultats & exports</h1><p class="sub">Statistiques calculées sur cet appareil et bilan pour ChatGPT.</p>
  <div class="grid2"><div class="card"><div class="caption">Réponses cette semaine</div><div class="metric">${all.reviews}</div></div><div class="card"><div class="caption">Réussite cette semaine</div><div class="metric">${all.successRate} %</div></div></div>
  <div class="card"><h2>Activité depuis lundi</h2><div class="row" style="align-items:end;gap:8px;height:90px">${dayCounts.map(d=>`<div style="flex:1;text-align:center"><div class="bar" style="height:62px;display:flex;align-items:end"><div style="width:100%;height:${d.count?Math.max(8,Math.round(d.count/Math.max(1,...dayCounts.map(x=>x.count))*100)):0}%"></div></div><div class="tiny mt">${d.day}</div><div class="tiny">${d.count}</div></div>`).join('')}</div></div>
  <div class="grid2">${[['en',en],['it',it]].map(([code,s])=>`<div class="card"><h3>${iconFor(code)} ${LANG[code]}</h3><div class="caption">${s.cards} actives · ${s.mastered} maîtrisées</div><div class="metric">${s.successRate} %</div><div class="caption">${s.reviews} réponses cette semaine</div></div>`).join('')}</div>
  <div class="card"><h2>Expressions les plus difficiles</h2>${top.length?top.map(x=>`<div class="list-card"><div><strong>${iconFor(x.c.language)} ${esc(x.c.front)}</strong><div class="caption">${esc(x.c.back)}</div></div><span class="badge">${x.fail} difficulté${x.fail>1?'s':''}</span></div>`).join(''):'<p class="caption">Une carte apparaît ici après deux réponses « Oublié » ou « Difficile ».</p>'}</div>
  <div class="card accent"><h2>Fin de semaine : échange avec ChatGPT</h2><p class="sub">Ce fichier comprend toutes tes cartes, les réponses et l’historique complet. Garde-le dans Fichiers sur ton iPhone.</p>
  <div class="stack"><button class="btn primary full" data-action="downloadReport">${lcIcon('download',17)} Exporter le bilan hebdomadaire JSON</button><button class="btn" data-action="copyReport">Copier le bilan JSON</button><button class="btn ghost" data-screen="settings">Importer la semaine suivante</button></div></div>`;
}
function settingsView() {
  return `<h1>Paramètres & sauvegardes</h1><p class="sub">Aucune donnée n'est envoyée automatiquement. Tout reste enregistré sur cet appareil.</p>
  <div class="card"><h2>Ajouter la semaine suivante</h2><p class="caption">Importe un fichier JSON fourni par ChatGPT. Les cartes existantes, les statistiques et les intervalles de révision sont préservés.</p>
    <div class="stack mt"><button class="btn primary full" data-action="importPlan">${lcIcon('upload',17)} Importer un programme hebdomadaire</button>
    <button class="btn ghost full" data-action="downloadExample">${lcIcon('download',17)} Exemple du format attendu</button></div></div>
  <div class="card"><h2>Sauvegarde complète</h2><p class="caption">Export autonome contenant toutes les cartes, réponses, statistiques et demandes. À conserver dans Fichiers ou un dossier personnel de ton choix.</p>
    <div class="stack mt"><button class="btn full" data-action="downloadBackup">${lcIcon('download',17)} Sauvegarder toutes les données</button><button class="btn ghost full" data-action="restoreBackup">${lcIcon('upload',17)} Restaurer une sauvegarde JSON</button></div>
    <div class="notice">Restaurer une sauvegarde remplace les données actuellement présentes. L'application demandera une confirmation.</div></div>
  <div class="card"><h2>Confidentialité et fonctionnement</h2><div class="stack caption"><div>Stockage local IndexedDB.</div><div>Révisions possibles hors connexion après installation.</div><div>Aucune connexion à ChatGPT depuis l'application.</div><div>Export et import JSON uniquement à ton initiative.</div><div>Si Safari efface les données de ce site, la sauvegarde JSON est nécessaire pour restaurer tes progrès.</div></div></div>
  <div class="card"><h2>Gestion des cartes B2</h2><p class="caption">Ancienne bibliothèque disponible ici si tu veux modifier tes cartes personnelles.</p><button class="btn ghost full mt" data-screen="library">Ouvrir la bibliothèque B2</button></div>
  <div class="card"><h2>Gestion</h2><div class="caption mb">${state.cards.length} cartes enregistrées, ${state.history.length} réponses historisées.</div><button class="btn red" data-action="eraseAll">Effacer les données locales</button></div>
  <input class="file-input" type="file" accept=".json,application/json" id="planInput">
  <input class="file-input" type="file" accept=".json,application/json" id="backupInput">`;
}
function editorView(card) {
 const c=card||{language:langFilter==='it'?'it':'en',front:'',back:'',example:'',topic:'Général'};
 return `<h1>${card?'Modifier':'Nouvelle'} carte</h1><p class="sub">Les informations sont conservées uniquement sur ton appareil.</p>
  <div class="card"><form id="cardForm"><div class="field"><label>Langue</label><select name="language" ${card?'disabled':''}><option value="en" ${c.language==='en'?'selected':''}>Anglais</option><option value="it" ${c.language==='it'?'selected':''}>Italien</option></select></div>
  <div class="field"><label>Expression française</label><input required maxlength="250" name="front" value="${esc(c.front)}" placeholder="Je suis impatient de…"></div>
  <div class="field"><label>Traduction</label><input required maxlength="250" name="back" value="${esc(c.back)}" placeholder="I am looking forward to…"></div>
  <div class="field"><label>Phrase d’exemple (facultatif)</label><textarea name="example" maxlength="500">${esc(c.example)}</textarea></div>
  <div class="field"><label>Thème</label><input required maxlength="100" name="topic" value="${esc(c.topic)}"></div>
  <div class="actions"><button class="btn primary" type="submit">Enregistrer</button><button class="btn ghost" type="button" data-action="cancelEdit">Annuler</button></div></form>
  ${card?`<hr class="thin"><button class="btn ${card.suspended?'ghost':'red'}" data-action="toggleSuspend">${card.suspended?'Réactiver la carte':'Suspendre cette carte'}</button><p class="caption">Suspendre ne supprime ni la carte ni son historique.</p>`:''}</div>`;
}
function ratingCard(rating){
 const c=state.cards.find(
  x=>x.id===studyCardId
 );

 if(!c||!revealed||rating<0||rating>3)
  return;

 const reviewedAt=now();
 const due=Number(c.dueAt||0)<=reviewedAt;
 const oldInterval=Number(c.intervalDays)||0;

 if(rating===0){
  c.repetitions=0;
  c.lapses++;
  c.ease=Math.max(1.3,c.ease-.2);
  c.intervalDays=0;
  c.dueAt=reviewedAt+10*60*1000;

 }else if(rating===1){
  c.ease=Math.max(1.3,c.ease-.12);

  if(due){
   c.repetitions++;
   c.intervalDays=1;
   c.dueAt=reviewedAt+86400000;
  }else{
   c.dueAt=Math.min(
    c.dueAt,reviewedAt+86400000
   );
   c.intervalDays=Math.min(
    oldInterval||1,1
   );
  }

 }else if(due&&rating===2){
  c.repetitions++;
  c.intervalDays=oldInterval===0?1:
   c.repetitions===2?3:
   Math.max(
    2,Math.round(oldInterval*c.ease)
   );
  c.dueAt=reviewedAt+
   c.intervalDays*86400000;

 }else if(due&&rating===3){
  c.repetitions++;
  c.ease=Math.min(3.1,c.ease+.12);
  c.intervalDays=oldInterval===0?4:
   Math.max(
    4,Math.round(
     oldInterval*(c.ease+.3)
    )
   );
  c.dueAt=reviewedAt+
   c.intervalDays*86400000;
 }

 c.lastReviewedAt=stamp();

 state.history.push({
  id:idGen(),
  cardId:c.id,
  language:c.language,
  rating,
  at:c.lastReviewedAt,
  intervalDays:c.intervalDays,
  freePractice:!due
 });

 if(rating===0){
  lc14Session.retry[c.id]=
   lc14Session.turn+1;
 }else if(rating===1){
  lc14Session.retry[c.id]=
   lc14Session.turn+3;
 }else{
  delete lc14Session.retry[c.id];
 }

 studyCardId=null;
 revealed=false;
 typedAnswer='';
 save();
 render();
}
function weeklyReport() {
 const a=statsFor(),en=statsFor('en'),it=statsFor('it');
 return {kind:'lexicycle-weekly-report',schemaVersion:SCHEMA,generatedAt:stamp(),weekStart:localDay(monday()),weekEnd:eWeek(),lastPlanWeek:state.lastPlanWeek,
  summary:{all:a,en,it,ratings:weeklyHistory().reduce((o,h)=>(o[['forgot','hard','good','easy'][h.rating]]++,o),{forgot:0,hard:0,good:0,easy:0})},
  recentDifficulties:state.cards.map(c=>({c,errors:state.history.filter(h=>h.cardId===c.id&&h.rating<=1).length})).filter(x=>x.errors>=2).sort((a,b)=>b.errors-a.errors).slice(0,30).map(({c,errors})=>({id:c.id,language:c.language,front:c.front,back:c.back,errors,lapses:c.lapses,repetitions:c.repetitions})),
  homework:{weekStart:lcWeek(),tasks:(state.tasks||[]).filter(t=>t.weekStart===lcWeek()),pending:lcTodo().length}, 
  schoolSummary:{packs:(state.school?.packs||[]).map(p=>({id:p.id,title:p.title,subject:p.subject,cards:p.cards.length})),reviewsThisWeek:(state.school?.reviews||[]).filter(r=>Date.parse(r.at)>=monday().getTime()).length},
  requests:state.requests,planHistory:state.planHistory,
  // Snapshot complet : cette seule exportation permet de restaurer le contexte sans ancien chat.
  fullSnapshot:structuredClone(state),
  instructionsForChatGPT:'Analyse mes difficultés et mes devoirs. Génère un lexicycle-weekly-plan schemaVersion 1 avec cards, updates et tasks. Maximum 10 nouvelles expressions par langue. Conserve les ID et la progression.'};
}
const backupObject=()=>({kind:'lexicycle-full-backup',schemaVersion:SCHEMA,generatedAt:stamp(),data:structuredClone(state)});
function downloadJSON(data,prefix) {
 const json=JSON.stringify(data,null,2);const blob=new Blob([json],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=`${prefix}-${localDay(new Date())}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function planExample() {
 return {kind:'lexicycle-weekly-plan',schemaVersion:SCHEMA,weekStart:localDay(monday()),
  cards:[{id:'en-w02-example-001',language:'en',front:'J’ai hâte de…',back:'I am looking forward to…',example:'I am looking forward to the concert.',topic:'Expressions'}],
  updates:[{id:'starter-en-0',example:'I used to play the piano.'}],
 tasks:[
 {id:'en-grammaire-01',language:'en',kind:'grammar',
 day:'mercredi',title:'Present simple',
 description:'Écrire 10 phrases.'},
 {id:'it-grammaire-01',language:'it',kind:'grammar',
 day:'jeudi',title:'Passato prossimo',
 description:'Écrire 6 phrases.'}
 ],notes:'Les mêmes IDs ne sont jamais recréés. Les mises à jour conservent la progression.'};
}
function isString(x,max=500) {return typeof x==='string'&&x.trim().length>0&&x.length<=max;}
function validateState(x) {
 if(!x||x.schemaVersion!==SCHEMA||!Array.isArray(x.cards)||!Array.isArray(x.history)||!Array.isArray(x.requests)||!Array.isArray(x.planHistory)||x.cards.length>50000||x.history.length>500000)throw Error('Sauvegarde incompatible ou incomplète.');
 if(x.tasks!==undefined&&(!Array.isArray(x.tasks)||x.tasks.length>3000))throw Error("Devoirs invalides.");
 const ids=new Set();for(const c of x.cards){
  if(!isString(c.id,140)||ids.has(c.id)||!LANG[c.language]||!isString(c.front,250)||!isString(c.back,250)||typeof c.dueAt!=='number')throw Error('Une carte de la sauvegarde est invalide.');
  ids.add(c.id);
 }
 for(const h of x.history)if(!isString(h.cardId,140)||!isString(h.at,50)||!LANG[h.language]||![0,1,2,3].includes(h.rating))throw Error('Historique invalide.');
 return x;
}
function validatePlan(x) {
 if(!x||x.kind!=='lexicycle-weekly-plan'||x.schemaVersion!==SCHEMA||!isString(x.weekStart,12)||!/^\d{4}-\d{2}-\d{2}$/.test(x.weekStart)||!Array.isArray(x.cards)||!Array.isArray(x.updates)||x.cards.length>400||x.updates.length>400)throw Error('Format de programme JSON invalide.');
 for(const c of x.cards){if(!isString(c.id,140)||!LANG[c.language]||!isString(c.front,250)||!isString(c.back,250)|| (c.example!=null&&typeof c.example!=='string')||(c.topic!=null&&typeof c.topic!=='string'))throw Error('Une nouvelle carte est invalide.');}
 for(const u of x.updates){if(!isString(u.id,140)||!['front','back','example','topic','suspended'].every(k=>u[k]===undefined|| (k==='suspended'?typeof u[k]==='boolean':typeof u[k]==='string'))|| (u.front!==undefined&&!isString(u.front,250))||(u.back!==undefined&&!isString(u.back,250)))throw Error('Mise à jour de carte invalide.');}

 if(x.tasks!==undefined){
 if(!Array.isArray(x.tasks)||x.tasks.length>30)
 throw Error('Devoirs invalides.');
 const ids=new Set();
 for(const t of x.tasks){
 if(!t||!isString(t.id,140)||ids.has(t.id)||
 !LANG[t.language]||!isString(t.title,140)||
 !['grammar','listening','writing','review','other']
 .includes(t.kind||'other')||
 (t.description!==undefined&&
 (typeof t.description!=='string'||
 t.description.length>800))||
 (t.day!==undefined&&
 (typeof t.day!=='string'||t.day.length>40)))
 throw Error('Devoir invalide.');
 ids.add(t.id);
 }
 }
 return x;
}
async function handlePlan(data) {
 const plan=validatePlan(data);const seen=new Set(), actions=[];
 for(const c of plan.cards) {
  if(seen.has(c.id))throw Error('Identifiant de carte répété dans le fichier.');seen.add(c.id);
  const existing=state.cards.find(x=>x.id===c.id);
  if(existing&&existing.language!==c.language)throw Error('Identifiant utilisé dans une autre langue.');
  if(!existing)actions.push({kind:'add',card:createCard(c)});
 }
 for(const u of plan.updates){
  const target=state.cards.find(c=>c.id===u.id)||actions.find(a=>a.kind==='add'&&a.card.id===u.id)?.card;
  if(!target)throw Error(`Mise à jour impossible : carte inconnue (${u.id}).`);
  actions.push({kind:'update',targetId:u.id,update:u});
 }
 // Validation complète avant la moindre modification.
 let added=0,changed=0;
 for(const a of actions){
  if(a.kind==='add'){state.cards.push(a.card);added++;}
  else {const c=state.cards.find(x=>x.id===a.targetId);for(const k of ['front','back','example','topic','suspended'])if(a.update[k]!==undefined)c[k]=typeof a.update[k]==='string'?a.update[k].trim():a.update[k];changed++;}
 }
 const tasks=state.tasks||(state.tasks=[]);
 let addedTasks=0;
 for(const t of plan.tasks||[]){
 if(!tasks.some(old=>old.id===t.id)){
 tasks.push({
 id:t.id,language:t.language,kind:t.kind||'other',
 day:t.day||'',title:t.title.trim(),
 description:(t.description||'').trim(),
 weekStart:plan.weekStart,
 createdAt:stamp(),completedAt:null
 });
 addedTasks++;
 }
 }
 state.lastPlanWeek=plan.weekStart;
 state.planHistory.push({at:stamp(),weekStart:plan.weekStart,added,changed,addedTasks,notes:typeof plan.notes==='string'?plan.notes.slice(0,300):''});
 await save();tell(`Programme importé : ${added} nouvelle(s) carte(s), ${changed} modification(s), ${addedTasks} devoir(s). Les révisions précédentes sont conservées.`);
}
async function handleBackup(file) {
 let candidate=file?.kind==='lexicycle-full-backup'?file.data:file?.kind==='lexicycle-weekly-report'?file.fullSnapshot:null;
 if(!candidate)throw Error('Ce fichier n’est pas une sauvegarde LexiCycle ni un bilan complet.');
 candidate=validateState(candidate);
 if(!confirm(`Restaurer ${candidate.cards.length} cartes et ${candidate.history.length} réponses ? Cela REMPLACERA toutes les données locales actuelles.`))return;
 await writeQueue.catch(()=>{});state=structuredClone(candidate);await save();studyCardId=null;editId=null;screen='home';tell('Sauvegarde restaurée avec succès.');
}
async function importFile(inputId,type) {
 const input=document.getElementById(inputId);if(!input)return;
 input.onchange=async()=>{
  const file=input.files?.[0];if(!file)return;
  if(file.size>30*1024*1024){tell('Fichier trop volumineux (maximum 30 Mo).',true);return;}
  try {const json=JSON.parse(await file.text());if(type==='plan')await handlePlan(json);else if(type==='school')await schoolImport(json);else await handleBackup(json);}
  catch(err){tell(`Import impossible : ${err.message}`,true);}
 };
 input.click();
}
async function actionClick(action) {
 switch(action){
  case 'reveal':revealed=true;render();break;
  case 'newCard':editId=null;screen='editor';renderEditor();break;
  case 'cancelEdit':editId=null;screen='library';render();break;
  case 'toggleSuspend':{
    const c=state.cards.find(x=>x.id===editId);if(c){c.suspended=!c.suspended;await save();renderEditor();}break;
  }
  case 'downloadReport':downloadJSON(weeklyReport(),'LexiCycle-bilan');break;
  case 'downloadBackup':downloadJSON(backupObject(),'LexiCycle-sauvegarde');break;
  case 'downloadExample':downloadJSON(planExample(),'LexiCycle-exemple-programme');break;
  case 'importPlan':await importFile('planInput','plan');break;
  case 'importSchool':await importFile('schoolInput','school');break;
  case 'restoreBackup':await importFile('backupInput','backup');break;
  case 'copyReport':{
    try{await navigator.clipboard.writeText(JSON.stringify(weeklyReport(),null,2));tell('Bilan complet copié. Tu peux le coller dans ChatGPT.');}
    catch(_){tell('Copie indisponible. Utilise le bouton « Exporter le bilan JSON ».',true);}break;
  }
  case 'eraseAll':{
    const response=prompt('Pour effacer définitivement toutes les données locales, écris EFFACER. Fais d’abord une sauvegarde.');
    if(response==='EFFACER'){state=initialState();await save();screen='home';tell('Données locales réinitialisées. Les cartes de démarrage sont réinstallées.');}break;
  }
 }
}
function renderEditor(){render();}
document.addEventListener('click',async e=>{
 const btn=e.target.closest('button');if(!btn)return;
 flash=null;
 if(btn.dataset.schoolBack!==undefined){schoolPackId=null;schoolReset();render();return;}
 if(btn.dataset.schoolOpen){schoolPackId=btn.dataset.schoolOpen;schoolReset();render();return;}
 if(btn.dataset.schoolReveal!==undefined){schoolRevealed=true;render();return;}
 if(btn.dataset.schoolRate!==undefined){schoolRate(Number(btn.dataset.schoolRate));return;}
 if(btn.dataset.schoolImport!==undefined){await importFile('schoolInput','school');return;}
 if(btn.dataset.schoolExample!==undefined){downloadJSON(schoolExample(),'LexiCycle-exemple-ecole');return;}
 if(btn.dataset.screen){schoolPackId=null;schoolReset();lc14Reset();screen=btn.dataset.screen;editId=null;studyCardId=null;revealed=false;render();window.scrollTo(0,0);return;}
 if(btn.dataset.language){lc14Reset();langFilter=btn.dataset.language;studyCardId=null;revealed=false;render();return;}
 if(btn.dataset.start){lc14Reset();langFilter=btn.dataset.start;screen='study';studyCardId=null;revealed=false;render();window.scrollTo(0,0);return;}
 if(btn.dataset.edit){
 editId=btn.dataset.edit;screen='editor';renderEditor();return;
 }
 if(btn.dataset.finishTask){
 const t=(state.tasks||[]).find(
 x=>x.id===btn.dataset.finishTask
 );
 if(t&&!t.completedAt){
 t.completedAt=stamp();await save();render();
 }
 return;
 }
 if(btn.dataset.rate!==undefined){ratingCard(Number(btn.dataset.rate));return;}
 if(btn.dataset.action)try{await actionClick(btn.dataset.action);}catch(err){tell(`Erreur : ${err.message}`,true);}
});
document.addEventListener('input',e=>{
 if(e.target.id==='attempt')typedAnswer=e.target.value;
 if(e.target.id==='search') {const value=e.target.value;searchText=value;const selection=e.target.selectionStart;render();const input=document.getElementById('search');input?.focus();input?.setSelectionRange(selection,selection);}
});
document.addEventListener('submit',async e=>{
 if(!['quickRequest','cardForm'].includes(e.target.id))return;
 e.preventDefault();const fields=Object.fromEntries(new FormData(e.target).entries());
 if(e.target.id==='quickRequest') {
  if(!isString(fields.text,300))return;
  state.requests.push({id:idGen(),at:stamp(),language:fields.language,text:fields.text.trim(),handled:false});await save();tell('Difficulté enregistrée pour le prochain bilan.');return;
 }
 if(!isString(fields.front,250)||!isString(fields.back,250))return;
 if(editId){const c=state.cards.find(x=>x.id===editId);if(!c)return;
  for(const k of ['front','back','example','topic'])c[k]=(fields[k]||'').trim();
 } else state.cards.push(createCard({language:fields.language,front:fields.front,back:fields.back,example:fields.example,topic:fields.topic}));
 await save();editId=null;screen='library';tell('Carte enregistrée.');
});
document.addEventListener('keydown',e=>{
 if(screen!=='study'||e.target.matches('input,textarea,select')||e.metaKey||e.ctrlKey||e.altKey)return;
 if(e.code==='Space'&&!revealed){e.preventDefault();revealed=true;render();}
 else if(revealed&&['1','2','3','4'].includes(e.key)){e.preventDefault();ratingCard(Number(e.key)-1);}
});
window.addEventListener('online',()=>render());window.addEventListener('offline',()=>render());
(async()=>{
 try{
  if(!('indexedDB' in window))throw Error('IndexedDB indisponible sur ce navigateur.');
  db=await startupTimeout(openDB(), 8000, 'Ouverture du stockage local');
  state=await startupTimeout(dbGet(STATE_KEY), 8000, 'Lecture des données locales');
  if(!state){
    state=initialState();
    await startupTimeout(save(), 8000, 'Création des données locales');
  }
  validateState(state);
  render();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Mode hors ligne non disponible avant installation :',e));
 }catch(error){root.innerHTML=`<main class="shell"><h1>Stockage local indisponible</h1><div class="notice error">${esc(error.message)}</div><p>Ouvre l’application dans Safari normal (pas en navigation privée). Vérifie que le stockage du site est autorisé, puis recharge. Si tu disposes d'une sauvegarde, conserve-la.</p></main>`;}
})();
