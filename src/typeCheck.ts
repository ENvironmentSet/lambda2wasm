/**
 * Type checker
 *
 * Covers lambda expression that can be typed in monomorphic type or rank 1 polymorphic type.
 *
 * @TODO: Verify algorithm
 * @TODO: rank-n type inference for `$` operator and `runST`.
 */

import {
  LCAbs,
  LCAbsT,
  LCApp,
  LCArith,
  LCBind,
  LCExp,
  LCNum,
  LCProc,
  LCPVar,
  LCTerm,
  LCType,
  LCUVar,
  LCVar
} from './AST';
import { prettyError } from './prettyError';

export type TypeMap = WeakMap<LCTerm, LCType>
// stack of bindings, leftmost binding has priority in resolution.
type Context = [string, LCType][]
type BoundTypeVariables = string[]

// returns string representation of given type.
function typeToString(type: LCType): string {
  switch (type.tag) {
    case 'LCMVar':
      return type.id
    case 'LCPVar':
      return type.id
    case 'LCUVar':
      // unification variables may not have been unified at the time of calling this function
      if (type.unified) return typeToString(type.unified)
      else return `${type.id}`
    case 'LCAbsT':
      // '->' is right associative, therefore parentheses are required to represent function type of parameter.
      if (type.param.tag === 'LCAbsT') return `(${typeToString(type.param)}) -> ${typeToString(type.ret)}`
      else return `${typeToString(type.param)} -> ${typeToString(type.ret)}`
  }
}

// returns string representation of given type.
function contextToString(context: Context): string {
  return context.reduce((str, [name, type]) => `${str}\n(${name}, ${typeToString(type)})`, '')
}

/*
 simplify types.

 - remove unnecessary layer of unification variable.
 */
function simplifyType(type: LCType): LCType {
  if (type.tag === 'LCAbsT') return LCAbsT(simplifyType(type.param), simplifyType(type.ret))
  if (type.tag !== 'LCUVar') return type
  return type.unified ?? type
}

// check if two types are compatible.
// monomorphic types only.
function compareType(t1: LCType, t2: LCType, expectation: boolean): boolean {
  // let types be it's simplest form.
  t1 = simplifyType(t1)
  t2 = simplifyType(t2)

  if (t1.tag === 'LCAbsT' || t2.tag === 'LCAbsT') {
    // at least, one of t1 and t2 is function type now.
    if (t1.tag !== t2.tag) return false

    // t1 and t2 are function type here.
    return compareType((t1 as LCAbsT).param, (t2 as LCAbsT).param, expectation) && compareType((t1 as LCAbsT).ret, (t2 as LCAbsT).ret, expectation)
  } else if (t1.tag === 'LCUVar' || t2.tag === 'LCUVar') {
    // compatible check of unification variables are delayed until one of them is resolved.
    if (t1.tag === 'LCUVar') {
      // If t1 is unified, but not compatible with t2
      if (t1.unified && compareType(t1.unified, t2, expectation) !== expectation)
        throw prettyError(`
          expected two types are ${expectation ? 'compatible' : 'incompatible'},
          but found they are not.
        `)
      // If t1 is not unified
      else if (!t1.unified) {
        t1.unified = t2

        if(!t1.constraints.every(constraint => constraint(t2)))
          throw prettyError(`
            assuming ${typeToString(t1)} equals to ${typeToString(t2)} conflicts to constraints already given to. 
          `)
      }
    }
    else if (t2.tag === 'LCUVar') {
      if (t2.unified && compareType(t2.unified, t1, expectation) !== expectation)
        throw prettyError(`
          expected two types are ${expectation ? 'compatible' : 'incompatible'},
          but found they are not.
        `)
      else if (!t2.unified) {
        t2.unified = t1

        if(!t2.constraints.every(constraint => constraint(t1)))
          throw prettyError(`
            assuming ${typeToString(t1)} equals to ${typeToString(t2)} conflicts to constraints already given to. 
          `)
      }
    }

    return expectation
  }
  /*
   two non-function types are compatible
   if and only if they are same kind and same name.
  */
  else return t1.tag === t2.tag && t1.id === t2.id
}

/*
 * check whether given type represents any kinds of number type.
 * @TODO: Let primitive types be top level binding so that this kinds of check does not need.
 */
function isNumberType(type: LCType, expectation: boolean): boolean {
  if (type.tag === 'LCPVar' || type.tag === 'LCAbsT') return false
  if (type.tag === 'LCUVar') {
    if (type.unified) return isNumberType(type.unified, expectation)
    else {
      type.constraints.push(type => isNumberType(type, expectation) === expectation)

      return expectation
    }
  }

  return ['I32', 'I64', 'F32', 'F64'].includes(type.id)
}

// collect all type variables in given type, duplication will be ignored.
function collectTypeVariables(type: LCType): BoundTypeVariables {
  if (type.tag === 'LCMVar' || type.tag === 'LCUVar') return []
  else if (type.tag === 'LCPVar') return [type.id]
  else return collectTypeVariables(type.param).concat(collectTypeVariables(type.ret)) // Now type must be LCAbsT.
}

