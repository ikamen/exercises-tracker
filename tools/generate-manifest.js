// Regenerates exercises/manifest.json from the files present in exercises/images.
// Run from the project root: node tools/generate-manifest.js

const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '..', 'exercises', 'images');
const MANIFEST_PATH = path.join(__dirname, '..', 'exercises', 'manifest.json');
const VALID_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error('Images folder not found: ' + IMAGES_DIR);
    process.exit(1);
  }

  const files = fs
    .readdirSync(IMAGES_DIR)
    .filter((name) => VALID_EXTENSIONS.includes(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(files, null, 2) + '\n');

  console.log('Wrote ' + files.length + ' file(s) to ' + path.relative(process.cwd(), MANIFEST_PATH));
  files.forEach((f) => console.log('  - ' + f));
}

main();
