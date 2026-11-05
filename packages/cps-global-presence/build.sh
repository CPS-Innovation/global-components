#!/usr/bin/env bash
#
# build.sh — assemble the injected presence client.
#
#   ./build.sh   emits BOTH injected clients, each written under the name it is
#                PUBLISHED as (see the section at the foot of this file):
#                  dist/cms-augmentation/client-modern-unstable.js
#                                              common/ + modern/   (CMS Modern, DCF)
#                  dist/cms-augmentation/client-classic-unstable.js
#                                              common/ + classic/  (CMS Classic)
#                plus the two hello-world stubs that sit beside them and dist/esm/
#                for the web components. No vendor code, no Promise polyfill,
#                nothing patched onto the host page.
#
# A working SignalR transport is archived, with its vendor libraries removed and
# rehydration instructions, under infra/proxy/reference/signalr-presence-transport/.
#
# CODE SHARING
#   common/  runs in BOTH legacy clients, so it is held to the DOCUMENT MODE 5
#            floor — Classic's engine. Proven by check-syntax.js es3: ES3 syntax
#            plus a denylist of the ES5 runtime Classic does not have. There is no
#            tool that transpiles down to mode 5 (TypeScript removed its ES3
#            target, esbuild's floor is a partial es5, and Babel cannot conjure a
#            missing JSON or Array.prototype.forEach), so the floor is written by
#            hand and enforced mechanically.
#   modern/  Modern/DCF only (document mode 11), so ES5 is its floor.
#   classic/ CMS Classic only — document mode 5, so it is held to the SAME floor
#            as common/. It was a single hand-edited file until we took ownership
#            of it; it is generated now, and everything under dist/ is output, not
#            source.
#
# The order below matters: common/ declares CCP.* which modern/ consumes, and
# modern/main.js runs on load, so it goes last.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# WHERE THINGS LAND. Everything the deploys upload is in one folder, each file
# named for the blob it is uploaded as, and nothing else goes there:
#
#   dist/cms-augmentation/  the PUBLICATION names — the four at the foot of this file
#   dist/esm/index.js       the shared modules for the web components
#
# Both clients are written STRAIGHT to their publication name. There is one build
# of each, so an intermediate copy would only be a second name for one file.
#
# Until 2026-11-03 there were three Modern presentations (legacy-apps/modern{,-2,-3}/)
# emitted side by side into dist/skins/, with a MODERN_SKIN selector in
# deploy.local.sh choosing which one shipped. modern-3's pinned notification won;
# the other two and the selector are gone, so there is one Modern build again.
#
# The historic names cms-auth-v2-client.js and cms-presence-client.js are GONE from
# the build, from the nginx conf, and from the client sources. Nothing reads them;
# the blobs still sitting at those two names are the pre-switch generation, kept as
# the rollback. See the section at the foot of this file.
AUG_OUT="$DIR/dist/cms-augmentation"
CLASSIC_OUT="$AUG_OUT/client-classic-unstable.js"
MODERN_OUT="$AUG_OUT/client-modern-unstable.js"

# common/ is shared with the WEB COMPONENTS as well as both legacy clients, so it
# leads every bundle and is the only part exported as ESM.
SHARED="$DIR/common/presence-environment.js $DIR/common/presence-apps.js $DIR/common/presence-section-names.js $DIR/common/presence-joined.js $DIR/common/presence-people.js"
# ...except these, which live in common/ because the definitions belong beside
# their neighbours, but go ONLY to the web components. The legacy clients show a
# roster and interrupt nobody, so shipping the interruption rules into an IE-mode
# tab would be dead weight in a bundle where bytes are scarce. Still held to the
# mode 5 floor below with the rest of common/: the folder's contract does not
# bend for who happens to consume a file today.
SHARED_ESM_ONLY="$DIR/common/presence-section-rules.js"
# legacy-apps/common/ is shared between Classic and Modern/DCF and nothing else —
# JSONP, sessions and the script-origin trick have no meaning in a bundled app.
LEGACY_COMMON="$DIR/legacy-apps/common/presence-viewer.js $DIR/legacy-apps/common/presence-sections.js $DIR/legacy-apps/common/presence-origin.js $DIR/legacy-apps/common/presence-roster.js $DIR/legacy-apps/common/presence-locator.js $DIR/legacy-apps/common/presence-jsonp.js $DIR/legacy-apps/common/presence-sessions.js"
COMMON="$SHARED $LEGACY_COMMON"
# The web components' pinned notification, rebuilt by hand. govuk-frontend v5 dropped
# IE11 and these pages are document mode 11, so the design is recreated from its
# measurements rather than shared — see modern/bar.js.
MODERN="$DIR/legacy-apps/modern/sections.js $DIR/legacy-apps/modern/bar.js $DIR/legacy-apps/modern/main.js"
CLASSIC="$DIR/legacy-apps/classic/dom.js $DIR/legacy-apps/classic/sections.js $DIR/legacy-apps/classic/stripe.js $DIR/legacy-apps/classic/event-sink.js $DIR/legacy-apps/classic/main.js"
SWITCH="$DIR/legacy-apps/classic/kill-switch.js"
AUTH="$DIR/legacy-apps/classic/auth.js"

