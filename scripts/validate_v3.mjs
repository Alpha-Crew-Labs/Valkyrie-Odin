import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=process.cwd();
const dir=path.join(root,'prototype','valkyrie-v3');
const required=['index.html','styles.css','ontology.js','app.js','motion-v31.css','motion-v31.js','localize-v32.js','polish-v32.css','motion-v32.js'];
let failed=false;
const assert=(cond,msg)=>{if(cond)console.log(`✓ ${msg}`);else{console.error(`✗ ${msg}`);failed=true;}};

for(const file of required)assert(fs.existsSync(path.join(dir,file)),`v3 file exists: ${file}`);
if(failed)process.exit(1);

const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const css=fs.readFileSync(path.join(dir,'styles.css'),'utf8');
const motionCss=fs.readFileSync(path.join(dir,'motion-v31.css'),'utf8');
const polishCss=fs.readFileSync(path.join(dir,'polish-v32.css'),'utf8');
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
const motion=fs.readFileSync(path.join(dir,'motion-v31.js'),'utf8');
const motion32=fs.readFileSync(path.join(dir,'motion-v32.js'),'utf8');
const localize32=fs.readFileSync(path.join(dir,'localize-v32.js'),'utf8');
const ontology=fs.readFileSync(path.join(dir,'ontology.js'),'utf8');

assert(/VALKYRIE v3\.2/.test(html),'v3.2 document title/version is present');
assert(html.includes('살아있는 마켓 온톨로지'),'v3.2 Korean-first title is present');
assert(!/https?:\/\//i.test(html),'v3 has no external HTTP runtime dependency');
assert(html.includes("script-src 'self'"),'v3 CSP restricts scripts to self');
assert(html.includes("style-src 'self' 'unsafe-inline'"),'v3 CSP allows local stylesheet');
assert(/\.\/ontology\.js\?v=\d+/.test(html)&&/\.\/app\.js\?v=\d+/.test(html),'v3 core runtime assets are versioned');
assert(/\.\/motion-v31\.css\?v=\d+/.test(html)&&/\.\/motion-v31\.js\?v=\d+/.test(html),'v3.1 motion assets remain wired');
assert(/\.\/localize-v32\.js\?v=\d+/.test(html)&&/\.\/polish-v32\.css\?v=\d+/.test(html)&&/\.\/motion-v32\.js\?v=\d+/.test(html),'v3.2 Korean and hydro polish assets are versioned and wired');
assert(css.includes('@keyframes bootFailSafe'),'v3 includes CSS boot fail-safe');
assert(motionCss.includes('v31Hydro')&&motionCss.includes('v31Comet'),'v3.1 semantic hydro motion styles exist');
assert(motion.includes('runScenarioPropagation')&&motion.includes('runTracePropagation')&&motion.includes('runTemporalPropagation'),'v3.1 semantic propagation orchestrator exists');
assert(polishCss.includes('v32FlowA')&&polishCss.includes('v32FlowB'),'v3.2 triple-stream hydro styles exist');
assert(motion32.includes('installStreams')&&motion32.includes('seedBeads'),'v3.2 flowing data-bead runtime exists');
assert(localize32.includes('한국은행 금리 경로')&&localize32.includes('IPO 의사결정 점수'),'v3.2 domain localization exists');

const sandbox={window:{},console};
vm.createContext(sandbox);
try{vm.runInContext(ontology,sandbox,{filename:'ontology.js'});console.log('✓ ontology.js evaluates in isolated VM');}catch(err){console.error(err.stack||err);process.exit(1);}
const data=sandbox.window.VALKYRIE_V3;
assert(Boolean(data),'VALKYRIE_V3 export exists');
assert(data.objects.length===23,`v3 has exactly 23 objects (found ${data.objects.length})`);
assert(data.relations.length===29,`v3 has exactly 29 relations (found ${data.relations.length})`);
assert(data.snapshots.length===5,`v3 has exactly 5 temporal snapshots (found ${data.snapshots.length})`);

const ids=new Set(data.objects.map(o=>o.id));
assert(ids.size===data.objects.length,'v3 object IDs are unique');
for(const r of data.relations){assert(ids.has(r.from),`${r.id} source exists: ${r.from}`);assert(ids.has(r.to),`${r.id} target exists: ${r.to}`);assert(Boolean(r.type),`${r.id} relation type exists`);}

const types=new Set(data.objects.map(o=>o.type));
for(const t of ['OBSERVATION','MODEL','MARKET','CONCEPT','SIGNAL','DECISION','OUTCOME'])assert(types.has(t),`ontology type exists: ${t}`);
const owners=data.objects.map(o=>o.owner).join(' ');
assert(owners.includes('정희강'),'정희강 macro objects exist');
assert(owners.includes('정훈'),'정훈 rates objects exist');
assert(owners.includes('김유찬'),'김유찬 equity objects exist');
for(const id of ['cpi_model','bok_path','rates_signal','rates_decision','duration_concept','cb_refix','ipo_score','ipo_signal','ipo_decision'])assert(ids.has(id),`core ontology object exists: ${id}`);
for(const s of ['BASE','HAWKISH','DOVISH','RISK_OFF'])assert(Boolean(data.scenarios[s]),`scenario exists: ${s}`);
for(const [name,s] of Object.entries(data.scenarios)){for(const id of s.changed||[])assert(ids.has(id),`${name} scenario references valid object: ${id}`);for(const id of Object.keys(s.patch||{}))assert(ids.has(id),`${name} patch references valid object: ${id}`);}

const htmlIds=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
for(const m of app.matchAll(/byId\(['"]([^'"]+)['"]\)/g)){const id=m[1];assert(htmlIds.has(id),`static runtime DOM id exists: #${id}`);}

assert(/TRACE/.test(app)&&/STRESS/.test(app)&&/TEMPORAL/.test(app),'v3 implements live trace stress temporal modes');
assert(/runCommand/.test(app),'v3 graph operator routing exists');
assert(/openWorkspace/.test(app),'v3 domain workspace drawer exists');
assert(motionCss.includes('@media (prefers-reduced-motion:reduce)'),'v3.1 respects reduced-motion preference');
assert(polishCss.includes('@media(prefers-reduced-motion:reduce)'),'v3.2 respects reduced-motion preference');

if(failed){console.error('\nVALKYRIE v3.2 validation FAILED.');process.exit(1);}console.log('\nVALKYRIE v3.2 validation PASSED.');
