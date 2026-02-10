import path from "node:path";
import { mkdir } from "node:fs/promises";

import sharp from "sharp";

export type ThumbOptions = {
  maxSize?: number;
  staticQuality?: number;
  gifColors?: number;
  gifDelayMs?: number;
};

const DEFAULTS: Required<ThumbOptions> = {
  maxSize: 360,
  staticQuality: 82,
  gifColors: 128,
  gifDelayMs: 80,
};

const ensureDirForFile = async (filePath: string) => {
  await mkdir(path.dirname(filePath), { recursive: true });
};

export async function generateStaticThumb(
  inputPath: string,
  outputPath: string,
  options: ThumbOptions = {}
) {
  const { maxSize, staticQuality } = { ...DEFAULTS, ...options };
  await ensureDirForFile(outputPath);

  await sharp(inputPath)
    .resize({ width: maxSize, height: maxSize, fit: "inside" })
    .jpeg({ quality: staticQuality })
    .toFile(outputPath);
}

export async function generateAnimatedThumb(
  inputPath: string,
  outputPath: string,
  options: ThumbOptions = {}
) {
  const { maxSize, gifColors, gifDelayMs } = { ...DEFAULTS, ...options };
  await ensureDirForFile(outputPath);

  await sharp(inputPath, { animated: true })
    .resize({ width: maxSize, height: maxSize, fit: "inside" })
    .gif({
      colours: gifColors,
      delay: gifDelayMs,
      loop: 0,
    })
    .toFile(outputPath);
}

export async function generateThumb(
  inputPath: string,
  outputPath: string,
  animated: boolean,
  options: ThumbOptions = {}
) {
  if (animated) {
    await generateAnimatedThumb(inputPath, outputPath, options);
    return;
  }
  await generateStaticThumb(inputPath, outputPath, options);
}