# Gate BEFORE building: a floor violation should fail here, naming the file and
# line, rather than surfacing as a blank page in an IE-mode tab.
mkdir -p "$AUG_OUT" "$DIR/dist/esm"

echo "--- floor checks ---"
node "$DIR/check-syntax.js" es3 $COMMON $SHARED_ESM_ONLY
node "$DIR/check-syntax.js" es3 $CLASSIC $AUTH
node "$DIR/check-syntax.js" es5 $MODERN
node "$DIR/check-syntax.js" es3 "$DIR/cms-augmentation-placeholders/client-classic.js"
node "$DIR/check-syntax.js" es5 "$DIR/cms-augmentation-placeholders/client-modern.js"

# common/ is plain JS, but tsc type-checks it from its JSDoc and REGENERATES
# types/common.d.ts — the surface global-components would import. Nothing is
# emitted into the shipping path; this only proves the shared code is internally
# consistent and keeps its published types from drifting. Skipped if the compiler
# is not present (a bare checkout of the proxy folder alone).
TSC="$DIR/../../node_modules/.bin/tsc"
if [ -x "$TSC" ]; then
  echo "--- types ---"
  "$TSC" -p "$DIR"
  # tsc's output describes OUR functions but only REFERENCES the API's wire shapes
  # (CCPSection, CCPNotification, CCPPerson) — it defines none of them, so it is not
  # usable on its own. Publish one self-contained file instead: the hand-written wire
  # contract followed by the generated surface.
  {
    echo "/* types/index.d.ts — GENERATED by build.sh. DO NOT EDIT."
    echo " *"
    echo " * The published surface of common/. Two halves:"
    echo " *   1. legacy-apps/common/types.d.ts   the wire shapes (hand-written:"
    echo " *                          they describe the SERVER's contract, so there is"
    echo " *                          nothing in our code to infer them from)"
    echo " *   2. types/common.d.ts   our functions, generated by tsc from the JSDoc"
    echo " *                          in common/*.js, so they cannot drift"
    echo " */"
    echo
    cat "$DIR/legacy-apps/common/types.d.ts"
    echo
    cat "$DIR/types/common.d.ts"
  } > "$DIR/types/index.d.ts"
  echo "ok   tsc  common/*.js type-checked, types/index.d.ts regenerated"
else
  echo "skip tsc  (compiler not found — types not re-checked)"
fi

# ---- the Modern/DCF client ----------------------------------------------------
#
# One IIFE in strict mode, unlike Classic's two: these pages are document mode 11
# and there is no second concern to isolate.
echo "--- output ---"
{
  echo "/* $(basename "$MODERN_OUT") — GENERATED by build.sh. DO NOT EDIT."
  echo " *"
  echo " * Presence client for CMS Modern (/viewer/) and DCF (/dcf/), which run in Edge"
  echo " * IE mode at document mode 11. JSONP transport — no vendor code, no Promise"
  echo " * polyfill, nothing patched onto the host page."
  echo " *"
  echo " * Assembled from:"
  echo " *   common/             shared with the web components AND the Classic client"
  echo " *   legacy-apps/common/ shared with the Classic client — mode 5 floor"
  echo " *   legacy-apps/modern/ this app only"
  echo " *"
  echo " * Edit those sources and re-run build.sh."
  echo " */"
  echo "(function () {"
  echo '  "use strict";'
  echo
  echo "  // Each common module declares its own CCP* namespace. Concatenation rather"
  echo "  // than modules: the injected script has no loader, and document mode 5 has no"
  echo "  // module system. Order matters — presence-sections defines what the others use."
  for f in $COMMON $MODERN; do
    echo
    echo "  /* ================= ${f#$DIR/} ================= */"
    sed 's/^/  /' "$f"
  done
  echo "})();"
} > "$MODERN_OUT"

