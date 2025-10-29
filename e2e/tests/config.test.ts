import { act } from "../helpers/act";
import { arrange } from "../helpers/arrange";
import { locators as L } from "../helpers/constants";

describe("Config", () => {
  it("shows an error when config breaks", async () => {
    // we do not set config via arrange so it breaks

    const header = await act();

    await expect(header).toMatchElement(L.BANNER);
    await expect(header).toMatchElement(L.ERROR);
  });

  // Design decision here: let's say not having a context is ok. We will leave
  //  it to deeper components that may or may not appear in a given use case
  //  to check context and only throw if they are not happy
  it("should NOT show an error if there is no matching context", async () => {
    await arrange({ config: { CONTEXTS: [] } });

    const header = await act();

    await expect(header).toMatchElement(L.BANNER);
    await expect(header).not.toMatchElement(L.ERROR);
  });

  // Design decision here: let's say auth is not directly mandatory. If a deeper
  //  component needs it the it is up to it to throw or not render or whatever
  it("should NOT show an error if the user is not authenticated", async () => {
    await arrange({ auth: { isAuthed: false, adGroups: [] } });

    const header = await act();

    await expect(header).toMatchElement(L.BANNER);
    await expect(header).not.toMatchElement(L.ERROR);
  });
});
