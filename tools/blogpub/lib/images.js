const fs = require("fs");
const path = require("path");

/**
 * Copies every file from a draft's images/ folder into
 * src/images/posts/<slug>/. No-ops (returns 0) if the folder is
 * missing or empty — not every post has images.
 */
function copyDraftImages(draftImagesDir, destDir) {
  if (!fs.existsSync(draftImagesDir)) return 0;

  const files = fs
    .readdirSync(draftImagesDir)
    .filter((f) => fs.statSync(path.join(draftImagesDir, f)).isFile());

  if (!files.length) return 0;

  fs.mkdirSync(destDir, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(draftImagesDir, file), path.join(destDir, file));
  }
  return files.length;
}

module.exports = { copyDraftImages };
