import { Register } from "../../store/store";
import { CaseLockingPresentSection } from "../case-locking/CaseLockingPresentUsers";
import { makeConsole } from "../../logging/makeConsole";

/**
 * A console handle on the store, for local development only.
 *
 * WHY THIS EXISTS
 * Some state is reachable only through a chain we cannot run at `pnpm dev`:
 * case-locking presence needs a config URL, an authenticated MSAL user, a live
 * SignalR hub AND a second human on the same case before the UI has anything to
 * render. But the components themselves read one value — caseLockingPresentUsers
 * — and are otherwise pure. Writing that value directly gets the UI on screen in
 * a second, and (more useful) lets us produce the states that are awkward to
 * arrange with real people: five users, two sections at once, a member with no
 * joinedAt, or a new section arriving after the interruption was dismissed.
 *
 * WHY IT IS SAFE
 * Called only when flags.isLocalDevelopment — localhost or a devtunnel. It is
 * still compiled into the production bundle, so it deliberately holds no
 * secrets, no endpoints and no logic beyond writing to the store; everything it
 * does is something the deployed app already does for itself.
 */
type Props = {
  window: Window;
  register: Register;
};

const APP_NAME = "Dev";

const { _log } = makeConsole("devStore");

export const exposeDevStore = ({ window, register }: Props) => {
  // A whole roster in one call, for the common case of "show me the UI":
  //   __cps.presence("a.person@cps.gov.uk", "b.person@cps.gov.uk")
  const presence = (...users: string[]) =>
    register({
      caseLockingPresentUsers: users.length
        ? {
            sections: [
              {
                code: "case",
                users: users.map(user => ({ user, appName: APP_NAME, joinedAt: new Date().toISOString() })),
              },
            ],
          }
        : undefined,
    });

  // The full shape, for section combinations and missing joinedAt:
  //   __cps.sections([{ code: "witness", users: [{ user: "a@b", appName: "CMS" }] }])
  const sections = (next: CaseLockingPresentSection[]) => register({ caseLockingPresentUsers: next.length ? { sections: next } : undefined });

  const clear = () => register({ caseLockingPresentUsers: undefined });

  (window as any).__cps = { register, presence, sections, clear };

  _log("__cps ready — try __cps.presence('a.person@cps.gov.uk'), __cps.sections([...]), __cps.clear()");
};
