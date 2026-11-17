from pathlib import Path
import re, subprocess, sys

parts={name:Path(name) for name in ['app.js','styles.css','index.html','sw.js']}
if not all(p.exists() for p in parts.values()):
    sys.exit('Ouvre le Shell à la racine du projet LexiCycle (fichiers manquants).')
a=parts['app.js'].read_text()
c=parts['styles.css'].read_text()
h=parts['index.html'].read_text()
w=parts['sw.js'].read_text()

if 'LC_SCHOOL_V15' in a:
    print('LexiCycle V1.5 déjà installé.')
    sys.exit(0)

def change(old,new,label):
    global a
    if a.count(old)!=1:
        sys.exit('Version incompatible : '+label+' (aucun fichier modifié).')
    a=a.replace(old,new,1)

school = r'''// LC_SCHOOL_V15 : école séparée des cartes B2
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
'''
change('function segment() {',school+'\nfunction segment() {','écran École')

change(
 "[['home','home','Accueil'],['study','study','Réviser'],['library','cards','Cartes'],['stats','stats','Bilan']]",
 "[['home','home','Accueil'],['study','study','Réviser'],['school','school','École'],['stats','stats','Bilan']]",
 'menu'
)

change(
 " home:'<path",
 " school:'<path d=\"M3 5h18v14H3zM8 5v14M12 9h6M12 13h6\"/>',\n home:'<path",
 'icône École'
)

change(
 'library:libraryView,stats:statsView,settings:settingsView',
 'library:libraryView,school:schoolView,stats:statsView,settings:settingsView',
 'affichage'
)

change(
 "case 'importPlan':await importFile('planInput','plan');break;",
 "case 'importPlan':await importFile('planInput','plan');break;\n  case 'importSchool':await importFile('schoolInput','school');break;",
 'import école'
)

change(
 "if(type==='plan')await handlePlan(json);else await handleBackup(json);",
 "if(type==='plan')await handlePlan(json);else if(type==='school')await schoolImport(json);else await handleBackup(json);",
 'lecture fichier école'
)

change(
 " if(btn.dataset.screen){lc14Reset();",
 """ if(btn.dataset.schoolBack!==undefined){schoolPackId=null;schoolReset();render();return;}
 if(btn.dataset.schoolOpen){schoolPackId=btn.dataset.schoolOpen;schoolReset();render();return;}
 if(btn.dataset.schoolReveal!==undefined){schoolRevealed=true;render();return;}
 if(btn.dataset.schoolRate!==undefined){schoolRate(Number(btn.dataset.schoolRate));return;}
 if(btn.dataset.schoolImport!==undefined){await importFile('schoolInput','school');return;}
 if(btn.dataset.schoolExample!==undefined){downloadJSON(schoolExample(),'LexiCycle-exemple-ecole');return;}
 if(btn.dataset.screen){schoolPackId=null;schoolReset();lc14Reset();""",
 'actions école'
)


change(
 '  requests:state.requests,planHistory:state.planHistory,',
 '  schoolSummary:{packs:(state.school?.packs||[]).map(p=>({id:p.id,title:p.title,subject:p.subject,cards:p.cards.length})),reviewsThisWeek:(state.school?.reviews||[]).filter(r=>Date.parse(r.at)>=monday().getTime()).length},\n  requests:state.requests,planHistory:state.planHistory,',
 'bilan école'
)

change(
 '  <div class="card"><h2>Gestion</h2>',
 '  <div class="card"><h2>Gestion des cartes B2</h2><p class="caption">Ancienne bibliothèque disponible ici si tu veux modifier tes cartes personnelles.</p><button class="btn ghost full mt" data-screen="library">Ouvrir la bibliothèque B2</button></div>\n  <div class="card"><h2>Gestion</h2>',
 'accès cartes B2'
)

c+='''
/* LexiCycle V1.5 : École */
.school-pack{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:15px 0;border-top:1px solid var(--line)}
.school-pack-content{min-width:0;flex:1;overflow-wrap:anywhere}
.school-pack-content strong{display:block;margin-bottom:5px}
.school-front .prompt,.school-front .answer{overflow-wrap:anywhere;white-space:pre-line}
.school-pack .btn{flex-shrink:0}
@media(max-width:380px){
 .school-pack{gap:6px}
 .school-pack .btn{padding:8px 10px}
}
'''

if '<style>' not in h or "'use strict';" not in h:
    sys.exit('HTML autonome incompatible (aucun fichier modifié).')

h,n1=re.subn(
 r'<style>.*?</style>',
 lambda m:'<style>\n'+c+'\n</style>',
 h,count=1,flags=re.S
)

h,n2=re.subn(
 r"<script>\s*'use strict';.*?</script>",
 lambda m:'<script>\n'+a.replace('</script','<\\/script')+'\n</script>',
 h,count=1,flags=re.S
)

if n1!=1 or n2!=1:
    sys.exit('HTML incompatible (aucun fichier modifié).')

h=re.sub(
 r'(<meta name="lexicycle-version" content=")[^"]+',
 r'\g<1>1.5-autonome',
 h,count=1
)

w,count=re.subn(
 r"(const CACHE\s*=\s*)'[^']+'",
 r"\1'lexicycle-selfcontained-v15'",
 w,count=1
)

if count!=1:
    sys.exit('Service worker incompatible (aucun fichier modifié).')

for name,source in [('app.js',a),('sw.js',w)]:
    p=subprocess.run(
        ['node','--check','-'],
        input=source,text=True,capture_output=True
    )
    if p.returncode:
        sys.exit('Erreur syntaxe '+name+': '+p.stderr)

for name,s in [
    ('app.js',a),
    ('styles.css',c),
    ('index.html',h),
    ('sw.js',w)
]:
    p=parts[name]
    backup=Path(name+'.avant-v15')
    if not backup.exists():
        backup.write_bytes(p.read_bytes())
    p.write_text(s)

print('LexiCycle V1.5 installé.')
print('Onglet École activé.')
print('Révisions B2 et École séparées.')
print('Stockage local conservé.')
