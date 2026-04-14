import { loadAstroDb } from './src/lib/load-astro-db';

async function debugConnect() {
    const targets = [
        'http://127.0.0.1:24190',
        'http://10.1.0.58:24190',
        'http://10.1.0.58:18789'
    ];
    const token = 'casaos';
    const paths = ['/api/v1/sessions', '/api/sessions', '/v1/models', '/api/models', '/health'];

    console.log('--- Probing OpenClaw API ---');
    for (const base of targets) {
        console.log(`\nTarget: ${base}`);
        for (const path of paths) {
            try {
                const url = `${base}${path}`;
                const res = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-Gateway-Token': token,
                        'Accept': 'application/json'
                    },
                    signal: AbortSignal.timeout(2000)
                });
                const contentType = res.headers.get('content-type') || 'none';
                console.log(`  [${res.status}] ${path} (${contentType})`);
                if (res.ok && contentType.includes('json')) {
                    const data = await res.json();
                    console.log(`    SUCCESS: ${JSON.stringify(data).slice(0, 50)}...`);
                }
            } catch (e: any) {
                console.log(`  [ERR] ${path}: ${e.message}`);
            }
        }
    }
}

debugConnect().catch(console.error);