node "$DIR/check-syntax.js" es5 "$MODERN_OUT"
grep -q "eyJ0eXAiOiJKV1Qi" "$MODERN_OUT" && { echo "ERROR: a credential leaked into the bundle" >&2; exit 1; }
echo "built $MODERN_OUT ($(wc -c < "$MODERN_OUT" | tr -d ' ') bytes), no credential"

# ---- the ESM entry, for the web components -----------------------------------
#
# A THIRD consumption path for the same sources. The legacy clients concatenate
# them into an IIFE and the tests eval them through new Function(); a bundler needs
# ESM, so this emits the shared modules followed by an export statement.
#
# Only what the web components actually import is listed. The rest of common/ is
# shareable in principle — presence-roster's reconciliation especially — but an
# export nothing consumes is dead code in their bundle, since these files assign to
# module-scope variables and cannot be tree-shaken away. Add here when a consumer
# appears, not before.
ESM_SHARED="$SHARED $SHARED_ESM_ONLY"
ESM_EXPORTS="CCPApps, CCPEnvironment, CCPJoined, CCPPeople, CCPSectionNames, CCPSectionRules"
ESM_OUT="$DIR/dist/esm/index.js"
{
  echo "/* dist/esm/index.js — GENERATED by build.sh. DO NOT EDIT."
  echo " *"
  echo " * The shared presence modules as an ES module, for the web components. The same"
  echo " * sources ship to CMS Classic and CMS Modern as concatenated IIFEs; this is the"
  echo " * bundler-facing shape of them, so the three clients cannot diverge."
  echo " */"
  for f in $ESM_SHARED; do
    echo
    echo "/* ================= ${f#$DIR/} ================= */"
    cat "$f"
  done
  echo
  echo "export { $ESM_EXPORTS };"
} > "$ESM_OUT"
echo "built $ESM_OUT ($(wc -c < "$ESM_OUT" | tr -d ' ') bytes)"

# ---- the Classic client ------------------------------------------------------
#
# Two IIFEs, exactly as the hand-written file had, because the header's promise
# still holds: a failure in one concern must not reach the other. The presence
# concern gets common/ inside its scope; the auth concern is self-contained and
# is appended untouched.
#
# NO "use strict" here, unlike the Modern bundle. This code has always run in
# sloppy mode at document mode 5, and turning it on now would be a behaviour
# change nobody asked for in someone else's application.
{
  echo "/* $(basename "$CLASSIC_OUT") — GENERATED by cps-global-presence/build.sh. DO NOT EDIT."
  echo " *"
  echo " * Injected into the persistent CMS Classic frameset shell (uaglCMS.aspx <head>),"
  echo " * which loads once per session and persists THROUGH login. Two independent"
  echo " * concerns, each its own IIFE so a failure in one cannot affect the other:"
  echo " *   1. section presence + the contact-edit logger"
  echo " *   2. the login -> auth iframe hand-off"
  echo " *"
  echo " * Document mode 5 (old JScript): no const/let/arrow, no trailing commas, no"
  echo " * Array.forEach/indexOf, no String.trim, no JSON, no querySelector, no"
  echo " * addEventListener. build.sh proves it with check-syntax.js es3."
  echo " *"
  echo " * Assembled from packages/cps-global-presence/:"
  echo " *   common/   shared with the Modern/DCF client"
  echo " *   classic/  this app only"
  echo " *"
  echo " * CMS_WATCHDOG_ENABLED (classic/kill-switch.js) is emitted at the top, outside"
  echo " * both IIFEs: set it false and redeploy to stop both concerns dead."
  echo " *"
  echo " * Edit those sources and re-run build.sh."
  echo " */"
  echo
  # OUTSIDE both IIFEs on purpose: both concerns read it, so it cannot live inside
  # either one. See the file's own header.
  cat "$SWITCH"
  echo "(function () {"
  for f in $COMMON $CLASSIC; do
    echo
    echo "  /* ================= ${f#$DIR/} ================= */"
    sed 's/^/  /' "$f"
  done
  echo "})();"
  echo
  cat "$AUTH"
} > "$CLASSIC_OUT"

