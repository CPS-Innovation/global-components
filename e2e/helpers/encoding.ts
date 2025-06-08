import { Config } from "cps-global-configuration";

export const encode = (input: string) =>
  Buffer.from(input, "utf8").toString("base64");

export const decode = (encodedBase64: string) =>
  Buffer.from(encodedBase64, "base64").toString("utf8");
