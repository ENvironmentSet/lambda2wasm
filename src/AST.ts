//@TODO: More meaningful names

import { TaggedRecord } from './TaggedRecord';

export type LCMVar = TaggedRecord<'LCMVar', { id: string }>;
export type LCPVar = TaggedRecord<'LCPVar', { id: string }>;
export type LCUVar = TaggedRecord<'LCUVar', { id: `#${string}`, unified?: LCType, constraints: Array<(type: LCType) => boolean> }>
export type LCAbsT = TaggedRecord<'LCAbsT', { param: LCType, ret: LCType }>;
export type LCType = LCMVar | LCPVar | LCAbsT | LCUVar;

export type LCVar = TaggedRecord<'LCVar', { id: string }>;
export type LCNum = TaggedRecord<'LCNum', { val: number, type: LCMVar | LCPVar }>;
export type LCAbs = TaggedRecord<'LCAbs', { pID: string, pType: LCType, exp: LCExp }>;
export type LCApp = TaggedRecord<'LCApp', { f: LCExp, arg: LCExp }>;
export type LCAdd = TaggedRecord<'LCAdd', { left: LCExp, right: LCExp }>;
export type LCMult = TaggedRecord<'LCMult', { left: LCExp, right: LCExp }>;
export type LCSub = TaggedRecord<'LCSub', { left: LCExp, right: LCExp }>;
export type LCDiv = TaggedRecord<'LCDiv', { left: LCExp, right: LCExp }>;
export type LCArith = LCAdd | LCMult | LCSub | LCDiv;
export type LCExp = LCVar | LCNum | LCAbs | LCApp | LCArith;

export type LCBind = TaggedRecord<'LCBind', { id: string, exp: LCExp }>;
export type LCProc = TaggedRecord<'LCProc', { bindings: LCBind[] }>;

export type LCTerm = LCExp | LCBind | LCProc
export type AST = LCType | LCTerm;

//@serializable.
export const LCMVar = (id: string): LCMVar => ({ tag: 'LCMVar', id });
export const LCPVar = (id: string): LCPVar => ({ tag: 'LCPVar', id });
export const LCUVar = (id: string): LCUVar => ({ tag: 'LCUVar', id: `#${id}`, constraints: [] });
export const LCAbsT = (param: LCType, ret: LCType): LCAbsT => ({ tag: 'LCAbsT', param, ret });

export const LCVar = (id: string): LCVar => ({ tag: 'LCVar', id });
export const LCNum = (val: number, type: LCMVar | LCPVar): LCNum => ({ tag: 'LCNum', val, type });
export const LCAbs = (pID: string, pType: LCType, exp: LCExp): LCAbs => ({ tag: 'LCAbs', pID, pType, exp });
export const LCApp = (f: LCExp, arg: LCExp): LCApp => ({ tag: 'LCApp', f, arg });
export const LCAdd = (left: LCExp, right: LCExp): LCAdd => ({ tag: 'LCAdd', left, right });
export const LCMult = (left: LCExp, right: LCExp): LCMult => ({ tag: 'LCMult', left, right });
export const LCSub = (left: LCExp, right: LCExp): LCSub => ({ tag: 'LCSub', left, right });
export const LCDiv = (left: LCExp, right: LCExp): LCDiv => ({ tag: 'LCDiv', left, right });

export const LCBind = (id: string, exp: LCExp): LCBind => ({ tag: 'LCBind', id, exp });
export const LCProc = (bindings: LCBind[]): LCProc => ({ tag: 'LCProc', bindings });