node "$DIR/check-syntax.js" es3 "$CLASSIC_OUT"
grep -q "eyJ0eXAiOiJKV1Qi" "$CLASSIC_OUT" && { echo "ERROR: a credential leaked into the bundle" >&2; exit 1; }
echo "built $CLASSIC_OUT ($(wc -c < "$CLASSIC_OUT" | tr -d ' ') bytes), no credential"

# ---- the cms-augmentation publication names -----------------------------------
#
# The CMS maintainers have been asked to link these URLs from the real, unproxied
# CMS, in every environment:
#
#     /global-components/<env>/cms-augmentation/client-classic.js
#     /global-components/<env>/cms-augmentation/client-modern.js
#
# THOSE TWO NAMES ARE ALWAYS THE PLACEHOLDER, in every environment, prod included.
# They are the maintainers' contract: a link added before we are ready loads and
# runs rather than 404ing, and it goes on doing exactly that until we choose to
# reveal the real thing. Nothing about them varies by environment, so there is no
# env guard anywhere that could misfire and put a guest script into someone else's
# production application.
#
# The built clients are published BESIDE them, under -unstable names:
#
#     /global-components/<env>/cms-augmentation/client-classic-unstable.js
#     /global-components/<env>/cms-augmentation/client-modern-unstable.js
#
# Our OWN proxied CMS is what points at the -unstable pair (the sub_filter
# injections in infra/proxy/config/global-components.cms-auth-presence/), so we run
# the built clients from the to-be location while the maintainers' URLs stay inert.
# THE REVEAL IS THEN A ONE-LINE NGINX CHANGE -- drop "-unstable" from the injected
# src -- with no deploy and no rebuild.
#
# SWITCHED 2026-11-04. Those sub_filter lines now name the -unstable pair, so the
# proxied estate runs the clients built here. The blobs at the historic names are
# untouched by any deploy, which makes reverting the conf a complete rollback.
#
# The switch had to move TWO THINGS AT ONCE, and the reason is worth keeping:
# CCPOrigin used to find our own <script> tag by matching a marker against the
# injected filename, so renaming the blob broke the match -- and a marker that
# misses fell back to the HOST PAGE's origin SILENTLY, correct in the same-origin
# proxied estate and quietly wrong anywhere cross-domain. The marker is gone now.
# CCPOrigin.IMPL_ORIGIN is baked in by deploy.local.sh for the cross-domain case and
# ships as "" ("same origin as the page"), which is right for every same-host deploy
# and every CI deploy. So the names here can move again, and "-unstable" can be
# dropped for the reveal, with no code change and nothing to keep in step.
#
# CI copies the four files into the deploy artifact BY NAME, so they land in each
# environment's container on every deploy (prod only via deploy-all, like
# everything else), and nothing else in dist/ can reach a URL someone else's
# application loads. deploy.local.sh uploads the -unstable pair too, so a local
# deploy and a pipeline deploy put the same bytes at the same names.
#
# NOT SECRET, ONLY UNLINKED: the containers are created with --public-access
# container, so the blob LIST is readable. "-unstable" stops the maintainers
# wiring it up by accident; it does not hide it from anyone who looks.
#
# cms-augmentation-placeholders/ is therefore PERMANENT. It used to say here that
# the folder would be deleted once the real clients were ready; that was written
# assuming a clean cutover, and the stub is now a shipped artefact in its own
# right rather than scaffolding awaiting removal.
# Only the two stubs are copied in. The -unstable pair is already here: both client
# steps above wrote straight to their publication names, so there is nothing to pick
# between and nothing to copy.
cp "$DIR/cms-augmentation-placeholders/client-classic.js" "$AUG_OUT/client-classic.js"
cp "$DIR/cms-augmentation-placeholders/client-modern.js" "$AUG_OUT/client-modern.js"
for f in "$AUG_OUT/client-classic.js" "$AUG_OUT/client-modern.js" \
  "$AUG_OUT/client-classic-unstable.js" "$AUG_OUT/client-modern-unstable.js"; do
  grep -q "eyJ0eXAiOiJKV1Qi" "$f" && { echo "ERROR: a credential leaked into $f" >&2; exit 1; }
done
echo "built $AUG_OUT/client-{classic,modern}.js (placeholders)"
echo "built $AUG_OUT/client-classic-unstable.js ($(wc -c < "$AUG_OUT/client-classic-unstable.js" | tr -d ' ') bytes), client-modern-unstable.js ($(wc -c < "$AUG_OUT/client-modern-unstable.js" | tr -d ' ') bytes), no credential"

