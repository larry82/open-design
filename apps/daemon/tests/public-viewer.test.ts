import { describe, expect, it } from 'vitest';
import {
  PUBLIC_VIEWER_STORE_COOKIE,
  filterDesignSystemsForPublicViewer,
  isPublicViewerBasicAuthAccepted,
  isPublicViewerDesignSystemPathAllowed,
  isPublicViewerStoreAllowed,
  isPublicViewerWriteMethod,
  persistPublicViewerStore,
  readPublicViewerStore,
} from '../src/public-viewer.js';

describe('public viewer helpers', () => {
  it('reads the locked store from the query string first', () => {
    expect(readPublicViewerStore({ query: { store: 'bair-rewind' }, headers: {} })).toBe('bair-rewind');
  });

  it('falls back to the persisted store cookie', () => {
    expect(readPublicViewerStore({ query: {}, headers: { cookie: `${PUBLIC_VIEWER_STORE_COOKIE}=bair-rewind` } })).toBe('bair-rewind');
  });

  it('persists a valid store lock as a cookie', () => {
    const calls = [] as Array<{ name: string; value: string; options: Record<string, unknown> }>;
    const res = {
      cookie(name: string, value: string, options: Record<string, unknown>) {
        calls.push({ name, value, options });
      },
    };
    const persisted = persistPublicViewerStore({ query: { store: 'bair-rewind' } }, res);
    expect(persisted).toBe('bair-rewind');
    expect(calls).toEqual([
      {
        name: PUBLIC_VIEWER_STORE_COOKIE,
        value: 'bair-rewind',
        options: { httpOnly: true, sameSite: 'lax', path: '/' },
      },
    ]);
  });

  it('filters the design-system list down to the locked store', () => {
    const systems = [
      { id: 'bair-rewind', title: 'Rewind' },
      { id: 'airbnb', title: 'Airbnb' },
    ];
    expect(filterDesignSystemsForPublicViewer(systems, 'bair-rewind')).toEqual([
      { id: 'bair-rewind', title: 'Rewind' },
    ]);
  });

  it('rejects direct navigation to another design system when locked', () => {
    expect(isPublicViewerStoreAllowed('bair-rewind', 'airbnb')).toBe(false);
    expect(isPublicViewerDesignSystemPathAllowed('/design-systems/airbnb', 'bair-rewind')).toBe(false);
    expect(isPublicViewerDesignSystemPathAllowed('/design-systems/bair-rewind', 'bair-rewind')).toBe(true);
  });

  it('treats mutating methods as read-only violations', () => {
    expect(isPublicViewerWriteMethod('POST')).toBe(true);
    expect(isPublicViewerWriteMethod('PATCH')).toBe(true);
    expect(isPublicViewerWriteMethod('GET')).toBe(false);
  });

  it('accepts the configured Basic auth password and optional username', () => {
    const header = `Basic ${Buffer.from('owner:swordfish').toString('base64')}`;
    expect(
      isPublicViewerBasicAuthAccepted(header, {
        username: 'owner',
        password: 'swordfish',
      }),
    ).toBe(true);
    expect(
      isPublicViewerBasicAuthAccepted(header, {
        username: 'owner',
        password: 'wrong',
      }),
    ).toBe(false);
  });
});
