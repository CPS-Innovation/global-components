import { h } from "@stencil/core";

export const renderError = (error: Error | string) => {
  const coercedError = error instanceof Error ? error : new Error(error);
  return <div class="level-1 background-grey error govuk-error-message">Global header - {coercedError.toString()}</div>;
};
