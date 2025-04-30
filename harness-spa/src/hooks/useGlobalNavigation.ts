import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const GLOBAL_EVENT_NAME = "cps-global-header-event";
type GlobalNavigationEvent = CustomEventInit<string>;

export const useGlobalNavigation = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: GlobalNavigationEvent) => navigate(event.detail!);

    window.addEventListener(GLOBAL_EVENT_NAME, handler);
    return () => window.removeEventListener(GLOBAL_EVENT_NAME, handler);
  }, []);
};
