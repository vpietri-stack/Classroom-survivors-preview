const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright-core');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
    const file = path.resolve(__dirname, '.' + new URL(req.url, 'http://localhost').pathname);
    try {
        assert.ok(file.startsWith(__dirname + path.sep));
        const body = await fs.readFile(file);
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
        res.end(body);
    } catch {
        res.writeHead(404).end();
    }
});

(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({
        executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        const heavy = [];
        page.on('pageerror', error => errors.push(error.message));
        let releaseLesson;
        const lessonGate = new Promise(resolve => { releaseLesson = resolve; });
        let loginRequests = 0;
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (/\/(phaser\.min\.js|speech_adaptive_worker\.js|speech_assets\/|models\/|lib\/wasm\/)/.test(url.pathname)) {
                heavy.push(url.pathname);
                return route.abort();
            }
            if (url.port === '7074' && url.pathname.startsWith('/api/')) {
                const headers = {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'content-type,x-app-key,x-auth-token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                };
                if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
                const login = url.pathname === '/api/login';
                if (login) loginRequests++;
                return route.fulfill({ headers, json: login ? {
                    id: 'startup-fixture', fullName: 'Startup fixture', role: 'student',
                    avatar: '\u{1F642}', book: 'PU1', unit: '1', page: '11'
                } : { enabled: false, addedEventIds: [], duplicateEventIds: [] } });
            }
            if (url.origin !== origin) return route.abort();
            if (/\.(js|css)$/.test(url.pathname) &&
                !/\/(config|frontend_auth|client_diagnostics)\.js$/.test(url.pathname)) {
                await lessonGate;
            }
            return route.continue();
        });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', {
            offline: false, latency: 180, downloadThroughput: 192 * 1024, uploadThroughput: 64 * 1024
        });

        await page.goto(origin + '/index.html', { waitUntil: 'commit' });
        const login = page.locator('#loginOverlay');
        await login.waitFor();
        assert.equal(await login.evaluate(el => getComputedStyle(el).display), 'flex');
        await page.locator('#login-username').fill('fixture');
        await page.locator('#login-password').fill('fixture');
        await login.getByRole('button', { name: '\u767b\u5f55', exact: true }).click();
        await page.getByText('\u6b63\u5728\u52a0\u8f7d\u8bfe\u7a0b…').waitFor();
        assert.equal(loginRequests, 1);
        assert.equal(await page.evaluate(() => typeof loadContent), 'undefined');
        assert.equal(await page.locator('#step-greeting').isVisible(), false);
        releaseLesson();

        await page.getByText('Hello, Startup fixture!').waitFor();
        const result = await page.evaluate(() => ({
            lesson: selectedClassContent,
            marks: performance.getEntriesByType('mark').filter(e => e.name.startsWith('student-')).map(e => e.name)
        }));
        assert.deepEqual(result.lesson, { book: 'PU1', unit: '1', page: '11' });
        assert.deepEqual(result.marks, ['student-shell-ready', 'student-sign-in-start', 'student-sign-in-response', 'student-lesson-ready']);
        await page.reload();
        await page.getByText('Startup fixture', { exact: true }).waitFor();
        assert.equal(await login.isVisible(), false);
        assert.deepEqual(heavy, []);
        assert.deepEqual(errors, []);
        console.log('PASS sign-in works while lesson assets are held, the assigned lesson opens after release, and saved profiles render on reload');
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => { server.close(); console.error(error); process.exitCode = 1; });
