# vnext (`global-components.vnext`)

**The advance copy of our changes to Polaris's global-components feature**
(`features/global-components/global-components.{conf,js}` in Polaris). We deploy it ourselves
so the changes work now, while the PR that carries them into Polaris is reviewed. When that PR
is deployed, Polaris's copies take over and these stop answering, without anyone deleting
anything.

## What it adds

| Route                                   | Change                                                                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/global-components/state/<key>`        | Polaris's GET/PUT unchanged, plus a JSONP read (`?callback=`) for the IE-mode legacy clients and the dual-engine write (`?set=&return=&done=`) that fills both the Edge and IE cookie jars. UTF-8 safe. |
| `/global-components/navigate-cms`       | Polaris's handler plus `target=modern` (RNAV-43): drives CMS Modern (`/viewer/landing#/case-summary/<id>`) instead of Classic; un-proxied, on the Classic host's paired Modern host (e.g. `cin3` → `cmsmodcin3`).                                                                         |
| `/global-components/[api/]swagger…`     | MDS's Swagger doc + UI, with the doc rewritten to point at this proxy, so "Try it out" works from the CPS network.                                                                                     |

`/global-components/state/preview` (the preview page and the legacy clients) used to be served
by cms-augmentation; it is plain state now, served here.

## How it yields to the PR — bronze, silver, gold

nginx picks `=` over `^~` over regex (first loaded wins) over plain prefix. A duplicate `=` or
`^~` stops nginx from starting; a duplicate regex does not.

- **Bronze — this module.** Regex locations only, so nothing here can collide with anything.
  Today they win: a regex beats Polaris's prefix locations outright, and beats Polaris's regexes
  because `features/global-components.vnext/` is loaded before `features/global-components/`
  (`.` sorts before `/` in the `include features/*/*.conf` glob — proven in the Docker layer).
- **Silver — the PR.** The same routes as `=`/`^~`, which beat every regex, so it wins the
  moment it deploys.
- **Gold — an emergency override** of a mainline route that must survive mainline (`=`/`^~` in
  one of our own features). Not used here.

`features.unit.test.js` enforces the bronze rule: regex locations only, each marked.

## The signal

Every location here adds `X-Gloco-Vnext: <route>`. While it is on a response, vnext answered;
once it is gone, Polaris's PR version did. The PR copies drop the header.

```
curl -sI https://<proxy>/global-components/state/preview | grep -i x-gloco-vnext
```

## Cutting the PR

Each block in the conf and the njs says where it goes:

- the conf's locations → `global-components.conf`, as `^~` (the shape is noted on each);
- the njs → `global-components.js`; its sections are marked COPIED (Polaris's, unchanged) or
  OURS (the delta);
- `js_var $gloco_vnext_mds_base_url` → however Polaris reads `WM_MDS_BASE_URL`.

Retire a section here only once every environment this module is deployed to runs the PR
version. A bronze section left behind is harmless meanwhile.

## Files

- `global-components.vnext.conf` — the locations, and the header explaining the tiers.
- `global-components.vnext.js` — njs: `handleState`, `handleNavigateCms`, `filterSwaggerBody`.
- `tests/` — unit tests (Node) and the Docker integration layer
  (`docker/docker-compose.vnext.yml`), which checks who answers each route.

## Deploying

`scripts/deploy-vnext.local.sh` (gitignored). Deploy vnext **before** a cms-augmentation that
no longer serves `state/preview`; the other way round, `state/preview` briefly falls back to
Polaris's plain state route, with no JSONP.

App settings: only Polaris's (`WM_MDS_BASE_URL`, `WM_MDS_ACCESS_KEY`, `WEBSITE_DNS_SERVER`).
