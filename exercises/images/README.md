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
Arms - Biceps.jpg
Arms - Triceps.jpg
Legs - Squats.jpg
Chest - Push Up.jpg
Core - Plank.jpg
```

**After adding or renaming files, regenerate the manifest** by running, from the
project root:

```
node tools/generate-manifest.js
```

This rewrites `exercises/manifest.json` with the current list of files
(alphabetically sorted), which is what the site actually reads at runtime —
the app never scans this folder directly.

The four sample filenames currently listed in `manifest.json` don't have
matching image files yet — they're placeholders showing the naming pattern.
Replace them with your own photos and regenerate the manifest.
