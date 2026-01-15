// Setup file for Jest
import '@testing-library/jest-dom';
import 'urlpattern-polyfill';

// Mock window.location for all tests
Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    href: 'http://localhost/',
    origin: 'http://localhost',
    protocol: 'http:',
    host: 'localhost',
    hostname: 'localhost',
    port: '',
    pathname: '/',
    search: '',
    hash: ''
  }
});