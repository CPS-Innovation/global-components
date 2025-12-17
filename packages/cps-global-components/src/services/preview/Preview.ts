type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined // gets omitted in JSON.stringify
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Preview = JsonValue;
