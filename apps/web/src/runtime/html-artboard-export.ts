import JSZip from 'jszip';
import { domToBlob } from 'modern-screenshot';

const EXPORT_LOG_PREFIX = '[html-artboard-export]';
const EXPORT_CAPTURE_STYLE = `
  html, body {
    margin: 0;
    padding: 0;
    background: transparent;
  }

  .twk-panel,
  [data-od-comment-bridge],
  [data-od-comment-bridge-style] {
    display: none !important;
    visibility: hidden !important;
  }
`;

export type HtmlArtboardExportScope = 'current' | 'all';

export interface ExportHtmlArtboardsOptions {
  fileName: string;
  html: string;
  baseHref?: string;
  scope: HtmlArtboardExportScope;
  currentArtboardIndex?: number | null;
}

export interface ExportHtmlArtboardsResult {
  scope: HtmlArtboardExportScope;
  exportedCount: number;
  currentArtboardIndex: number;
}

export async function exportHtmlArtboards(
  options: ExportHtmlArtboardsOptions,
): Promise<ExportHtmlArtboardsResult> {
  const iframe = await mountExportIframe(
    buildArtboardExportDocument(options.html, options.baseHref),
  );

  try {
    const doc = iframe.contentDocument;
    if (!doc) {
      throw new Error('Export preview did not finish loading.');
    }

    await waitForRenderableContent(doc);

    const artboards = Array.from(doc.querySelectorAll<HTMLElement>('.dc-card'));
    if (artboards.length === 0) {
      throw new Error('No .dc-card artboards were found to export.');
    }

    const currentArtboardIndex = resolveCurrentArtboardIndex({
      artboards,
      preferredIndex: options.currentArtboardIndex,
    });
    const indexes =
      options.scope === 'current'
        ? [currentArtboardIndex]
        : artboards.map((_artboard, index) => index);

    console.info(`${EXPORT_LOG_PREFIX} starting`, {
      scope: options.scope,
      artboardCount: artboards.length,
      currentArtboardIndex,
      fileName: options.fileName,
    });

    if (options.scope === 'current') {
      const artboard = artboards[currentArtboardIndex]!;
      const artboardName = inferArtboardName(artboard, currentArtboardIndex);
      const blob = await captureArtboardBlob(artboard, artboardName, currentArtboardIndex, artboards.length);
      downloadBlob(blob, buildArtboardPngFilename(options.fileName, artboardName));
      return {
        scope: options.scope,
        exportedCount: 1,
        currentArtboardIndex,
      };
    }

    const zip = new JSZip();
    for (const index of indexes) {
      const artboard = artboards[index]!;
      const artboardName = inferArtboardName(artboard, index);
      const blob = await captureArtboardBlob(artboard, artboardName, index, artboards.length);
      zip.file(buildArtboardPngFilename(options.fileName, artboardName), blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, buildArtboardZipFilename(options.fileName));

    return {
      scope: options.scope,
      exportedCount: indexes.length,
      currentArtboardIndex,
    };
  } finally {
    iframe.remove();
  }
}

export function buildArtboardPngFilename(fileName: string, artboardName: string): string {
  const fileSlug = sanitizeExportFilenamePart(stripFileExtension(fileName), 'artboard');
  const artboardSlug = sanitizeExportFilenamePart(artboardName, 'artboard');
  return `${fileSlug}-${artboardSlug}.png`;
}

export function buildArtboardZipFilename(fileName: string): string {
  const fileSlug = sanitizeExportFilenamePart(stripFileExtension(fileName), 'artboard');
  return `${fileSlug}-export.zip`;
}

export function sanitizeExportFilenamePart(raw: string, fallback: string): string {
  const cleaned = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

function stripFileExtension(fileName: string): string {
  const stripped = String(fileName ?? '').replace(/\.[^.]+$/u, '');
  return stripped || String(fileName ?? '');
}

function buildArtboardExportDocument(html: string, baseHref?: string): string {
  const wrapped = wrapHtmlDocument(html);
  const withoutScripts = wrapped.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const withBase = baseHref ? injectBaseHref(withoutScripts, baseHref) : withoutScripts;
  return injectExportStyle(withBase);
}

function wrapHtmlDocument(html: string): string {
  const trimmed = html.trimStart().toLowerCase();
  if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) return html;
  return `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n</head>\n<body>${html}</body>\n</html>`;
}

function injectBaseHref(doc: string, baseHref: string): string {
  const safeHref = escapeHtmlAttribute(baseHref);
  const tag = `<base href="${safeHref}">`;
  if (/<head[^>]*>/i.test(doc)) {
    return doc.replace(/<head[^>]*>/i, (match) => `${match}${tag}`);
  }
  if (/<html[^>]*>/i.test(doc)) {
    return doc.replace(/<html[^>]*>/i, (match) => `${match}<head>${tag}</head>`);
  }
  return `${tag}${doc}`;
}

function injectExportStyle(doc: string): string {
  const tag = `<style data-od-artboard-export>${EXPORT_CAPTURE_STYLE}</style>`;
  if (/<\/head>/i.test(doc)) return doc.replace(/<\/head>/i, `${tag}</head>`);
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (match) => `${match}${tag}`);
  return `${tag}${doc}`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function mountExportIframe(srcdoc: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.tabIndex = -1;
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '2200px';
  iframe.style.height = '2200px';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.border = '0';
  iframe.srcdoc = srcdoc;

  const loadPromise = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('Timed out while preparing the export preview.'));
    }, 30_000);

    iframe.addEventListener(
      'load',
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });

  document.body.appendChild(iframe);
  await loadPromise;
  return iframe;
}

