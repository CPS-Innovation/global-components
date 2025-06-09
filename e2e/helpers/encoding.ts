export const encode = (input: string) =>
  Buffer.from(input, "utf8").toString("base64");

export const decode = (input: string) =>
  Buffer.from(input, "base64").toString("utf8");
