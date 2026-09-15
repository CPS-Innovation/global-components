const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const { Script, createContext } = require("node:vm")

const clientPath = path.join(__dirname, "..", "cms-auth-v2-client.js")
const clientScript = new Script(readFileSync(clientPath, "utf8"), { filename: clientPath })
const tickScript = new Script("window.__ccContactLogger.tick()")
const caseUrl = "/Case/Overview.aspx?intCaseID=123"
const popupId = "ccPresencePopup"
const stripeId = "ccPresenceStripe"
const stripeHeaderId = "ccPresenceStripeHeader"
const stripeSummaryId = "ccPresenceStripeSummary"
const stripeToggleId = "ccPresenceStripeToggle"
const stripeDetailsId = "ccPresenceStripeDetails"

// Run the unmodified client through its public observer API. The small DOM and
// timer fakes exercise its legacy APIs without a CMS server, network or real timers.
const createElement = (tagName) => {
  const element = {
    tagName: tagName.toUpperCase(),
    id: "",
    className: "",
    style: {},
    innerText: "",
    children: [],
    parentNode: null,
    handlers: {},
    attributes: {},
  }
  element.setAttribute = (name, value) => { element.attributes[name] = String(value) }
  element.getAttribute = (name) => element.attributes[name] ?? null
  Object.defineProperty(element, "nextSibling", {
    get: () => {
      const siblings = element.parentNode?.children
      return siblings ? siblings[siblings.indexOf(element) + 1] || null : null
    },
  })
  element.appendChild = (child) => {
    if (child.parentNode) {
      child.parentNode.removeChild(child)
    }
    child.parentNode = element
    element.children.push(child)
    return child
  }
  element.removeChild = (child) => {
    const index = element.children.indexOf(child)
    assert.notEqual(index, -1, "Child must belong to its parent")
    element.children.splice(index, 1)
    child.parentNode = null
    return child
  }
  element.insertBefore = (child, reference) => {
    if (!reference) {
      return element.appendChild(child)
    }
    if (child === reference) {
      return child
    }
    if (child.parentNode) {
      child.parentNode.removeChild(child)
    }
    const index = element.children.indexOf(reference)
    assert.notEqual(index, -1, "Reference must belong to its parent")
    element.children.splice(index, 0, child)
    child.parentNode = element
    return child
  }
  element.attachEvent = (name, handler) => {
    element.handlers[name] = handler
  }
  return element
}

const createDocument = (bodyTag = "BODY", withMenu = false, onScript = () => {}) => {
  const documentElement = createElement("html")
  const body = documentElement.appendChild(createElement(bodyTag))
  const elements = (root) => [root, ...root.children.flatMap(elements)]

  if (withMenu) {
    const row = body.appendChild(createElement("tr"))
    row.className = "menuBar"
    row.cells = row.children
    row.insertCell = (index) => {
      assert.equal(index, row.cells.length)
      const cell = row.appendChild(createElement("td"))
      cell.cellIndex = index
      return cell
    }
    row.deleteCell = (index) => row.removeChild(row.cells[index])
  }

  const appendChild = documentElement.appendChild
  documentElement.appendChild = (element) => {
    appendChild(element)
    if (element.tagName === "SCRIPT") {
      onScript(element)
    }
    return element
  }

  return {
    body,
    documentElement,
    createElement,
    getElementById: (id) => elements(documentElement).find((element) => element.id === id) || null,
    getElementsByTagName: (tag) => elements(documentElement).filter(
      (element) => tag === "*" || element.tagName === tag.toUpperCase()
    ),
  }
}

const createFrame = (name, href = caseUrl, bodyTag = "BODY", frames = []) => ({
  name,
  location: { href },
  document: createDocument(bodyTag),
  frames,
})

const createLayout = (frameset, href = caseUrl) => {
  if (!frameset) {
    const main = createFrame("frameMain", href)
    return { main, host: main }
  }
  const host = createFrame("framePage", href)
  const inner = createFrame("innerFrames", "/Inner.aspx", "FRAMESET", [host])
  const main = createFrame("frameMain", caseUrl, "FRAMESET", [inner])
  return { main, host }
}

