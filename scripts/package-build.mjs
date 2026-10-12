import {chmod} from 'node:fs/promises';
await chmod(new URL('../lib/cli.js',import.meta.url),0o755);
