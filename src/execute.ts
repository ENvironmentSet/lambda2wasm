import { ASTKinds, parse } from './parser';
import { refineSyntaxTree } from './refineSyntaxTree';
import { typeCheck } from './typeCheck';
import { compile } from './compiler';

import { readFileSync } from 'node:fs';
import wabt from 'wabt';

wabt().then(async ({ parseWat }) => {
  const source = String.fromCharCode(...readFileSync(process.argv[2]));
  const runtime =  String.fromCharCode(...readFileSync(`${__dirname}/../runtime.wat`));

  const ast = parse(source);

  if (ast.errs.length > 0 || ast?.ast?.kind !== ASTKinds.start)
    throw new Error(`Parse Failed! \n ${ast.errs.join('\n,')}`);

  const refinedAST = refineSyntaxTree(ast.ast);
  const typeMap = typeCheck(refinedAST);
  const wat = compile(refinedAST, typeMap, runtime);
  const wasmModule = parseWat('main', wat);

  WebAssembly.instantiate(wasmModule.toBinary({}).buffer).then(results => {
    //@ts-ignore-next-line
    console.log(results.instance.exports.main());
  });
})