const createHarness = (globals = {}) => {
  const requests = []
  const events = []
  const intervals = new Map()
  const timeouts = new Map()
  let timerId = 0
  const document = createDocument("BODY", true, (script) => {
    const params = new URL(script.src, "https://cms.example.test").searchParams
    requests.push(Object.fromEntries(params))
  })
  const window = {
    document,
    frames: [],
    attachEvent: () => {},
    setInterval: (fn) => {
      intervals.set(++timerId, fn)
      return timerId
    },
    clearInterval: (id) => intervals.delete(id),
    setTimeout: (fn) => {
      timeouts.set(++timerId, fn)
      return timerId
    },
    clearTimeout: (id) => timeouts.delete(id),
  }
  const context = createContext({ window, document, ...globals })
  clientScript.runInContext(context, { timeout: 1000 })
  window.__ccContactLogger.onChange = (kind, rec) => events.push({ kind, rec })
  const tick = () => tickScript.runInContext(context, { timeout: 1000 })

  return {
    window,
    document,
    requests,
    events,
    intervals,
    tick,
    open: (layout, precedingFrames = []) => {
      window.frames = [...precedingFrames, layout.main]
      tick()
    },
    hover: () => {
      const icon = document.getElementById("ccPresenceBanner")
      assert.ok(icon, "Presence icon should exist")
      icon.handlers.onmouseover()
    },
    respond: (request, data) => window[request.callback](data),
    runIntervals: () => {
      for (const fn of [...intervals.values()]) {
        fn()
      }
    },
  }
}

const sections = [
  { name: "generic CASE", url: caseUrl, sectionId: "123:CASE" },
  {
    name: "case review",
    url: "/Case/uapcPreChargeCaseAnalysis.aspx?intCaseID=123",
    sectionId: "123:CASE_REVIEW",
  },
  {
    name: "defendant",
    url: "/Case/uadcDefsCharges.aspx?intCaseID=123",
    sectionId: "123:DEFENDANT:456",
    setup: (host) => {
      host.sMode = "editdefendant"
      for (const [id, value] of [["hidInEditMode", "Y"], ["hidPartyID", "456"]]) {
        const field = host.document.body.appendChild(createElement("input"))
        field.id = id
        field.value = value
      }
    },
  },
]

for (const section of sections) {
  for (const frameset of [false, true]) {
    test(`${section.name}: resolves and renders in ${frameset ? "nested framePage" : "HTML frameMain"}`, () => {
      const layout = createLayout(frameset, section.url)
      if (section.setup) {
        section.setup(layout.host)
      }
      const harness = createHarness()
      harness.open(layout)
      assert.equal(harness.events.length, 1)
      assert.equal(harness.events[0].rec.sectionId, section.sectionId)
      assert.equal(harness.events[0].rec.popupFrame, frameset ? "framePage" : "frameMain")
      assert.equal(harness.requests[0].sectionId, section.sectionId)
      harness.hover()
      const popup = layout.host.document.getElementById(popupId)
      assert.ok(popup)
      assert.equal(popup.parentNode, layout.host.document.body)
      assert.equal(popup.style.top, frameset ? "0px" : "50px")
      assert.equal(popup.innerText, "Connecting to The Watchdog...")
      if (frameset) {
        assert.equal(layout.main.document.getElementById(popupId), null)
      }
    })
  }
}

test("HTML frameMain remains the host even if it contains child iframes", () => {
  const layout = createLayout(false)
  const child = createFrame("framePage", "/Embedded.aspx")
  layout.main.frames = [child]
  const harness = createHarness()
  harness.open(layout)
  assert.equal(harness.events[0].rec.popupFrame, "frameMain")
  harness.hover()
  assert.ok(layout.main.document.getElementById(popupId))
  assert.equal(child.document.getElementById(popupId), null)
})

test("framePage is selected and rendered only within frameMain's subtree", () => {
  const layout = createLayout(true)
  const unrelated = createFrame("framePage", "/Unrelated.aspx")
  const harness = createHarness()
  harness.open(layout, [unrelated])
  assert.equal(harness.events[0].rec.popupFrame, "framePage")
  harness.hover()
  assert.ok(layout.host.document.getElementById(popupId))
  assert.equal(unrelated.document.getElementById(popupId), null)
})

test("missing framePage does not fall back to the frameset or an unrelated frame", () => {
  const layout = createLayout(true)
  layout.main.frames = []
  const unrelated = createFrame("framePage", "/Unrelated.aspx")
  const harness = createHarness()
  harness.open(layout, [unrelated])
  assert.equal(harness.events[0].rec.popupFrame, null)
  harness.hover()
  assert.equal(layout.main.document.getElementById(popupId), null)
  assert.equal(unrelated.document.getElementById(popupId), null)
})

for (const missing of ["frameMain", "document access", "body"]) {
  test(`unavailable ${missing} leaves rec.popupFrame null without preventing presence`, () => {
    const layout = createLayout(false)
    if (missing === "frameMain") {
      layout.main.name = "anotherFrame"
    } else if (missing === "document access") {
      Object.defineProperty(layout.main, "document", {
        get: () => { throw new Error("Access denied") },
      })
    } else {
      layout.main.document.body = null
    }
    const harness = createHarness()
    harness.open(layout)
    assert.equal(harness.events[0].rec.sectionId, "123:CASE")
    assert.equal(harness.events[0].rec.popupFrame, null)
    assert.equal(harness.requests[0].op, "create")
    assert.doesNotThrow(harness.hover)
  })
}

