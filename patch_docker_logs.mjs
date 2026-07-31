import { readFileSync, writeFileSync } from 'fs';

const filepath = 'src/pages/api/docker-logs.ts';
let content = readFileSync(filepath, 'utf8');

content = content.replace("import { execSync } from 'child_process';",
`import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);`);

content = content.replace("const command = `docker logs --tail ${tail} ${containerId}`;", "");

const searchBlock = `    let logs = [];
    try {
        const output = execSync(command, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
        logs = output.trim().split('\\n');
    } catch (err: any) {
        // Certains logs sortent sur stderr, checkons stderr si stdout est vide ou si erreur
        if (err.stderr) {
            logs = err.stderr.toString().trim().split('\\n');
        } else {
            throw err;
        }
    }`;

const replaceBlock = `    // 🛡️ Sentinel: Validate container ID to prevent flag injection
    if (containerId.startsWith('-')) {
      return new Response(JSON.stringify({ error: "ID du conteneur invalide" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 🛡️ Sentinel: Validate and parse tail parameter to ensure it is a safe integer
    const parsedTail = parseInt(tail, 10);
    if (isNaN(parsedTail) || parsedTail < 0) {
      return new Response(JSON.stringify({ error: "Paramètre tail invalide" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let logs = [];
    try {
        // 🛡️ Sentinel: Use execFileAsync with an array of arguments to prevent command injection
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', parsedTail.toString(), containerId], { maxBuffer: 10 * 1024 * 1024 });
        const output = stdout || stderr; // Docker logs often outputs to stderr
        logs = output.trim().split('\\n');
    } catch (err: any) {
        // Certains logs sortent sur stderr, checkons stderr si stdout est vide ou si erreur
        if (err.stderr) {
            logs = err.stderr.toString().trim().split('\\n');
        } else {
            // 🛡️ Sentinel: Sanitize error message
            throw new Error("Erreur lors de la récupération des logs Docker");
        }
    }`;

content = content.replace(searchBlock, replaceBlock);
writeFileSync(filepath, content);
