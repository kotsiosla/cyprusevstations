import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = new URL("..", import.meta.url);
const publicDir = path.resolve(root.pathname, "public");
const sourceSvgPath = path.join(publicDir, "evcyprus-icon.svg");

async function main() {
  const svg = await fs.readFile(sourceSvgPath);

  const outputs = [
    { size: 192, filename: "pwa-192x192.png" },
    { size: 512, filename: "pwa-512x512.png" }
  ];

  for (const out of outputs) {
    const dest = path.join(publicDir, out.filename);
    await sharp(svg, { density: 256 })
      .resize(out.size, out.size, { fit: "cover" })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(dest);
    // eslint-disable-next-line no-console
    console.log(`Wrote ${dest}`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