test("same CASE switches host in both directions without reconnecting or resetting heartbeat", () => {
  const harness = createHarness()
  let layout = createLayout(false)
  harness.open(layout)
  harness.respond(harness.requests[0], { sessionId: "session-123" })
  const requestCount = harness.requests.length
  const intervalIds = [...harness.intervals.keys()]
  harness.hover()

  for (const frameset of [true, false]) {
    const oldDoc = layout.host.document
    layout = createLayout(frameset)
    harness.open(layout)
    assert.equal(oldDoc.getElementById(popupId), null)
    harness.hover()
    assert.ok(layout.host.document.getElementById(popupId))
    assert.equal(harness.requests.length, requestCount)
    assert.deepEqual([...harness.intervals.keys()], intervalIds)
    assert.equal(harness.events.length, 1)
  }
  harness.window.frames = []
  harness.tick()
  assert.equal(harness.events[1].kind, "closed")
  assert.equal(harness.events[1].rec.popupFrame, "frameMain", "lastRec must retain the latest host")
})

test("same CASE moves the connecting popup without issuing a second create", () => {
  const harness = createHarness()
  harness.open(createLayout(false))
  const layout = createLayout(true)
  harness.open(layout)
  harness.hover()
  assert.equal(layout.host.document.getElementById(popupId).innerText, "Connecting to The Watchdog...")
  assert.equal(harness.requests.length, 1)
})

test("same CASE moves a permanent-error popup without reconnecting", () => {
  const harness = createHarness()
  harness.open(createLayout(true))
  harness.respond(harness.requests[0], { jsonpError: "500" })
  const layout = createLayout(false)
  harness.open(layout)
  harness.hover()
  assert.equal(layout.host.document.getElementById(popupId).innerText, "There was an error connecting to The Watchdog!")
  assert.equal(harness.document.getElementById("ccPresenceCount").innerText, "(!)")
  assert.equal(harness.requests.length, 1)
  assert.equal(harness.events.length, 1)
})

test("replacing a framePage document removes the old popup on the next hover", () => {
  const harness = createHarness()
  const oldLayout = createLayout(true)
  harness.open(oldLayout)
  harness.hover()
  const layout = createLayout(true)
  harness.open(layout)
  harness.hover()
  assert.equal(oldLayout.host.document.getElementById(popupId), null)
  assert.ok(layout.host.document.getElementById(popupId))
  assert.equal(harness.requests.length, 1)
})

test("a host that becomes a frameset before the next tick never receives popup HTML", () => {
  const harness = createHarness()
  harness.open(createLayout(false))
  const layout = createLayout(true)
  harness.window.frames = [layout.main]
  harness.hover()
  assert.equal(layout.main.document.getElementById(popupId), null)
})

test("a framePage that finishes loading is picked up without reconnecting", () => {
  const harness = createHarness()
  const layout = createLayout(true)
  const children = layout.main.frames
  layout.main.frames = []
  harness.open(layout)
  assert.equal(harness.events[0].rec.popupFrame, null)
  layout.main.frames = children
  harness.tick()
  harness.hover()
  assert.ok(layout.host.document.getElementById(popupId))
  assert.equal(harness.requests.length, 1)
})

for (const frameset of [false, true]) {
  test(`specific section skips the generic reader on an earlier ${frameset ? "parent" : "sibling"}`, () => {
    const harness = createHarness()
    const layout = createLayout(frameset)
    const review = createFrame("review", sections[1].url)
    let genericReads = 0
    Object.defineProperty(layout.main, "iScreenCaseID", {
      get: () => { genericReads += 1; return 123 },
    })
    if (frameset) {
      layout.host.frames = [review]
      harness.open(layout)
    } else {
      harness.window.frames = [layout.main, review]
      harness.tick()
    }
    assert.equal(harness.events[0].rec.sectionId, "123:CASE_REVIEW")
    assert.equal(genericReads, 0)
    assert.equal(harness.requests[0].sectionId, "123:CASE_REVIEW")
  })
}

test("no open case terminates without creating a presence session", () => {
  const harness = createHarness()
  harness.open(createLayout(false, "/Home.aspx"))
  assert.equal(harness.events.length, 0)
  assert.equal(harness.requests.length, 0)
})

