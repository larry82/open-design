import { useEffect, useState } from 'react';
import {
  exportAllArtboardsAsZip,
  exportArtboardAsPng,
  listArtboards,
  type ArtboardCard,
} from '../runtime/exports';

interface Props {
  projectId: string;
  fileName: string;
  exportTitle: string;
  onClose: () => void;
}

type Selection = { kind: 'all' } | { kind: 'single'; card: number };

export function ExportArtboardsDialog({
  projectId,
  fileName,
  exportTitle,
  onClose,
}: Props) {
  const [cards, setCards] = useState<ArtboardCard[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: 'all' });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCards(null);
    setListError(null);
    listArtboards(projectId, fileName)
      .then((next) => {
        if (cancelled) return;
        setCards(next);
        if (next.length > 0) setSelection({ kind: 'all' });
      })
      .catch((err) => {
        if (cancelled) return;
        setListError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, fileName]);

  async function commit() {
    if (!cards || cards.length === 0 || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      if (selection.kind === 'all') {
        await exportAllArtboardsAsZip({
          projectId,
          fileName,
          title: exportTitle,
        });
      } else {
        const card = cards.find((c) => c.idx === selection.card);
        await exportArtboardAsPng({
          projectId,
          fileName,
          card: selection.card,
          title: exportTitle,
          cardLabel: card?.label,
        });
      }
      onClose();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  const ready = cards !== null && cards.length > 0;

  return (
    <div className="modal-backdrop" onClick={exporting ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export artboards as PNG</h2>
        <p className="hint">
          Each artboard renders at <strong>2× scale</strong> via the daemon's
          headless Chromium pipeline. Multi-artboard exports are streamed into a
          single ZIP.
        </p>

        {listError ? (
          <p className="hint" style={{ color: '#c84141' }}>
            Failed to list artboards: {listError}
          </p>
        ) : cards === null ? (
          <p className="hint">Detecting artboards…</p>
        ) : cards.length === 0 ? (
          <p className="hint">
            No <code>.dc-card</code> artboards detected in this file.
          </p>
        ) : (
          <>
            <p className="hint">
              {cards.length} artboard{cards.length === 1 ? '' : 's'} detected.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="export-scope"
                checked={selection.kind === 'all'}
                onChange={() => setSelection({ kind: 'all' })}
                disabled={exporting}
              />
              <span>All artboards (ZIP)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="export-scope"
                checked={selection.kind === 'single'}
                onChange={() =>
                  setSelection({ kind: 'single', card: cards[0]!.idx })
                }
                disabled={exporting}
              />
              <span>Single artboard:</span>
              <select
                value={selection.kind === 'single' ? selection.card : ''}
                disabled={selection.kind !== 'single' || exporting}
                onChange={(e) =>
                  setSelection({ kind: 'single', card: Number(e.target.value) })
                }
              >
                {cards.map((card) => (
                  <option key={card.idx} value={card.idx}>
                    #{card.idx} · {card.w}×{card.h}
                    {card.label ? ` · ${card.label}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {exporting ? (
          <p className="hint">
            {selection.kind === 'all'
              ? `Rendering ${cards?.length ?? '?'} artboards in one playwright session…`
              : 'Rendering artboard…'}
          </p>
        ) : null}
        {exportError ? (
          <p className="hint" style={{ color: '#c84141' }}>{exportError}</p>
        ) : null}

        <div className="row">
          <button onClick={onClose} disabled={exporting}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={commit}
            disabled={!ready || exporting}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
