import { describe, it, expect } from 'vitest';
import {
  interpretUrlInput,
  resolvedUrl,
} from '../../src/ui/url-input-logic.js';

describe('interpretUrlInput', () => {
  it('treats blank input as empty', () => {
    expect(interpretUrlInput('')).toEqual({ kind: 'empty' });
    expect(interpretUrlInput('   ')).toEqual({ kind: 'empty' });
  });

  it('accepts absolute http(s) URLs (R1.1)', () => {
    expect(interpretUrlInput('https://example.com/page')).toEqual({
      kind: 'valid',
      url: 'https://example.com/page',
    });
    expect(interpretUrlInput('http://example.com')).toEqual({
      kind: 'valid',
      url: 'http://example.com/',
    });
  });

  it('preserves query and fragment on a valid URL', () => {
    const result = interpretUrlInput('https://example.com/a?b=1#c');
    expect(result).toEqual({
      kind: 'valid',
      url: 'https://example.com/a?b=1#c',
    });
  });

  it('offers https:// for a scheme-less host (R1.3)', () => {
    expect(interpretUrlInput('example.com/page')).toEqual({
      kind: 'guess',
      url: 'https://example.com/page',
      typed: 'example.com/page',
    });
  });

  it('rejects a non-http scheme and names it (R1.2)', () => {
    const result = interpretUrlInput('ftp://example.com/file');
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.message).toContain('ftp');
      expect(result.message.toLowerCase()).toContain('http');
    }
  });

  it('rejects javascript: input (never turned into a link)', () => {
    expect(interpretUrlInput('javascript:alert(1)').kind).toBe('invalid');
  });

  it('rejects input that is not a host', () => {
    expect(interpretUrlInput('just some words').kind).toBe('invalid');
    expect(interpretUrlInput('notahost').kind).toBe('invalid');
  });

  it('rejects a scheme with nothing after it', () => {
    expect(interpretUrlInput('http://').kind).toBe('invalid');
  });

  it('resolvedUrl returns the URL for valid and guess, null otherwise', () => {
    expect(resolvedUrl(interpretUrlInput('https://example.com'))).toBe(
      'https://example.com/',
    );
    expect(resolvedUrl(interpretUrlInput('example.com'))).toBe(
      'https://example.com/',
    );
    expect(resolvedUrl(interpretUrlInput(''))).toBeNull();
    expect(resolvedUrl(interpretUrlInput('ftp://x.example'))).toBeNull();
  });
});
