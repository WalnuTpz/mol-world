import "dotenv/config";
import { prisma } from "../lib/db";
import { getAppConfig } from "../lib/appConfig";
import { ensureDailyPools } from "../lib/dailyPool";

async function main() {
  const day = new Date().toISOString().slice(0, 10);
  const config = await getAppConfig();
  const memes = await prisma.meme.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true },
  });
  const pools = await ensureDailyPools(
    day,
    memes.map((item) => item.id),
    config.dailyPoolGroups,
    config.dailyPoolSize,
    true,
  );
  console.log(`Rebuilt ${pools.length} daily pools for ${day}.`);
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
