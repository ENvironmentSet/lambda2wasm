# lambda2wasm
A Lambda expression compiler targeting web assembly.

## Lambda Expression Syntax

> you can find formal definition of syntax in 'syntax.peg' file. 

```
binding = 1#I32.

int32 = 0#I32.
int64 = 0#I64.
float32 = 0#F32.
float64 = 0#F64.

inc = x:I32. x + 1#I32.
dec = x:I32. x - 1#I32.
square = x:I32. x * x.

id = x:a. x.
apply = f:a->a. x:a. f x.

main = apply inc 6#I32.
```

## Commands

### `compile`

```
npm run compile [path]
```

prints wat(webassembly text format) output of a given source.

### `execute`

```
npm run execute [path]
```

compiles and execute a given code. (`main` is the entry point, value of `main` will be printed)

## Known bugs

- monomorphic function passed to universally quantified parameter makes function signature mismatch error.