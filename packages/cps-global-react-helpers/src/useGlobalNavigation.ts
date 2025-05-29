import { GLOBAL_EVENT_NAME } from "cps-global-core";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

type GlobalNavigationEvent = CustomEventInit<string>;

export const useGlobalNavigation = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: GlobalNavigationEvent) => navigate(event.detail!);

    window.addEventListener(GLOBAL_EVENT_NAME, handler);
    return () => window.removeEventListener(GLOBAL_EVENT_NAME, handler);
  }, []);
};
