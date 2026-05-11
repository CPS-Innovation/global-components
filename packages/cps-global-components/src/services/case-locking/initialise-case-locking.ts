import { Config, Preview } from "cps-global-configuration";
import { Register } from "../../store/store";
import { Result } from "../../utils/Result";
import { AuthResult } from "../auth/AuthResult";
import { RegionEnterEvent, RegionLeaveEvent, RegionDetail } from "../../components/cps-global-locking-region/region-events";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { createCaseLockingPresence, CaseLockingPresenceService } from "./case-locking-presence";
import { createWitnessAreaSubscriber } from "./witness-area-subscriber";
import { FEATURE_FLAGS } from "../../feature-flags/feature-flags";
import { makeConsole } from "../../logging/makeConsole";

type Props = {
  window: Window;
  config: Config;
  preview: Result<Preview>;
  register: Register;
};

const APP_NAME = "Global Components";

const { _debug } = makeConsole("initialiseCaseLocking");

export const initialiseCaseLocking = ({ window, config, preview, register }: Props) => {
  const apiUrl = config.CASE_LOCKING_API_URL;
  _debug("initialise", { apiUrl });

  if (!apiUrl) {
    _debug("no CASE_LOCKING_API_URL — case-locking subscriber & service inert");
    return {
      initialiseCaseLockingForContext: (_args: { auth: AuthResult; caseIdentifiers: CaseIdentifiers | undefined }) => {},
      witnessAreaSubscriber: createWitnessAreaSubscriber(false),
    };
  }

  let presence: CaseLockingPresenceService | null = null;
  const refCounts = new Map<string, number>();

  const onEnter = (event: Event) => {
    const { code } = (event as RegionEnterEvent).detail as RegionDetail;
    const next = (refCounts.get(code) ?? 0) + 1;
    refCounts.set(code, next);
    _debug("region enter", { code, refCount: next });
    if (next === 1) {
      presence?.addCode(code);
    }
  };

  const onLeave = (event: Event) => {
    const { code } = (event as RegionLeaveEvent).detail as RegionDetail;
    const current = refCounts.get(code) ?? 0;
    if (current <= 1) {
      refCounts.delete(code);
      _debug("region leave (last)", { code });
      presence?.removeCode(code);
    } else {
      refCounts.set(code, current - 1);
      _debug("region leave (still active)", { code, refCount: current - 1 });
    }
  };

  window.document.addEventListener(RegionEnterEvent.type, onEnter);
  window.document.addEventListener(RegionLeaveEvent.type, onLeave);
  _debug("region event listeners attached");

  const initialiseCaseLockingForContext = ({ auth, caseIdentifiers }: { auth: AuthResult; caseIdentifiers: CaseIdentifiers | undefined }) => {
    const flagPasses = FEATURE_FLAGS.shouldEnableCaseLocking({ config, preview, auth, authHint: undefined });
    _debug("forContext", { isAuthed: auth.isAuthed, flagPasses, caseId: caseIdentifiers?.caseId, presenceCreated: !!presence });

    if (!presence && auth.isAuthed && flagPasses) {
      _debug("creating presence service for user", { username: auth.username });
      presence = createCaseLockingPresence({
        apiUrl,
        username: auth.username,
        appName: APP_NAME,
        register,
      });
      for (const code of refCounts.keys()) {
        _debug("replaying buffered code into presence", { code });
        presence.addCode(code);
      }
    }
    presence?.setCaseId(caseIdentifiers?.caseId);
  };

  return {
    initialiseCaseLockingForContext,
    witnessAreaSubscriber: createWitnessAreaSubscriber(true),
  };
};
