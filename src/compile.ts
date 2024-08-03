import { ASTKinds, parse } from './parser';
import { refineSyntaxTree } from './refineSyntaxTree';
import { typeCheck } from './typeCheck';
import { compile } from './compiler';

import { readFileSync } from 'node:fs';

const source = String.fromCharCode(...readFileSync(process.argv[2]));
const runtime = String.fromCharCode(...readFileSync('../runtime.wat'));

const ast = parse(source);

if (ast.errs.length > 0 || ast?.ast?.kind !== ASTKinds.start)
  throw new Error(`Parse Failed! \n ${ast.errs.join('\n,')}`);

const refinedAST = refineSyntaxTree(ast.ast);
const typeMap = typeCheck(refinedAST);

console.log(compile(refinedAST, typeMap, runtime));