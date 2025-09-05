const isJest = typeof jest !== "undefined";

const makeMethod =
  (method: "debug" | "error" | "log", colour: string) =>
  (...data: any[]) => {
    if (isJest) {
      return;
    }
    const style = `background-color: ${colour}; color: white;`;
    console[method](`%c[CPS-GLOBAL-COMPONENTS]`, style, ...data);
  };

export const _console = {
  ...console,
  debug: makeMethod("debug", "lightsteelblue"),
  log: makeMethod("log", "lightgreen"),
  error: makeMethod("error", "firebrick"),
};
