import { getConfig } from '../src/lib/config-db.ts';
import fs from 'node:fs';

async function test() {
  const keyPath = await getConfig('zimaosSshKeyPath');
  console.log('Current SSH Key Path in DB:', keyPath);
  if (keyPath && fs.existsSync(keyPath)) {
    console.log('File exists!');
  } else if (keyPath) {
    console.log('File NOT found at this path.');
  } else {
    console.log('No key path configured in DB.');
  }
}
test();
