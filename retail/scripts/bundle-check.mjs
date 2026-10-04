import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname,resolve,extname,isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Resolve only this application's files: avoids unrelated ancestor directory
// inspection in restricted Windows workspaces. No runtime imports are stubbed.
const result=await build({stdin:{contents:await readFile(resolve(root,'netlify/functions/retail.mts'),'utf8'),loader:'ts',sourcefile:'retail.mts'},
  bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'workspace-files',setup(b){
    b.onResolve({filter:/.*/},args=>{
      if(args.path.startsWith('node:'))return {path:args.path,external:true};
      const path=resolve(isAbsolute(args.importer)?dirname(args.importer):resolve(root,'netlify/functions'),args.path);
      if(!path.startsWith(root))throw Error('Import escapes retail project');
      return {path,namespace:'workspace'};
    });
    b.onLoad({filter:/.*/,namespace:'workspace'},async args=>({contents:await readFile(args.path,'utf8'),loader:extname(args.path)==='.mts'?'ts':'js'}));
  }}]});
if(!result.outputFiles[0]?.text.includes('export'))throw Error('Missing function export');
console.log('Retail Netlify entry and all server imports bundle successfully.');
