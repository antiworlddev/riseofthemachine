import { tablePackages } from "../src/server/table-stock";
import { seedMerch } from "./seed-merch";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const concert = await db.event.upsert({
    where: {
      slug: process.env.CONCERT_EVENT_SLUG || "rise-of-the-machine-2026",
    },
    update: {},
    create: {
      slug: process.env.CONCERT_EVENT_SLUG || "rise-of-the-machine-2026",
      name: "ODUMODUBLVCK LIVE — RISE OF THE MACHINE",
      dateLocal: "2026-12-20",
    },
  });
  for (const tier of [
    { code: "regular", name: "Regular", priceMinor: 2000000 },
    { code: "vip", name: "VIP", priceMinor: 10000000 },
  ])
    await db.ticketTier.upsert({
      where: { eventId_code: { eventId: concert.id, code: tier.code } },
      update: {},
      create: { eventId: concert.id, ...tier, capacity: 0, active: false },
    });
  for (const tier of tablePackages)
    await db.ticketTier.upsert({
      where: { eventId_code: { eventId: concert.id, code: tier.code } },
      update: { name: tier.name },
      create: { eventId: concert.id, ...tier, capacity: 0, active: false },
    });
  await db.tableInventory.upsert({
    where: { eventId: concert.id },
    update: {},
    create: { eventId: concert.id },
  });
  const event = await db.event.upsert({
    where: { slug: process.env.KALA_EVENT_SLUG || "kala-games-2026" },
    update: {},
    create: {
      slug: process.env.KALA_EVENT_SLUG || "kala-games-2026",
      name: "KALA GAMES",
      dateLocal: "2026-12-19",
    },
  });
  for (const sportCode of ["football", "basketball"])
    await db.competition.upsert({
      where: { eventId_sportCode: { eventId: event.id, sportCode } },
      update: {},
      create: { eventId: event.id, sportCode },
    });
  await seedMerch(db);
  console.log(
    "Events created if missing. Confirmed ticket/table prices added if missing. Capacity is zero and ticket sales remain closed. No team entries or registrations enabled.",
  );
} finally {
  await db.$disconnect();
}
