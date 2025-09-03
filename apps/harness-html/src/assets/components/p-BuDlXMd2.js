import { _ as _console, d as getRenderingRef, e as forceUpdate } from './p-D95SeqOK.js';

const withLogging = (fnName, fn) => {
    return ((...args) => {
        const name = fnName || fn.name || "anonymous";
        const coreArgs = [`Calling ${name}`].concat(args.length ? args : []);
        try {
            const result = fn(...args);
            if (result instanceof Promise) {
                return result.then(value => {
                    _console.debug(...coreArgs.concat("resolved", value));
                    return value;
                }, error => {
                    _console.debug(...coreArgs.concat("rejected with", error));
                    throw error;
                });
            }
            _console.debug(...coreArgs.concat("returned", result));
            return result;
        }
        catch (err) {
            _console.error(...coreArgs.concat("threw", err));
            throw err;
        }
    });
};

const appendToMap = (map, propName, value) => {
    const items = map.get(propName);
    if (!items) {
        map.set(propName, [value]);
    }
    else if (!items.includes(value)) {
        items.push(value);
    }
};
const debounce = (fn, ms) => {
    let timeoutId;
    return (...args) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            timeoutId = 0;
            fn(...args);
        }, ms);
    };
};

/**
 * Check if a possible element isConnected.
 * The property might not be there, so we check for it.
 *
 * We want it to return true if isConnected is not a property,
 * otherwise we would remove these elements and would not update.
 *
 * Better leak in Edge than to be useless.
 */
const isConnected = (maybeElement) => !('isConnected' in maybeElement) || maybeElement.isConnected;
const cleanupElements = debounce((map) => {
    for (let key of map.keys()) {
        map.set(key, map.get(key).filter(isConnected));
    }
}, 2_000);
const stencilSubscription = () => {
    if (typeof getRenderingRef !== 'function') {
        // If we are not in a stencil project, we do nothing.
        // This function is not really exported by @stencil/core.
        return {};
    }
    const elmsToUpdate = new Map();
    return {
        dispose: () => elmsToUpdate.clear(),
        get: (propName) => {
            const elm = getRenderingRef();
            if (elm) {
                appendToMap(elmsToUpdate, propName, elm);
            }
        },
        set: (propName) => {
            const elements = elmsToUpdate.get(propName);
            if (elements) {
                elmsToUpdate.set(propName, elements.filter(forceUpdate));
            }
            cleanupElements(elmsToUpdate);
        },
        reset: () => {
            elmsToUpdate.forEach((elms) => elms.forEach(forceUpdate));
            cleanupElements(elmsToUpdate);
        },
    };
};

const unwrap = (val) => (typeof val === 'function' ? val() : val);
const createObservableMap = (defaultState, shouldUpdate = (a, b) => a !== b) => {
    const unwrappedState = unwrap(defaultState);
    let states = new Map(Object.entries(unwrappedState ?? {}));
    const handlers = {
        dispose: [],
        get: [],
        set: [],
        reset: [],
    };
    // Track onChange listeners to enable removeListener functionality
    const changeListeners = new Map();
    const reset = () => {
        // When resetting the state, the default state may be a function - unwrap it to invoke it.
        // otherwise, the state won't be properly reset
        states = new Map(Object.entries(unwrap(defaultState) ?? {}));
        handlers.reset.forEach((cb) => cb());
    };
    const dispose = () => {
        // Call first dispose as resetting the state would
        // cause less updates ;)
        handlers.dispose.forEach((cb) => cb());
        reset();
    };
    const get = (propName) => {
        handlers.get.forEach((cb) => cb(propName));
        return states.get(propName);
    };
    const set = (propName, value) => {
        const oldValue = states.get(propName);
        if (shouldUpdate(value, oldValue, propName)) {
            states.set(propName, value);
            handlers.set.forEach((cb) => cb(propName, value, oldValue));
        }
    };
    const state = (typeof Proxy === 'undefined'
        ? {}
        : new Proxy(unwrappedState, {
            get(_, propName) {
                return get(propName);
            },
            ownKeys(_) {
                return Array.from(states.keys());
            },
            getOwnPropertyDescriptor() {
                return {
                    enumerable: true,
                    configurable: true,
                };
            },
            has(_, propName) {
                return states.has(propName);
            },
            set(_, propName, value) {
                set(propName, value);
                return true;
            },
        }));
    const on = (eventName, callback) => {
        handlers[eventName].push(callback);
        return () => {
            removeFromArray(handlers[eventName], callback);
        };
    };
    const onChange = (propName, cb) => {
        const setHandler = (key, newValue) => {
            if (key === propName) {
                cb(newValue);
            }
        };
        const resetHandler = () => cb(unwrap(defaultState)[propName]);
        // Register the handlers
        const unSet = on('set', setHandler);
        const unReset = on('reset', resetHandler);
        // Track the relationship between the user callback and internal handlers
        changeListeners.set(cb, { setHandler, resetHandler, propName });
        return () => {
            unSet();
            unReset();
            changeListeners.delete(cb);
        };
    };
    const use = (...subscriptions) => {
        const unsubs = subscriptions.reduce((unsubs, subscription) => {
            if (subscription.set) {
                unsubs.push(on('set', subscription.set));
            }
            if (subscription.get) {
                unsubs.push(on('get', subscription.get));
            }
            if (subscription.reset) {
                unsubs.push(on('reset', subscription.reset));
            }
            if (subscription.dispose) {
                unsubs.push(on('dispose', subscription.dispose));
            }
            return unsubs;
        }, []);
        return () => unsubs.forEach((unsub) => unsub());
    };
    const forceUpdate = (key) => {
        const oldValue = states.get(key);
        handlers.set.forEach((cb) => cb(key, oldValue, oldValue));
    };
    const removeListener = (propName, listener) => {
        const listenerInfo = changeListeners.get(listener);
        if (listenerInfo && listenerInfo.propName === propName) {
            // Remove the specific handlers that were created for this listener
            removeFromArray(handlers.set, listenerInfo.setHandler);
            removeFromArray(handlers.reset, listenerInfo.resetHandler);
            changeListeners.delete(listener);
        }
    };
    return {
        state,
        get,
        set,
        on,
        onChange,
        use,
        dispose,
        reset,
        forceUpdate,
        removeListener,
    };
};
const removeFromArray = (array, item) => {
    const index = array.indexOf(item);
    if (index >= 0) {
        array[index] = array[array.length - 1];
        array.length--;
    }
};