const addTitleBar = (doc, twoRows = false) => {
  const table = doc.body.appendChild(createElement("table"))
  table.className = "cmsTitleBar"
  const tbody = table.appendChild(createElement("tbody"))
  const row = tbody.appendChild(createElement("tr"))
  row.id = "trTitleBar"
  row.appendChild(createElement("td")).innerText = "Case 123"
  if (twoRows) {
    tbody.appendChild(createElement("tr")).appendChild(createElement("td"))
  }
  const content = doc.body.appendChild(createElement("p"))
  content.innerText = "Existing CMS content"
  return { titleBar: table, content }
}

const createTitleLayout = (frameset, url = caseUrl) => {
  const layout = createLayout(frameset, url)
  // The title bar is in frameTabs, a sibling of framePage, not in the popup host.
  const stripeHost = frameset ? createFrame("frameTabs", "/Tabs.aspx") : layout.main
  if (frameset) {
    layout.main.frames[0].frames.unshift(stripeHost)
  }
  return { ...layout, stripeHost, ...addTitleBar(stripeHost.document, frameset) }
}

const notification = (version = 1, members = ["one@example.test", "two@example.test"]) => [{
  payload: {
    snapshots: [{
      section: { caseId: "123", kind: "CASE" },
      version,
      members: members.map((userEmail) => ({ userEmail, sourceApplication: "CMS" })),
    }],
  },
}]

const receivePoll = (harness, data) => {
  const poll = harness.requests.filter((request) => request.op === "poll").at(-1)
  assert.ok(poll, "A poll request must exist")
  harness.respond(poll, data)
}

const connectWithRoster = (harness, data = notification()) => {
  harness.respond(harness.requests.find((request) => request.op === "create"), { sessionId: "session-123" })
  receivePoll(harness, data)
}

for (const frameset of [false, true]) {
  test(`accordion sits below the entire ${frameset ? "two-row frameTabs" : "frameMain"} title bar`, () => {
    const layout = createTitleLayout(frameset)
    const doc = layout.stripeHost.document
    const harness = createHarness()
    harness.open(layout)
    const stripe = doc.getElementById(stripeId)
    assert.ok(stripe)
    assert.equal(layout.titleBar.nextSibling, stripe)
    assert.equal(stripe.nextSibling, layout.content)
    assert.equal(stripe.parentNode, layout.titleBar.parentNode)
    assert.equal(layout.titleBar.children[0].children.length, frameset ? 2 : 1)
    assert.equal(doc.getElementById(stripeHeaderId).style.height, "23px")
    assert.equal(doc.getElementById(stripeHeaderId).style.lineHeight, "23px")
    assert.equal(doc.getElementById(stripeHeaderId).style.backgroundColor, "#b10e1e")
    assert.equal(doc.getElementById(stripeSummaryId).innerText, "Connecting to The Watchdog...")
    assert.equal(doc.getElementById(stripeDetailsId).style.display, "none")
    assert.equal(doc.getElementById(stripeToggleId).innerText, "Show details")

    const data = notification()
    data[0].payload.snapshots.push({
      section: { caseId: "123", kind: "CASE_REVIEW" },
      version: 1,
      members: [{ userEmail: "three@example.test", sourceApplication: "Polaris" }],
    })
    connectWithRoster(harness, data)
    assert.equal(doc.getElementById(stripeId), stripe)
    assert.equal(doc.getElementById(stripeSummaryId).innerText, "3 users currently working on the case")
    assert.equal(harness.document.getElementById("ccPresenceCount").innerText, "(3)")
    assert.equal(harness.events[0].rec.popupFrame, frameset ? "framePage" : "frameMain")
    harness.hover()
    assert.equal(doc.getElementById(stripeDetailsId).innerText, layout.host.document.getElementById(popupId).innerText)
    if (frameset) {
      assert.equal(layout.main.document.getElementById(stripeId), null)
      assert.equal(layout.host.document.getElementById(stripeId), null)
      assert.equal(doc.getElementById(popupId), null, "Hover popup must not move into frameTabs")
    }
  })
}

test("accordion toggles a white, red-bordered panel containing the full hover text", () => {
  const harness = createHarness()
  const layout = createTitleLayout(false)
  const doc = layout.stripeHost.document
  harness.open(layout)
  connectWithRoster(harness)
  const toggle = doc.getElementById(stripeToggleId)
  const details = doc.getElementById(stripeDetailsId)
  const requests = harness.requests.length
  assert.equal(toggle.style.textDecoration, "underline")
  assert.equal(toggle.getAttribute("role"), "button")
  assert.equal(toggle.getAttribute("aria-controls"), stripeDetailsId)
  assert.equal(toggle.getAttribute("aria-expanded"), "false")
  assert.equal(toggle.onclick(), false, "Do not navigate to the href")
  assert.equal(toggle.innerText, "Hide details")
  assert.equal(toggle.getAttribute("aria-expanded"), "true")
  assert.equal(details.style.display, "block")
  assert.equal(details.style.backgroundColor, "#ffffff")
  assert.equal(details.style.border, "1px solid #b10e1e")
  assert.equal(details.style.whiteSpace, "pre")
  harness.hover()
  assert.equal(details.innerText, layout.host.document.getElementById(popupId).innerText)
  assert.equal(doc.getElementById(stripeHeaderId).style.height, "23px")
  assert.equal(toggle.onclick(), false)
  assert.equal(toggle.innerText, "Show details")
  assert.equal(details.style.display, "none")
  assert.equal(harness.requests.length, requests, "Toggling must not reconnect or poll")
})

