import { ASTKinds, parse } from './parser';
import { refineSyntaxTree } from './refineSyntaxTree';
import { typeCheck } from './typeCheck';
import { compile } from './compiler';

import { readFileSync, unlink } from 'node:fs';
import { exec } from 'node:child_process';
import { open } from 'node:fs/promises';

const source = String.fromCharCode(...readFileSync(process.argv[2]));
const runtime = `

  (memory $context_heap 1 100)
  (global $context_index_offset (mut i32) (i32.const 0))

  (func $cal_context_addr (param $context_index i32) (result i32)
    (i32.mul (local.get $context_index) (i32.const 16))
  )

  (func $get_next_context_addr (result i32)
    (call $cal_context_addr (global.get $context_index_offset))
    (global.set $context_index_offset (i32.add (global.get $context_index_offset) (i32.const 1)))
  )

  (func $get_context (param $context_index i32) (result v128)
    (call $cal_context_addr (local.get $context_index))
    (v128.load)
  )

  (func $is_top_context (param $context v128) (result i32)
    (i32x4.extract_lane 3 (local.get $context))
  )

  (func $get_outer_context_index (param $context v128) (result i32)
    (i32x4.extract_lane 2 (local.get $context))
  )

  (func $create_context_i32 (param $value i32) (result i32) (local $new_index i32)
    (local.set $new_index (call $get_next_context_addr))
    (local.get $new_index)
    (i32x4.replace_lane 0 (v128.const i32x4 0 0 0 1) (local.get $value))
    (v128.store)
    (i32.div_u (local.get $new_index) (i32.const 16))
  )

  (func $create_context_i64 (param $value i64) (result i32) (local $new_index i32)
      (local.set $new_index (call $get_next_context_addr))
      (local.get $new_index)
      (i64x2.replace_lane 0 (v128.const i32x4 0 0 0 1) (local.get $value))
      (v128.store)
      (i32.div_u (local.get $new_index) (i32.const 16))
  )
  
  (func $create_context_f32 (param $value f32) (result i32) (local $new_index i32)
      (local.set $new_index (call $get_next_context_addr))
      (local.get $new_index)
      (f32x4.replace_lane 0 (v128.const i32x4 0 0 0 1) (local.get $value))
      (v128.store)
      (i32.div_u (local.get $new_index) (i32.const 16))
    )
  
    (func $create_context_f64 (param $value f64) (result i32) (local $new_index i32)
        (local.set $new_index (call $get_next_context_addr))
        (local.get $new_index)
        (f64x2.replace_lane 0 (v128.const i32x4 0 0 0 1) (local.get $value))
        (v128.store)
        (i32.div_u (local.get $new_index) (i32.const 16))
    )

  (func $alloc_context_var_i32 (param $value i32) (param $outer_index i32) (result i32) (local $new_context_index i32)
    (local.set $new_context_index (call $create_context_i32 (local.get $value)))
    (call $cal_context_addr (local.get $new_context_index))
    (i32x4.replace_lane 2 (call $get_context (local.get $new_context_index)) (local.get $outer_index))
    (v128.store)
    (local.get $new_context_index)
  )

  (func $alloc_context_var_i64 (param $value i64) (param $outer_index i32) (result i32) (local $new_context_index i32)
      (local.set $new_context_index (call $create_context_i64 (local.get $value)))
      (call $cal_context_addr (local.get $new_context_index))
      (i32x4.replace_lane 2 (call $get_context (local.get $new_context_index)) (local.get $outer_index))
      (v128.store)
      (local.get $new_context_index)
    )

  (func $read_i32_from_context (param $offset i32) (param $contextRef i32) (result i32)
    (if (result i32)
     (i32.eq (local.get $offset) (i32.const 0))
     (then (i32x4.extract_lane 0 (call $get_context (local.get $contextRef))))
     (else (call $read_i32_from_context (i32.sub (local.get $offset) (i32.const 1)) (call $get_outer_context_index (call $get_context (local.get $contextRef)))))
    )
  )

  (func $read_i64_from_context (param $offset i32) (param $contextRef i32) (result i64)
      (if (result i64)
       (i32.eq (local.get $offset) (i32.const 0))
       (then (i64x2.extract_lane 0 (call $get_context (local.get $contextRef))))
       (else (call $read_i64_from_context (i32.sub (local.get $offset) (i32.const 1)) (call $get_outer_context_index (call $get_context (local.get $contextRef)))))
      )
    )

  ;; use context heap for closure

  (func $create_closure (param $fref i32) (param $context_ref i32) (result i32) (local $new_index i32)
    (local.set $new_index (call $get_next_context_addr))
    (local.get $new_index)
    (i32x4.replace_lane 0 (v128.const i64x2 0 0) (local.get $fref))
    (i32x4.replace_lane 1 (local.get $context_ref))
    (v128.store)
    (i32.div_u (local.get $new_index) (i32.const 16))
  )

  (func $get_fref_from_closure (param $closure_index i32) (result i32)
    (call $get_context (local.get $closure_index))
    (i32x4.extract_lane 0)
  )

  (func $get_context_from_closure (param $closure_index i32) (result i32)
    (call $get_context (local.get $closure_index))
    (i32x4.extract_lane 1)
  )

`;

const ast = parse(source);

if (ast.errs.length > 0 || ast?.ast?.kind !== ASTKinds.start)
  throw new Error(`Parse Failed! \n ${ast.errs.join('\n,')}`);

const refinedAST = refineSyntaxTree(ast.ast);
const typeMap = typeCheck(refinedAST);
const wat = compile(refinedAST, typeMap, runtime);

(async () => {
  const tempFile = await open('./temp.wat', 'w');

  await tempFile.writeFile(wat);

  exec('wat2wasm ./temp.wat', (_, stdout) => {
    WebAssembly.instantiate(readFileSync('./temp.wasm')).then(results => {
      //@ts-ignore-next-line
      console.log(results.instance.exports.main());
      unlink('./temp.wat', () => {});
      unlink('./temp.wasm', () => {});
    });
  });
})();

