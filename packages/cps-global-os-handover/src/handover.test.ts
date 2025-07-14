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
    beforeEach(() => {
      // Clear localStorage before each test
      global.localStorage = {
        clear: jest.fn(),
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        length: 0,
        key: jest.fn()
      };
    });

    test('redirects to token handover URL when cookies do not match localStorage', () => {
      // Set up localStorage with different cookies
      global.localStorage['$OS_Users$WorkManagementApp$ClientVars$Cookies'] = 'different-cookies';
      global.localStorage['$OS_Users$CaseReview$ClientVars$Cookies'] = 'different-cookies';

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

    test('returns target URL directly when cookies match localStorage', () => {
      // Set up localStorage with matching cookies
      global.localStorage['$OS_Users$WorkManagementApp$ClientVars$Cookies'] = 'test-cookies';
      global.localStorage['$OS_Users$CaseReview$ClientVars$Cookies'] = 'test-cookies';

      const result = handleRedirect({
        currentUrl: 'https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=test-cookies',
        cookieHandoverUrl: 'https://cin3.cps.gov.uk/polaris',
        tokenHandoverUrl: 'https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token'
      });

      // Should return the target URL directly, skipping token handover
      expect(result).toBe('https://example.com/target');
    });

    test('returns target URL when cookies match but are in different order', () => {
      // Set up localStorage with cookies in different order
      global.localStorage['$OS_Users$WorkManagementApp$ClientVars$Cookies'] = 'b=2; a=1; c=3';
      global.localStorage['$OS_Users$CaseReview$ClientVars$Cookies'] = 'a=1; c=3; b=2';

      const result = handleRedirect({
        currentUrl: 'https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=c=3; b=2; a=1',
        cookieHandoverUrl: 'https://cin3.cps.gov.uk/polaris',
        tokenHandoverUrl: 'https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token'
      });

      // Should return the target URL directly since all cookies are equivalent
      expect(result).toBe('https://example.com/target');
    });

    test('redirects to token handover when localStorage cookies are undefined', () => {
      // localStorage has no cookies set
      global.localStorage['$OS_Users$WorkManagementApp$ClientVars$Cookies'] = undefined;
      global.localStorage['$OS_Users$CaseReview$ClientVars$Cookies'] = undefined;

      const result = handleRedirect({
        currentUrl: 'https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=test-cookies',
        cookieHandoverUrl: 'https://cin3.cps.gov.uk/polaris',
        tokenHandoverUrl: 'https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token'
      });

      const url = new URL(result);
      expect(url.origin + url.pathname).toBe('https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token');
    });

    test('redirects to token handover when only one localStorage entry matches', () => {
      // Only one localStorage entry matches
      global.localStorage['$OS_Users$WorkManagementApp$ClientVars$Cookies'] = 'test-cookies';
      global.localStorage['$OS_Users$CaseReview$ClientVars$Cookies'] = 'different-cookies';

      const result = handleRedirect({
        currentUrl: 'https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-cookie-return&cc=test-cookies',
        cookieHandoverUrl: 'https://cin3.cps.gov.uk/polaris',
        tokenHandoverUrl: 'https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token'
      });

      const url = new URL(result);
      expect(url.origin + url.pathname).toBe('https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token');
    });
  });

  describe('os-token-return stage', () => {
    test('returns target URL and stores auth data', () => {
      const result = handleRedirect({
        currentUrl: 'https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=https://example.com/target&stage=os-token-return&cc=test-cookies&cms-modern-token=test-token',
        cookieHandoverUrl: 'https://cin3.cps.gov.uk/polaris',
        tokenHandoverUrl: 'https://polaris-qa-notprod.cps.gov.uk/auth-handover-cms-modern-token'
      });

      expect(result).toBe('https://example.com/target');
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