import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogInput} from '../src/server/merch-catalog-admin';
import {csvCell,merchOrderFilters} from '../src/server/merch-order-tools';
import {auditDetails} from '../src/server/staff-management';
test('CSV cells neutralize formula prefixes including whitespace, tabs and multiline content while preserving quoting',()=>{
 for(const value of ['=1+1','+2348000000000','-2','@SUM(A1)','  =1','\tplain','\nplain'])assert.ok(csvCell(value).startsWith('"\''));
 assert.equal(csvCell('ordinary, "name"'),'"ordinary, ""name"""');assert.equal(csvCell(null),'""');assert.equal(csvCell(50000),'"50000"');
});
test('catalogue edits reject fractional prices, unsafe image schemes, credentials and reserved or duplicate variant labels',()=>{
 const base={productId:null,revision:null,name:'Machine Tee',description:'Design description',kind:'TEE',priceMinor:5000000,imageUrl:'',variants:[{id:null,label:'M',enabled:true}],reason:'Initial collection setup',confirmed:true};
 for(const imageUrl of ['data:image/svg+xml,bad','javascript:bad','http://example.com/a.png','https://user:secret@example.com/a.png','//evil.example/a.png','/images/../secret'])assert.equal(catalogInput.safeParse({...base,imageUrl}).success,false);
 assert.equal(catalogInput.safeParse({...base,imageUrl:'/images/tee.png'}).success,true);assert.equal(catalogInput.safeParse({...base,priceMinor:1.5}).success,false);assert.equal(catalogInput.safeParse({...base,variants:[{id:null,label:'__edit_private',enabled:true}]}).success,false);
 assert.equal(merchOrderFilters.safeParse({from:'2026-10-13T12:00:00',mode:'live'}).success,false);
});
test('catalogue audit variant snapshots reveal allowed labels/enabled values without unknown fields',()=>{
 assert.deepEqual(auditDetails({variants:[{id:'v',label:'XL',enabled:false,token:'secret'}],beforeVariants:[{id:'v',label:'L',enabled:true,private:'secret'}]}),{variants:[{id:'v',label:'XL',enabled:false}],beforeVariants:[{id:'v',label:'L',enabled:true}]});
});
