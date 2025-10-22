import { AuthResult } from "../auth/AuthResult";
import { FoundContext } from "../context/find-context";

export const handleContextAuthorisation = ({ window: { location }, context, auth }: { window: Window; context: FoundContext; auth: AuthResult }) => {
  if (!context.found) {
    // We have no context so cannot make a determination
    return {
      isRedirecting: false,
    };
  }

  if (!context.authorisation) {
    // This context has no authorisation rule
    return {
      isRedirecting: false,
    };
  }

  if (auth.isAuthed && auth.groups.includes(context.authorisation.adGroup)) {
    // This context has an authorisation rule that is satisfied
    return {
      isRedirecting: false,
    };
  }

  // Otherwise we are either not authed when the context requires authorisation
  //  or our user does not have the required AD group
  location.replace(context.authorisation.unAuthedRedirectUrl);
  return { isRedirecting: true };
};
