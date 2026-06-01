import { Config, Preview } from "cps-global-configuration";
import { Result } from "../../utils/Result";
import { TrackEvent } from "../analytics/analytics-event";
import { coerceValue, initialiseRequestObservationShim, readCoercedQueryParams } from "./initialise-request-observation-shim";

const ACTIVATION_URL = "https://acme.outsystemsenterprise.com/WorkManagementApp/Triage?CaseId=2170327&TaskId=2265639";
const LISTEN_URL =
  "https://acme.outsystemsenterprise.com/WorkManagementApp/screenservices/WorkManagementApp/Triage/CheckDetails/ActionCompleteODReviewTask";
const LISTEN_URL_OD_TASK =
  "https://acme.outsystemsenterprise.com/WorkManagementApp/screenservices/WorkManagementApp/Triage/CheckDetails/ActionCompleteODTask";
const LISTEN_URL_DCP_TASK =
  "https://acme.outsystemsenterprise.com/WorkManagementApp/screenservices/WorkManagementApp/Triage/CheckDetails/ActionCompleteDCPTask";
const OTHER_POST_URL = "https://acme.outsystemsenterprise.com/WorkManagementApp/screenservices/WorkManagementApp/Triage/CheckDetails/Something";

const previewOn: Result<Preview> = { found: true, result: { requestObservationShim: true } };
const previewOff: Result<Preview> = { found: true, result: { requestObservationShim: false } };

const configOn = { OS_TRIAGE_REQUEST_OBSERVATION_ENABLED: true } as unknown as Config;
const configOff = { OS_TRIAGE_REQUEST_OBSERVATION_ENABLED: false } as unknown as Config;

const makeFakeXHR = () => {
  const open = jest.fn();
  const send = jest.fn();
  class FakeXHR {
    open(..._args: any[]) {
      open.apply(this, _args as any);
    }
    send(..._args: any[]) {
      send.apply(this, _args as any);
    }
  }
  return { FakeXHR, open, send };
};

const makeFakeWindow = (href: string, search: string, XMLHttpRequest: any): Window & typeof globalThis => {
  return {
    location: { href, search } as Location,
    XMLHttpRequest,
  } as unknown as Window & typeof globalThis;
};

