# JAWS title test rig

A small static rig for testing how JAWS (and other screen readers) announce a
transient redirect page under different `<title>` strategies. It exists to
validate the fix for the auth-handover page announcing its URL on load
(FCT2-20379).

## Where it lives / why

These files sit under `public/` so Vite copies them to the deploy root
**verbatim**. That matters: the whole point is testing exact title bytes (an
empty title vs. a single space), and a build step that re-serialises the HTML
could collapse `<title> </title>` into `<title></title>` and silently invalidate
the whitespace test. Nothing here is a Vite build entry, so `vite.config.ts` is
untouched.

## URL

After deploy, the hub is at:

```
<accessibility-site-root>/jaws-title-test/index.html
```

Give a JAWS user that URL.

## How to use

1. Turn JAWS on and open the hub URL.
2. (Optional) Change the **Redirect delay** — how long each redirect page lingers
   before bouncing back. Longer gives JAWS more time to reach the title
   announcement; `0` is an instant redirect. It applies to every link.
3. Activate a link. The redirect page loads, then immediately bounces you back to
   the hub (via `location.replace`, so there is no back-button trap). The hub
   shows a banner confirming which test you returned from.
4. Note what JAWS announced *on the redirect page*: the URL, the title text, or
   silence.

## The tests

| Link             | Redirect page title                | What it probes                                             |
| ---------------- | ---------------------------------- | ---------------------------------------------------------- |
| Empty title      | `<title></title>`                  | Does an empty title still trigger the URL fallback?        |
| Whitespace title | `<title> </title>`                 | Does a blank-but-non-empty title suppress the URL?         |
| Defocus title    | `<title>Loading</title>` + focus steal | Does stealing focus on load cut off the speech stream? |
| Meaningful title | `<title>Application handover page</title>` | The shipped value — is it announced calmly?        |

The redirect pages are identical apart from the title strategy (same body text,
same redirect logic) so the title is the only variable.

## Notes

- Each redirect page's script is inline (not a shared file) so the defocus
  focus-steal fires with zero network latency.
- Pages carry `<meta name="robots" content="noindex">`.
