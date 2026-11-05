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
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (/\/(phaser\.min\.js|speech_adaptive_worker\.js|speech_assets\/|models\/|lib\/wasm\/)/.test(url.pathname)) {
                heavy.push(url.pathname);
                return route.abort();
            }
            return url.origin === origin ? route.continue() : route.abort();
        });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', {
            offline: false, latency: 180, downloadThroughput: 192 * 1024, uploadThroughput: 64 * 1024
        });

        await page.goto(origin + '/index.html');
        await page.locator('#loginOverlay').waitFor();
        const username = page.locator('#login-username');
        await username.fill('fixture');
        assert.equal(await username.inputValue(), 'fixture');
        assert.equal(await page.locator('#loginOverlay').evaluate(el => getComputedStyle(el).display), 'flex');

        await page.evaluate(() => localStorage.setItem('savedUsers', JSON.stringify([
            { id: 'fixture', name: 'Saved fixture', avatar: '🙂' }
        ])));
        await page.reload();
        await page.getByText('Saved fixture', { exact: true }).waitFor();
        assert.equal(await page.locator('#loginOverlay').isVisible(), false);
        assert.deepEqual(heavy, []);
        assert.deepEqual(errors, []);
        console.log('PASS login and saved profiles render with no Phaser or speech model requests');
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => { server.close(); console.error(error); process.exitCode = 1; });
