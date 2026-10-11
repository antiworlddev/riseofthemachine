import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('migrations and database invariants', async t => {
 const db = new PGlite();
 try {
  for (const folder of (await readdir('prisma/migrations')).filter(x => x !== 'migration_lock.toml').sort()) {
   await db.exec(await readFile(`prisma/migrations/${folder}/migration.sql`, 'utf8'));
  }
  const q = (s,p=[]) => db.query(s,p);
  const rejects = (s,p=[]) => assert.rejects(() => q(s,p));
  await q('INSERT INTO "Event" (id,slug,name,"dateLocal") VALUES ($1,\'concert\',\'RISE OF THE MACHINE\',\'2026-12-20\'),($2,\'kala\',\'KALA GAMES\',\'2026-12-19\')',[id(1),id(2)]);
  await q('INSERT INTO "TicketTier" (id,"eventId",code,name,"priceMinor",capacity) VALUES ($1,$2,\'regular\',\'Regular\',2000000,2)',[id(3),id(1)]);
  await q('INSERT INTO "Order" (id,"eventId","idempotencyKey","buyerName","buyerEmail","totalMinor","expiresAt") VALUES ($1,$2,\'request-1\',\'Test Buyer\',\'test@example.com\',2000000,now()+interval \'15 minutes\')',[id(4),id(1)]);
  await q('INSERT INTO "OrderLine" (id,"orderId","eventId","tierId",quantity,"unitPriceMinor") VALUES ($1,$2,$3,$4,1,2000000)',[id(5),id(4),id(1),id(3)]);
  await t.test('negative money rejected',()=>rejects('UPDATE "TicketTier" SET "priceMinor"=-1 WHERE id=$1',[id(3)]));
  await t.test('overselling rejected',()=>rejects('UPDATE "TicketTier" SET sold=2,reserved=1 WHERE id=$1',[id(3)]));
  await t.test('cross-event line rejected',()=>rejects('UPDATE "OrderLine" SET "eventId"=$1 WHERE id=$2',[id(2),id(5)]));
  const insertTicket = (ticket,ordinal,hash) => q('INSERT INTO "Ticket" (id,"orderLineId",ordinal,"tokenHash") VALUES ($1,$2,$3,$4)',[id(ticket),id(5),ordinal,hash]);
  await t.test('unpaid issuance rejected',()=>assert.rejects(()=>insertTicket(6,1,'a'.repeat(64))));
  await t.test('paid status requires timestamp',()=>rejects('UPDATE "Order" SET status=\'PAID\' WHERE id=$1',[id(4)]));
  await q('UPDATE "Order" SET status=\'PAID\',"paidAt"=now() WHERE id=$1',[id(4)]);
  await insertTicket(6,1,'a'.repeat(64));
  await t.test('duplicate issuance rejected',()=>assert.rejects(()=>insertTicket(7,1,'b'.repeat(64))));
  await t.test('excess ticket issuance rejected',()=>assert.rejects(()=>insertTicket(7,2,'b'.repeat(64))));
  await q('INSERT INTO "PaymentAttempt" (id,"orderId",reference,"amountMinor",currency) VALUES ($1,$2,\'paystack-test\',2000000,\'NGN\')',[id(8),id(4)]);
  await t.test('verification requires provider evidence',()=>rejects('UPDATE "PaymentAttempt" SET status=\'VERIFIED\' WHERE id=$1',[id(8)]));
  await t.test('duplicate payment reference rejected',()=>rejects('INSERT INTO "PaymentAttempt" (id,"orderId",reference,"amountMinor",currency) VALUES ($1,$2,\'paystack-test\',2000000,\'NGN\')',[id(9),id(4)]));
  await q('INSERT INTO "StaffUser" (id,"authSubject",email,role) VALUES ($1,\'scanner-1\',\'scan@example.com\',\'SCANNER\')',[id(10)]);
  const scan = () => q('INSERT INTO "Admission" ("ticketId","staffId") VALUES ($1,$2)',[id(6),id(10)]);
  await t.test('disabled scanner rejected',()=>assert.rejects(scan));
  await q('UPDATE "StaffUser" SET enabled=true WHERE id=$1',[id(10)]);
  await q('UPDATE "Ticket" SET status=\'VOID\' WHERE id=$1',[id(6)]);
  await t.test('void ticket rejected',()=>assert.rejects(scan));
  await q('UPDATE "Ticket" SET status=\'ACTIVE\' WHERE id=$1',[id(6)]);
  await scan();
  await t.test('double admission rejected',()=>assert.rejects(scan));
  await q('INSERT INTO "Representative" (id,"authSubject",name,email,phone) VALUES ($1,\'rep-1\',\'Representative\',\'rep@example.com\',\'+234000000000\')',[id(11)]);
  await q('INSERT INTO "TeamOption" (id,"eventId",key,name) VALUES ($1,$2,\'test-university\',\'Test University\')',[id(19),id(2)]);
  await q('INSERT INTO "TeamRegistration" (id,"eventId","representativeId","teamKey","teamName") VALUES ($1,$2,$3,\'test-university\',\'Test University\')',[id(12),id(2),id(11)]);
  await t.test('duplicate team registration rejected',()=>rejects('INSERT INTO "TeamRegistration" (id,"eventId","representativeId","teamKey","teamName") VALUES ($1,$2,$3,\'test-university\',\'Different spelling\')',[id(13),id(2),id(11)]));
  await q('INSERT INTO "Competition" (id,"eventId","sportCode","minPlayers","maxPlayers") VALUES ($1,$2,\'football\',1,2)',[id(14),id(2)]);
  await q('INSERT INTO "SportRoster" (id,"teamId","competitionId","eventId") VALUES ($1,$2,$3,$4)',[id(15),id(12),id(14),id(2)]);
  await t.test('direct submitted roster creation rejected',()=>rejects('INSERT INTO "SportRoster" (id,"teamId","competitionId","eventId",status,"submittedAt") VALUES ($1,$2,$3,$4,\'APPROVED\',now())',[id(20),id(12),id(14),id(2)]));
  await t.test('empty roster submission rejected',()=>rejects('UPDATE "SportRoster" SET status=\'SUBMITTED\',"submittedAt"=now() WHERE id=$1',[id(15)]));
  await q('INSERT INTO "RosterMember" (id,"rosterId","participantKey","fullName",captain) VALUES ($1,$2,\'player-1\',\'Player One\',true)',[id(16),id(15)]);
  await t.test('second captain rejected',()=>rejects('INSERT INTO "RosterMember" (id,"rosterId","participantKey","fullName",captain) VALUES ($1,$2,\'player-2\',\'Player Two\',true)',[id(17),id(15)]));
  await t.test('duplicate participant rejected',()=>rejects('INSERT INTO "RosterMember" (id,"rosterId","participantKey","fullName") VALUES ($1,$2,\'player-1\',\'Duplicate\')',[id(17),id(15)]));
  await q('UPDATE "Competition" SET "minPlayers"=2 WHERE id=$1',[id(14)]);
  await t.test('configured minimum enforced',()=>rejects('UPDATE "SportRoster" SET status=\'SUBMITTED\',"submittedAt"=now() WHERE id=$1',[id(15)]));
  await q('UPDATE "Competition" SET "minPlayers"=1 WHERE id=$1',[id(14)]);
  await q('UPDATE "SportRoster" SET status=\'SUBMITTED\',"submittedAt"=now() WHERE id=$1',[id(15)]);
  await t.test('submitted roster edits rejected',()=>rejects('UPDATE "RosterMember" SET "fullName"=\'Edited\' WHERE id=$1',[id(16)]));
  await t.test('submitted roster deletion rejected',()=>rejects('DELETE FROM "RosterMember" WHERE id=$1',[id(16)]));
  await t.test('registration has no payment linkage',async()=>{
   const {rows}=await q('SELECT column_name FROM information_schema.columns WHERE table_name=\'TeamRegistration\'');
   assert.equal(rows.some(r=>/payment|order|fee/i.test(r.column_name)),false);
  });
 } finally { await db.close(); }
});
