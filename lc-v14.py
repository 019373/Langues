from pathlib import Path
import re, subprocess

app_path=Path('app.js')
css_path=Path('styles.css')
html_path=Path('index.html')
sw_path=Path('sw.js')

files=[app_path,css_path,html_path,sw_path]
if not all(p.is_file() for p in files):
    raise SystemExit('Fichiers LexiCycle manquants.')

app=app_path.read_text(encoding='utf-8')
css=css_path.read_text(encoding='utf-8')
html=html_path.read_text(encoding='utf-8')
sw=sw_path.read_text(encoding='utf-8')

if 'lc14Pick' in app:
    print('V1.4 déjà installée.')
    raise SystemExit(0)

if 'function studyView()' not in app or 'function ratingCard(rating)' not in app:
    raise SystemExit('Version non reconnue.')

def once(before,after,name):
    global app
    if app.count(before)!=1:
        raise SystemExit('Incompatibilité : '+name)
    app=app.replace(before,after,1)

picker='''// LexiCycle V1.4
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
'''

once(
 'function selectedCards() {',
 picker+'\nfunction selectedCards() {',
 'sélection aléatoire'
)

once(
 "${s.due?'':'disabled'}>Réviser",
 "${s.cards?'':'disabled'}>Réviser",
 'boutons accueil'
)

once(
 'const options=dueCards();',
 'const options=selectedCards().filter(c=>!c.suspended);',
 'cartes disponibles'
)

once(
 "if (!card || card.suspended || card.dueAt>now() || (langFilter!=='all'&&card.language!==langFilter)) { card=options[0];studyCardId=card?.id||null;revealed=false;typedAnswer=''; }",
 "if (!card || card.suspended || (langFilter!=='all'&&card.language!==langFilter)) { card=lc14Pick();studyCardId=card?.id||null;revealed=false;typedAnswer=''; }",
 'choix des cartes'
)

once(
 'Lis le français, retrouve la phrase dans la langue choisie, puis évalue ta réponse.',
 'Révision libre et illimitée, dans un ordre aléatoire. Les cartes oubliées ou difficiles reviennent rapidement.',
 'description séance'
)

once(
 "${options.length} carte${options.length>1?'s':''} à revoir",
 "${options.length} carte${options.length>1?'s':''} disponible${options.length>1?'s':''} · sans limite",
 'compteur'
)

once(
 'Aucune carte à revoir pour le moment</strong>La répétition espacée choisira les prochaines dates.',
 'Aucune carte active</strong>Ajoute une carte ou réactive une carte suspendue pour commencer.',
 'écran vide'
)
start=app.index('function ratingCard(rating) {')
end=app.index('function weeklyReport() {',start)

rating='''function ratingCard(rating){
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
'''

app=app[:start]+rating+app[end:]

once(
 'if(btn.dataset.screen){screen=btn.dataset.screen;',
 'if(btn.dataset.screen){lc14Reset();screen=btn.dataset.screen;',
 'navigation'
)

once(
 'if(btn.dataset.language){langFilter=btn.dataset.language;',
 'if(btn.dataset.language){lc14Reset();langFilter=btn.dataset.language;',
 'changement de langue'
)

once(
 'if(btn.dataset.start){langFilter=btn.dataset.start;',
 'if(btn.dataset.start){lc14Reset();langFilter=btn.dataset.start;',
 'début révision'
)

css+='''
/* LexiCycle V1.4 */
html,body{
 width:100%;
 max-width:100%;
 overflow-x:hidden;
 overscroll-behavior-x:none;
}
body{
 touch-action:pan-y;
}
html,body,.shell{
 scrollbar-width:none;
 -ms-overflow-style:none;
}
html::-webkit-scrollbar,
body::-webkit-scrollbar,
.shell::-webkit-scrollbar{
 display:none;
 width:0;
 height:0;
}
.shell,.card,.top,.row,.grid2,.study-front{
 max-width:100%;
 min-width:0;
}
input,textarea,select{
 max-width:100%;
}
'''

if (
 '1.3-autonome' not in html and
 '1.2-autonome' not in html
):
 raise SystemExit(
  'index.html incompatible : aucune modification.'
 )

html,n1=re.subn(
 r'<style>.*?</style>',
 lambda _:'<style>\n'+css+'\n</style>',
 html,count=1,flags=re.S
)

html,n2=re.subn(
 r"<script>\s*'use strict';.*?</script>",
 lambda _:'<script>\n'+
 app.replace('</script','<\\/script')+
 '\n</script>',
 html,count=1,flags=re.S
)

if n1!=1 or n2!=1:
 raise SystemExit(
  'Structure HTML incompatible.'
 )

html=html.replace(
 '1.3-autonome','1.4-autonome'
).replace(
 '1.2-autonome','1.4-autonome'
)

sw,n3=re.subn(
 r"(const CACHE\s*=\s*)'[^']+'",
 r"\1'lexicycle-selfcontained-v14'",
 sw,count=1
)

if n3!=1:
 raise SystemExit('Cache incompatible.')

for name,source in [
 ('app.js',app),('sw.js',sw)
]:
 result=subprocess.run(
  ['node','--check','-'],
  input=source,text=True,
  capture_output=True
 )
 if result.returncode:
  raise SystemExit(
   'Erreur '+name+' : '+result.stderr
  )

for p in files:
 backup=p.with_name(p.name+'.avant-v14')
 if not backup.exists():
  backup.write_bytes(p.read_bytes())

for p,content in [
 (app_path,app),
 (css_path,css),
 (html_path,html),
 (sw_path,sw)
]:
 p.write_text(content,encoding='utf-8')

print('LexiCycle V1.4 installé.')
print('Révisions illimitées activées.')
print('Ordre aléatoire activé.')
print('Rappels accélérés activés.')
print('Défilement horizontal bloqué.')
print('Données locales conservées.')
