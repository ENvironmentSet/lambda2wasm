import { AST, LCAbs, LCAbsT, LCApp, LCExp, LCMVar, LCNum, LCProc, LCPVar, LCType, LCVar } from './AST';

//@TODO: Rewrite in functional manner.

export type TypeMap = WeakMap<AST, LCType>;
type TypeEnv = [string, LCType][];

export function typeToString(type: LCType): string {
  if (type.tag === 'LCMVar') return type.id;
  if (type.tag === 'LCPVar') return type.id;
  else return `(${typeToString(type.param)}) -> ${typeToString(type.ret)}`
}

function resolveTVar(tenv: TypeEnv, variable: string): LCType {
  const result = tenv.find(([key]) => key === variable);

  if (!result) throw new Error(`cannot resolve type of variable '${variable}'`);
  else return result[1];
}

function checkNumberLiteral(ast: LCNum, tmap: TypeMap): void {
  if (ast.type.tag === 'LCPVar') throw new Error('Numeric Literal cannot have polymorphic type');

  function checkInt(): void {
    if (!Number.isInteger(ast.val)) throw new Error(`${ast.val} is not a integer`);
  }

  function checkSize(size: number): void { //@FIXME: Illegal implementation
    if (ast.val.toString(2).length > size) throw new Error(`${ast.val} is bigger than ${size} bit`);
  }

  switch (ast.type.id) {
    case 'I32':
      checkInt();
      checkSize(32);
      tmap.set(ast, ast.type);
      break;
    case 'I64':
      checkInt();
      checkSize(64);
      tmap.set(ast, ast.type);
      break;
    case 'F32':
      checkSize(32);
      tmap.set(ast, ast.type);
      break;
    case 'F64':
      tmap.set(ast, ast.type);
      break;
    default:
      throw new Error(`Unknown monomorphic type '${ast.type.id}'`);
  }
}

function checkVariable(ast: LCVar, tmap: TypeMap, tenv: TypeEnv): void {
  const type = resolveTVar(tenv, ast.id);

  tmap.set(ast, type);
}

function checkAbstraction(ast: LCAbs, tmap: TypeMap, tenv: TypeEnv): void {
  checkExp(ast.exp, tmap, ([[ast.pID, ast.pType]] as TypeEnv).concat(tenv));

  const bodyType = tmap.get(ast.exp)!;

  tmap.set(ast, LCAbsT(ast.pType, bodyType));
}

function typeEq(t1: LCType, t2: LCType): boolean {
  if (t1.tag !== t2.tag) return false;
  else if (t1.tag === 'LCAbsT' && t2.tag === 'LCAbsT') {
    return typeEq(t1.param, t2.param) && typeEq(t1.ret, t2.ret);
  } else return (t1 as LCPVar | LCMVar).id === (t2 as LCPVar | LCMVar).id;
}

export function isPolyType(type: LCType): boolean {
  if (type.tag === 'LCMVar') return false;
  if (type.tag === 'LCPVar') return true;

  return isPolyType(type.param) || isPolyType(type.ret);
}

// find sol of t1 = t2
function solveTypeEquation(t1: LCType, t2: LCType, tenv: TypeEnv): TypeEnv {
  if (t1.tag === 'LCPVar') return ([[t1.id, t2]] as TypeEnv).concat(tenv);
  if (t1.tag === 'LCMVar' || t2.tag !== 'LCAbsT') throw new Error(`No solution for type equation: ${typeToString(t1)} = ${typeToString(t2)}`);

  return solveTypeEquation(t1.ret, t2.ret, solveTypeEquation(t1.param, t2.param, tenv));
}

function instantiatePolyType(ptype: LCType, tenv: TypeEnv): LCType {
  if (ptype.tag === 'LCPVar') {
    return (tenv.find(([id]) => ptype.id === id) ?? [, ptype])[1];
  }
  if (ptype.tag === 'LCMVar') return ptype;

  return LCAbsT(instantiatePolyType(ptype.param, tenv), instantiatePolyType(ptype.ret, tenv));
}

function checkApplication(ast: LCApp, tmap: TypeMap, tenv: TypeEnv): void {
  checkExp(ast.f, tmap, tenv);
  checkExp(ast.arg, tmap, tenv);

  const headType = tmap.get(ast.f)!;
  const argType = tmap.get(ast.arg)!;

  if (headType.tag !== 'LCAbsT') throw new Error(`${ast.f} is not a function`);

  const paramType = headType.param;
  const retType = headType.ret;

  if (isPolyType(paramType)) {
    const sols = solveTypeEquation(paramType, argType, tenv);

    tmap.set(ast, instantiatePolyType(retType, sols));
  } else {
    if (!typeEq(paramType, argType)) throw new Error(`${typeToString(argType)} is not equals to ${typeToString(retType)}`);

    tmap.set(ast, retType);
  }
}

function checkExp(ast: LCExp, tmap: TypeMap, tenv: TypeEnv): void {
  if (ast.tag === 'LCVar') checkVariable(ast, tmap, tenv);
  else if (ast.tag === 'LCNum') checkNumberLiteral(ast, tmap);
  else if (ast.tag === 'LCAbs') checkAbstraction(ast, tmap, tenv);
  else if (ast.tag === 'LCApp') checkApplication(ast, tmap, tenv);
  else {
    const { left, right } = ast;

    checkExp(left, tmap, tenv);
    checkExp(right, tmap, tenv);

    const ltype = tmap.get(left)!;
    const rtype = tmap.get(right)!;

    if (!typeEq(ltype, rtype)) throw new Error(`type of left and right operand are not compatible,  ${typeToString(ltype)} is not equal to ${typeToString(rtype)}`);
    tmap.set(ast, ltype);
  }
}

export function typeCheck(ast: LCProc): TypeMap {
  const tmap = new WeakMap<AST, LCType>();
  const tenv = [] as TypeEnv;

  for (const binding of ast.bindings) {
    checkExp(binding.exp, tmap, tenv);

    const bindingType = tmap.get(binding.exp)!;
    tmap.set(binding, bindingType);
    tenv.push([binding.id, bindingType]);
  }

  return tmap;
}