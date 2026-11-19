import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  statusContent,
  partialBanner,
  type BannerStatus,
} from '../../src/ui/status-banner.js';
import { StatusBanner } from '../../src/ui/StatusBanner.js';
import type { AssetResult, AssetStatus } from '../../src/core/types.js';

function render(status: BannerStatus, onRetry?: () => void): string {
  return renderToStaticMarkup(
    createElement(StatusBanner, onRetry ? { status, onRetry } : { status }),
  );
}

describe('statusContent covers every design.md §11 state', () => {
  const kinds: BannerStatus[] = [
    { kind: 'invalid-url', message: 'bad' },
    { kind: 'no-captures', url: 'http://x.example' },
    { kind: 'no-working-capture', url: 'http://x.example' },
    { kind: 'slow' },
    { kind: 'rate-limited' },
    { kind: 'timeout' },
    { kind: 'outage' },
    { kind: 'network' },
    { kind: 'partial', recoveredCount: 1, missingCount: 1, uncheckedCount: 0 },
    { kind: 'flash-missing' },
    { kind: 'ruffle-failure' },
  ];

  it('gives each state a non-empty title and detail', () => {
    for (const status of kinds) {
      const content = statusContent(status);
      expect(content.title.length).toBeGreaterThan(0);
      expect(content.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('StatusBanner messages (R8.1–R8.6)', () => {
  it('no captures: explains the archive has no copy, with a next step (R8.1)', () => {
    const html = render({ kind: 'no-captures', url: 'http://gone.example' });
    expect(html).toContain('No contact');
    expect(html).toContain('no saved copy of http://gone.example');
    expect(html).toContain('try a different address');
  });

  it('no working capture: explains saved-but-never-200 and offers the fallback (R2.3)', () => {
    const html = render({
      kind: 'no-working-capture',
      url: 'http://x.example',
      fallbackDate: '3 March 2008',
    });
    expect(html).toContain('never with a working (200) response');
    expect(html).toContain('3 March 2008');
  });

  it('rate limited: says the archive asked us to slow down, with a countdown (R8.3)', () => {
    const html = render({ kind: 'rate-limited', retryInSeconds: 5 });
    expect(html).toContain('asked us to slow down');
    expect(html).toContain('5 seconds');
  });

  it('outage: states it is the archive/network side, not the URL, and offers retry (R8.4)', () => {
    const retry = () => {};
    const html = render({ kind: 'outage' }, retry);
    expect(html).toContain('not your address');
    expect(html).toContain('Try again');
    expect(html).toContain('role="alert"');
  });

  it('partial: counts only checked files, naming the misses (R8.5, R4.3)', () => {
    const html = render({
      kind: 'partial',
      recoveredCount: 34,
      missingCount: 7,
      uncheckedCount: 0,
    });
    // checked = 34 + 7 = 41; all 41 were checked here.
    expect(html).toContain('34 of 41 checked files came back');
    expect(html).toContain('7 could not be reached');
  });

  it('partial: names unchecked files honestly, never as failures (task 53)', () => {
    const html = render({
      kind: 'partial',
      recoveredCount: 4,
      missingCount: 2,
      uncheckedCount: 13,
    });
    // checked = 6; only the 2 missing could not be reached.
    expect(html).toContain('4 of 6 checked files came back');
    expect(html).toContain('2 could not be reached');
    expect(html).toContain('13 more were not checked');
    expect(html).toContain('to keep requests to the archive low');
    // The 13 unchecked files are not described as unreachable failures.
    expect(html).not.toContain('13 could not be reached');
  });

  it('flash missing: plain not-saved message (R6.3)', () => {
    const html = render({ kind: 'flash-missing' });
    expect(html).toContain('no copy was saved');
    expect(html).toContain('cannot be played');
  });

  it('ruffle failure: plain message, rest of page still shown (R6.5)', () => {
    const html = render({ kind: 'ruffle-failure' });
    expect(html).toContain('could not start');
    expect(html).toContain('rest of the page is shown');
  });

  it('shows a retry control only for retryable states', () => {
    expect(render({ kind: 'outage' }, () => {})).toContain('Try again');
    expect(render({ kind: 'no-captures', url: 'x' }, () => {})).not.toContain(
      'Try again',
    );
  });

  it('offers a retry control on every archive-side failure (R8.9)', () => {
    const retry = () => {};
    for (const status of [
      { kind: 'rate-limited' },
      { kind: 'timeout' },
      { kind: 'outage' },
      { kind: 'network' },
    ] as const) {
      expect(statusContent(status).retryable).toBe(true);
      expect(render(status, retry)).toContain('Try again');
    }
  });
});

describe('partialBanner gating (task 53): only checked misses trigger it', () => {
  const asset = (status: AssetStatus, originalUrl: string): AssetResult =>
    status === 'recovered'
      ? { originalUrl, kind: 'image', status, archiveUrl: 'x' }
      : { originalUrl, kind: 'image', status };

  it('returns null when nothing checked is missing, even with unchecked assets', () => {
    const assets: AssetResult[] = [asset('recovered', 'a')];
    for (let i = 0; i < 13; i++) {
      assets.push(asset('unknown', `u${i}`));
    }
    // 1 recovered, 0 missing, 13 unchecked: no "partial contact" banner, because
    // nothing that was checked is actually missing.
    expect(partialBanner(assets)).toBeNull();
  });

  it('returns a partial status with checked and unchecked counts when a checked asset is missing', () => {
    const assets: AssetResult[] = [
      asset('recovered', 'a'),
      asset('recovered', 'b'),
      asset('recovered', 'c'),
      asset('recovered', 'd'),
      asset('missing', 'e'),
      asset('missing', 'f'),
    ];
    for (let i = 0; i < 13; i++) {
      assets.push(asset('unknown', `u${i}`));
    }
    expect(partialBanner(assets)).toEqual({
      kind: 'partial',
      recoveredCount: 4,
      missingCount: 2,
      uncheckedCount: 13,
    });
  });
});
