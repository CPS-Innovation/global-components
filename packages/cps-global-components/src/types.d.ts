/// <reference types="navigation-api-types" />

interface Window {
  // title case properties as we put these values straight
  // into analytics and that is the convention there
  cps_global_components_build?: { Branch: string; Sha: string; RunId: number; Timestamp: string };
}
