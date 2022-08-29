import dedent from 'dedent';

export function prettyError(msg: string) {
  return new Error(dedent(msg))
}