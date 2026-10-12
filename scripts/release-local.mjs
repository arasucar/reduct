import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const destination=fileURLToPath(new URL('../releases/',import.meta.url));
await mkdir(destination,{recursive:true});
const result=spawnSync('npm',['pack','--pack-destination',destination],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
