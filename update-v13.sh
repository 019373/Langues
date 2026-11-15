set -e
python3 - <<'PY'
from pathlib import Path
import re

files = [Path(x) for x in ('index.html','app.js','styles.css','sw.js')]
if not all(p.exists() for p in files):
    raise SystemExit('Erreur : ouvre le Shell à la racine de LexiCycle.')

html, app, css, sw = (
    p.read_text(encoding='utf-8') for p in files
)

if 'lexi-v13-custom' in app:
    print('LexiCycle V1.3 est déjà installé.')
    raise SystemExit(0)

def edit(source, old, new, name):
    if old not in source:
        raise SystemExit('Version incompatible : '+name)
    return source.replace(old,new,1)

icons = '''// lexi-v13-custom
const iconPath = {
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
'''

app=edit(app,
 "const iconFor = code => code==='en'?'🇬🇧':'🇮🇹';",
 icons,'icônes')

app=edit(app,
 'Anglais & italien · sans compte',
 'Anglais & italien','titre')

app=edit(app,
 '<div class="mark">L</div>',
 '<div class="mark">${lcIcon("book",25)}</div>',
 'logo')

app=edit(app,
 "${navigator.onLine?'● En ligne':'● Hors ligne'}",
 "${lcIcon(navigator.onLine?'wifi':'offline',14)} ${navigator.onLine?'En ligne':'Hors ligne'}",
 'réseau')

app=edit(app,
 "[['home','⌂','Accueil'],['study','◫','Réviser'],['library','▤','Cartes'],['stats','▥','Bilan']]",
 "[['home','home','Accueil'],['study','study','Réviser'],['library','cards','Cartes'],['stats','stats','Bilan']]",
 'navigation')

app=edit(app,
 '<span class="ni">${ico}</span>',
 '<span class="ni">${lcIcon(ico,21)}</span>',
 'navigation SVG')

app=edit(app,
 '>🇬🇧 Anglais</button>',
 '>Anglais</button>','filtre anglais')

app=edit(app,
 '>🇮🇹 Italien</button>',
 '>Italien</button>','filtre italien')

app=edit(app,
 '  <div class="card"><h2>Une expression difficile ?',
 '  ${lcHomework()}\n  <div class="card"><h2>Une expression difficile ?',
 'section devoirs')

for old,new in {
 '⚙ Paramètres & imports':"${lcIcon('settings',17)} Paramètres & imports",
 '↓ Exporter le bilan JSON':"${lcIcon('download',17)} Exporter le bilan JSON",
 '↓ Exporter le bilan hebdomadaire JSON':"${lcIcon('download',17)} Exporter le bilan hebdomadaire JSON",
 '↑ Importer un programme hebdomadaire':"${lcIcon('upload',17)} Importer un programme hebdomadaire",
 '↓ Exemple du format attendu':"${lcIcon('download',17)} Exemple du format attendu",
 '↓ Sauvegarder toutes les données':"${lcIcon('download',17)} Sauvegarder toutes les données",
 '↑ Restaurer une sauvegarde JSON':"${lcIcon('upload',17)} Restaurer une sauvegarde JSON",
 '+ Ajouter une carte':"${lcIcon('plus',17)} Ajouter une carte",
 '↻<span>Oublié</span>':"${lcIcon('repeat',18)}<span>Oublié</span>",
 '◔<span>Difficile</span>':"${lcIcon('clock',18)}<span>Difficile</span>",
 '✓<span>Correct</span>':"${lcIcon('check',18)}<span>Correct</span>",
 '★<span>Facile</span>':"${lcIcon('star',18)}<span>Facile</span>",
 '<div style="font-size:38px">✓</div>':"<div class=\"lc-empty\">${lcIcon('check',29)}</div>",
 '✓ Stockage local IndexedDB, sans compte.':'Stockage local IndexedDB.',
 '✓ Révisions possibles hors connexion après installation.':'Révisions possibles hors connexion après installation.',
 '✓ Aucune connexion à ChatGPT depuis l\'application.':'Aucune connexion à ChatGPT depuis l\'application.',
 '✓ Export et import JSON uniquement à ton initiative.':'Export et import JSON uniquement à ton initiative.',
 '⚠ Si Safari efface les données de ce site, la sauvegarde JSON est nécessaire pour restaurer tes progrès.':'Si Safari efface les données de ce site, la sauvegarde JSON est nécessaire pour restaurer tes progrès.'
}.items():
 app=app.replace(old,new)