test("accordion supports Space with both a supplied event and the legacy owning-window event", () => {
  const harness = createHarness()
  const layout = createTitleLayout(true)
  const doc = layout.stripeHost.document
  harness.open(layout)
  const toggle = doc.getElementById(stripeToggleId)
  const event = { keyCode: 32, returnValue: true }
  assert.equal(toggle.onkeydown(event), false)
  assert.equal(event.returnValue, false)
  assert.equal(toggle.innerText, "Hide details")
  doc.parentWindow = { event: { keyCode: 32, returnValue: true } }
  assert.equal(toggle.onkeydown(), false)
  assert.equal(doc.parentWindow.event.returnValue, false)
  assert.equal(toggle.innerText, "Show details")
  assert.equal(toggle.onkeydown({ keyCode: 13 }), true, "Enter is left to native link activation")
})

test("polls refresh the count and expanded details without duplicating or collapsing the accordion", () => {
  const harness = createHarness()
  const layout = createTitleLayout(true)
  const doc = layout.stripeHost.document
  harness.open(layout)
  connectWithRoster(harness)
  const stripe = doc.getElementById(stripeId)
  const toggle = doc.getElementById(stripeToggleId)
  const click = toggle.onclick
  toggle.onclick()
  harness.runIntervals()
  receivePoll(harness, notification(2, ["one@example.test"]))
  harness.tick()
  assert.equal(doc.getElementById(stripeId), stripe)
  assert.equal(toggle.onclick, click)
  assert.equal(toggle.innerText, "Hide details")
  assert.equal(doc.getElementById(stripeDetailsId).style.display, "block")
  assert.equal(doc.getElementById(stripeDetailsId).innerText, harness.document.getElementById("ccPresenceBanner").ccTipText)
  assert.equal(doc.getElementById(stripeSummaryId).innerText, "1 users currently working on the case")
  assert.equal(harness.document.getElementById("ccPresenceCount").innerText, "(1)")
  harness.runIntervals()
  receivePoll(harness, [])
  assert.equal(doc.getElementsByTagName("div").filter((el) => el.id === stripeId).length, 1)
  assert.equal(toggle.innerText, "Hide details")
})

test("same-case navigation moves the accordion and retains its expanded state without reconnecting", () => {
  const harness = createHarness()
  let layout = createTitleLayout(false)
  harness.open(layout)
  connectWithRoster(harness)
  layout.stripeHost.document.getElementById(stripeToggleId).onclick()
  const requests = harness.requests.length
  const intervalIds = [...harness.intervals.keys()]
  for (const frameset of [true, true, false]) {
    const oldDoc = layout.stripeHost.document
    layout = createTitleLayout(frameset)
    harness.open(layout)
    assert.equal(oldDoc.getElementById(stripeId), null)
    assert.equal(layout.titleBar.nextSibling.id, stripeId)
    assert.equal(layout.stripeHost.document.getElementById(stripeDetailsId).style.display, "block")
    assert.equal(layout.stripeHost.document.getElementById(stripeSummaryId).innerText, "2 users currently working on the case")
    assert.equal(harness.requests.length, requests)
    assert.deepEqual([...harness.intervals.keys()], intervalIds)
  }
})

test("the accordion reattaches after a title bar is replaced in the same document", () => {
  const harness = createHarness()
  const layout = createTitleLayout(false)
  const doc = layout.stripeHost.document
  harness.open(layout)
  const stripe = doc.getElementById(stripeId)
  layout.titleBar.parentNode.removeChild(layout.titleBar)
  const replacement = addTitleBar(doc, true)
  harness.tick()
  assert.equal(replacement.titleBar.nextSibling, stripe)
  assert.equal(doc.getElementsByTagName("div").filter((el) => el.id === stripeId).length, 1)
  assert.equal(harness.requests.length, 1)
})

