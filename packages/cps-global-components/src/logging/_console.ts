const isJest = typeof jest !== "undefined";

const makeMethod =
  (method: "debug" | "error" | "log" | "warn", colour: string) =>
  (...data: any[]) => {
    if (isJest) {
      return;
    }
    const style = `background-color: ${colour}; color: white;`;
    console[method](`%c[CPS-GLOBAL-COMPONENTS]`, style, Date.now(), ...data);
  };

export const _console = {
  ...console,
  debug: makeMethod("debug", "lightsteelblue"),
  log: makeMethod("log", "lightgreen"),
  error: makeMethod("error", "firebrick"),
  warn: makeMethod("warn", "goldenrod"),
};
