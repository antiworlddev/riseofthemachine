import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {checkoutInput} from '../src/server/ticketing';
import {encryptTicket,decryptTicket,hashTicket} from '../src/server/ticket-tokens';
import {paystackConfig,validWebhook} from '../src/server/paystack';
test('ticket input rejects client prices and unknown tiers',()=>{
 const input={tierCode:'regular',quantity:1,buyerName:'Test Buyer',idempotencyKey:'00000000-0000-4000-8000-000000000001'};
 assert.ok(checkoutInput.safeParse(input).success);
 for(const patch of [{amount:1},{tierCode:'table'},{quantity:11},{quantity:0},{buyerSubject:'forged'}])assert.equal(checkoutInput.safeParse({...input,...patch}).success,false);
});
test('ticket codes are authenticated and bound to ticket identity',()=>{
 process.env.TICKET_TOKEN_KEY='b'.repeat(64);
 const code='private-ticket-code',encrypted=encryptTicket(code,'ticket-one');
 assert.equal(decryptTicket(encrypted,'ticket-one'),code);assert.throws(()=>decryptTicket(encrypted,'ticket-two'));
 assert.notEqual(encrypted,code);assert.match(hashTicket(code),/^[a-f0-9]{64}$/);
});
test('Paystack mode and raw webhook signature must match',()=>{
 process.env.PAYSTACK_MODE='test';process.env.PAYSTACK_SECRET_KEY='sk_test_'+'x'.repeat(32);
 const body=Buffer.from('{"event":"charge.success"}');const signature=createHmac('sha512',process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
 assert.ok(validWebhook(body,signature));assert.equal(validWebhook(Buffer.concat([body,Buffer.from(' ')]),signature),false);assert.equal(validWebhook(body,'bad'),false);
 process.env.PAYSTACK_MODE='live';assert.throws(()=>paystackConfig());process.env.PAYSTACK_SECRET_KEY='sk_live_'+'x'.repeat(32);process.env.PAYSTACK_LIVE_ENABLED='false';assert.throws(()=>paystackConfig());
});

test('rendered ticket QR decodes to the exact opaque token',async()=>{
 const QRCode=(await import('qrcode')).default,jsQR=(await import('jsqr')).default;
 const token='a'.repeat(43),qr=QRCode.create(token,{errorCorrectionLevel:'M'}),scale=8,margin=4,size=(qr.modules.size+2*margin)*scale,pixels=new Uint8ClampedArray(size*size*4);
 pixels.fill(255);
 for(let y=0;y<qr.modules.size;y++)for(let x=0;x<qr.modules.size;x++)if(qr.modules.get(y,x))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const index=(((y+margin)*scale+dy)*size+(x+margin)*scale+dx)*4;pixels[index]=pixels[index+1]=pixels[index+2]=0;}
 assert.equal(jsQR(pixels,size,size)?.data,token);
});