test("a title bar that appears after a permanent failure still gets the error accordion", () => {
  const harness = createHarness()
  const layout = createLayout(false)
  harness.open(layout)
  harness.respond(harness.requests[0], { jsonpError: "500" })
  assert.equal(layout.host.document.getElementById(stripeId), null)
  const { titleBar } = addTitleBar(layout.host.document)
  harness.tick()
  assert.equal(titleBar.nextSibling.id, stripeId)
  assert.equal(layout.host.document.getElementById(stripeSummaryId).innerText, "There was an error connecting to The Watchdog!")
  assert.equal(harness.requests.length, 1)
})

test("temporary loss of the title bar removes the stripe but preserves its display state", () => {
  const harness = createHarness()
  const layout = createTitleLayout(true)
  const doc = layout.stripeHost.document
  harness.open(layout)
  doc.getElementById(stripeToggleId).onclick()
  layout.titleBar.parentNode.removeChild(layout.titleBar)
  harness.tick()
  assert.equal(doc.getElementById(stripeId), null)
  addTitleBar(doc)
  harness.tick()
  assert.equal(doc.getElementById(stripeDetailsId).style.display, "block")
  assert.equal(harness.requests.length, 1)
})

for (const unavailable of ["missing", "inaccessible", "loading", "frameset"]) {
  test(`${unavailable} frameTabs never sends the stripe to framePage or an unrelated title bar`, () => {
    const harness = createHarness()
    const layout = createTitleLayout(true)
    const tabsDoc = layout.stripeHost.document
    const unrelated = createFrame("frameTabs", "/Other.aspx")
    addTitleBar(unrelated.document)
    addTitleBar(layout.host.document)
    if (unavailable === "missing") {
      layout.main.frames[0].frames = [layout.host]
    } else if (unavailable === "inaccessible") {
      Object.defineProperty(layout.stripeHost, "document", {
        get: () => { throw new Error("Access denied") },
      })
    } else if (unavailable === "loading") {
      tabsDoc.body = null
    } else {
      tabsDoc.body.tagName = "FRAMESET"
    }
    harness.open(layout, [unrelated])
    assert.equal(tabsDoc.getElementById(stripeId), null)
    assert.equal(unrelated.document.getElementById(stripeId), null)
    assert.equal(layout.host.document.getElementById(stripeId), null)
    assert.equal(layout.main.document.getElementById(stripeId), null)
    harness.hover()
    assert.ok(layout.host.document.getElementById(popupId), "Hover popup still uses framePage")
    assert.equal(harness.requests.length, 1)
  })
}

test("the accordion uses nested frameTabs only within frameMain's subtree", () => {
  const harness = createHarness()
  const layout = createTitleLayout(true)
  const unrelated = createFrame("frameTabs", "/Unrelated.aspx")
  addTitleBar(unrelated.document)
  harness.open(layout, [unrelated])
  assert.equal(layout.titleBar.nextSibling.id, stripeId)
  assert.equal(unrelated.document.getElementById(stripeId), null)
  assert.equal(layout.host.document.getElementById(stripeId), null)
})

test("an HTML frameMain keeps the accordion even if it contains a frameTabs iframe", () => {
  const harness = createHarness()
  const layout = createTitleLayout(false)
  const embedded = createFrame("frameTabs", "/Embedded.aspx")
  addTitleBar(embedded.document)
  layout.main.frames.push(embedded)
  harness.open(layout)
  assert.equal(layout.titleBar.nextSibling.id, stripeId)
  assert.equal(embedded.document.getElementById(stripeId), null)
  assert.equal(harness.events[0].rec.popupFrame, "frameMain")
})

test("frameTabs can display the accordion while framePage is still loading", () => {
  const harness = createHarness()
  const layout = createTitleLayout(true)
  layout.main.frames[0].frames = [layout.stripeHost]
  harness.open(layout)
  assert.equal(harness.events[0].rec.popupFrame, null)
  const doc = layout.stripeHost.document
  const stripe = doc.getElementById(stripeId)
  assert.ok(stripe)
  doc.getElementById(stripeToggleId).onclick()
  layout.main.frames[0].frames.push(layout.host)
  harness.tick()
  harness.hover()
  assert.equal(doc.getElementById(stripeId), stripe)
  assert.equal(doc.getElementById(stripeDetailsId).style.display, "block")
  assert.ok(layout.host.document.getElementById(popupId))
  assert.equal(harness.requests.length, 1, "Loading the popup host must not reconnect")
})

