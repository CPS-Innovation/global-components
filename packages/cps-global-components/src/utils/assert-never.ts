// Used to make the `default` case in a switch statement a typescript
//  design-time failure if the preceding case statements have not
//  exhaustively captured all possibilities.
export const assertNever = (x: never): never => {
  // This is just a safety net; in practice you should never reach it.
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
};
