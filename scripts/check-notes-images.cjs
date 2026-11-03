const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const PAGE_LIMIT = 450_000;
const LESSON_LIMIT = 1_500_000;

// Read dimensions from the WebP bitstream without decoding or a browser.
function webpDimensions(bytes) {
    assert.ok(bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF'
        && bytes.toString('ascii', 8, 12) === 'WEBP', 'Expected a WebP image');
    const chunk = bytes.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
    if (chunk === 'VP8L') {
        assert.equal(bytes[20], 0x2f, 'Invalid lossless WebP header');
        const size = bytes.readUInt32LE(21);
        return [(size & 0x3fff) + 1, ((size >>> 14) & 0x3fff) + 1];
    }
    assert.ok(chunk === 'VP8 ' && bytes.readUIntBE(23, 3) === 0x9d012a, 'Invalid WebP frame header');
    return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
}

function checkNotesImages() {
    const { catalog } = require('../api/src/functions/shared/previewNotesCore');
    for (const note of catalog) {
        const reader = path.join(root, note.reader);
        const html = fs.readFileSync(reader, 'utf8');
        const script = html.match(/<script\b[^>]*\bsrc=["']([^"'?]*notes_data\.js)(?:\?[^"']*)?["']/i)?.[1];
        assert.ok(script, `${note.id} must load a notes_data.js manifest`);
        const context = { window: {} };
        vm.runInNewContext(fs.readFileSync(path.resolve(path.dirname(reader), script), 'utf8'), context, { timeout: 1000 });
        const lesson = context.window.InteractiveNotesData;
        assert.ok(lesson?.pages?.length, `${note.id} has no image pages`);
        const counted = new Set();
        let total = 0;
        for (const page of lesson.pages) {
            assert.ok(page.file.endsWith('.webp'), `${note.id}: ${page.file} must be WebP`);
            const imagePath = path.resolve(path.dirname(reader), lesson.assetBase || 'interactive_notes_assets/', page.file);
            const bytes = fs.readFileSync(imagePath);
            assert.ok(bytes.length <= PAGE_LIMIT, `${page.file}: ${bytes.length} bytes exceeds ${PAGE_LIMIT}`);
            assert.deepEqual(webpDimensions(bytes), [page.width, page.height], `${page.file}: dimensions must match hotspot coordinates`);
            if (!counted.has(imagePath)) total += bytes.length;
            counted.add(imagePath);
        }
        assert.ok(total <= LESSON_LIMIT, `${note.id}: ${total} bytes exceeds ${LESSON_LIMIT}`);
        console.log(`${note.id}: ${counted.size} WebP images, ${total} bytes`);
    }
}

module.exports = { webpDimensions };
if (require.main === module) checkNotesImages();
