export const _console = {
  ...console,
  debug: (...data: any[]) => {
    const style = "background-color: lightsteelblue; color: white;";
    console.debug(`%c[CPS-GLOBAL-COMPONENTS]`, style, ...data);
  },
  error: (...data: any[]) => {
    const style = "background-color: firebrick; color: white;";
    console.error(`%c[CPS-GLOBAL-COMPONENTS]`, style, ...data);
  },
};
