/**
 * window[name] = value, spelled out because TypeScript objects otherwise: the DOM
 * lib types a string index on Window as a named frame, not an arbitrary value.
 * JSONP callbacks MUST be real top-level globals — the njs adapter reflects the
 * name verbatim and rejects anything but a bare identifier — so this is a
 * deliberate use of the global namespace, not an accident.
 * @param {string} name
 * @param {*} value
 */
declare function setGlobalCallback(name: string, value: any): void;
declare namespace CCPJsonp {
    /**
     * Build the JSONP caller. Returns call(op, params, onData); onData receives the
     * executed object/array, or null when the call timed out.
     * @param {{base: string, appName: string, timeoutMs?: number, log?: function(...*): void}} options
     * @returns {function(string, Object, function(*): void): void}
     */
    function createJsonp(options: {
        base: string;
        appName: string;
        timeoutMs?: number;
        log?: (...args: any[]) => void;
    }): (arg0: string, arg1: any, arg2: (arg0: any) => void) => void;
}
declare namespace CCPLocator {
    /**
     * Normalise the parts of a section into the shape everything downstream expects.
     * Returns null when there is no identifiable section, so a detector can simply
     * `return CCPLocator.section(...)` and let a missing caseId mean "not here".
     *
     * @param {string|number|null|undefined} caseId
     * @param {string|null|undefined} kind
     * @param {string|number|null=} subjectId
     * @param {*=} hint app-specific payload, passed through untouched
     * @returns {{id: string, caseId: string, kind: string, subjectId: string, hint: *}|null}
     */
    function section(caseId: string | number | null | undefined, kind: string | null | undefined, subjectId?: (string | number | null) | undefined, hint?: any | undefined): {
        id: string;
        caseId: string;
        kind: string;
        subjectId: string;
        hint: any;
    } | null;
    /**
     * A detector driven entirely by the page URL — the whole story for Modern and DCF,
     * where the address IS the context: on /dcf/ you are reviewing a case, and in the
     * viewer you are on one.
     *
     * @param {{kind: string, pattern: RegExp, caseIdGroup?: number, subjectIdGroup?: number,
     *          hint?: *}} spec
     * @returns {{kind: string, detect: function(*): Object|null}}
     */
    function urlDetector(spec: {
        kind: string;
        pattern: RegExp;
        caseIdGroup?: number;
        subjectIdGroup?: number;
        hint?: any;
    }): {
        kind: string;
        detect: (arg0: any) => any | null;
    };
    /**
     * Build a locator over a list of detectors.
     *
     * @param {{kind: string, detect: function(*): (Object|Object[]|null)}[]} detectors
     * @returns {{list: function(*): Object[], ids: function(*): string[]}}
     */
    function createLocator(detectors: {
        kind: string;
        detect: (arg0: any) => (any | any[] | null);
    }[]): {
        list: (arg0: any) => any[];
        ids: (arg0: any) => string[];
    };
}
declare namespace CCPOrigin {
    /**
     * The origin of the <script> tag whose src contains `marker`.
     * @param {string} marker a distinctive part of our own script's filename
     * @returns {string} e.g. "https://polaris-uat-notprod.cps.gov.uk", or "" if not found
     */
    function scriptOrigin(marker: string): string;
    /**
     * An absolute URL for one of our endpoints, on whichever host served this script.
     * @param {string} marker a distinctive part of our own script's filename
     * @param {string} path an absolute path, e.g. "/global-components/presence-jsonp"
     * @returns {string} the absolute URL, or `path` unchanged when the tag is not found
     */
    function resolve(marker: string, path: string): string;
    /**
     * The URL of a file served ALONGSIDE this script — same host and same directory.
     *
     * `resolve` is for endpoints, whose paths are fixed and known. This is for our own
     * sibling assets, whose directory is not: the client is deployed under a per-
     * environment prefix ("/global-components/uat/…", "/global-components/test/…")
     * that the script cannot know and must not hard-code. Taking the directory from
     * our own tag means a bundle deployed anywhere finds its siblings.
     *
     * NOT CURRENTLY CALLED by the shipping client: its only consumer was the on-demand
     * SignalR bundle, now archived under reference/signalr-presence-transport/. Kept
     * because any second artefact needs exactly this, and it is cheap and tested.
     *
     * @param {string} marker a distinctive part of our own script's filename
     * @param {string} filename e.g. "cms-presence-extra.js"
     * @returns {string} the absolute URL, or `filename` unchanged when the tag is not found
     */
    function sibling(marker: string, filename: string): string;
}
declare namespace CCPRoster {
    /**
     * A roster: apply the API's notifications, ask who is present.
     * @returns {{
     *   apply: function(CCPNotification[]|null|undefined): boolean,
     *   people: function(): CCPPerson[],
     *   describe: function(): string,
     *   sections: function(): Object,
     *   forget: function(string): boolean,
     *   clear: function(): void
     * }}
     */
    function createRoster(): {
        apply: (arg0: CCPNotification[] | null | undefined) => boolean;
        people: () => CCPPerson[];
        describe: () => string;
        sections: () => any;
        forget: (arg0: string) => boolean;
        clear: () => void;
    };
}
declare namespace CCPSections {
    /**
     * A section id as the presence API expects it. Case-wide kinds carry NO subject
     * and NO trailing colon — "544545:CASE", not "544545:CASE:" — while
     * subject-scoped kinds append theirs: "544545:VICTIM_WITNESS:98765".
     * @param {string|number|null|undefined} caseId
     * @param {string|null|undefined} kind
     * @param {string|number|null=} subjectId
     * @returns {string|null} null when there is no case or kind to name
     */
    function sectionId(caseId: string | number | null | undefined, kind: string | null | undefined, subjectId?: (string | number | null) | undefined): string | null;
    /**
     * The same identity, derived from a snapshot's section object rather than parts.
     * Used to key the roster cache, so it MUST agree with sectionId above.
     * @param {CCPSection|null|undefined} section
     * @returns {string} "" when the section cannot be identified
     */
    function sectionKey(section: CCPSection | null | undefined): string;
    /**
     * Array.prototype.indexOf does not exist at document mode 5.
     * @param {string[]} list
     * @param {string} value
     * @returns {number} the index, or -1
     */
    function indexOfString(list: string[], value: string): number;
}
declare namespace CCPSessions {
    /**
     * @param {{call: function(string, Object, function(*): void): void,
     *          appName: string, tickMs: number,
     *          log: function(...*): void, verbose: function(): boolean,
     *          onNotifications: function(Array): void,
     *          onSectionDropped: function(string): void,
     *          dropSectionOnError?: boolean,
     *          onFatal?: function(string, string): void}} options
     * @returns {{setDesired: function(string[]): void, stop: function(): void,
     *            ids: function(): string[], stats: function(): Object}}
     */
    function createSessions(options: {
        call: (arg0: string, arg1: any, arg2: (arg0: any) => void) => void;
        appName: string;
        tickMs: number;
        log: (...args: any[]) => void;
        verbose: () => boolean;
        onNotifications: (arg0: any[]) => void;
        onSectionDropped: (arg0: string) => void;
        dropSectionOnError?: boolean;
        onFatal?: (arg0: string, arg1: string) => void;
    }): {
        setDesired: (arg0: string[]) => void;
        stop: () => void;
        ids: () => string[];
        stats: () => any;
    };
}
