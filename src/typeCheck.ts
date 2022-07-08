import { AST, LCAbs, LCAbsT, LCApp, LCExp, LCMVar, LCNum, LCProc, LCPVar, LCType, LCVar } from './AST';

//@TODO: Rewrite in functional manner.

export type TypeMap = WeakMap<AST, LCType>;
type Env = [string, LCType][];
type TypeEnv = string[];

export function typeToString(type: LCType): string {
  if (type.tag === 'LCMVar') return type.id;
  if (type.tag === 'LCPVar') return type.id;
  else return `(${typeToString(type.param)}) -> ${typeToString(type.ret)}`
}

function resolveTVar(env: Env, variable: string): LCType {
  const result = env.find(([key]) => key === variable);

  if (!result) throw new Error(`cannot resolve type of variable '${variable}'`);
  else return result[1];
}

function checkNumberLiteral(ast: LCNum, tmap: TypeMap): void {
  if (ast.type.tag === 'LCPVar') throw new Error('Numeric Literal cannot have polymorphic type');

  function checkInt(): void {
    if (!Number.isInteger(ast.val)) throw new Error(`${ast.val} is not a integer`);
  }

  //@FIXME: Illegal implementation
  function checkSize(size: number): void {}

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

function checkVariable(ast: LCVar, tmap: TypeMap, env: Env): void {
  const type = resolveTVar(env, ast.id);

  tmap.set(ast, type);
}

function collectTypeVar(type: LCType): string[] {
  if (type.tag === 'LCMVar') return [];
  else if (type.tag === 'LCPVar') return [type.id];
  else return collectTypeVar(type.param).concat(collectTypeVar(type.ret));
}

function checkAbstraction(ast: LCAbs, tmap: TypeMap, env: Env, tenv: TypeEnv): void {
  //body type..?
  checkExp(ast.exp, tmap, ([[ast.pID, ast.pType]] as Env).concat(env), tenv.concat(collectTypeVar(ast.pType)));

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
function solveTypeEquation(t1: LCType, t2: LCType, tenv: TypeEnv, sol: [string, LCType][] = []): [string, LCType][] {
  if (t1.tag === 'LCPVar') {
    if (tenv.includes(t1.id)) {
      if (t2.tag === 'LCPVar' && t1.tag === t2.tag) return sol;
      else throw new Error(`No solution for type equation: ${typeToString(t1)} = ${typeToString(t2)}`);
    } else if (sol.find(([id]) => id === t1.id)) {
      const prevSol = sol.find(([id]) => id === t1.id)!;

      if (typeEq(prevSol[1], t2)) return sol;
      else throw new Error(`No solution for type equation: ${typeToString(t1)} = ${typeToString(t2)}`);
    } return ([[t1.id, t2] as [string, LCType]]).concat(sol);
  }
  if (t1.tag === 'LCMVar' || t2.tag !== 'LCAbsT') throw new Error(`No solution for type equation: ${typeToString(t1)} = ${typeToString(t2)}`);

  return solveTypeEquation(t1.ret, t2.ret, tenv, solveTypeEquation(t1.param, t2.param, tenv, sol));
}

function instantiatePolyType(ptype: LCType, sols: [string, LCType][]): LCType {
  if (ptype.tag === 'LCPVar') {
    return (sols.find(([id]) => ptype.id === id) ?? [, ptype])[1];
  }
  if (ptype.tag === 'LCMVar') return ptype;

  return LCAbsT(instantiatePolyType(ptype.param, sols), instantiatePolyType(ptype.ret, sols));
}

function checkApplication(ast: LCApp, tmap: TypeMap, env: Env, tenv: TypeEnv): void {
  checkExp(ast.f, tmap, env, tenv);
  checkExp(ast.arg, tmap, env, tenv);

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

function checkExp(ast: LCExp, tmap: TypeMap, env: Env, tenv: TypeEnv): void {
  if (ast.tag === 'LCVar') checkVariable(ast, tmap, env);
  else if (ast.tag === 'LCNum') checkNumberLiteral(ast, tmap);
  else if (ast.tag === 'LCAbs') checkAbstraction(ast, tmap, env, tenv);
  else if (ast.tag === 'LCApp') checkApplication(ast, tmap, env, tenv);
  else {
    const { left, right } = ast;

    checkExp(left, tmap, env, tenv);
    checkExp(right, tmap, env, tenv);

    const ltype = tmap.get(left)!;
    const rtype = tmap.get(right)!;

    if (isPolyType(ltype) || isPolyType(rtype)) throw new Error(`Cannot perform arithmetic operation to polytype value.`);
    if (!typeEq(ltype, rtype)) throw new Error(`type of left and right operand are not compatible,  ${typeToString(ltype)} is not equal to ${typeToString(rtype)}`);
    tmap.set(ast, ltype);
  }
}

export function typeCheck(ast: LCProc): TypeMap {
  const tmap = new WeakMap<AST, LCType>();
  const env = [] as Env;
  const tenv = [] as TypeEnv;

  for (const binding of ast.bindings) {
    checkExp(binding.exp, tmap, env, tenv);

    const bindingType = tmap.get(binding.exp)!;
    tmap.set(binding, bindingType);
    env.push([binding.id, bindingType]);
  }

  return tmap;
}