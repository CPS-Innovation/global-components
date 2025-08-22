import { forceUpdate, getRenderingRef as brokenGetRenderingRef } from "@stencil/core";
import { createObservableMap, createStore, Subscription } from "@stencil/store";
import { _console } from "../logging/_console";

// In our use case the stencil store does trigger rerenders in the normal way
//  see https://github.com/stenciljs/core/issues/4135
//  This is a brute-force shim that allows components to force rerendering.
//  The fact that we are having to do this leads to thoughts of just using
//  using redux with some helper functionality to trigger rerendering, just
//  as we are having to do here anyway.

export const createCustomStore: typeof createStore = <T extends { [key: string]: any }>(
  defaultState?: T | (() => T),
  shouldUpdate?: (newV: any, oldValue: any, prop: keyof T) => boolean,
) => {
  const map = createObservableMap(defaultState, shouldUpdate);
  map.use(customSubscription());
  return map;
};

// Simple global tracking
let currentlyRenderingComponent: any = null;

const getRenderingRef = () => currentlyRenderingComponent;

// The decorator
export function TrackRender() {
  return function (targetPrototype: any, key: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      currentlyRenderingComponent = this;
      try {
        _console.debug("Rendering", targetPrototype.constructor.name, key);
        return originalMethod.apply(this, args);
      } finally {
        currentlyRenderingComponent = null;
      }
    };
  };
}

const appendToMap = <K, V>(map: Map<K, V[]>, propName: K, value: V) => {
  const items = map.get(propName);
  if (!items) {
    map.set(propName, [value]);
  } else if (!items.includes(value)) {
    items.push(value);
  }
};

const debounce = <T extends (...args: any[]) => any>(fn: T, ms: number): ((...args: Parameters<T>) => void) => {
  let timeoutId: any;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = 0;
      fn(...args);
    }, ms);
  };
};

const isConnected = (maybeElement: any) => !("isConnected" in maybeElement) || maybeElement.isConnected;

const cleanupElements = debounce((map: Map<string, any[]>) => {
  for (let key of map.keys()) {
    var els = map.get(key) || [];
    map.set(key, els.filter(isConnected));
  }
}, 2_000);

export const customSubscription = <T>(): Subscription<T> => {
  const elmsToUpdate = new Map<string, any[]>();

  return {
    dispose: () => elmsToUpdate.clear(),
    get: propName => {
      const elm = getRenderingRef();
      _console.debug(brokenGetRenderingRef(), elm);
      if (elm) {
        appendToMap(elmsToUpdate, propName as string, elm);
      }
    },
    set: propName => {
      _console.debug("State setting", propName);
      const elements = elmsToUpdate.get(propName as string);
      if (elements) {
        elmsToUpdate.set(propName as string, elements.filter(forceUpdate));
      }
      cleanupElements(elmsToUpdate);
    },
    reset: () => {
      elmsToUpdate.forEach(elms => elms.forEach(forceUpdate));
      cleanupElements(elmsToUpdate);
    },
  };
};
