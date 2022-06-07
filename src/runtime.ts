//@TODO: Rewrite in WASM

import { chain, fold, none, Option, some } from 'fp-ts/Option';

class Context {
  private readonly outer: Option<Context>;
  private readonly value: number;

  constructor(value: number, outer: Option<Context> = none) {
    this.value = value;
    this.outer = outer;
  }

  getValueByOffset(offset: number): Option<number> {
    if (offset < 0) return none;

    if (offset === 0) return some(this.value);
    else return chain((outerContext: Context) => outerContext.getValueByOffset(offset - 1))(this.outer);
  }
}

export class Runtime {
  private contexts: Map<number, Context> = new Map;
  private closures: Map<number, { fref: number, contextRef: number }> = new Map;

  createContext(value: number): number {
    const contextRef = this.contexts.size;

    this.contexts.set(contextRef, new Context(value));

    return contextRef;
  }

  allocContextVar(value: number, baseContextRef: number): number {
    const baseContext = this.contexts.get(Number(baseContextRef))!;
    const contextRef = this.contexts.size;

    this.contexts.set(contextRef, new Context(value, some(baseContext)));

    return contextRef;
  }

  readFromContext(offset: number, contextRef: number): number {
    const context = this.contexts.get(Number(contextRef))!;

    return fold(() => 0, (x: number) => x)(context.getValueByOffset(offset));
  }

  createClosure(fref: number, contextRef: number): number { // [i32, i32] -> i64
    const closureRef = this.closures.size;

    this.closures.set(closureRef, { fref, contextRef });

    return closureRef;
  }

  getFrefFromClosure(closureRef: number): number { // i64 -> i32
    return this.closures.get(Number(closureRef))!.fref;
  }

  getContextFromClosure(closureRef: number): number { // i64 -> i32
    return this.closures.get(Number(closureRef))?.contextRef ?? 0;
  }
}