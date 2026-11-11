import { AuthResult, CmsSessionHint, Config, FEATURE_FLAGS, FoundContext, Preview } from "cps-global-configuration";
import { CCPEnvironment } from "cps-global-presence";
import { Register } from "../../store/store";
import { Result } from "../../utils/Result";
import { RegionEnterEvent, RegionLeaveEvent, RegionDetail } from "../../components/cps-global-locking-region/region-events";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { GetToken } from "../auth/GetToken";
import { createCaseLockingPresence, CaseLockingPresenceService, PresenceRegion, regionKey } from "./case-locking-presence";
import { makeConsole } from "../../logging/makeConsole";

type Props = {
  window: Window;
  config: Config;
  preview: Result<Preview>;
  cmsSessionHint: Result<CmsSessionHint>;
  register: Register;
};

/**
 * What we register as when the matched context does not name an application.
 *
 * It is a legacy default, not a sensible one: every SPA registration used to send
 * this regardless of which OutSystems app the user was actually in, so two of the
 * three were misreported. Contexts now carry caseLockingAppName (see Config.ts) and
 * this exists only so an environment whose config has not been updated behaves as
 * it did rather than registering something the API would reject. Delete it once
 * every context names its app.
 */
const FALLBACK_APP_NAME = "Work Management App";

/**
 * The region our own header registers on every case page.
 *
 * It is a FALLBACK: something must claim presence before any host app has been
 * changed to say where in the case the user actually is. Any other region
 * supersedes it — see held().
 */
const CASE_REGION_CODE = "case";

const { _debug } = makeConsole("initialiseCaseLocking");

