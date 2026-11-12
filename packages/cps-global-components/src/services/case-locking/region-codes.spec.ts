import { CASE_LOCKING_REGION_CODES } from "cps-global-configuration";
import { CCPKinds } from "cps-global-presence";

// Config validates caseLockingRegion.code against its own list, because the
// configuration package depends on nothing but zod. This holds that list to the
// shared table every client names its sections from.
describe("caseLockingRegion codes", () => {
  it("are the shared section kinds, in lower case", () => {
    expect([...CASE_LOCKING_REGION_CODES].sort()).toEqual(
      Object.values(CCPKinds)
        .map(kind => kind.toLowerCase())
        .sort(),
    );
  });
});