test("replacing only frameTabs refreshes the accordion without disturbing the popup or session", () => {
  const harness = createHarness()
  const layout = createTitleLayout(true)
  harness.open(layout)
  connectWithRoster(harness)
  harness.hover()
  const popup = layout.host.document.getElementById(popupId)
  const oldDoc = layout.stripeHost.document
  oldDoc.getElementById(stripeToggleId).onclick()
  const requests = harness.requests.length
  const intervalIds = [...harness.intervals.keys()]
  const newDoc = createDocument()
  const { titleBar } = addTitleBar(newDoc, true)
  layout.stripeHost.document = newDoc
  harness.tick()
  assert.equal(oldDoc.getElementById(stripeId), null)
  assert.equal(titleBar.nextSibling.id, stripeId)
  assert.equal(newDoc.getElementById(stripeDetailsId).style.display, "block")
  assert.equal(newDoc.getElementById(stripeSummaryId).innerText, "2 users currently working on the case")
  assert.equal(layout.host.document.getElementById(popupId), popup)
  assert.equal(harness.requests.length, requests)
  assert.deepEqual([...harness.intervals.keys()], intervalIds)
})

test("frameTabs appearing after a permanent failure restores the error accordion without retrying", () => {
  const harness = createHarness()
  const layout = createTitleLayout(true)
  layout.main.frames[0].frames = [layout.host]
  harness.open(layout)
  harness.respond(harness.requests[0], { jsonpError: "500" })
  layout.main.frames[0].frames.unshift(layout.stripeHost)
  harness.tick()
  assert.equal(layout.titleBar.nextSibling.id, stripeId)
  assert.equal(layout.stripeHost.document.getElementById(stripeSummaryId).innerText, "There was an error connecting to The Watchdog!")
  assert.equal(harness.requests.length, 1)
})

test("accordion text remains plain text even when the roster contains HTML characters", () => {
  const harness = createHarness()
  const layout = createTitleLayout(false)
  harness.open(layout)
  connectWithRoster(harness, notification(1, ["<img src=x onerror=alert(1)> & viewer@example.test"]))
  const details = layout.stripeHost.document.getElementById(stripeDetailsId)
  assert.equal(details.children.length, 0)
  assert.match(details.innerText, /<img src=x onerror=alert\(1\)> & viewer@example.test/)
})

test("changing section clears the old details and starts a collapsed accordion", () => {
  const harness = createHarness()
  const oldLayout = createTitleLayout(false)
  harness.open(oldLayout)
  connectWithRoster(harness)
  oldLayout.stripeHost.document.getElementById(stripeToggleId).onclick()
  const layout = createTitleLayout(false, sections[1].url)
  harness.open(layout)
  assert.equal(oldLayout.stripeHost.document.getElementById(stripeId), null)
  assert.equal(layout.stripeHost.document.getElementById(stripeDetailsId).style.display, "none")
  assert.equal(layout.stripeHost.document.getElementById(stripeSummaryId).innerText, "Connecting to The Watchdog...")
  assert.equal(harness.requests.filter((request) => request.op === "create").length, 2)
})

test("leaving a case removes the accordion even if the menu bar is no longer available", () => {
  const harness = createHarness()
  const layout = createTitleLayout(true)
  harness.open(layout)
  connectWithRoster(harness)
  harness.hover()
  harness.document.body.children[0].className = ""
  harness.window.frames = []
  harness.tick()
  assert.equal(layout.stripeHost.document.getElementById(stripeId), null)
  assert.equal(layout.host.document.getElementById(popupId), null)
})

test("the stripe still works when the yellow menu bar cannot be found", () => {
  const harness = createHarness()
  harness.document.body.children[0].className = ""
  const layout = createTitleLayout(false)
  harness.open(layout)
  connectWithRoster(harness)
  assert.equal(harness.document.getElementById("ccPresenceBanner"), null)
  assert.equal(layout.stripeHost.document.getElementById(stripeSummaryId).innerText, "2 users currently working on the case")
})

test("an empty roster removes the stripe instead of retaining stale users", () => {
  const harness = createHarness()
  const layout = createTitleLayout(false)
  harness.open(layout)
  connectWithRoster(harness)
  harness.runIntervals()
  receivePoll(harness, notification(2, []))
  assert.equal(layout.stripeHost.document.getElementById(stripeId), null)
  harness.tick()
  assert.equal(layout.stripeHost.document.getElementById(stripeId), null)
})

test("permanent failure replaces the roster and survives subsequent navigation without retrying", () => {
  const harness = createHarness()
  const oldLayout = createTitleLayout(false)
  harness.open(oldLayout)
  connectWithRoster(harness)
  harness.respond(harness.requests.find((request) => request.op === "heartbeat"), { jsonpError: "500" })
  const requests = harness.requests.length
  const layout = createTitleLayout(true)
  harness.open(layout)
  assert.equal(oldLayout.stripeHost.document.getElementById(stripeId), null)
  const doc = layout.stripeHost.document
  assert.equal(doc.getElementById(stripeSummaryId).innerText, "There was an error connecting to The Watchdog!")
  doc.getElementById(stripeToggleId).onclick()
  assert.equal(doc.getElementById(stripeDetailsId).innerText, harness.document.getElementById("ccPresenceBanner").ccTipText)
  harness.runIntervals()
  assert.equal(harness.requests.length, requests)
})

