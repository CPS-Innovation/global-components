import { trackPageViewAsync } from "../../analytics";

let initiated = false;

// The idea here is that multiple consumers can request tracking but we only
//  need it once. The different consumers do not need to know about each other
//  in this approach.
export const initiateTracking = () => {
  if (initiated) {
    return;
  }
  initiated = true;
  trackPageViewAsync();
  // todo: this is a singleton so disposing of the listener isn't currently
  //  a priority (and we should always be here on the page till the bitter end)
  window.navigation.addEventListener("navigate", trackPageViewAsync);
};
