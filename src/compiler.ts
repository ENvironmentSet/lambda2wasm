import { TypeMap } from './typeCheck';
import { LCAbs, LCAbsT, LCAdd, LCApp, LCDiv, LCExp, LCMult, LCNum, LCProc, LCSub, LCType, LCVar } from './AST';

// wasm global : offset / heap control

type Context = {
  typeMap: TypeMap;
  functionMap: Map<string, { code: string, tableIndex: number }>;
  lambdaConfig: {
    lambdaName: string;
    lambdaDepth: number;
  };
  tableOffset: number;
  localVars: [string, LCType][];
  sigMap: Map<string, string>;
};

function lcType2WasmType(lcType: LCType): string {
  if (lcType.tag === 'LCMVar') {
    return lcType.id.toLowerCase();
  } else if (lcType.tag === 'LCAbsT') return 'i32';
  else return 'i64';
}

function compileNumericLiteral(ast: LCNum): string {
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

function compileVariable(ast: LCVar, context: Context): string {
  const variableOffSet = context.localVars.findIndex(([id]) => ast.id === id);

  if (variableOffSet === 0) { // bound variable
    return `(local.get $${ast.id})`;
  } else if (variableOffSet >= 1) { // semi-bound
    const opType = lcType2WasmType(context.typeMap.get(ast)!);

    return `(call $read_${opType}_from_context (i32.const ${variableOffSet}) (local.get $context))`;
  } else { // global binding
    return `(call $${ast.id})`;
  }
}

type LCArithmetic = LCAdd | LCSub | LCMult | LCDiv;

function compileArithmetic(ast: LCArithmetic, context: Context): string {
  const type = lcType2WasmType(context.typeMap.get(ast)!);
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

  return `(${type}.${op} ${compileExpression(ast.left, context)} ${compileExpression(ast.right, context)})`
}

function compileAbstraction(ast: LCAbs, context: Context): string {
  const functionType = context.typeMap.get(ast)! as LCAbsT;
  const functionName = `${context.lambdaConfig.lambdaName}_${context.lambdaConfig.lambdaDepth}`;
  const paramType = lcType2WasmType(functionType.param);
  let contextInit = '';

  context.localVars.unshift([ast.pID, functionType.param]);

  if (context.lambdaConfig.lambdaDepth === 0) {
    contextInit = `
      (local.set $context (call $create_context_${lcType2WasmType(ast.pType)} (local.get $${ast.pID})))
    `;
  } else {
    contextInit += `
     (local.set $context (call $alloc_context_var_${lcType2WasmType(ast.pType)} (local.get $${ast.pID}) (local.get $context)))
    `;
  }

  context.lambdaConfig.lambdaDepth++;

  context.functionMap.set(functionName, {
    code: `
      (func $${functionName} (param $${ast.pID} ${paramType}) (param $context i32) (result ${lcType2WasmType(functionType.ret)})
        (local $closure_ref_tmp i32)
        ${contextInit}
        ${compileExpression(ast.exp, context)}
      )
    `,
    tableIndex: context.tableOffset
  });

  context.localVars.shift();

  return `(call $create_closure (i32.const ${context.tableOffset++}) (local.get $context))`;
}

function getConversionKit(type: string): [string[], string[]] {
  if (type === 'i32') {
    return [['i64.extend_i32_s'], ['i32.wrap_i64']];
  } else if (type === 'f32') {
    return [['f64.promote_f32', 'i64.reinterpret_f64'], ['f64.reinterpret_i64', 'f32.demote_f64']];
  } else if(type === 'f64') {
    return [['i64.reinterpret_f64'], ['f64.reinterpret_i64']];
  } else throw new Error(`Cannot find conversion kit for type '${type}`);
}

function compileApplication(ast: LCApp, context: Context): string { //@TODO: wrap monomorphic function poly-like function when call polyfunc.
  const signatureName = `$_sig_${context.lambdaConfig.lambdaName}_${context.sigMap.size}`;
  const paramType = (context.typeMap.get(ast.f) as LCAbsT).param;
  const retType = (context.typeMap.get(ast.f) as LCAbsT).ret;
  const expectedType = context.typeMap.get(ast)!;
  const argType = context.typeMap.get(ast.arg)!;
  const signature = `(type ${signatureName} (func (param ${lcType2WasmType(paramType)}) (param i32) (result ${lcType2WasmType(retType)})))`;

  context.sigMap.set(signatureName, signature);

  let argExp = compileExpression(ast.arg, context);

  if (paramType.tag === 'LCPVar' && argType.tag !== 'LCPVar') {
    const [convIn] = getConversionKit(lcType2WasmType(argType));

    argExp = `
      ${argExp}
      ${convIn.map(op => `(${op})`).join('')}
    `;
  }

  let callExp = `(call_indirect (type ${signatureName}) ${argExp} (local.set $closure_ref_tmp ${compileExpression(ast.f, context)}) (call $get_context_from_closure (local.get $closure_ref_tmp)) (call $get_fref_from_closure (local.get $closure_ref_tmp)))`;

  if (retType.tag === 'LCPVar' && expectedType.tag !== 'LCPVar') {
    const [_, convOut] = getConversionKit(lcType2WasmType(expectedType));
    callExp = `
      ${callExp}
      ${convOut.map(op => `(${op})`).join('')}
    `;
  }

  return `
    ${callExp}
  `;
}

function compileExpression(ast: LCExp, context: Context): string {
  switch (ast.tag) {
    case 'LCNum':
      return compileNumericLiteral(ast);
    case 'LCVar':
      return compileVariable(ast, context);
    case 'LCAbs':
      return compileAbstraction(ast, context);
    case 'LCApp':
      return compileApplication(ast, context);
    case 'LCAdd':
    case 'LCSub':
    case 'LCMult':
    case 'LCDiv':
      return compileArithmetic(ast, context);
    default:
      throw new Error(`Unknown AST: ${JSON.stringify(ast)}`);
  }
}

export function compile(ast: LCProc, typeMap: TypeMap, runtime: string): string {
  const functionMap = new Map<string, { code: string, tableIndex: number }>();
  let tableOffset = 0;
  const sigMap = new Map<string, string>();
  //v128 cannot be passed between wasm runtime and js host.
  let result = `
    (module
    ${runtime}
  `;

  for (const binding of ast.bindings) {
    const lambdaConfig = {
      lambdaName: binding.id,
      lambdaDepth: 0
    };
    const localVars = [] as [string, LCType][];
    const context = { typeMap, functionMap, lambdaConfig, tableOffset, localVars, sigMap };

    result += `
      (func $${binding.id} (result ${lcType2WasmType(typeMap.get(binding)!)})
        (local $closure_ref_tmp i32)
        (local $context i32)
        ${compileExpression(binding.exp, context)}
      )
    `; //FFI?

    result += `\n(export "${binding.id}" (func $${binding.id}))`;

    tableOffset = context.tableOffset;
  }

  result += `\n(table ${functionMap.size} funcref)`;

  result += `\n(elem (i32.const 0) ${[...functionMap.entries()].sort(([_1, { tableIndex: x }], [_2, { tableIndex: y }]) => x - y).map(([k]) => `$${k}`).join(' ')})`;

  for (const funcDef of functionMap.values()) {
    result += `\n${funcDef.code}`;
  }

  for (const callSig of sigMap.values()) {
    result += `\n${callSig}`;
  }

  result += '\n)';
  return result;
}