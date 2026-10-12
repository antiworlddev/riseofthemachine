import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {quoteInput,shippingInput} from '../src/server/shipping';
import {cartHash,pricesHash} from '../src/server/merch-cart';
import {merchInput} from '../src/server/merch';
test('shipping quotes accept only cart and configured destination IDs, never customer prices',()=>{
 const items=[{variantId:randomUUID(),quantity:1}],pickup={items,fulfilment:'PICKUP'};
 assert.equal(quoteInput.safeParse(pickup).success,true);assert.equal(quoteInput.safeParse({...pickup,fulfilment:'DELIVERY',shippingRateId:randomUUID()}).success,true);
 const duplicate='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';assert.equal(quoteInput.safeParse({fulfilment:'PICKUP',items:[{variantId:duplicate,quantity:1},{variantId:duplicate.toUpperCase(),quantity:1}]}).success,false);
 for(const invalid of [{...pickup,totalMinor:1},{...pickup,shippingFeeMinor:0},{...pickup,fulfilment:'DELIVERY'},{...pickup,items:[...items,...items]}])assert.equal(quoteInput.safeParse(invalid).success,false);
 const delivery={buyerName:'Test Buyer',phone:'+2348000000000',idempotencyKey:randomUUID(),items,fulfilment:'DELIVERY',shippingRateId:randomUUID(),quoteToken:'quote',acceptDeliveryQuote:true,address:{line1:'123 Test Road',city:'Abuja',state:'FCT',country:'Nigeria'}};
 assert.equal(merchInput.safeParse(delivery).success,true);assert.equal(merchInput.safeParse({...delivery,shippingFeeMinor:0}).success,false);assert.equal(merchInput.safeParse({...delivery,acceptDeliveryQuote:false}).success,false);assert.equal(merchInput.safeParse({...delivery,quoteToken:undefined}).success,false);
});
test('shipping administration requires bounded integer fees and stale-edit revisions',()=>{
 const create={action:'create',state:'FCT',feeMinor:500000,note:'Synthetic test delivery service',enabled:true};assert.equal(shippingInput.safeParse(create).success,true);assert.equal(shippingInput.safeParse({...create,feeMinor:0}).success,true);
 for(const invalid of [{...create,feeMinor:-1},{...create,feeMinor:1.1},{...create,feeMinor:100000001},{...create,domain:'live'},{...create,note:''}])assert.equal(shippingInput.safeParse(invalid).success,false);
 assert.equal(shippingInput.safeParse({action:'update',id:randomUUID(),revision:0,feeMinor:1,note:'Test delivery',enabled:true}).success,false);
});
test('quote fingerprints bind quantities and each unit price, independent of cart ordering',()=>{
 const a={variantId:randomUUID(),quantity:1,unitPriceMinor:5000000},b={variantId:randomUUID(),quantity:1,unitPriceMinor:3000000};
 assert.equal(cartHash([a,b]),cartHash([b,a]));assert.equal(pricesHash([a,b]),pricesHash([b,a]));assert.notEqual(cartHash([a,b]),cartHash([{...a,quantity:2},b]));assert.notEqual(pricesHash([a,b]),pricesHash([{...a,unitPriceMinor:a.unitPriceMinor+1},{...b,unitPriceMinor:b.unitPriceMinor-1}]));
});
