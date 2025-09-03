import { h } from "@stencil/core";

export const renderWait = (msg: string = "Please wait...") => <div class="level-1 background-grey wait">{msg}</div>;
