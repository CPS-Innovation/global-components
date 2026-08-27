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
}
declare namespace CCPRoster {
    /**
     * A roster: apply the API's notifications, ask who is present.
     * @returns {{
     *   apply: function(CCPNotification[]|null|undefined): boolean,
     *   people: function(): CCPPerson[],
     *   describe: function(): string,
     *   sections: function(): Object,
     *   clear: function(): void
     * }}
     */
    function createRoster(): {
        apply: (arg0: CCPNotification[] | null | undefined) => boolean;
        people: () => CCPPerson[];
        describe: () => string;
        sections: () => any;
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
