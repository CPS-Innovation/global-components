import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

type GlobalNavigationEvent = CustomEventInit<string>;

export const useGlobalNavigation = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: GlobalNavigationEvent) => navigate(event.detail!);

    window.addEventListener("cps-global-header-event", handler);
    return () => window.removeEventListener("cps-global-header-event", handler);
  }, []);
};
