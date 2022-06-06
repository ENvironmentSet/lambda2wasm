import { isPolyType, TypeMap, typeToString } from './typeCheck';
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
  else throw new Error(`Cannot convert polymorphic type ${typeToString(lcType)} to wasm type. `);
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

function compileVariable(ast: LCVar, context: Context): string {
  const variableOffSet = context.localVars.findIndex(([id]) => ast.id === id);

  if (variableOffSet === 0) { // bound variable
    return `(local.get $${ast.id})`;
  } else if (variableOffSet >= 1) { // semi-bound
    const opType = lcType2WasmType(context.typeMap.get(ast)!);

    return `(call $read_${opType}_from_context (i32.const ${context.localVars.length - variableOffSet}) (local.get $context))`;
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

  if (isPolyType(functionType)) throw new Error('Polymorphic Function is not implemented yet');

  const functionName = `${context.lambdaConfig.lambdaName}_${context.lambdaConfig.lambdaDepth}`;
  const paramType = lcType2WasmType(functionType.param);
  let contextInit = '';

  context.localVars.unshift([ast.pID, functionType.param]);

  if (context.lambdaConfig.lambdaDepth === 0) {
    contextInit = `
      (local.set $context (call $start_context (i64.const 0)))
    `;
  }

  context.lambdaConfig.lambdaDepth++;

  contextInit += `
   (local.set $context (call $alloc_context_var_${lcType2WasmType(ast.pType)} (local.get $${ast.pID}) (local.get $context)))
  `;

  context.functionMap.set(functionName, {
    code: `
      (func $${functionName} (param $${ast.pID} ${paramType}) (param $context i32) (result ${lcType2WasmType(functionType.ret)})
        ${contextInit}
        ${compileExpression(ast.exp, context)}
      )
    `,
    tableIndex: context.tableOffset
  });

  context.localVars.shift();

  return `(i32.const ${context.tableOffset++})`;
}

function compileApplication(ast: LCApp, context: Context): string {
  const signatureName = `$_sig_${context.lambdaConfig.lambdaName}_${context.sigMap.size}`;
  const signature = `(type ${signatureName} (func (param ${lcType2WasmType((context.typeMap.get(ast.f) as LCAbsT).param)}) (param i32) (result ${lcType2WasmType((context.typeMap.get(ast.f) as LCAbsT).ret)})))`;
  //@FIXME: Monkey patch

  context.sigMap.set(signatureName, signature);

  return `(call_indirect (type ${signatureName}) ${compileExpression(ast.arg, context)} (local.get $context) ${compileExpression(ast.f, context)})`
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

export function compile(ast: LCProc, typeMap: TypeMap): string {
  const functionMap = new Map<string, { code: string, tableIndex: number }>();
  let tableOffset = 0;
  const sigMap = new Map<string, string>();
  let result = `
    (module
    (global $context_heap_offset (mut i32) (i32.const 0))
  (memory $context_heap 1)
  ;; context ref : vec128 ( value : 64bit, next: i32, start: i32)
  ;; context ref :  vec128 ( value : 64bit, before: i32, index: i32)
  (func $create_context (param $value i64) (param $start i32) (result v128)
      (i64x2.replace_lane 0 (v128.const i64x2 0 0) (local.get $value))
      (local.get $start)
      (i32x4.replace_lane 3)
  )
  (func $cal_heap_border (result i32)
    (i32.mul (global.get $context_heap_offset) (i32.const 128))
  )
  (func $start_context (param $value i64) (result i32)
    (call $cal_heap_border)
    (call $create_context (local.get $value) (call $cal_heap_border))
    (v128.store)
    (global.get $context_heap_offset)
    (global.set $context_heap_offset (i32.add (i32.const 1) (global.get $context_heap_offset)))
  )
  (func $get_next_context (param $offset i32) (result i32)
    (call $get_context (local.get $offset))
    (i32x4.extract_lane 2)
  )
   (func $get_context_start (param $offset i32) (result i32)
    (call $get_context (local.get $offset))
    (i32x4.extract_lane 3)
    (call $get_context)
    (i32x4.extract_lane 2)
  )
  (func $get_context (param $offset i32) (result v128)
    (v128.load (i32.mul (local.get $offset) (i32.const 128)))
  )
  (func $get_context_val_i32 (param $offset i32) (result i32)
    (call $get_context (local.get $offset))
    (i32x4.extract_lane 0)
  )
  (func $get_context_val_i64 (param $offset i32) (result i64)
    (call $get_context (local.get $offset))
    (i64x2.extract_lane 0)
  )
  (func $get_context_val_f32 (param $offset i32) (result f32)
    (call $get_context (local.get $offset))
    (f32x4.extract_lane 0)
  )
  (func $get_context_val_f64 (param $offset i32) (result f64)
    (call $get_context (local.get $offset))
    (f64x2.extract_lane 0)
  )
  (func $alloc_context_var_i32 (param $value i32) (param $base i32) (result i32)
    (call $cal_heap_border)
    (call $create_context (i64.extend_i32_s (local.get $value)) (call $get_context_start (local.get $base)))
    (v128.store)
    (i32.mul (local.get $base) (i32.const 128))
    (i32x4.replace_lane 2 (call $get_context (local.get $base)) (call $cal_heap_border))
    (v128.store)
    (global.get $context_heap_offset)
    (global.set $context_heap_offset (i32.add (i32.const 1) (global.get $context_heap_offset)))
  )
  (func $read_i32_from_context (param $index i32) (param $context i32) (result i32)
    (local $currentContext v128)
    (local.set $currentContext (call $get_context (call $get_context_start (local.get $context))))

    (block
      (loop
        (br_if 0 (i32.eq (local.get $index) (i32.const 1)))
        (local.set $currentContext (call $get_context (i32x4.extract_lane 2 (local.get $currentContext))))
        (local.set $index (i32.sub (local.get $index) (i32.const 1)))
      )
    )

    (i32x4.extract_lane 0 (local.get $currentContext))
  )
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