const createStore = (defaultState, shouldUpdate) => {
    const map = createObservableMap(defaultState, shouldUpdate);
    map.use(stencilSubscription());
    return map;
};

const initialInternalState = {
    flags: undefined,
    config: undefined,
    auth: undefined,
    context: undefined,
    tags: undefined,
    fatalInitialisationError: undefined,
    initialisationStatus: undefined,
};
let store;
const initialiseStore = () => {
    store = createStore(() => (Object.assign({}, initialInternalState)), (newValue, oldValue) => JSON.stringify(newValue) !== JSON.stringify(oldValue));
    store.use({
        set: (key, newValue) => {
            _console.debug("Store", `Setting ${key}`, newValue === null || newValue === void 0 ? void 0 : newValue.toString());
            if (key === "initialisationStatus") {
                return;
            }
            if (key === "fatalInitialisationError" && !!newValue) {
                store.state.initialisationStatus = "broken";
                return;
            }
            const allStateKnown = Object.keys(store.state)
                .filter((key) => key !== "initialisationStatus" && key != "fatalInitialisationError")
                .every(key => !!store.state[key]);
            const noError = !store.state.fatalInitialisationError;
            if (allStateKnown && noError) {
                store.state.initialisationStatus = "ready";
            }
        },
        reset: () => {
            throw new Error("We do not support resetting state - the initiation of state is done only in the startup of the app");
        },
    });
};
const registerToStore = (arg) => {
    Object.keys(arg).forEach(key => store.set(key, arg[key]));
};
const readyState = (...keys) => {
    const keysToCheck = keys.length === 0 ? Object.keys(store.state) : keys;
    for (const key of keysToCheck) {
        if (store.state[key] === undefined) {
            return false;
        }
    }
    const result = {};
    for (const key of keysToCheck) {
        result[key] = store.state[key];
    }
    return result;
};
const rawState = () => store.state;

const shouldEnableAccessibilityMode = ({ flags }) => flags.isOverrideMode;
const shouldShowGovUkRebrand = ({ config }) => !!config.SHOW_GOVUK_REBRAND;
const shouldShowMenu = ({ config: { SHOW_MENU, FEATURE_FLAG_ENABLE_MENU_GROUP }, auth }) => !!SHOW_MENU && !!FEATURE_FLAG_ENABLE_MENU_GROUP && auth.isAuthed && auth.groups.includes(FEATURE_FLAG_ENABLE_MENU_GROUP);
const surveyLink = ({ config }) => ({ showLink: !!config.SURVEY_LINK, url: config.SURVEY_LINK });
const FLAGS = {
    shouldEnableAccessibilityMode: withLogging("shouldEnableAccessibilityMode", shouldEnableAccessibilityMode),
    shouldShowGovUkRebrand: withLogging("shouldShowGovUkRebrand", shouldShowGovUkRebrand),
    shouldShowMenu: withLogging("shouldShowMenu", shouldShowMenu),
    surveyLink: withLogging("surveyLink", surveyLink),
};

export { FLAGS as F, rawState as a, readyState as b, initialiseStore as i, registerToStore as r, withLogging as w };
//# sourceMappingURL=p-BuDlXMd2.js.map

//# sourceMappingURL=p-BuDlXMd2.js.map