describe("initialiseRequestObservationShim", () => {
  describe("activation gating", () => {
    it("does not patch when both gates are off", () => {
      const { FakeXHR, send } = makeFakeXHR();
      const window = makeFakeWindow(ACTIVATION_URL, "?CaseId=1", FakeXHR);
      const original = FakeXHR.prototype.send;

      initialiseRequestObservationShim({ window, config: configOff, preview: previewOff, trackEvent: jest.fn() });

      expect(FakeXHR.prototype.send).toBe(original);
      expect(send).not.toHaveBeenCalled();
    });

    it("patches when only the config kill-switch is on", () => {
      const { FakeXHR } = makeFakeXHR();
      const window = makeFakeWindow(ACTIVATION_URL, "?CaseId=1", FakeXHR);
      const original = FakeXHR.prototype.send;

      initialiseRequestObservationShim({ window, config: configOn, preview: previewOff, trackEvent: jest.fn() });

      expect(FakeXHR.prototype.send).not.toBe(original);
    });

    it("patches when only the preview flag is on", () => {
      const { FakeXHR } = makeFakeXHR();
      const window = makeFakeWindow(ACTIVATION_URL, "?CaseId=1", FakeXHR);
      const original = FakeXHR.prototype.send;

      initialiseRequestObservationShim({ window, config: configOff, preview: previewOn, trackEvent: jest.fn() });

      expect(FakeXHR.prototype.send).not.toBe(original);
    });

    it("does not patch when the page URL does not match the activation pattern", () => {
      const { FakeXHR } = makeFakeXHR();
      const window = makeFakeWindow("https://example.com/somewhere", "", FakeXHR);
      const original = FakeXHR.prototype.send;

      initialiseRequestObservationShim({ window, config: configOn, preview: previewOn, trackEvent: jest.fn() });

      expect(FakeXHR.prototype.send).toBe(original);
    });

    it("patches when both flags are on and the page URL matches", () => {
      const { FakeXHR } = makeFakeXHR();
      const window = makeFakeWindow(ACTIVATION_URL, "?CaseId=1", FakeXHR);
      const original = FakeXHR.prototype.send;

      initialiseRequestObservationShim({ window, config: configOn, preview: previewOn, trackEvent: jest.fn() });

      expect(FakeXHR.prototype.send).not.toBe(original);
    });

    it("does not throw and leaves the prototype intact when XHR.prototype is locked", () => {
      const { FakeXHR } = makeFakeXHR();
      const originalOpen = FakeXHR.prototype.open;
      const originalSend = FakeXHR.prototype.send;
      Object.defineProperty(FakeXHR.prototype, "open", { value: originalOpen, writable: false, configurable: false });
      Object.defineProperty(FakeXHR.prototype, "send", { value: originalSend, writable: false, configurable: false });
      const window = makeFakeWindow(ACTIVATION_URL, "?CaseId=1", FakeXHR);
      const trackEvent = jest.fn();

      expect(() => initialiseRequestObservationShim({ window, config: configOn, preview: previewOn, trackEvent })).not.toThrow();

      expect(FakeXHR.prototype.open).toBe(originalOpen);
      expect(FakeXHR.prototype.send).toBe(originalSend);

      const xhr: any = new FakeXHR();
      xhr.open("POST", LISTEN_URL);
      xhr.send(JSON.stringify({ inputParameters: { IsCPSD: true } }));
      expect(trackEvent).not.toHaveBeenCalled();
    });
  });

  describe("when shim is installed", () => {
    const installShim = (trackEvent: TrackEvent, search = "?CaseId=2170327&TaskId=2265639&TaskType=Priority+PCD+Review") => {
      const { FakeXHR, open, send } = makeFakeXHR();
      const window = makeFakeWindow(ACTIVATION_URL, search, FakeXHR);
      initialiseRequestObservationShim({ window, config: configOn, preview: previewOn, trackEvent });
      return { FakeXHR, open, send };
    };

    it("calls trackEvent with coerced query params and IsCPSD when a matching POST is sent", () => {
      const trackEvent = jest.fn();
      const { FakeXHR, open, send } = installShim(trackEvent);

      const xhr: any = new FakeXHR();
      xhr.open("POST", LISTEN_URL);
      xhr.send(JSON.stringify({ inputParameters: { IsCPSD: true } }));

      expect(open).toHaveBeenCalledWith("POST", LISTEN_URL);
      expect(send).toHaveBeenCalledWith(JSON.stringify({ inputParameters: { IsCPSD: true } }));
      expect(trackEvent).toHaveBeenCalledWith({
        name: "triage-submission",
        CaseId: 2170327,
        TaskId: 2265639,
        TaskType: "Priority PCD Review",
        IsCPSD: true,
      });
    });

    it("omits IsCPSD when missing from the body", () => {
      const trackEvent = jest.fn();
      const { FakeXHR } = installShim(trackEvent, "?CaseId=42");

      const xhr: any = new FakeXHR();
      xhr.open("POST", LISTEN_URL);
      xhr.send(JSON.stringify({ inputParameters: {} }));

      expect(trackEvent).toHaveBeenCalledWith({
        name: "triage-submission",
        CaseId: 42,
      });
    });

    it("does not call trackEvent for POSTs to other URLs", () => {
      const trackEvent = jest.fn();
      const { FakeXHR } = installShim(trackEvent);

      const xhr: any = new FakeXHR();
      xhr.open("POST", OTHER_POST_URL);
      xhr.send(JSON.stringify({ inputParameters: { IsCPSD: true } }));

      expect(trackEvent).not.toHaveBeenCalled();
    });

    it("does not call trackEvent for non-POST methods to the listen URL", () => {
      const trackEvent = jest.fn();
      const { FakeXHR } = installShim(trackEvent);

      const xhr: any = new FakeXHR();
      xhr.open("GET", LISTEN_URL);
      xhr.send();

      expect(trackEvent).not.toHaveBeenCalled();
    });

    it("emits without IsCPSD when the body is not valid JSON", () => {
      const trackEvent = jest.fn();
      const { FakeXHR } = installShim(trackEvent, "?CaseId=42");

      const xhr: any = new FakeXHR();
      xhr.open("POST", LISTEN_URL);
      xhr.send("not json");

      expect(trackEvent).toHaveBeenCalledWith({
        name: "triage-submission",
        CaseId: 42,
      });
    });

    it("emits without IsCPSD when the body does not match the schema", () => {
      const trackEvent = jest.fn();
      const { FakeXHR } = installShim(trackEvent, "?CaseId=42");

      const xhr: any = new FakeXHR();
      xhr.open("POST", LISTEN_URL);
      xhr.send(JSON.stringify({ inputParameters: { IsCPSD: "yes" } }));

      expect(trackEvent).toHaveBeenCalledWith({
        name: "triage-submission",
        CaseId: 42,
      });
    });

    it("captures ODTask submissions even when the body is not our shape", () => {
      const trackEvent = jest.fn();
      const { FakeXHR } = installShim(trackEvent, "?CaseId=42&TaskType=OD");

      const xhr: any = new FakeXHR();
      xhr.open("POST", LISTEN_URL_OD_TASK);
      xhr.send(JSON.stringify({ somethingElse: { nested: [1, 2, 3] } }));

      expect(trackEvent).toHaveBeenCalledWith({
        name: "triage-submission",
        CaseId: 42,
        TaskType: "OD",
      });
    });

    it("captures DCPTask submissions even when the body is not JSON", () => {
      const trackEvent = jest.fn();
      const { FakeXHR } = installShim(trackEvent, "?CaseId=42&TaskType=DCP");

      const xhr: any = new FakeXHR();
      xhr.open("POST", LISTEN_URL_DCP_TASK);
      xhr.send("<xml>whatever</xml>");

      expect(trackEvent).toHaveBeenCalledWith({
        name: "triage-submission",
        CaseId: 42,
        TaskType: "DCP",
      });
    });

    it("still delegates to the original send when capture fails", () => {
      const trackEvent = jest.fn().mockImplementation(() => {
        throw new Error("analytics is broken");
      });
      const { FakeXHR, send } = installShim(trackEvent);

      const xhr: any = new FakeXHR();
      xhr.open("POST", LISTEN_URL);
      expect(() => xhr.send(JSON.stringify({ inputParameters: { IsCPSD: true } }))).not.toThrow();
      expect(send).toHaveBeenCalled();
    });
  });
});

describe("coerceValue", () => {
  it("coerces integer-looking strings to numbers", () => {
    expect(coerceValue("2170327")).toBe(2170327);
    expect(coerceValue("-42")).toBe(-42);
    expect(coerceValue("0")).toBe(0);
  });

  it("leaves non-integer strings as strings", () => {
    expect(coerceValue("hello")).toBe("hello");
    expect(coerceValue("2170327abc")).toBe("2170327abc");
    expect(coerceValue("1.5")).toBe("1.5");
    expect(coerceValue("")).toBe("");
  });

  it("leaves unsafe-integer strings as strings", () => {
    expect(coerceValue("99999999999999999999")).toBe("99999999999999999999");
  });
});

describe("readCoercedQueryParams", () => {
  it("returns an empty object when there are no params", () => {
    const window = { location: { search: "" } } as Window;
    expect(readCoercedQueryParams(window)).toEqual({});
  });

  it("decodes and coerces param values", () => {
    const window = { location: { search: "?CaseId=2170327&Name=Stef+Stachow" } } as Window;
    expect(readCoercedQueryParams(window)).toEqual({
      CaseId: 2170327,
      Name: "Stef Stachow",
    });
  });
});
