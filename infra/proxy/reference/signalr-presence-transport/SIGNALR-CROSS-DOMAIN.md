# SignalR in the IE-mode estate: RESULT

> **Answered 2026-08-27: it works.** A CMS Modern page on the QA host held a SignalR
> connection to the hub on the UAT host, with negotiate ON, and received a presence
> snapshot. Cross-origin, in the real IE-mode estate. The rest of this document is the
> reasoning that led to the test, kept because the *why* is what generalises; see
> "What the result means" at the end for what is now known and what is still open.

# What was being tested

JSONP ships. SignalR is available behind `__ccPresence.setTransport("signalr")` to
settle one question that has been answered too confidently in both directions.

## The question

Can CMS Modern / DCF hold a SignalR connection to the presence hub **when the host
page and the hub are on different origins** — which is the production position, and
was not the position in which SignalR was previously proved to work?

## What we know, and how well

| Claim | Evidence | Confidence |
|---|---|---|
| Skipping negotiate means you never receive a push | Flipped it to `false` and a roster appeared immediately | **Proven.** Cost a day to find |
| Negotiate is what puts a client in Azure SignalR Service's delivery path | Above, plus the Service's documented redirect flow | **Proven** |
| ~~Zone 1406 answers a cross-domain XHR with a security dialog~~ | Seen at document mode 11: *"This page is accessing information that is not under its control…"* | **DISPROVED for our estate** — see the result at the top |
| A WebSocket is not gated by 1406 | Probe gave a clean `1000` close, no dialog | **Observed** |
| A `<script src>` is not gated | The entire JSONP client works | **Proven daily** |

The gap was in row three, and it turned out to be the whole thing. The probe that
raised that dialog was run from a page whose origin was never written down, and the
decision to abandon SignalR rested entirely on that one unrecorded reading. Whatever it
was, it was not 1406 gating this estate. **Write down the origin of a probe.**

## Why "we already proved SignalR works" is narrower than it sounds

When SignalR worked, the page was on `polaris-…-notprod` and the hub was on
`polaris-…-notprod`. Same origin. Zone 1406 was never consulted, because there was no
cross-domain request to consult it about.

Production will not look like that. Modern and DCF add our `<script src>` to their own
pages on their own host; our endpoints stay on polaris. So the one configuration in
which SignalR is known to work is the one configuration that will never ship — and the
QA-UI / UAT-implementation split is the first environment that reproduces the real
origin relationship honestly.

Note also that the delivery path was never the obstacle: the proxy already reverse-
proxies Azure SignalR Service (`location ~ ^/global-components/case-locking/api/sr/`)
and rewrites the negotiate response (`filterNegotiateBody`) so the client is sent to
our origin instead of `*.service.signalr.net`. Everything the Service needs is in
place. The only open question is the one XHR.

## Running it

Deploy cross-domain — UI on one host, implementation on the other:

```bash
DRY_RUN=0 ENV=test IMPL_ENV=uat EXCLUDE=classic-client ./deploy.local.sh
```

Then on a case in Modern or DCF, in the console:

```js
__ccPresence.setTransport("signalr")
__ccPresence.status()
```

**Watch the browser window, not only the console.** The failure mode we are looking
for is a modal dialog, and a dialog blocks script — so the console may simply stop
rather than report anything. That is how this was missed the first time.

## Reading the result

| What you see | What it means | What follows |
|---|---|---|
| Roster appears, `status().stats.state === "Connected"` | Negotiate survives cross-domain. Our reading of 1406 was wrong | SignalR is genuinely viable; decide on merit (below), not on possibility |
| Security dialog, then nothing | 1406 gates it, as assumed | JSONP stands. Route B below is the only remaining SignalR path |
| `loadFailed` in `status().stats` | The vendor bundle never arrived — not a SignalR result at all | Check the second artefact deployed alongside the first |
| Connects but no roster ever | The delivery-path failure, i.e. negotiate was skipped | `setSkipNegotiation(false)`, `reconnect()` |

## Route B — designed, then not needed

Kept as a record, because it is the answer if a zone ever *does* gate this. Negotiate
has to happen, but nothing says *we* must be the ones to make the XHR.

1. An njs handler performs both negotiate hops server-side (it already proxies both
   ends) and returns the resulting Service URL and connection token **as JSONP** —
   a `<script src>`, which the zone permits.
2. The client then builds the connection with `skipNegotiation: true` pointed at that
   URL and token. It is in the delivery path, because negotiate did happen; it made no
   cross-domain XHR, because the negotiate travelled by script tag.

This satisfies both constraints, and the WebSocket that follows is ungated. The cost is
a bespoke path nobody else in the world runs, plus token expiry to handle on reconnect —
which is why it was worth spending an hour testing the simple thing first.

## If it works, it still has to earn its place

Viability is not the same as the right answer:

- **JSONP is permanent regardless.** Classic is document mode 5 and is supported long
  term; it can never run SignalR. Adopting SignalR for Modern means maintaining two
  transports against one API forever, rather than one.
- **It is ~127KB of vendor code** against ~44KB for the whole current client, on a
  page we are a guest on.
- **The library is end of line** for this use: 3.1 is what still runs at document mode
  11.
- Against all that: push instead of a 3s poll, and it is the same transport the
  current global-components client already uses.

The honest summary is that JSONP wins on footprint and on having one mechanism for
both legacy apps, and SignalR wins on responsiveness and on matching what we do
elsewhere. This experiment settles only whether that trade is available to us at all.

## What the result means

**Known:** a page on `polaris-qa-notprod` negotiated (XHR, cross-origin), connected, and
received. So 1406 does not gate cross-domain XHR from that page — and because 1406 is a
property of **the page's zone**, not the target's, this generalises to every page in the
same zone, whatever host it calls. That is a much stronger result than one host pair.

**Still open, and cheap to close:**

1. **Liveness.** One notification is the snapshot you get on Connect; it proves the
   delivery path opened, not that it keeps delivering. Put a second person on the case
   and watch `status().stats.notifications` climb.
2. **Endurance.** Leave it connected for a few minutes: `keepAlives` rising,
   `keepAliveErrors` at zero, no `reconnects` — the session-eviction window is 10s and
   unforgiving.
3. **Zone membership of the REAL pages.** We proved it from a polaris host. Production
   inserts our script into CMS Modern / DCF pages on *their* host. If those pages land
   in the same zone — almost certainly Local Intranet — the result carries directly. If
   they are in a different zone with different settings, it does not. Check Page
   Properties (Zone) on a real page, or the site-to-zone GPO list.

**What it does NOT settle:** whether we should. JSONP is permanent for Classic either
way, so adopting SignalR for Modern means two transports against one API forever. That
trade is now a choice rather than a constraint — which is the whole value of this
exercise.
