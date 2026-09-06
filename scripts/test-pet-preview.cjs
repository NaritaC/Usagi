// Offline tests of the shipped animation controller, with a small DOM double.
// This does not claim browser rendering or native Codex integration coverage.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
class Element {
  constructor(){this.children=[];this.dataset={};this.events={};this.parts={};this.value='';this.attributes={};this.calls=[];}
  append(e){this.children.push(e);}
  addEventListener(name,fn){this.events[name]=fn;}
  setAttribute(name,value){this.attributes[name]=value;}
  querySelector(name){return this.parts[name]??=new Element();}
  getContext(){return {clearRect(){},drawImage:(...args)=>this.calls.push(args.slice(1))};}
  fire(event,value){if(value!==undefined)this.value=value;this.events[event]({target:this});}
}
const root=path.resolve(__dirname,'..'),elements={};
const document={querySelector:s=>elements[s]??=new Element(),createElement:()=>new Element()};
document.querySelector('#timing').value='host';document.querySelector('#speed').value='1';
let imageObject;
const context=vm.createContext({document,Image:class{constructor(){imageObject=this;this.naturalWidth=1536;this.naturalHeight=1872;}},requestAnimationFrame(){},console});
const run=code=>vm.runInContext(code,context);
run(fs.readFileSync(path.join(root,'pets/usagi-codex/preview.js'),'utf8'));
const passed=[];
function test(name,fn){fn();passed.push(name);}
imageObject.onload();
test('all 9 state cards and decoded atlas readiness',()=>{assert.equal(elements['#grid'].children.length,9);assert.equal(run('ready'),true);});
test('native idle duration is 1680 ms for first frame',()=>{run('advance(1679)');assert.equal(run('rows[0].frame'),0);run('advance(1)');assert.equal(run('rows[0].frame'),1);});
elements['#timing'].fire('change','host');
test('host action repeats three times then idles',()=>{run('advance(2100)');assert.equal(run('rows[3].row'),0);assert.equal(run('rows[3].frame'),0);});
elements['#timing'].fire('change','loop');
test('all 57 frames play for three complete loops without sampling an empty cell',()=>{
  run('for(const r of rows){r.card.querySelector("canvas").calls=[];}');
  for(let elapsed=0;elapsed<4000;elapsed+=10)run('advance(10)');
  const counts=[6,8,8,4,5,8,6,6,6];
  elements['#grid'].children.forEach((card,index)=>{
    const calls=card.querySelector('canvas').calls;
    const seen=new Set(calls.map(c=>c[0]/192));assert.equal(seen.size,counts[index]);
    assert(calls.every(c=>c[1]===index*208&&c[0]>=0&&c[0]<counts[index]*192));
  });
});
test('global pause and resume preserve frame',()=>{elements['#toggle'].fire('click');const before=run('rows[0].frame');run('advance(500)');assert.equal(run('rows[0].frame'),before);elements['#toggle'].fire('click');assert.equal(run('globalPaused'),false);});
test('scrubbing pauses a card on its own state even after host fallback',()=>{
  elements['#timing'].fire('change','host');run('advance(3000)');
  const card=elements['#grid'].children[3];card.querySelector('input').fire('input','2');
  assert.equal(run('rows[3].row'),3);assert.equal(run('rows[3].frame'),2);assert.equal(run('rows[3].paused'),true);
  card.querySelector('button').fire('click');assert.equal(run('rows[3].paused'),false);
});
test('background selector updates preview surfaces',()=>{for(const value of ['dark','light','desktop','checker']){elements['#background'].fire('change',value);assert.equal(elements['#grid'].dataset.background,value);}});
test('speed control affects animation delta',()=>{elements['#timing'].fire('change','loop');elements['#speed'].value='2';run('last=null;tick(0);tick(150)');assert.equal(run('rows[0].frame'),1);});
test('wrong dimensions and missing atlas show explicit errors',()=>{imageObject.naturalWidth=123;imageObject.onload();assert.equal(elements['#status'].dataset.error,'true');imageObject.onerror();assert.match(elements['#status'].textContent,/未找到图集/);});
const report={passed:true,coverage:'offline controller tests with DOM double, not browser UI rendering',checks:passed,browser_preview:'not opened: browser URL policy blocked local file; no workaround attempted'};
fs.writeFileSync(path.join(root,'art/codex-pet-v1/qa/preview-logic-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
