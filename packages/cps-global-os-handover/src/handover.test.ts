import { describe, test, expect } from '@jest/globals';
import { createOutboundUrl, handleRedirect } from './handover';

describe('createOutboundUrl', () => {
  test('creates correct outbound URL with stage and return parameters', () => {
    const result = createOutboundUrl({
      handoverUrl: 'https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html',
      targetUrl: 'https://example.com/target'
    });

    const url = new URL(result);
    expect(url.searchParams.get('stage')).toBe('os-outbound');
    expect(url.searchParams.get('r')).toBe('https://example.com/target');
    expect(url.origin + url.pathname).toBe('https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html');
  });
});

describe('handleRedirect', () => {
  describe('os-outbound stage', () => {
    test('redirects to cookie handover URL with correct parameters', () => {
      const result = handleRedirect({
        currentUrl: 'https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-outbound',
        cookieHandoverUrl: 'https://cin3.cps.gov.uk/polaris',
        tokenHandoverUrl: 'https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token'
      });

      const url = new URL(result);
      expect(url.origin + url.pathname).toBe('https://cin3.cps.gov.uk/polaris');
      
      const returnUrl = new URL(url.searchParams.get('r')!);
      expect(returnUrl.searchParams.get('stage')).toBe('os-cookie-return');
      expect(returnUrl.searchParams.get('r')).toBe('https://example.com/target');
    });
  });

  describe('os-cookie-return stage', () => {
    test('redirects to token handover URL with cookies', () => {
      const result = handleRedirect({
        currentUrl: 'https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=test-cookies',
        cookieHandoverUrl: 'https://cin3.cps.gov.uk/polaris',
        tokenHandoverUrl: 'https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token'
      });

      const url = new URL(result);
      expect(url.origin + url.pathname).toBe('https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token');
      expect(url.searchParams.get('cc')).toBe('test-cookies');
      
      const returnUrlParam = url.searchParams.get('r')!;
      const returnUrl = new URL(returnUrlParam);
      // The return URL has the updated stage but cookies are stripped
      expect(returnUrl.searchParams.get('stage')).toBe('os-token-return');
      expect(returnUrl.searchParams.get('r')).toBe('https://example.com/target');
      // Cookies are passed as a separate parameter to the token handover URL
      expect(url.searchParams.get('cc')).toBe('test-cookies');
    });
  });

  describe('os-token-return stage', () => {
    test('returns target URL and logs auth data', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = handleRedirect({
        currentUrl: 'https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token',
        cookieHandoverUrl: 'https://cin3.cps.gov.uk/polaris',
        tokenHandoverUrl: 'https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token'
      });

      expect(result).toBe('https://example.com/target');
      expect(consoleSpy).toHaveBeenCalledWith({
        target: 'https://example.com/target',
        cookies: 'test-cookies',
        token: 'test-token'
      });

      consoleSpy.mockRestore();
    });
  });

  describe('unknown stage', () => {
    test('throws error for unknown stage', () => {
      expect(() => {
        handleRedirect({
          currentUrl: 'https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=unknown',
          cookieHandoverUrl: 'https://cin3.cps.gov.uk/polaris',
          tokenHandoverUrl: 'https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token'
        });
      }).toThrow('Unknown stage query parameter: unknown');
    });

    test('throws error for missing stage', () => {
      expect(() => {
        handleRedirect({
          currentUrl: 'https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target',
          cookieHandoverUrl: 'https://cin3.cps.gov.uk/polaris',
          tokenHandoverUrl: 'https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token'
        });
      }).toThrow('Unknown stage query parameter: empty');
    });
  });
});