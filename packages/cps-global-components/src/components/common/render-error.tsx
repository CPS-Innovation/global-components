import { h } from "@stencil/core";

export const renderError = (error: Error | string) => <div class="level-1 background-grey error">{error}</div>;
