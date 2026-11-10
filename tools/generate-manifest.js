// Regenerates exercises/manifest.json from the files present in exercises/images.
// Run from the project root: node tools/generate-manifest.js
//
// Each entry records the file name and the image's size in pixels, which the
// page puts on the <img> so the layout doesn't jump as the photos load.

const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '..', 'exercises', 'images');
const MANIFEST_PATH = path.join(__dirname, '..', 'exercises', 'manifest.json');
const VALID_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

// Reads the width and height from the file's header. Returns null for a
// format or file it can't make sense of.
function imageSize(buf) {
  if (buf.length < 30) return null;

  // PNG: IHDR right after the 8-byte signature
  if (buf.toString('ascii', 1, 4) === 'PNG') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // GIF: logical screen size straight after "GIF89a"
  if (buf.toString('ascii', 0, 3) === 'GIF') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // JPEG: walk the markers to the first start-of-frame
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }

  // WebP: RIFF container, size depends on the first chunk's flavour
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') {
      return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    }
  }

  return null;
}

function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error('Images folder not found: ' + IMAGES_DIR);
    process.exit(1);
  }

  const files = fs
    .readdirSync(IMAGES_DIR)
    .filter((name) => VALID_EXTENSIONS.includes(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const entries = files.map((file) => {
    const size = imageSize(fs.readFileSync(path.join(IMAGES_DIR, file)));
    if (!size) console.warn('  (could not read the size of ' + file + ')');
    return size ? { file, width: size.width, height: size.height } : { file };
  });

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(entries, null, 2) + '\n');

  console.log('Wrote ' + entries.length + ' file(s) to ' + path.relative(process.cwd(), MANIFEST_PATH));
  entries.forEach((e) => console.log('  - ' + e.file + (e.width ? ' (' + e.width + 'x' + e.height + ')' : '')));
}

main();
