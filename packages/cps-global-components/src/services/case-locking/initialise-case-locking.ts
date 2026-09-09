import { AuthResult, Config, FEATURE_FLAGS, FoundContext, Preview } from "cps-global-configuration";
import { Register } from "../../store/store";
import { Result } from "../../utils/Result";
import { RegionEnterEvent, RegionLeaveEvent, RegionDetail } from "../../components/cps-global-locking-region/region-events";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { GetToken } from "../auth/GetToken";
import { createCaseLockingPresence, CaseLockingPresenceService } from "./case-locking-presence";
import { makeConsole } from "../../logging/makeConsole";

type Props = {
  window: Window;
  config: Config;
  preview: Result<Preview>;
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
 * supersedes it — see applyDesired.
 */
const CASE_REGION_CODE = "case";

const { _debug } = makeConsole("initialiseCaseLocking");

export const initialiseCaseLocking = ({ window, config, preview, register }: Props) => {
  const apiUrl = config.CASE_LOCKING_API_URL;
  _debug("initialise", { apiUrl });

  if (!apiUrl) {
    _debug("no CASE_LOCKING_API_URL — case-locking subscriber & service inert");
    return {
      initialiseCaseLockingForContext: (_args: { auth: AuthResult; caseIdentifiers: CaseIdentifiers | undefined; getToken: GetToken; context: FoundContext }) => {},
    };
  }

  let presence: CaseLockingPresenceService | null = null;
  // Regions on screen, ref-counted by SECTION IDENTITY (code + subject) rather
  // than by code, so two witness regions for different people are two sections and
  // two regions for the same person are one.
  const regionKey = (code: string, subjectId?: string) => (subjectId ? `${code}:${subjectId}` : code);
  const refCounts = new Map<string, number>();
  const activeRegions = new Map<string, { code: string; subjectId?: string }>();
  // Only needed to stand down a region whose parts we have already forgotten.
  const parseRegionKey = (key: string): [string, string | undefined] => {
    const at = key.indexOf(":");
    return at === -1 ? [key, undefined] : [key.slice(0, at), key.slice(at + 1)];
  };

  /**
   * THE MORE SPECIFIC REGION WINS.
   *
   * Our header registers a case-wide region on every case page, because something
   * must claim presence before any host app has been changed to say where in the
   * case you are. As soon as a region for an actual section appears anywhere in the
   * DOM, that section is what we hold and the case-wide one stands down; when the
   * last specific region goes, the fallback comes back.
   *
   * They cannot both be held. A case-wide session already receives notifications for
   * every section of its case (see applyNotification), so holding both would
   * register us twice for one presence and report us to other users as two people.
   *
   * Computed from the whole active set rather than decided per event, because the
   * answer depends on what else is on screen: an enter can retire a region, and a
   * leave can bring one back.
   */
  const applied = new Set<string>();

  const applyDesired = () => {
    const active = Array.from(activeRegions.entries());
    const specific = active.filter(([, region]) => region.code !== CASE_REGION_CODE);
    const desired = new Map(specific.length ? specific : active);

    Array.from(applied).forEach(key => {
      if (desired.has(key)) {
        return;
      }
      const region = activeRegions.get(key);
      const [code, subjectId] = region ? [region.code, region.subjectId] : parseRegionKey(key);
      _debug("standing down region", { key });
      presence?.removeRegion(code, subjectId);
      applied.delete(key);
    });
    desired.forEach((region, key) => {
      if (applied.has(key)) {
        return;
      }
      _debug("holding region", { key, code: region.code, subjectId: region.subjectId });
      presence?.addRegion(region.code, region.subjectId);
      applied.add(key);
    });
  };

  const onEnter = (event: Event) => {
    const { code, subjectId } = (event as RegionEnterEvent).detail as RegionDetail;
    const key = regionKey(code, subjectId);
    const next = (refCounts.get(key) ?? 0) + 1;
    refCounts.set(key, next);
    activeRegions.set(key, { code, subjectId });
    _debug("region enter", { key, code, subjectId, refCount: next });
    applyDesired();
  };

  const onLeave = (event: Event) => {
    const { code, subjectId } = (event as RegionLeaveEvent).detail as RegionDetail;
    const key = regionKey(code, subjectId);
    const current = refCounts.get(key) ?? 0;
    if (current <= 1) {
      refCounts.delete(key);
      activeRegions.delete(key);
      _debug("region leave (last)", { key, code, subjectId });
      applyDesired();
    } else {
      refCounts.set(key, current - 1);
      _debug("region leave (still active)", { key, refCount: current - 1 });
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
  }: {
    auth: AuthResult;
    caseIdentifiers: CaseIdentifiers | undefined;
    getToken: GetToken;
    context: FoundContext;
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
        // Read once, at construction: a preview change takes effect on reload,
        // which is fine for a development switch.
        countSelf: FEATURE_FLAGS.shouldCountSelfInCaseLocking({ config, preview, auth, authHint: undefined }),
      });
      // Regions that appeared before auth completed. Replayed through the same rule
      // rather than added wholesale, or a page that already had a specific region on
      // screen would register the case-wide fallback alongside it.
      applied.clear();
      applyDesired();
    }
    presence?.setCaseId(caseIdentifiers?.caseId);
  };

  return {
    initialiseCaseLockingForContext,
  };
};
