// Which hosts are OutSystems. Knows both the outsystemsenterprise.com tenants
// and the CPS reverse proxies OutSystems is moving behind (oapps.int.cps.gov.uk
// in prod, oapps-<env>-notprod.int.cps.gov.uk elsewhere), so recognising OS needs
// no change when an environment moves across. It only classifies a host — which
// host an environment actually uses is whatever its config's URLs say.
const OUTSYSTEMS_HOSTNAME = /\.outsystemsenterprise\.com$|^oapps(-[a-z0-9]+-notprod)?\.int\.cps\.gov\.uk$/i;

export const isOutSystemsHostname = (hostname: string): boolean => OUTSYSTEMS_HOSTNAME.test(hostname);

export const isOutSystemsUrl = (href: string): boolean => {
  try {
    const url = new URL(href);
    return url.protocol.startsWith("http") && isOutSystemsHostname(url.hostname);
  } catch {
    return false;
  }
};
