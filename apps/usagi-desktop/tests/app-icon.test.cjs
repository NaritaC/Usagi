'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {PNG}=require('pngjs');
const assets=path.resolve(__dirname,'../assets');
function occupancy(image) {
  let left=image.width,top=image.height,right=-1,bottom=-1,count=0;
  for(let y=0;y<image.height;y++) for(let x=0;x<image.width;x++) {
    if(image.data[(y*image.width+x)*4+3]<=24)continue;
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);count++;
  }
  return {width:(right-left+1)/image.width,height:(bottom-top+1)/image.height,area:count/(image.width*image.height)};
}
function assertBadge(image) {
  const fill=occupancy(image);
  assert.ok(fill.width>=0.88,`visible width ${fill.width}`);
  assert.ok(fill.height>=0.88,`visible height ${fill.height}`);
  assert.ok(fill.area>=0.6,`visible area ${fill.area}`);
  assert.equal(image.data[3],0,'badge corner stays transparent');
}
test('application PNG fills its icon tile while preserving transparent corners',()=>{
  const image=PNG.sync.read(fs.readFileSync(path.join(assets,'icon.png')));
  assert.equal(image.width,256);assert.equal(image.height,256);assertBadge(image);
});
test('ICO supplies full badges at standard Windows sizes and display scaling tiers',()=>{
  const ico=fs.readFileSync(path.join(assets,'icon.ico'));
  assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);
  const count=ico.readUInt16LE(4),sizes=[];
  assert.equal(count,9);
  for(let index=0;index<count;index++) {
    const entry=6+index*16,size=ico[entry]||256,bytes=ico.readUInt32LE(entry+8),offset=ico.readUInt32LE(entry+12);
    assert.ok(offset+bytes<=ico.length);
    const image=PNG.sync.read(ico.subarray(offset,offset+bytes));
    assert.equal(image.width,size);assert.equal(image.height,size);assertBadge(image);sizes.push(size);
  }
  assert.deepEqual(sizes,[16,20,24,32,40,48,64,128,256]);
});
test('application icon changes preserve the original animation atlases',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(assets,'asset-manifest.json'),'utf8'));
  for(const format of ['png','webp']) {
    const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(assets,`spritesheet.${format}`))).digest('hex');
    assert.equal(actual,manifest.source[format].sha256);
  }
});