async function waitForRenderableContent(doc: Document): Promise<void> {
  const fontSet = doc.fonts;
  if (fontSet?.ready) {
    await fontSet.ready.catch((error) => {
      console.warn(`${EXPORT_LOG_PREFIX} fonts.ready failed`, error);
    });
  }

  const images = Array.from(doc.images);
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        }),
    ),
  );

  await waitForAnimationFrame(doc.defaultView);
  await waitForAnimationFrame(doc.defaultView);
}

function waitForAnimationFrame(view: Window | null): Promise<void> {
  if (!view) return Promise.resolve();
  return new Promise((resolve) => view.requestAnimationFrame(() => resolve()));
}

function resolveCurrentArtboardIndex(input: {
  artboards: HTMLElement[];
  preferredIndex?: number | null;
}): number {
  const { artboards, preferredIndex } = input;
  if (
    typeof preferredIndex === 'number' &&
    Number.isInteger(preferredIndex) &&
    preferredIndex >= 0 &&
    preferredIndex < artboards.length
  ) {
    return preferredIndex;
  }

  const flaggedIndex = artboards.findIndex((artboard) =>
    artboard.matches('.active, .is-active, .current, [aria-hidden="false"]'),
  );
  if (flaggedIndex >= 0) return flaggedIndex;

  const visibleIndex = artboards.findIndex((artboard) => {
    const style = artboard.ownerDocument.defaultView?.getComputedStyle(artboard);
    if (!style) return true;
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  });
  if (visibleIndex >= 0) return visibleIndex;

  return 0;
}

function inferArtboardName(artboard: HTMLElement, index: number): string {
  const candidates = [
    artboard.getAttribute('data-artboard-name'),
    artboard.getAttribute('data-name'),
    artboard.getAttribute('data-screen-label'),
    artboard.getAttribute('aria-label'),
    artboard.getAttribute('title'),
    artboard.getAttribute('id'),
  ];

  const descendantLabel = artboard.querySelector<HTMLElement>('[data-screen-label], [aria-label], [title], h1, h2, h3]');
  if (descendantLabel) {
    candidates.push(
      descendantLabel.getAttribute('data-screen-label'),
      descendantLabel.getAttribute('aria-label'),
      descendantLabel.getAttribute('title'),
      descendantLabel.textContent,
    );
  }

  const firstCandidate = candidates
    .map((value) => String(value ?? '').trim())
    .find((value) => value.length > 0);

  return sanitizeExportFilenamePart(firstCandidate ?? '', `artboard-${String(index + 1).padStart(2, '0')}`);
}

async function captureArtboardBlob(
  artboard: HTMLElement,
  artboardName: string,
  index: number,
  total: number,
): Promise<Blob> {
  console.info(`${EXPORT_LOG_PREFIX} capturing artboard`, {
    artboardName,
    index,
    total,
  });

  return domToBlob(artboard, {
    scale: 2,
    type: 'image/png',
    timeout: 30_000,
    debug: true,
    filter: (node) => {
      if (!(node instanceof Element)) return true;
      return !node.matches('.twk-panel, script, noscript');
    },
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
