// After `vite build --mode native`: Capacitor loads dist-native/index.html,
// so move the app page (built at app/index.html) to the root.
import { renameSync, rmSync, existsSync } from 'node:fs';

const from = 'dist-native/app/index.html';
if (!existsSync(from)) throw new Error(`${from} not found. Run vite build --mode native first.`);
renameSync(from, 'dist-native/index.html');
rmSync('dist-native/app', { recursive: true, force: true });
console.log('dist-native/index.html ready');
