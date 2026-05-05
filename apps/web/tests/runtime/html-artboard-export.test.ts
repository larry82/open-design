import { describe, expect, it } from 'vitest';

import {
  buildArtboardPngFilename,
  buildArtboardZipFilename,
  sanitizeExportFilenamePart,
} from '../../src/runtime/html-artboard-export';

describe('html artboard export filenames', () => {
  it('preserves unicode while normalizing spaces and slashes', () => {
    expect(sanitizeExportFilenamePart('  首頁 Hero / 封面  ', 'fallback')).toBe('首頁-Hero-封面');
  });

  it('builds per-artboard PNG filenames from the file and artboard names', () => {
    expect(buildArtboardPngFilename('Campaign Deck.html', '封面 / Hero Frame')).toBe(
      'Campaign-Deck-封面-Hero-Frame.png',
    );
  });

  it('builds the all-artboards ZIP filename from the file name', () => {
    expect(buildArtboardZipFilename('品牌 提案.html')).toBe('品牌-提案-export.zip');
  });
});
