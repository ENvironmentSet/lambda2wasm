import { ASTKinds, parse } from './parser';
import { refineSyntaxTree } from './refineSyntaxTree';
import { typeCheck } from './typeCheck';
import { compile } from './compiler';

import { readFileSync, unlink } from 'node:fs';
import { exec } from 'node:child_process';
import { open } from 'node:fs/promises';

const source = String.fromCharCode(...readFileSync(process.argv[2]));
const runtime = String.fromCharCode(...readFileSync('../runtime.wat'));

const ast = parse(source);

if (ast.errs.length > 0 || ast?.ast?.kind !== ASTKinds.start)
  throw new Error(`Parse Failed! \n ${ast.errs.join('\n,')}`);

const refinedAST = refineSyntaxTree(ast.ast);
const typeMap = typeCheck(refinedAST);
const wat = compile(refinedAST, typeMap, runtime);

(async () => {
  const tempFile = await open('./temp.wat', 'w');

  await tempFile.writeFile(wat);

  exec('wat2wasm ./temp.wat', (_, stdout) => {
    WebAssembly.instantiate(readFileSync('./temp.wasm')).then(results => {
      //@ts-ignore-next-line
      console.log(results.instance.exports.main());
      unlink('./temp.wat', () => {});
      unlink('./temp.wasm', () => {});
    });
  });
})();

