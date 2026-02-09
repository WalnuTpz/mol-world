import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./prisma/dev.db",
});

const prisma = new PrismaClient({ adapter });

const memes = [
  {
    title: "传说中的拜谢",
    type: "STATIC" as const,
    mediaUrl: "/memes/original/传说中的拜谢.jpg",
    thumbUrl: "/memes/thumb/传说中的拜谢.jpg",
    isFeatured: true,
  },
  {
    title: "我已拜谢",
    type: "STATIC" as const,
    mediaUrl: "/memes/original/我已拜谢.png",
    thumbUrl: "/memes/thumb/我已拜谢.jpg",
    isFeatured: false,
  },
  {
    title: "原版拜谢",
    type: "ANIMATED" as const,
    mediaUrl: "/memes/original/原版拜谢.gif",
    thumbUrl: "/memes/thumb/原版拜谢.jpg",
    isFeatured: true,
  },
];

async function main() {
  await prisma.memeTag.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.meme.deleteMany();

  await prisma.meme.createMany({
    data: memes,
  });

  console.log(`Seeded ${memes.length} memes.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
