import { h } from "@stencil/core";

export const renderError = (error: Error) => <div class="level-1 background-grey error">{error}</div>;
