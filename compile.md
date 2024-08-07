bindings -> global function

constant as 0-arity func (unary)
multiparam?

autocurrying support / polyfunc support
other type support

indirect function call


func creation:

global func def(with inner index) -> upload in table

use table idx instead of variable (and... typesearch?)

//

global vs local comparsion.



lexical environment

\x. (\y. x)

\x. i32
\x y. x.

but..

twice = \a. (\f. \x. f (f x))(\x. a).

// problems i've ever met

- parser comb (hanwritten) vs peg(generated)
- ast def(mvar, pvar) - how precise
- ast def - i need macros(cons-adt) (editor level macro)
- tip: Naming things(Prefix for keywords)
- typecheck: WeakMap use case
- type equation
- variable-with-init-exp
- currying - HOF - closure
- polyfuncs
//// v2

Numeric/Arithmetic -> just as usual

Abs / App / Variable / Binding / Global

0. naming convention.

(original name)_(lambda depth)_(parameter_type)

'->' translated to '2'

1. constant bindings

with init exp -> 0-arity func wrap *

constant -> just constant (opt)

2. functions

issues : currying / HoF / PolyF

=> indirect call / environments

func val -> funcref, saturated in call site.

```
\x. x

funcref -> \x. x

\y. \x. x

\y. (funcref -> \x. x)

\f. f (f 1)

context.create 
~
context.allocVar
indirect_call sig ...args env funcref

sig infer -> just like type check

//

func def : arg context#i32(pointer) ret

free var -> use env
bound -> use arg (local.get)

context.get envref string <-- first, depend on js api. next, use standalone api.
----
context.alloc[type] envref string val[type] ~ envref
context.start ~ envref.
```


context as linked list

vec128

[64bit] for data -> i32 (index) -> i32(next)

funcPointer : i32(f table pointer) / i32(context pointer)

context : vec128 (val i64 / before(outer) i32 / reserved i32)

;; polyfunc compile


if, def, then

abst -> type split
typevar as constant per stage, n * m

else, exp, withapp -> getFullySaturatedType ~ free type var? error!

a -> a

diff a initiate?

a unboxed to...

parametric poly only...
boxed? <-- memory loss?

boxedval -> boxedval... (like funcref)
poly call -> boxed
poly out -> unboxed

poly func impl : poly var as boxed
a -> a

| functype | argtype | rettype |
|----------|---------|---------|
| mono     | mono    | mono    |
| poly     | mono    | mono    |
| poly     | mono    | poly    |
| poly     | poly    | poly    |
| poly     | poly    | mono    |

polytypevar stays polytype in it's scope
monotypevar boxed polytype when enter polyfunc, unboxed when exit.


M -> a (i64 conv)
a -> M (i64 conv)
a -> a (both conv)

convkit with specialization

((a -> a) -> a) -> a -> a