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

(original name)_(lambda depth)_(parameter_type)_(return_type)

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