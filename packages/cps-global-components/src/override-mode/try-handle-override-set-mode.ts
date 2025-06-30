import { OVERRIDE_KEY, OVERRIDE_VALUE, REDIRECT_KEY } from "./constants";



const tryHandleOverrideSetMode = () => {
  const { searchParams } = new URL(window.location.href);
  const setFlag = searchParams.get(OVERRIDE_KEY);
  if (!setFlag) {
    return;
  }

  if (setFlag === OVERRIDE_VALUE) {
    localStorage.setItem(OVERRIDE_KEY, OVERRIDE_VALUE);
  } else {
    localStorage.removeItem(OVERRIDE_KEY);
  }

  const [nextUrl, ...remainingUrls] = searchParams.getAll(REDIRECT_KEY);
  if (!nextUrl) {
    return;
  }

  const url = new URL(nextUrl);
  url.searchParams.set(OVERRIDE_KEY, setFlag);
  remainingUrls.forEach(remainingUrl => url.searchParams.append(REDIRECT_KEY, remainingUrl));
  window.location.href = url.toString();
  return;
};

export { tryHandleOverrideSetMode };