const withTimeZone = (timeZone, run) => {
  const previous = process.env.TZ
  process.env.TZ = timeZone
  try {
    return run()
  } finally {
    if (previous === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = previous
    }
  }
}

const tooltipForJoinedAt = (joinedAt, globals = {}) => {
  const harness = createHarness(globals)
  const layout = createLayout(false)
  harness.open(layout)
  harness.respond(harness.requests[0], { sessionId: "session-123" })
  harness.respond(harness.requests.find((request) => request.op === "poll"), [{
    payload: {
      snapshots: [{
        section: { caseId: "123", kind: "CASE" },
        version: 1,
        members: [{ userEmail: "viewer@example.test", sourceApplication: "CMS", joinedAt }],
      }],
    },
  }])
  harness.hover()
  return layout.host.document.getElementById(popupId).innerText
}

const rosterText = "Who's working where:\nCurrently these users are working on Case:\nviewer@example.test on CMS"

const joinedDateCases = [
  ["UTC", "2026-08-21T08:11:53.226+00:00", "21 Aug 2026 08:11"],
  ["Europe/London", "2026-08-21T08:11:53.226+00:00", "21 Aug 2026 09:11"],
  ["Europe/London", "2026-01-21T08:11:53Z", "21 Jan 2026 08:11"],
  ["America/New_York", "2026-08-21T08:11:53Z", "21 Aug 2026 04:11"],
  ["Asia/Kolkata", "2026-08-21T08:11Z", "21 Aug 2026 13:41"],
  ["Asia/Kathmandu", "2026-08-21T08:11:53.1234567Z", "21 Aug 2026 13:56"],
  ["Europe/London", "2026-08-21T13:41:53.226+05:30", "21 Aug 2026 09:11"],
  ["Europe/London", "2026-08-21T13:41:53.226+0530", "21 Aug 2026 09:11"],
  ["Europe/London", "2026-08-21T04:11:53.226-04:00", "21 Aug 2026 09:11"],
  ["UTC", "2026-08-21T04:41:53.226-03:30", "21 Aug 2026 08:11"],
  ["America/Los_Angeles", "2026-01-01T02:05:00Z", "31 Dec 2025 18:05"],
  ["Asia/Kathmandu", "2026-12-31T20:05:00Z", "1 Jan 2027 01:50"],
  ["America/New_York", "2026-03-08T06:59:59.999Z", "8 Mar 2026 01:59"],
  ["America/New_York", "2026-03-08T07:00:00Z", "8 Mar 2026 03:00"],
  ["America/New_York", "2026-11-01T05:59:59Z", "1 Nov 2026 01:59"],
  ["America/New_York", "2026-11-01T06:00:00Z", "1 Nov 2026 01:00"],
  ["UTC", "2024-02-29T08:11:00Z", "29 Feb 2024 08:11"],
  ["Europe/London", "2026-08-21 08:11", "21 Aug 2026 08:11"],
]

for (const [timeZone, iso, expected] of joinedDateCases) {
  test(`joined date: ${iso} is displayed in ${timeZone}`, () => {
    withTimeZone(timeZone, () => {
      assert.equal(tooltipForJoinedAt(iso), `${rosterText} - joined ${expected}`)
    })
  })
}

for (const invalid of [null, undefined, "", 123, "not a date", "2026-02-29T08:11Z", "2026-13-01T08:11Z", "2026-08-21T25:11Z", "2026-08-21T08:61Z", "2026-08-21T08:11:61Z", "2026-08-21T08:11+24:00", "2026-08-21T08:11+05:60", "2026-08-21T08:11garbage"]) {
  test(`invalid joined date ${String(invalid)} is omitted without losing the roster`, () => {
    assert.equal(tooltipForJoinedAt(invalid), rosterText)
  })
}

test("joined dates work without native ISO string parsing", () => {
  const LegacyDate = function (value) {
    assert.equal(typeof value, "number", "IE mode cannot reliably construct Dates from ISO strings")
    return new Date(value)
  }
  LegacyDate.UTC = Date.UTC
  LegacyDate.parse = () => { throw new Error("Native ISO parsing is unavailable") }
  withTimeZone("Europe/London", () => {
    assert.equal(
      tooltipForJoinedAt("2026-08-21T08:11:53.226+00:00", { Date: LegacyDate }),
      `${rosterText} - joined 21 Aug 2026 09:11`
    )
  })
})