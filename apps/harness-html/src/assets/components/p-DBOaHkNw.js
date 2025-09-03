import { _ as _console, p as proxyCustomElement, H, i as createEvent, h } from './p-D95SeqOK.js';
import { W as WithLogging } from './p-BbbWnMnY.js';

var __decorate = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
window.addEventListener("cps-global-header-event", (event) => _console.debug("A navigation event has been fired: ", event));
const NavLink = /*@__PURE__*/ proxyCustomElement(class NavLink extends H {
    constructor() {
        super();
        this.__registerHost();
        this.CpsGlobalHeaderEvent = createEvent(this, "cps-global-header-event");
        this.emitEvent = (link) => this.CpsGlobalHeaderEvent.emit(link);
        this.launchNewTab = (link) => window.open(link, "_blank", "noopener,noreferrer");
    }
    render() {
        const mode = this.disabled || !this.href ? "disabled" : this.openInNewTab ? "new-tab" : this.preferEventNavigation ? "emit-event" : "standard";
        const coreProps = {
            "role": "link",
            "aria-current": this.ariaSelected ? "page" : undefined,
        };
        const renderLink = () => {
            switch (mode) {
                case "disabled":
                    return (h("a", Object.assign({}, coreProps, { class: "govuk-link disabled", "aria-disabled": true, href: this.href }), this.label));
                case "new-tab":
                    return (h("button", Object.assign({}, coreProps, { class: "linkButton", onClick: () => this.launchNewTab(this.href) }), this.label));
                case "emit-event":
                    return (h("button", Object.assign({}, coreProps, { class: "linkButton", onClick: () => this.emitEvent(this.href) }), this.label));
                default:
                    return (h("a", Object.assign({}, coreProps, { class: "govuk-link", href: this.href }), this.label));
            }
        };
        return h("li", { class: this.selected ? "selected" : "" }, renderLink());
    }
}, [256, "nav-link", {
        "label": [1],
        "href": [1],
        "selected": [4],
        "ariaSelected": [4, "aria-selected"],
        "disabled": [4],
        "openInNewTab": [4, "open-in-new-tab"],
        "preferEventNavigation": [4, "prefer-event-navigation"]
    }]);
__decorate([
    WithLogging("NavLink")
], NavLink.prototype, "render", null);
function defineCustomElement() {
    if (typeof customElements === "undefined") {
        return;
    }
    const components = ["nav-link"];
    components.forEach(tagName => { switch (tagName) {
        case "nav-link":
            if (!customElements.get(tagName)) {
                customElements.define(tagName, NavLink);
            }
            break;
    } });
}

export { NavLink as N, defineCustomElement as d };
//# sourceMappingURL=p-DBOaHkNw.js.map

//# sourceMappingURL=p-DBOaHkNw.js.map