//@FIXME: resolve name collision problem in more elegant way.
function terminateUnificationVariable(type: LCType, namespace: string): LCType {
  if (type.tag === 'LCAbsT') return LCAbsT(terminateUnificationVariable(type.param, `${namespace}_`), terminateUnificationVariable(type.ret, `${namespace}'`))
  else if (type.tag !== 'LCUVar') return type
  else if (type.unified) return terminateUnificationVariable(type.unified, namespace)
  else {
    type.unified = LCPVar(`${namespace}_u`)

    if (!type.constraints.every(constraint => constraint(type)))
      throw prettyError(`
        tried to resolve unification variable '${type.id}' as ${typeToString(type.unified)} but failed.
      `)

    return type
  }
}

// resolves type of given variable's name.
function resolveTypeOfVariable(target: string, context: Context): LCType {
  // leftmost binding(the latest one) has priority in name resolution.
  const searchResult = context.find(([name]) => name === target)

  if (!searchResult)
    throw prettyError(`
      Cannot resolve type of variable '${target}' in the context:
      
      ${contextToString(context)}
    `)

  return searchResult[1]
}

// type check given numeric literal.
function checkNumericLiteral(ast: LCNum, typeMap: TypeMap) {
  function checkInt(): void {
    if (!Number.isInteger(ast.val))
      throw prettyError(`
        ${ast.val} is not a integer, value of type '${typeToString(ast.type)}' expected.
      `)
  }

  //@TODO: check size of number.
  switch (ast.type.id) {
    case 'I32':
      checkInt()
      typeMap.set(ast, ast.type)
      break;
    case 'I64':
      checkInt()
      typeMap.set(ast, ast.type)
      break
    case 'F32':
      typeMap.set(ast, ast.type)
      break
    case 'F64':
      typeMap.set(ast, ast.type)
      break
    default:
      throw prettyError(`Incompatible type for numeric literal '${ast.type}' is given.`)
  }
}

// type check given variable reference.
function checkVariable(ast: LCVar, context: Context, typeMap: TypeMap) {
  const type = resolveTypeOfVariable(ast.id, context)

  typeMap.set(ast, type)
}

//@TODO: Better error messages.
function solveTypeEquation(parameterType: LCType, argumentType: LCType, context: Context, boundTypeVariables: BoundTypeVariables, solutionMap: Map<string, LCType>): Map<string, LCType> {
  if (parameterType.tag === 'LCPVar' && !boundTypeVariables.includes(parameterType.id)) {
    if (solutionMap.has(parameterType.id) && !compareType(solutionMap.get(parameterType.id)!, argumentType, true))
      throw prettyError(`occurrence check failed`)

    solutionMap.set(parameterType.id, argumentType)
  } else if (parameterType.tag === 'LCMVar' || (parameterType.tag === 'LCPVar' && boundTypeVariables.includes(parameterType.id))) {
    if (!compareType(parameterType, argumentType, true))
      throw prettyError(`type did not match error`)

    if (argumentType.tag === 'LCUVar') {
      if (argumentType.unified)
          solveTypeEquation(parameterType, argumentType.unified, context, boundTypeVariables, solutionMap)
      else {
        argumentType.unified = parameterType

        if (!argumentType.constraints.every(constraint => constraint(parameterType)))
          throw prettyError(`fail to meet constraints for unification variable`)
      }
    }
  } else if (parameterType.tag === 'LCAbsT') {
    if (argumentType.tag === 'LCUVar') {
      if (argumentType.unified)
        solveTypeEquation(parameterType, argumentType.unified, context, boundTypeVariables, solutionMap)
      else {
        const semiInstantiatedUnificationVar: LCAbsT = LCAbsT(LCUVar(`${argumentType.id}_head`), LCUVar(`${argumentType.id}_ret`))

        argumentType.unified = semiInstantiatedUnificationVar

        if (argumentType.constraints.every(constraint => constraint(semiInstantiatedUnificationVar)))
          throw prettyError(`fail to apply incremental resolution to unification variable`)

        solveTypeEquation(parameterType, semiInstantiatedUnificationVar, context, boundTypeVariables, solutionMap)
      }
    } else if (argumentType.tag === 'LCAbsT') {
      solveTypeEquation(parameterType.param, argumentType.param, context, boundTypeVariables, solutionMap)
      solveTypeEquation(parameterType.ret, argumentType.ret, context, boundTypeVariables, solutionMap)
    } else throw prettyError(`type did not match error`)
  } else if (parameterType.tag === 'LCUVar') {
    if (parameterType.unified)
      solveTypeEquation(parameterType.unified, argumentType, context, boundTypeVariables, solutionMap)
    else {
      parameterType.unified = argumentType

      if (!parameterType.constraints.every(constraint => constraint(parameterType)))
        throw prettyError(`fail to meet constraints for unification variable`)
    }
  }

  return solutionMap
}

