import { h } from "@stencil/core";

export const renderError = (error: Error | string) => {
  const coercedError = error instanceof Error ? error : new Error(error);
  return <div class="level-1 background-grey error">{coercedError.toString()}</div>;
};
