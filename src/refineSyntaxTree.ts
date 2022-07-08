import {
  abstraction,
  application_1,
  ASTKinds,
  binding,
  expression,
  function_type_1,
  start,
  type
} from './parser';
import {
  LCAbs,
  LCAbsT,
  LCAdd,
  LCApp,
  LCBind,
  LCDiv,
  LCExp,
  LCMult,
  LCMVar,
  LCNum,
  LCProc,
  LCPVar,
  LCSub,
  LCType,
  LCVar
} from './AST';

function refineFunctionType(st: function_type_1, prefix: string): LCAbsT {
  return LCAbsT(refineType(st.param, prefix), refineType(st.exp, prefix));
}

function refineType(st: type, prefix: string): LCType {
  switch (st.kind) {
    case ASTKinds.function_type_1:
      return refineFunctionType(st, prefix)
    case ASTKinds.type_2:
      return refineType(st.type, prefix)
    case ASTKinds.type_var_mono:
      return LCMVar(st.identifier)
    case ASTKinds.type_var_poly:
      return LCPVar(`${prefix}_${st.identifier}`)
    case ASTKinds.type_function_type_head_2:
      return refineType(st.type, prefix)
    default:
      throw new Error(`non-exhaust switch statement in refineType: ${st}`);
  }
}

function refineAbstraction(st: abstraction, prefix: string): LCAbs {
  return LCAbs(st.param.identifier, refineType(st.paramT, prefix), refineExp(st.body, prefix))
}

function refineApplication(st: application_1, prefix: string): LCApp {
  return LCApp(refineExp(st.head, prefix), refineExp(st.arg.kind === ASTKinds.expression_argument_1 ? st.arg.exp : st.arg, prefix));
}

function refineExp(st: expression, prefix: string): LCExp {
  switch (st.kind) {
    case ASTKinds.expression_2:
      return refineExp(st.exp, prefix)
    case ASTKinds.additive_1:
      return LCAdd(refineExp(st.left, prefix), refineExp(st.right, prefix))
    case ASTKinds.additive_2:
      return LCSub(refineExp(st.left, prefix), refineExp(st.right, prefix))
    case ASTKinds.multiplicative_1:
      return LCMult(refineExp(st.left, prefix), refineExp(st.right, prefix))
    case ASTKinds.multiplicative_2:
      return LCDiv(refineExp(st.left, prefix), refineExp(st.right, prefix))
    case ASTKinds.abstraction:
      return refineAbstraction(st, prefix)
    case ASTKinds.application_1:
      return refineApplication(st, prefix)
    case ASTKinds.expression_head_1:
      return refineExp(st.exp, prefix)
    case ASTKinds.identifier:
      return LCVar(st.identifier);
    case ASTKinds.num:
      return LCNum(st.value, st.type.kind === ASTKinds.type_var_poly ? LCPVar(st.type.identifier) : LCMVar(st.type.identifier))
    default:
      throw new Error(`non-exhaust switch statement in refineExp: ${st}`);
  }
}

function refineBinding(st: binding): LCBind {
  return LCBind(st.name.identifier, refineExp(st.exp, st.name.identifier));
}

export function refineSyntaxTree(st: start): LCProc {
  return LCProc(st.bindings.map(refineBinding));
}

