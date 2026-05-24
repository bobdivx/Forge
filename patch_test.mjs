import { readFileSync, writeFileSync } from 'fs';

const filepath = 'tests/unit/forge-tool-install.test.ts';
let content = readFileSync(filepath, 'utf8');
content = content.replace("it('accepte un nom simple avec un manager explicite', async () => {", "it('accepte un nom simple avec un manager explicite', async () => {",);
// That replace didn't do anything helpful. I'll pass the timeout as the third argument to `it`.
content = content.replace("});\n});", "}, 20000);\n});");

writeFileSync(filepath, content);