function instantiateType(type: LCType, boundTypeVariables: BoundTypeVariables, sols: Map<string, LCType>): LCType {
  if (type.tag === 'LCPVar' && !boundTypeVariables.includes(type.id)) {
    if (sols.has(type.id)) return sols.get(type.id)!

    return type
  } else if (type.tag === 'LCAbsT')
    return LCAbsT(instantiateType(type.param, boundTypeVariables, sols), instantiateType(type.ret, boundTypeVariables, sols))
  else return type
}

// type check application expression
function checkApplication(ast: LCApp, context: Context, typeMap: TypeMap, boundTypeVariables: BoundTypeVariables) {
  checkExpression(ast.f, context, typeMap, boundTypeVariables)
  checkExpression(ast.arg, context, typeMap, boundTypeVariables)

  // once head/argument expression type checks, there must be mapping to type from it in TypeMap
  const headType = typeMap.get(ast.f)!;
  const argType = typeMap.get(ast.arg)!;

  if (headType.tag !== 'LCAbsT')
    throw prettyError(`
      head of application expression is not function
    `)

  const parameterType = headType.param
  const returnType = headType.ret

  const solutions = solveTypeEquation(parameterType, argType, context, boundTypeVariables, new Map)

  console.log(solutions)

  typeMap.set(ast, instantiateType(returnType, boundTypeVariables, solutions))
}

// type check given lambda abstraction
function checkAbstraction(ast: LCAbs, context: Context, typeMap: TypeMap, boundTypeVariables: BoundTypeVariables) {
  const collectedPVars = collectTypeVariables(ast.pType)

  checkExpression(ast.exp, ([[ast.pID, ast.pType]] as Context).concat(context), typeMap, collectedPVars.concat(boundTypeVariables))

  // once body expression of lambda abstraction type checks, there must be mapping to type from it in TypeMap
  const bodyType = typeMap.get(ast.exp)!

  typeMap.set(ast, LCAbsT(ast.pType, bodyType))
}

// type check given arithmetic expression
function checkArithmeticExpression(ast: LCArith, context: Context, typeMap: TypeMap, boundTypeVariables: BoundTypeVariables) {
  const { left, right } = ast

  checkExpression(left, context, typeMap, boundTypeVariables)
  checkExpression(right, context, typeMap, boundTypeVariables)

  // once left/right operand type checks, type of both can be found in TypeMap.
  const lvalType = typeMap.get(left)!;
  const rvalType = typeMap.get(right)!;

  if (lvalType.tag === 'LCAbsT' || rvalType.tag === 'LCAbsT')
    throw prettyError(`
      functions can not be target of arithmetic operations.
    `)
  if (lvalType.tag === 'LCPVar' || rvalType.tag === 'LCPVar')
    throw prettyError(`
      value of polymorphic type can not be target of arithmetic operations.
    `)
  if (!compareType(lvalType, rvalType, true))
    throw prettyError(`
      types of operand for arithmetic operation are incompatible.
      
      type of left operand is '${typeToString(lvalType)}', but type of right is '${typeToString(rvalType)}'. 
    `)
  if (!isNumberType(lvalType, true))
    throw prettyError(`
      only value of number types can be operand of arithmetic operation.
    `)

  typeMap.set(ast, lvalType)
}

// type check given lambda expression.
function checkExpression(ast: LCExp, context: Context, typeMap: TypeMap, boundTypeVariables: BoundTypeVariables) {
  switch (ast.tag) {
    case 'LCNum':
      checkNumericLiteral(ast, typeMap)
      break
    case 'LCVar':
      checkVariable(ast, context, typeMap)
      break
    case 'LCApp':
      checkApplication(ast, context, typeMap, boundTypeVariables)
      break
    case 'LCAbs':
      checkAbstraction(ast, context, typeMap, boundTypeVariables)
      break
    // @TODO: Let arithmetic operators be normal function so that this kind of handling could be erased.
    case 'LCAdd':
    case 'LCSub':
    case 'LCMult':
    case 'LCDiv':
      checkArithmeticExpression(ast, context, typeMap, boundTypeVariables);
      break
  }
}

// type check given supercombinator
function checkBinding(ast: LCBind, context: Context, typeMap: TypeMap, boundTypeVariables: BoundTypeVariables) {
  checkExpression(ast.exp, ([[ast.id, LCUVar(ast.id)]] as Context).concat(context), typeMap, boundTypeVariables)

  const expType = terminateUnificationVariable(typeMap.get(ast.exp)!, ast.id)

  typeMap.set(ast, simplifyType(expType))
}

// type check given program
export function typeCheck(ast: LCProc): TypeMap {
  const typeMap: TypeMap = new Map
  const context: Context = []
  const boundTypeVariables: BoundTypeVariables = []

  //@TODO: Hoisting?
  for (const binding of ast.bindings) {
    checkBinding(binding, context, typeMap, boundTypeVariables)

    context.push([binding.id, typeMap.get(binding)!])
  }

  return typeMap
}