import { globalInitialisation } from "./global-initialisation";
// Don't return a promise otherwise stencil will wait for all of this to be complete
//  before rendering.  Using the register* functions means we can render immediately
//  and the components themselves will know when the minimum setup that they need is
//  ready.  This means that a long-running auth process will not stop components that
//  do not need auth from rendering.
export default /* do not make this async */ () => {
  globalInitialisation();
};
