import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {checkoutInput} from '../src/server/ticketing';
import {tableSettingsInput,bookingInput} from '../src/server/tables';
import {parkingInput} from '../src/server/parking';
import {scanInput} from '../src/server/admission';
const booking={tierCode:'engines',quantity:1,buyerName:'Table Buyer',idempotencyKey:randomUUID(),expectedParkingPerTable:2,acceptTableTerms:true};
test('table checkout requires confirmed parking allocation and one table',()=>{
 assert.ok(checkoutInput.safeParse(booking).success);
 for(const input of [{...booking,quantity:2},{...booking,expectedParkingPerTable:undefined},{...booking,acceptTableTerms:undefined},{...booking,totalMinor:1}])assert.ok(!checkoutInput.safeParse(input).success);
});
test('parking codes cannot be used as concert admission codes',()=>{const code=`park_${'a'.repeat(43)}`;assert.ok(parkingInput.safeParse({token:code}).success);assert.ok(!scanInput.safeParse({token:code}).success);assert.ok(!parkingInput.safeParse({token:'a'.repeat(43)}).success);});
test('table settings require each category once and explicit parking values',()=>{
 const packages=['engines','autobots','machineries'].map(code=>({code,capacity:0,active:false,parkingPerTable:null}));assert.ok(tableSettingsInput.safeParse({revision:1,parkingCapacity:0,packages}).success);
 assert.ok(!tableSettingsInput.safeParse({revision:1,parkingCapacity:0,packages:[packages[0],packages[0],packages[2]]}).success);
 assert.ok(!tableSettingsInput.safeParse({revision:1,parkingCapacity:-1,packages}).success);
 assert.ok(!bookingInput.safeParse({action:'arrive',orderId:randomUUID(),revision:1,confirmed:false}).success);
});
