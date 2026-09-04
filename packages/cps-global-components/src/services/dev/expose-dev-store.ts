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
  const roster = (users: string[], wasOccupiedOnEntry: boolean) =>
    register({
      caseLockingPresentUsers: users.length
        ? {
            sections: [
              {
                code: "case",
                users: users.map(user => ({ user, appName: APP_NAME, joinedAt: new Date().toISOString() })),
                occupiedOnEntry: wasOccupiedOnEntry,
              },
            ],
          }
        : undefined,
    });

  // The two devices, which differ only by whether the section was already
  // occupied when we arrived — the one thing that is genuinely awkward to stage
  // with real people, since it needs two users and correct timing.
  //
  //   __cps.presence("a.person@cps.gov.uk")   we walked in on them -> interruption
  //   __cps.arrives("a.person@cps.gov.uk")    they joined after us -> banner only
  const presence = (...users: string[]) => roster(users, true);
  const arrives = (...users: string[]) => roster(users, false);

  // The full shape, for section combinations and missing joinedAt:
  //   __cps.sections([{ code: "witness", users: [{ user: "a@b", appName: "CMS" }] }])
  const sections = (next: CaseLockingPresentSection[]) => register({ caseLockingPresentUsers: next.length ? { sections: next } : undefined });

  const clear = () => register({ caseLockingPresentUsers: undefined });

  (window as any).__cps = { register, presence, arrives, sections, clear };

  _log("__cps ready — presence(...) interrupts, arrives(...) shows the banner only; also sections([...]) and clear()");
};
