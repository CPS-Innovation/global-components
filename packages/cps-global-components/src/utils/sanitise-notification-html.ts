const ALLOWED_TAGS = new Set(["P", "STRONG", "EM", "BR", "A"]);
const ALLOWED_HREF_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

// Sanitise user-editable HTML from notification.json to a minimal allow-list. This is
// defence-in-depth: the file is developer-committed today, but the feature is designed
// to eventually accept edits from a non-developer surface.
export const sanitiseNotificationHtml = (input: string): string => {
  if (typeof DOMParser === "undefined") {
    // Non-browser (e.g. some test) — fall back to stripping all tags.
    return input.replace(/<[^>]*>/g, "");
  }

  const doc = new DOMParser().parseFromString(`<!doctype html><body>${input}`, "text/html");
  const body = doc.body;

  const walk = (node: Element) => {
    Array.from(node.children).forEach(walk);

    if (!ALLOWED_TAGS.has(node.tagName)) {
      // Unwrap: replace the element with its children.
      const parent = node.parentNode;
      if (!parent) {
        return;
      }
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
      return;
    }

    // Strip attributes except the allow-list per-tag.
    const attrs = Array.from(node.attributes);
    attrs.forEach(attr => {
      const name = attr.name.toLowerCase();
      if (node.tagName === "A" && (name === "href" || name === "target" || name === "rel")) {
        if (name === "href") {
          try {
            const url = new URL(attr.value, "https://placeholder.local/");
            if (!ALLOWED_HREF_PROTOCOLS.has(url.protocol)) {
              node.removeAttribute(attr.name);
              return;
            }
          } catch {
            node.removeAttribute(attr.name);
            return;
          }
        }
        if (name === "target" && attr.value !== "_blank") {
          node.removeAttribute(attr.name);
        }
        return;
      }
      node.removeAttribute(attr.name);
    });

    // If it's an external link, force safe rel.
    if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
      node.setAttribute("rel", "noreferrer noopener");
    }
  };

  Array.from(body.children).forEach(walk);
  return body.innerHTML;
};
