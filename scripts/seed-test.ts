import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';

/** Synthetic entries for the local registration walkthrough; not competition rules. */
export async function seedTestEntries(db: PrismaClient, eventSlug: string) {
  return db.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { slug: eventSlug } });
    if (!event) throw new Error('KALA event missing. Run npm run db:seed first.');
    await tx.teamOption.upsert({
      where: { eventId_key: { eventId: event.id, key: 'test-team' } },
      create: { eventId: event.id, key: 'test-team', name: 'TEST TEAM', enabled: true },
      update: { name: 'TEST TEAM', enabled: true },
    });
    for (const sportCode of ['test-football', 'test-basketball']) {
      await tx.competition.upsert({
        where: { eventId_sportCode: { eventId: event.id, sportCode } },
        create: { eventId: event.id, sportCode, minPlayers: 1, maxPlayers: 2, registrationEnabled: true },
        update: { minPlayers: 1, maxPlayers: 2, registrationEnabled: true },
      });
    }
    return { event: event.name, team: 'TEST TEAM', sports: ['test-football', 'test-basketball'], minPlayers: 1, maxPlayers: 2 };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = new URL(process.env.APP_ORIGIN || 'http://localhost:3000');
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
    throw new Error('This setup is for a local development app connected to your development database.');
  }
  const db = new PrismaClient();
  try {
    const result = await seedTestEntries(db, process.env.KALA_EVENT_SLUG || 'kala-games-2026');
    console.log(`${result.team} ready for ${result.event}.`);
    console.log('Test football and basketball: 1–2 players each. These are development limits only.');
    console.log('Set KALA_REGISTRATION_ENABLED=true in your local .env and restart npm run dev.');
    console.log('An enabled organizer must open registration at /admin/kala-games/settings.');
    console.log('Sign in with your Google account, select TEST TEAM and both test sports, then create the team.');
  } finally {
    await db.$disconnect();
  }
}
