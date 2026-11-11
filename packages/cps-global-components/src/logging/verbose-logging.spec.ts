import { emitVerbose, MAX_BUFFERED_VERBOSE_LOGS, resetVerboseLoggingForTests, setVerboseLogging } from "./verbose-logging";

describe("verbose-logging", () => {
  beforeEach(() => {
    resetVerboseLoggingForTests();
  });

  it("buffers while pending and replays in order when switched on", () => {
    const calls: number[] = [];
    emitVerbose(() => calls.push(1));
    emitVerbose(() => calls.push(2));
    expect(calls).toEqual([]);

    setVerboseLogging(true);
    expect(calls).toEqual([1, 2]);

    emitVerbose(() => calls.push(3));
    expect(calls).toEqual([1, 2, 3]);
  });

  it("drops the buffer and stays quiet when switched off", () => {
    const emit = jest.fn();
    emitVerbose(emit);
    setVerboseLogging(false);
    emitVerbose(emit);
    expect(emit).not.toHaveBeenCalled();
  });

  it("keeps the first decision — a later off does not silence a local bundle", () => {
    setVerboseLogging(true);
    setVerboseLogging(false);
    const emit = jest.fn();
    emitVerbose(emit);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("keeps the first decision — a later on does not replay or enable", () => {
    const emit = jest.fn();
    emitVerbose(emit);
    setVerboseLogging(false);
    setVerboseLogging(true);
    emitVerbose(emit);
    expect(emit).not.toHaveBeenCalled();
  });

  it("caps the buffer while pending", () => {
    const emit = jest.fn();
    for (let i = 0; i < MAX_BUFFERED_VERBOSE_LOGS + 50; i++) {
      emitVerbose(emit);
    }
    setVerboseLogging(true);
    expect(emit).toHaveBeenCalledTimes(MAX_BUFFERED_VERBOSE_LOGS);
  });
});
