// Task 51 (R2.7): detect a redirect-stub page — a 200 response whose only
// effect is to send the browser elsewhere (meta refresh or a body-level
// window.location / location.replace), so the death-date logic does not treat
// a parked "moved" placeholder as the site's last working state. Pure, offline.

import { describe, it, expect } from 'vitest';
import { classifyRedirectStub } from '../../src/core/redirect-stub.js';

// The real NASA Kids stub that returned 200 from 2006 to 2011.
const NASA_STUB =
  '<!doctype html><html><head><title>NASA - Kids Club</title></head>' +
  "<body><script>window.location.href='http://www.nasa.gov/audience/forkids/kidsclub/flash/index.html';</script>" +
  '<!-- redirection page --></body></html>';

describe('classifyRedirectStub (R2.7)', () => {
  it('detects a body-level window.location redirect stub', () => {
    const stub = classifyRedirectStub(NASA_STUB);
    expect(stub).not.toBeNull();
    expect(stub?.target).toBe(
      'http://www.nasa.gov/audience/forkids/kidsclub/flash/index.html',
    );
  });

  it('detects a meta-refresh redirect stub', () => {
    const html =
      '<html><head><meta http-equiv="refresh" content="0; url=/newhome.html">' +
      '<title>Moved</title></head><body>You will be redirected.</body></html>';
    const stub = classifyRedirectStub(html);
    expect(stub).not.toBeNull();
    expect(stub?.target).toBe('/newhome.html');
  });

  it('detects location.replace(...)', () => {
    const html =
      '<html><body><script>location.replace("https://x.example/");</script></body></html>';
    expect(classifyRedirectStub(html)).not.toBeNull();
  });

  it('passes a real content page that merely reads location', () => {
    const body = '<p>' + 'Real article content here. '.repeat(40) + '</p>';
    const html =
      `<html><head><title>Home</title></head><body>${body}` +
      '<script>var p=document.location.pathname;</script></body></html>';
    expect(classifyRedirectStub(html)).toBeNull();
  });

  it('passes a normal page with no redirect directive', () => {
    expect(
      classifyRedirectStub(
        '<html><body><h1>Hello</h1><p>some real content</p></body></html>',
      ),
    ).toBeNull();
  });
});
