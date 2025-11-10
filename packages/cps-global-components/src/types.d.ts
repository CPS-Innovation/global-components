/// <reference types="navigation-api-types" />

interface Window {
  cps_global_components_build?: // title case properties as we put these values straight
  // into analytics and that is the convention there
  { Branch: string; Sha: string; RunId: number; Timestamp: string };
}
