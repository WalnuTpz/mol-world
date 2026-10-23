import "./env";
import { withDatabaseWrite } from "../src/lib/databaseWrite";

import { prisma } from "../src/lib/db";
import { getAppConfig, getTagRulesFromConfig } from "../src/lib/appConfig";

import { normalizeTags } from "../src/lib/tags";
import { ensureTagsWithNumId } from "../src/lib/numId";

const TAGS = [
  "对称",
  "快速",
  "慢速",
  "跳动",
  "变色",
  "发光",
  "旋转",
  "万花筒",
  "爆炸",
  "地面",
  "像素",
];

async function main() {
  await withDatabaseWrite(async () => {
    const rules = getTagRulesFromConfig(await getAppConfig());
    const memes = await prisma.meme.findMany({
      select: {
        id: true,
        title: true,
        tags: {
          select: {
            tag: { select: { name: true } },
          },
        },
      },
    });

    let updated = 0;

    for (const meme of memes) {
      const title = meme.title?.trim() ?? "";
      if (!title) continue;

      const matches = TAGS.filter((tag) => title.includes(tag));
      if (matches.length === 0) continue;

      const normalizedMatches = normalizeTags(matches, rules);
      const existing = meme.tags.map((t) => t.tag.name);
      const existingSet = new Set(existing);

      if (existing.length >= rules.maxTags) continue;

      const toAdd: string[] = [];
      for (const tag of normalizedMatches) {
        if (existingSet.has(tag)) continue;
        toAdd.push(tag);
        if (existing.length + toAdd.length >= rules.maxTags) break;
      }

      if (toAdd.length === 0) continue;

      await withDatabaseWrite(() =>
        prisma.$transaction(async (tx) => {
          const tagRows = await ensureTagsWithNumId(tx, toAdd);
          await tx.meme.update({
            where: { id: meme.id },
            data: {
              tags: {
                create: tagRows.map((tag) => ({
                  tag: { connect: { id: tag.id } },
                })),
              },
            },
          });
        }),
      );
      updated += 1;
    }

    console.log(`Updated ${updated} memes with title-based tags.`);
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