app=edit(app,
 'history:[],requests:[],planHistory:[],preferences:{dailyTarget:15}',
 'history:[],requests:[],planHistory:[],tasks:[],preferences:{dailyTarget:15}',
 'données de départ')


if 'validateState(state);render();' in app:
    app=app.replace(
        'validateState(state);render();',
        'validateState(state);if(!Array.isArray(state.tasks)){state.tasks=[];await save();}render();',
        1
    )
else:
    print('Migration locale déjà effectuée.')


app=edit(app,
 ' const ids=new Set();for(const c of x.cards){',
 ' if(x.tasks!==undefined&&(!Array.isArray(x.tasks)||x.tasks.length>3000))throw Error("Devoirs invalides.");\n const ids=new Set();for(const c of x.cards){',
 'validation sauvegarde')

app=edit(app,
 '.filter(x=>x.fail).sort((a,b)=>b.fail-a.fail || b.total-a.total)',
 '.filter(x=>x.fail>=2).sort((a,b)=>b.fail-a.fail || b.total-a.total)',
 'difficultés')

app=edit(app,
 'Aucune difficulté enregistrée pour le moment.',
 'Une carte apparaît ici après deux réponses « Oublié » ou « Difficile ».',
 'message difficultés')

old='recentDifficulties:state.cards.filter(c=>c.lapses>0).sort((a,b)=>b.lapses-a.lapses).slice(0,20).map(c=>({id:c.id,language:c.language,front:c.front,back:c.back,lapses:c.lapses,repetitions:c.repetitions})),'
new='recentDifficulties:state.cards.map(c=>({c,errors:state.history.filter(h=>h.cardId===c.id&&h.rating<=1).length})).filter(x=>x.errors>=2).sort((a,b)=>b.errors-a.errors).slice(0,30).map(({c,errors})=>({id:c.id,language:c.language,front:c.front,back:c.back,errors,lapses:c.lapses,repetitions:c.repetitions})),\n  homework:{weekStart:lcWeek(),tasks:(state.tasks||[]).filter(t=>t.weekStart===lcWeek()),pending:lcTodo().length}, '

app=edit(app,old,new,'export difficultés et devoirs')

app=edit(app,
 'Analyse mes difficultés et génère un fichier lexicycle-weekly-plan version 1. Garde les identifiants des cartes existantes, ajoute 10 expressions max par langue selon mes besoins et utilise updates pour corriger les cartes existantes. Ne modifie pas mes statistiques.',
 'Analyse mes difficultés et mes devoirs. Génère un lexicycle-weekly-plan schemaVersion 1 avec cards, updates et tasks. Maximum 10 nouvelles expressions par langue. Conserve les ID et la progression.',
 'consigne bilan')

app=edit(app,
 "updates:[{id:'starter-en-0',example:'I used to play the piano.'}],notes:",
 """updates:[{id:'starter-en-0',example:'I used to play the piano.'}],
 tasks:[
 {id:'en-grammaire-01',language:'en',kind:'grammar',
 day:'mercredi',title:'Present simple',
 description:'Écrire 10 phrases.'},
 {id:'it-grammaire-01',language:'it',kind:'grammar',
 day:'jeudi',title:'Passato prossimo',
 description:'Écrire 6 phrases.'}
 ],notes:""",
 'exemple devoirs')

