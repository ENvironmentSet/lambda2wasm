import { LCAbs, LCAbsT, LCAdd, LCApp, LCDiv, LCExp, LCMult, LCNum, LCProc, LCSub, LCType, LCVar } from './AST';
import { isPolyType, TypeMap } from './typeCheck';

type LocalVars = string[];
type LambdaConfig = { name: string, index: number, tIndex: number };
type FunctionMap = Map<string, { code: string, tIndex: number }>;
type CallSigMap = Map<string, string>;

function lcType2String(lcType: LCType): string {
  if (lcType.tag === 'LCPVar' || lcType.tag === 'LCMVar') return lcType.id;
  else return `(${lcType2String(lcType.param)}) -> ${lcType2String(lcType.ret)}`;
}

function lcType2WasmType(lcType: LCType): string {
  if (lcType.tag === 'LCMVar') {
    return lcType.id.toLowerCase();
  } else if (lcType.tag === 'LCAbsT') return 'i32';
  else throw new Error(`Cannot convert polymorphic type ${lcType2String} to wasm type. `);
}

function compileVariable(ast: LCVar, localVars: LocalVars, fmap: FunctionMap, tmap: TypeMap): string {
  if (localVars.includes(ast.id)) return `(local.get $${ast.id})`;
  else if (tmap.get(ast)!.tag === 'LCAbsT') return `(i32.const ${fmap.get(ast.id)!.tIndex})`;
  else return `(call $${ast.id})`;
}

function compileNumericLiteral(ast: LCNum): string {
  if (ast.type.tag === 'LCPVar') throw new Error('Numeric Literal cannot have polymorphic type');

  switch (ast.type.id) {
    case 'I32':
      return `(i32.const ${ast.val})`;
    case 'I64':
      return `(i64.const ${ast.val})`;
    case 'F32':
      return `(f32.const ${ast.val})`;
    case 'F64':
      return `(f64.const ${ast.val})`;
    default:
      throw new Error(`Unknown numeric literal : ${JSON.stringify(ast)}`);
  }
}

type LCArithmetic = LCAdd | LCSub | LCMult | LCDiv;

function compileArithmetic(ast: LCArithmetic, localVars: LocalVars, fmap: FunctionMap, tmap: TypeMap, lconfig: LambdaConfig, callSigMap: CallSigMap): string {
  const type = lcType2WasmType(tmap.get(ast)!);
  let op: string;

  switch (ast.tag) {
    case 'LCAdd':
      op = 'add';
      break;
    case 'LCSub':
      op = 'sub';
      break;
    case 'LCMult':
      op = 'mul';
      break;
    case 'LCDiv':
      op = 'div';
      break;
  }

  return `(${type}.${op} ${compileExpression(ast.left, localVars, fmap, tmap, lconfig, callSigMap)} ${compileExpression(ast.right, localVars, fmap, tmap, lconfig, callSigMap)})`
}

function compileAbstraction(ast: LCAbs, localVars: LocalVars, fmap: FunctionMap, tmap: TypeMap, lconfig: LambdaConfig, callSigMap: CallSigMap): string {
  const ftype = tmap.get(ast)! as LCAbsT;

  if (isPolyType(ftype)) throw new Error('NotImplementedYet');
  else {
    const fname = lconfig.index === 0 ? lconfig.name : `${lconfig.name}_${lconfig.index++}`;
    const paramType = lcType2WasmType(ftype.param);

    if (lconfig.index === 0) lconfig.index++;

    fmap.set(fname, {
      code: `(func $${fname} (param $${ast.pID} ${paramType}) (result ${lcType2WasmType(ftype.ret)}) ${compileExpression(ast.exp, [ast.pID].concat(localVars), fmap, tmap, lconfig, callSigMap)})`,
      tIndex: lconfig.tIndex
    });

    return `(i32.const ${lconfig.tIndex++})`;
  }
}

function compileApplication(ast: LCApp, localVars: LocalVars, fmap: FunctionMap, tmap: TypeMap, lconfig: LambdaConfig, callSigMap: CallSigMap): string {
  const sigName = `${lconfig.name}_${lconfig.index}_${callSigMap.size}`;
  //@FIXME: Monkey patch
  const fsig = `(type $${sigName} (func (param ${lcType2WasmType((tmap.get(ast.f) as LCAbsT).param)}) (result ${lcType2WasmType(tmap.get(ast)!)})))`;

  callSigMap.set(sigName, fsig);

  return `(call_indirect (type $${sigName}) ${compileExpression(ast.arg, localVars, fmap, tmap, lconfig, callSigMap)} ${compileExpression(ast.f, localVars, fmap, tmap, lconfig, callSigMap)})`;

}

function compileExpression(ast: LCExp, localVars: LocalVars, fmap: FunctionMap, tmap: TypeMap, lconfig: LambdaConfig, callSigMap: CallSigMap): string {
  switch (ast.tag) {
    case 'LCVar':
      return compileVariable(ast, localVars, fmap, tmap);
    case 'LCNum':
      return compileNumericLiteral(ast);
    case 'LCAbs':
      return compileAbstraction(ast, localVars, fmap, tmap, lconfig, callSigMap);
    case 'LCApp':
      return compileApplication(ast, localVars, fmap, tmap, lconfig, callSigMap);
    case 'LCAdd':
    case 'LCSub':
    case 'LCMult':
    case 'LCDiv':
      return compileArithmetic(ast, localVars, fmap, tmap, lconfig, callSigMap);
    default:
      throw new Error(`Unknown AST: ${JSON.stringify(ast)}`);
  }
}

export function compile(ast: LCProc, tmap: TypeMap): string {
  const localVars: LocalVars = [];
  const fmap: FunctionMap = new Map();
  const callSigMap: CallSigMap = new Map();
  let result = '(module \n';
  let tIndex = 0;

  for (const binding of ast.bindings) {
    let lconfig = { name: binding.id, tIndex, index: 0 };

    if (binding.exp.tag !== 'LCAbs') {
      lconfig.index++;
      result += `
      (func $${binding.id} (result ${lcType2WasmType(tmap.get(binding)!)}) ${compileExpression(binding.exp, localVars, fmap, tmap, lconfig, callSigMap)})
    `;
    } else compileExpression(binding.exp, localVars, fmap, tmap, lconfig, callSigMap);

    result += `\n(export "${binding.id}" (func $${binding.id}))`;

    tIndex = lconfig.tIndex;
  }

  result += `\n(table ${fmap.size} funcref)`;

  result += `\n(elem (i32.const 0) ${[...fmap.entries()].sort(([_1, { tIndex: x }], [_2, { tIndex: y }]) => x - y).map(([k]) => `$${k}`).join(' ')})`;

  for (const funcDef of fmap.values()) {
    result += `\n${funcDef.code}`;
  }

  for (const callSig of callSigMap.values()) {
    result += `\n${callSig}`;
  }

  result += '\n)';

  return result;
}