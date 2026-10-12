import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {merchInput} from '../src/server/merch';
const base={buyerName:'Merch Buyer',phone:'+2348000000000',idempotencyKey:randomUUID(),items:[{variantId:randomUUID(),quantity:1}]};
test('merch checkout rejects forged prices, excessive quantities, duplicate variants and missing delivery consent',()=>{
 assert.equal(merchInput.safeParse({...base,fulfilment:'PICKUP'}).success,true);
 for(const patch of [{priceMinor:1},{status:'PAID'},{buyerEmail:'other@example.com'},{items:[{...base.items[0],quantity:11}]},{items:[...base.items,...base.items]},{address:{}}])assert.equal(merchInput.safeParse({...base,fulfilment:'PICKUP',...patch}).success,false);
 const delivery={...base,fulfilment:'DELIVERY',address:{line1:'123 Test Road',city:'Abuja',state:'FCT',country:'Nigeria'}};
 assert.equal(merchInput.safeParse(delivery).success,false);assert.equal(merchInput.safeParse({...delivery,acceptDeliveryQuote:true,shippingRateId:randomUUID(),quoteToken:'test-quote'}).success,true);assert.equal(merchInput.safeParse({...delivery,acceptDeliveryQuote:true,shippingRateId:randomUUID(),quoteToken:'test-quote',address:{...delivery.address,country:'UK'}}).success,false);
});

import {inventoryInput} from '../src/server/merch-inventory';
test('inventory settings reject forged counters and invalid capacities',()=>{
 const input={productId:randomUUID(),expectedActive:true,active:false,variants:[{id:randomUUID(),expectedCapacity:5,capacity:10}]};
 assert.equal(inventoryInput.safeParse(input).success,true);
 for(const invalid of [{...input,sold:0},{...input,variants:[...input.variants,...input.variants]},{...input,variants:[{...input.variants[0],capacity:-1}]},{...input,variants:[{...input.variants[0],capacity:1.5}]},{...input,variants:[{...input.variants[0],reserved:0}]}])assert.equal(inventoryInput.safeParse(invalid).success,false);
});
