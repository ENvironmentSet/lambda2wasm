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

function refineFunctionType(st: function_type_1): LCAbsT {
  return LCAbsT(refineType(st.param), refineType(st.exp));
}

function refineType(st: type): LCType {
  switch (st.kind) {
    case ASTKinds.function_type_1:
      return refineFunctionType(st)
    case ASTKinds.type_2:
      return refineType(st.type)
    case ASTKinds.type_var_mono:
      return LCMVar(st.identifier)
    case ASTKinds.type_var_poly:
      return LCPVar(st.identifier)
    case ASTKinds.type_function_type_head_2:
      return refineType(st.type)
    default:
      throw new Error(`non-exhaust switch statement in refineTy[e: ${st}`);
  }
}

function refineAbstraction(st: abstraction): LCAbs {
  return LCAbs(st.param.identifier, refineType(st.paramT), refineExp(st.body))
}

function refineApplication(st: application_1): LCApp {
  return LCApp(refineExp(st.head), refineExp(st.arg.kind === ASTKinds.expression_argument_1 ? st.arg.exp : st.arg));
}

function refineExp(st: expression): LCExp {
  switch (st.kind) {
    case ASTKinds.expression_2:
      return refineExp(st.exp)
    case ASTKinds.additive_1:
      return LCAdd(refineExp(st.left), refineExp(st.right))
    case ASTKinds.additive_2:
      return LCSub(refineExp(st.left), refineExp(st.right))
    case ASTKinds.multiplicative_1:
      return LCMult(refineExp(st.left), refineExp(st.right))
    case ASTKinds.multiplicative_2:
      return LCDiv(refineExp(st.left), refineExp(st.right))
    case ASTKinds.abstraction:
      return refineAbstraction(st)
    case ASTKinds.application_1:
      return refineApplication(st)
    case ASTKinds.expression_head_1:
      return refineExp(st.exp)
    case ASTKinds.identifier:
      return LCVar(st.identifier)
    case ASTKinds.num:
      return LCNum(st.value, st.type.kind === ASTKinds.type_var_poly ? LCPVar(st.type.identifier) : LCMVar(st.type.identifier))
    default:
      throw new Error(`non-exhaust switch statement in refineExp: ${st}`);
  }
}

function refineBinding(st: binding): LCBind {
  return LCBind(st.name.identifier, refineExp(st.exp));
}

export function refineSyntaxTree(st: start): LCProc {
  return LCProc(st.bindings.map(refineBinding));
}

