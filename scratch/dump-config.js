import { getAllConfig } from '../src/lib/config-db.ts';

async function test() {
  const config = await getAllConfig();
  console.log(JSON.stringify(config, null, 2));
}
test();