validation = '''
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
'''

app=edit(app,
 " return x;\n}\nasync function handlePlan",
 validation+" return x;\n}\nasync function handlePlan",
 'validation des devoirs')

app=edit(app,
 ' state.lastPlanWeek=plan.weekStart;',
 ''' const tasks=state.tasks||(state.tasks=[]);
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
 state.lastPlanWeek=plan.weekStart;''',
 'import devoirs')

app=edit(app,
 'weekStart:plan.weekStart,added,changed,notes:',
 'weekStart:plan.weekStart,added,changed,addedTasks,notes:',
 'historique import')

app=edit(app,
 '${changed} modification(s). Les révisions précédentes sont conservées.',
 '${changed} modification(s), ${addedTasks} devoir(s). Les révisions précédentes sont conservées.',
 'message import')

app=edit(app,
 " if(btn.dataset.edit){editId=btn.dataset.edit;screen='editor';renderEditor();return;}",
 """ if(btn.dataset.edit){
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
 }""",
 'validation des devoirs')

css += '''
/* LexiCycle V1.3 */
.lc-icon{display:inline-block;vertical-align:middle;flex:none;pointer-events:none}
.mark{background:#27445f;color:#bfe3fa;border:1px solid #44698d}
.nav .ni{display:grid;place-items:center;height:25px}
.lc-lang{display:inline-flex;align-items:center;justify-content:center;min-width:23px;height:20px;padding:0 4px;border-radius:5px;font-size:10px;font-weight:750;margin-right:4px}
.lc-en{background:#274362;color:#b6dfff}
.lc-it{background:#20493f;color:#b5efd1}
.lc-empty{display:grid;place-items:center;width:52px;height:52px;margin:0 auto 14px;border-radius:50%;background:#224c44;color:#b4eed7}
.lc-work{border-color:#3d5e7c;background:linear-gradient(140deg,#1b3046,#15253a)}
.lc-work h2{display:flex;align-items:center;gap:8px;margin:0}
.lc-task-list{margin-top:12px}
.lc-task{display:flex;align-items:flex-start;gap:12px;padding:14px 0;border-top:1px solid var(--line)}
.lc-task-text{min-width:0;flex:1}
.lc-task-text strong{display:block;margin:6px 0 3px}
.lc-task-text p{font-size:13px;line-height:1.45;color:var(--muted)}
.lc-done{display:grid;place-items:center;flex:none;width:34px;height:34px;border:1px solid #6585a4;border-radius:10px;background:#223d54;color:#93adbf}
.lc-done:hover{color:#e4fff1;background:#245749}
'''

if '1.2-autonome' not in html:
 raise SystemExit('Ce correctif nécessite LexiCycle V1.2.')

html,n1=re.subn(
 r'<style>.*?</style>',
 lambda _:'<style>\n'+css+'\n</style>',
 html,count=1,flags=re.S)

html,n2=re.subn(
 r"<script>\s*'use strict';.*?</script>",
 lambda _:'<script>\n'+
 app.replace('</script','<\\/script')+
 '\n</script>',
 html,count=1,flags=re.S)

if n1!=1 or n2!=1:
 raise SystemExit('Structure index.html incompatible.')

html=html.replace('1.2-autonome','1.3-autonome')

sw=re.sub(
 r"(const CACHE\s*=\s*)'[^']+'",
 r"\1'lexicycle-selfcontained-v13'",
 sw,count=1)

for p in files:
 backup=Path(p.name+'.avant-v13')
 if not backup.exists():
  backup.write_text(
   p.read_text(encoding='utf-8'),
   encoding='utf-8')

for p,content in zip(files,(html,app,css,sw)):
 p.write_text(content,encoding='utf-8')

print('LexiCycle V1.3 installé.')
print('Données locales conservées.')
PY

node --check app.js
node --check sw.js
echo "Installation terminée."
