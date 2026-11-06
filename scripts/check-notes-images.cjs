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

        if (note.id === 'pu3-u9-p112') {
            const context = { window: {} };
            vm.runInNewContext(fs.readFileSync(path.join(root, 'jasmins_diary_lesson.js'), 'utf8'), context);
            const lesson = context.window.JasminsDiary;
            const images = new Set([...lesson.words.map(word => word[3]),
                ...lesson.columns.map(column => lesson.clip('illustrations/' + column.image + '.webp'))]);
            let total = 0;
            for (const image of images) {
                const bytes = fs.readFileSync(path.join(root, image));
                assert.ok(image.endsWith('.webp') && bytes.length <= PAGE_LIMIT, image);
                webpDimensions(bytes);
                total += bytes.length;
            }
            assert.ok(total <= LESSON_LIMIT, 'Diary images exceed lesson limit');
            console.log(note.id + ': ' + images.size + ' WebP images, ' + total + ' bytes');
            continue;
        }

        if (note.id === 'pu3-u1-p14') {
            const folder = path.join(root, 'pu3_circus_assets');
            const index = JSON.parse(fs.readFileSync(path.join(folder, 'image-index.json')));
            assert.equal(Object.keys(index).length, 27);
            const groups = new Map(); let total = 0;
            for (let i=1;i<=4;i++) { const bytes=fs.readFileSync(path.join(folder, `story-${i}.webp`)); webpDimensions(bytes); assert.ok(bytes.length<=PAGE_LIMIT); total+=bytes.length; }
            for (const [name,[g,o,n]] of Object.entries(index)) {
                if (!groups.has(g)) { const b=fs.readFileSync(path.join(folder, `images-${g}.bin`)); assert.ok(b.length<=PAGE_LIMIT); groups.set(g,b); total+=b.length; }
                const b=fs.readFileSync(path.join(folder,name+'.webp')); webpDimensions(b); assert.ok(groups.get(g).subarray(o,o+n).equals(b));
            }
            assert.ok(total<=LESSON_LIMIT, 'Circus Child image budget');
            console.log(note.id+': four story images, 27 vocabulary images, '+total+' bytes'); continue;
        }
        if (note.id === 'pu2-u1-p14') {
            const folder = path.join(root, 'pu2_race_assets');
            const imageIndex = JSON.parse(fs.readFileSync(path.join(folder, 'image-index.json'), 'utf8'));
            const groups = new Map(); let total = 0;
            for (let i = 1; i <= 5; i++) {
                const bytes = fs.readFileSync(path.join(folder, `story-${i}.webp`));
                assert.ok(bytes.length <= PAGE_LIMIT, `Story image ${i} exceeds page limit`);
                const [w, h] = webpDimensions(bytes); assert.ok(w > 0 && h > 0);
                total += bytes.length;
            }
            assert.equal(Object.keys(imageIndex).length, 14, 'Race must have 14 vocabulary images');
            for (const [name, [group, offset, length]] of Object.entries(imageIndex)) {
                if (!groups.has(group)) { const bytes = fs.readFileSync(path.join(folder, `images-${group}.bin`)); assert.ok(bytes.length <= PAGE_LIMIT); groups.set(group, bytes); total += bytes.length; }
                const source = fs.readFileSync(path.join(folder, `${name}.webp`));
                assert.ok(groups.get(group).subarray(offset, offset + length).equals(source), `${name} differs from packed image`);
            }
            assert.equal(groups.size, 4); assert.ok(total <= LESSON_LIMIT, 'Race images exceed lesson limit');
            console.log(`${note.id}: five story images, four vocabulary groups, ${total} bytes`); continue;

        }
        if (note.id === 'think0-u4-p44') {
            const scan = fs.readFileSync(path.join(root, 'think_parks_assets/page.webp'));
            assert.ok(scan.length <= PAGE_LIMIT, 'Parks scan exceeds page limit');
            assert.deepEqual(webpDimensions(scan), [817, 1108], 'Parks scan dimensions must match hotspots');
            const context = { window: {} };
            vm.runInNewContext(fs.readFileSync(path.join(root, 'think_parks_lesson.js'), 'utf8'), context);
            vm.runInNewContext(fs.readFileSync(path.join(root, 'think_parks_image_index.js'), 'utf8'), context);
            const groups = new Map();
            let total = scan.length;
            for (const word of context.window.ThinkParks.words) {
                const image = word[3];
                const [group, offset, length] = context.window.ThinkParksImageIndex[image];
                if (!groups.has(group)) {
                    const data = fs.readFileSync(path.join(root, 'think_parks_assets', 'images-' + group + '.bin'));
                    assert.ok(data.length <= PAGE_LIMIT, 'Parks image group exceeds page limit');
                    total += data.length;
                    groups.set(group, data);
                }
                const packed = groups.get(group).subarray(offset, offset + length);
                const source = fs.readFileSync(path.join(root, image));
                // Git can check out the SVG with CRLF while the packed copy
                // retains LF, or the reverse. Compare its text canonically.
                const same = image.endsWith('.svg')
                    ? packed.toString('utf8').replace(/\r\n/g, '\n') === source.toString('utf8').replace(/\r\n/g, '\n')
                    : packed.equals(source);
                assert.ok(same, image + ' does not match its grouped image');
            }
            assert.equal(groups.size, 5, 'Parks vocabulary images must have five groups');
            assert.ok(total <= LESSON_LIMIT, 'Parks images exceed lesson limit');
            console.log(note.id + ': scan and five image groups, ' + total + ' bytes');
            continue;
        }
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