export const initialiseCaseLocking = ({ window, config, preview, cmsSessionHint, register }: Props) => {
  const apiUrl = config.CASE_LOCKING_API_URL;

  /* WHICH CMS INSTANCE'S PRESENCE DO WE JOIN?
   *
   * CIN2, CIN3 and CIN5 share one Watchdog and are kept apart by a suffix on the
   * section kind, so a client that names a section without the right one is
   * isolated in silence — no error, and a roster that is simply always empty.
   * The rule is CCPEnvironment's, shared with the two legacy CMS clients so all
   * three cannot drift; the SOURCE is ours, and it is the session hint we already
   * fetch at boot. It was a hardcoded "CIN3" in CCPEnvironment until 2026-11-04.
   *
   * ADOPTED ONCE, HERE, before anything can register: the hint is resolved by the
   * time global-script calls this, so unlike the legacy clients (which learn it
   * from an async whoami) there is nothing to wait for.
   *
   * NO HINT MEANS INERT, and that is the point of the check rather than an
   * oversight. Registering unsuffixed on a guess would put us in a room nobody
   * occupies, which on screen is indistinguishable from presence working on a
   * quiet case — the failure this whole mechanism exists to avoid. It bites local
   * development and OutSystems dev, where there is no CMS and therefore no hint
   * (see initialise-cms-session-hint): case locking is off there now, loudly,
   * where it used to register against QA's Watchdog under a hardcoded CIN3.
   */
  const cmsDomain = cmsSessionHint.found ? (cmsSessionHint.result.cmsDomains[0] ?? "") : "";
  const cmsEnv = CCPEnvironment.labelFor(cmsDomain);
  if (cmsEnv) {
    CCPEnvironment.adopt(cmsEnv);
  }
  _debug("initialise", { apiUrl, cmsDomain, cmsEnv, cin: CCPEnvironment.CIN });

  if (!apiUrl || !CCPEnvironment.known()) {
    if (apiUrl) {
      _debug("no CMS environment in the session hint — case-locking subscriber & service inert", { cmsDomain });
    } else {
      _debug("no CASE_LOCKING_API_URL — case-locking subscriber & service inert");
    }
    return {
      initialiseCaseLockingForContext: (_args: {
        auth: AuthResult;
        caseIdentifiers: CaseIdentifiers | undefined;
        getToken: GetToken;
        context: FoundContext;
        onPresenceChanged?: () => void;
      }) => {},
    };
  }

  let presence: CaseLockingPresenceService | null = null;
  // Regions on screen, ref-counted by SECTION IDENTITY (code + subject) rather
  // than by code, so two witness regions for different people are two sections and
  // two regions for the same person are one.
  const onScreen = new Map<string, { region: PresenceRegion; count: number }>();

  /**
   * THE MORE SPECIFIC REGION WINS.
   *
   * Our header registers a case-wide region on every case page, because something
   * must claim presence before any host app has been changed to say where in the
   * case you are. As soon as a region for an actual section appears anywhere in the
   * DOM, that section is what we hold and the case-wide one stands down; when the
   * last specific region goes, the fallback comes back.
   *
   * They cannot both be held: a case-wide session already hears about every
   * section of its case, so holding both would register us twice for one presence
   * and report us to other users as two people.
   */
  const held = (): PresenceRegion[] => {
    const all = Array.from(onScreen.values()).map(({ region }) => region);
    const specific = all.filter(region => region.code !== CASE_REGION_CODE);
    return specific.length ? specific : all;
  };

  const apply = () => {
    const regions = held();
    _debug("holding regions", { regions });
    presence?.setRegions(regions);
  };

  const onEnter = (event: Event) => {
    const { code, subjectId } = (event as RegionEnterEvent).detail as RegionDetail;
    const key = regionKey({ code, subjectId });
    const count = (onScreen.get(key)?.count ?? 0) + 1;
    onScreen.set(key, { region: { code, subjectId }, count });
    _debug("region enter", { key, count });
    apply();
  };

  const onLeave = (event: Event) => {
    const { code, subjectId } = (event as RegionLeaveEvent).detail as RegionDetail;
    const key = regionKey({ code, subjectId });
    const entry = onScreen.get(key);
    if (!entry) {
      return;
    }
    entry.count -= 1;
    _debug("region leave", { key, count: entry.count });
    if (entry.count <= 0) {
      onScreen.delete(key);
      apply();
    }
  };

  window.document.addEventListener(RegionEnterEvent.type, onEnter);
  window.document.addEventListener(RegionLeaveEvent.type, onLeave);
  _debug("region event listeners attached");

  const initialiseCaseLockingForContext = ({
    auth,
    caseIdentifiers,
    getToken,
    context,
    onPresenceChanged,
  }: {
    auth: AuthResult;
    caseIdentifiers: CaseIdentifiers | undefined;
    getToken: GetToken;
    context: FoundContext;
    onPresenceChanged?: () => void;
  }) => {
    // WHICH APP ARE WE? The context tree knows: it is the same structure that
    // already decides what a URL means, so the app a path belongs to is recorded
    // there rather than inferred here. Read on every context pass, but only ever
    // used at creation below — crossing between apps is a page load, not an SPA
    // navigation, so the value cannot change under a live presence service.
    const appName = (context.found && context.caseLockingAppName) || FALLBACK_APP_NAME;
    const flagPasses = FEATURE_FLAGS.shouldEnableCaseLocking({ config, preview, auth, authHint: undefined });
    _debug("forContext", { isAuthed: auth.isAuthed, flagPasses, caseId: caseIdentifiers?.caseId, presenceCreated: !!presence });

    if (!presence && auth.isAuthed && flagPasses) {
      _debug("creating presence service for user", { username: auth.username });
      presence = createCaseLockingPresence({
        apiUrl,
        username: auth.username,
        appName,
        register,
        // The presence API's OWN scope, not the gateway scopes: one token has one
        // audience, and AD_GATEWAY_SCOPES asks for Microsoft Graph. The presence
        // API is the same app registration this SPA signs in with, so this yields
        // the same token the legacy CMS clients already send.
        //
        // GetToken takes its scopes under an AD_GATEWAY_SCOPES key for historical
        // reasons; it uses whatever array it is handed. An unset config means an
        // empty array, which makes getToken return null and presence send no
        // Authorization header at all — the right failure for a guest component
        // that must never trigger an interactive consent prompt.
        getAccessToken: () => getToken({ config: { AD_GATEWAY_SCOPES: config.CASE_LOCKING_SCOPES ?? [] } }),
        // EVERY PRESENCE CHANGE RE-READS THE LOCK, on every page that shows one.
        //
        // This was briefly gated to interruption-worthy sections, to spare the
        // case-summary endpoint. That was wrong, and wrong in the worst direction:
        // the banner shows the lock on EVERY case page, so on a case-wide page the
        // lock was read once at load and never again — someone unlocking and leaving
        // Classic left a lock statement on screen that could not go away. A stale
        // "this case is locked" is worse than none: it is the one thing here a
        // reader would act on, and acting on it is wasted when it is untrue.
        //
        // The cost is smaller than it looks. This fires only when the SET of people
        // changes, never on the keepalive republishes that make up almost all
        // presence traffic, so it is one call per arrival or departure — which, for
        // a Classic arrival or departure, IS the lock changing hands.
        onClassicPresenceChanged: () => {
          _debug("Classic presence changed — re-reading the lock");
          onPresenceChanged?.();
        },
      });
      // Regions that appeared before auth completed.
      apply();
    }
    presence?.setCaseId(caseIdentifiers?.caseId);
  };

  return {
    initialiseCaseLockingForContext,
  };
};
