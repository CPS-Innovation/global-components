import { AuthResult, Config, FEATURE_FLAGS, Preview } from "cps-global-configuration";
import { Register } from "../../store/store";
import { Result } from "../../utils/Result";
import { RegionEnterEvent, RegionLeaveEvent, RegionDetail } from "../../components/cps-global-locking-region/region-events";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { GetToken } from "../auth/GetToken";
import { createCaseLockingPresence, CaseLockingPresenceService } from "./case-locking-presence";
import { createWitnessAreaSubscriber } from "./witness-area-subscriber";
import { makeConsole } from "../../logging/makeConsole";

type Props = {
  window: Window;
  config: Config;
  preview: Result<Preview>;
  register: Register;
};

const APP_NAME = "Work Management App";

const { _debug } = makeConsole("initialiseCaseLocking");

export const initialiseCaseLocking = ({ window, config, preview, register }: Props) => {
  const apiUrl = config.CASE_LOCKING_API_URL;
  _debug("initialise", { apiUrl });

  if (!apiUrl) {
    _debug("no CASE_LOCKING_API_URL — case-locking subscriber & service inert");
    return {
      initialiseCaseLockingForContext: (_args: { auth: AuthResult; caseIdentifiers: CaseIdentifiers | undefined; getToken: GetToken }) => {},
      witnessAreaSubscriber: createWitnessAreaSubscriber(false),
    };
  }

  let presence: CaseLockingPresenceService | null = null;
  // Regions on screen, ref-counted by SECTION IDENTITY (code + subject) rather
  // than by code, so two witness regions for different people are two sections and
  // two regions for the same person are one.
  const regionKey = (code: string, subjectId?: string) => (subjectId ? `${code}:${subjectId}` : code);
  const refCounts = new Map<string, number>();
  const activeRegions = new Map<string, { code: string; subjectId?: string }>();

  const onEnter = (event: Event) => {
    const { code, subjectId } = (event as RegionEnterEvent).detail as RegionDetail;
    const key = regionKey(code, subjectId);
    const next = (refCounts.get(key) ?? 0) + 1;
    refCounts.set(key, next);
    activeRegions.set(key, { code, subjectId });
    _debug("region enter", { key, code, subjectId, refCount: next });
    if (next === 1) {
      presence?.addRegion(code, subjectId);
    }
  };

  const onLeave = (event: Event) => {
    const { code, subjectId } = (event as RegionLeaveEvent).detail as RegionDetail;
    const key = regionKey(code, subjectId);
    const current = refCounts.get(key) ?? 0;
    if (current <= 1) {
      refCounts.delete(key);
      activeRegions.delete(key);
      _debug("region leave (last)", { key, code, subjectId });
      presence?.removeRegion(code, subjectId);
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
  }: {
    auth: AuthResult;
    caseIdentifiers: CaseIdentifiers | undefined;
    getToken: GetToken;
  }) => {
    const flagPasses = FEATURE_FLAGS.shouldEnableCaseLocking({ config, preview, auth, authHint: undefined });
    _debug("forContext", { isAuthed: auth.isAuthed, flagPasses, caseId: caseIdentifiers?.caseId, presenceCreated: !!presence });

    if (!presence && auth.isAuthed && flagPasses) {
      _debug("creating presence service for user", { username: auth.username });
      presence = createCaseLockingPresence({
        apiUrl,
        username: auth.username,
        appName: APP_NAME,
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
      });
      // Regions that appeared before auth completed. The case section needs no
      // replay — it follows setCaseId below.
      for (const { code, subjectId } of activeRegions.values()) {
        _debug("replaying buffered region into presence", { code, subjectId });
        presence.addRegion(code, subjectId);
      }
    }
    presence?.setCaseId(caseIdentifiers?.caseId);
  };

  return {
    initialiseCaseLockingForContext,
    witnessAreaSubscriber: createWitnessAreaSubscriber(true),
  };
};
