import { footerSubscriber } from "./footer-subscriber";

// The handler wires MutationObservers (email scrape, header width sync) that we
// don't exercise here — stub them so the test is about the gate and telemetry.
class NoopMutationObserver {
  observe() {}
  disconnect() {}
}

const makeArgs = ({ FOOTER_SHIM_ENABLED, isLocalDevelopment = false }: { FOOTER_SHIM_ENABLED?: boolean; isLocalDevelopment?: boolean }) => {
  const trackEvent = jest.fn();
  const args = {
    context: { found: true, contextIds: "home" },
    flags: { isLocalDevelopment },
    config: { FOOTER_SHIM_ENABLED },
    window,
    trackEvent,
  } as any;
  return { args, trackEvent };
};

const addHostFooter = () => {
  const footer = document.createElement("footer");
  footer.textContent = "host footer";
  // Stencil's mock-doc has no ChildNode.after().
  (footer as any).after = (node: Node) => footer.parentNode!.insertBefore(node, footer.nextSibling);
  document.body.appendChild(footer);
  return footer;
};

describe("footerSubscriber", () => {
  const originalMutationObserver = (global as any).MutationObserver;

  beforeEach(() => {
    (global as any).MutationObserver = NoopMutationObserver;
    document.body.innerHTML = "";
  });

  afterEach(() => {
    (global as any).MutationObserver = originalMutationObserver;
  });

  it("is active when FOOTER_SHIM_ENABLED is true", () => {
    expect(footerSubscriber(makeArgs({ FOOTER_SHIM_ENABLED: true }).args).isActiveForContext).toBe(true);
  });

  it("is inactive when FOOTER_SHIM_ENABLED is false and not local dev", () => {
    expect(footerSubscriber(makeArgs({ FOOTER_SHIM_ENABLED: false }).args).isActiveForContext).toBe(false);
  });

  it("is active in local dev even when FOOTER_SHIM_ENABLED is false", () => {
    expect(footerSubscriber(makeArgs({ FOOTER_SHIM_ENABLED: false, isLocalDevelopment: true }).args).isActiveForContext).toBe(true);
  });

  it("hides the host footer, inserts cps-global-footer after it, and reports footer-shimmed once per page", () => {
    const { args, trackEvent } = makeArgs({ FOOTER_SHIM_ENABLED: true });
    const [{ handler }] = footerSubscriber(args).subscriptions;

    const first = addHostFooter();
    handler(first);

    expect(first.style.display).toBe("none");
    expect(first.nextElementSibling?.tagName.toLowerCase()).toBe("cps-global-footer");
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith({ name: "footer-shimmed", contextIds: "home" });

    // An SPA host remounting its footer on navigation re-fires the handler for a
    // new element — still the same page load, so no second event.
    const second = addHostFooter();
    handler(second);
    handler(second);

    expect(second.style.display).toBe("none");
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });
});
