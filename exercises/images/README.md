# Exercise images

Drop your exercise photos in this folder.

**Naming convention (required):**

```
<Group> - <Exercise name>.<extension>
```

- `<Group>` must be exactly one of: `Arms`, `Legs`, `Chest`, `Core` (matching is
  case-insensitive, but stick to this capitalisation for consistency).
- Use a space, a hyphen, a space (` - `) between the group and the exercise name.
- Supported extensions: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`.

Examples:

```
Arms - Biceps.webp
Arms - Triceps.webp
Legs - Squats.webp
Chest - Push Up.webp
Core - Plank.webp
```

**Keep the photos small.** The page shows them at most about 400 pixels
wide, so anything wider than 860 pixels is wasted download on a phone. The
photos here are WebP at 860 pixels wide or less, quality 80, which brought the
folder from 2.5 MB to under 400 KB. Any image tool can do this; with Node and
the `sharp` package it is one line per file:

```
node -e "require('sharp')('in.jpg').resize({width:860,withoutEnlargement:true}).webp({quality:80}).toFile('out.webp')"
```

**After adding or renaming files, regenerate the manifest** by running, from the
project root:

```
node tools/generate-manifest.js
```

This rewrites `exercises/manifest.json` with the current list of files
(alphabetically sorted) and each one's width and height in pixels, which is
what the site actually reads at runtime — the app never scans this folder
directly.
