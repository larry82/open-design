import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import type { DesignSystemSummary } from '../types';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { DesignSystemsTab } from './DesignSystemsTab';
import { CenteredLoader } from './Loading';

interface Props {
  systems: DesignSystemSummary[];
  store: string;
  loading?: boolean;
}

export function PublicViewer({ systems, store, loading = false }: Props) {
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewSystemId, setPreviewSystemId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId((current) => {
      if (current && systems.some((system) => system.id === current)) return current;
      return systems[0]?.id ?? null;
    });
  }, [systems]);

  const previewSystem = useMemo(
    () => (previewSystemId ? systems.find((system) => system.id === previewSystemId) ?? null : null),
    [systems, previewSystemId],
  );

  return (
    <div className="entry-shell public-viewer-shell">
      <main className="entry-main">
        <div className="entry-header">
          <div className="entry-tabs" role="tablist" aria-label={t('entry.tabDesignSystems')}>
            <button type="button" className="top-tab active" aria-selected>
              {t('entry.tabDesignSystems')}
            </button>
          </div>
          <div className="entry-header-right" style={{ color: 'var(--text-faint)', fontSize: 12 }}>
            {store}
          </div>
        </div>
        <div className="entry-tab-content">
          {loading ? (
            <CenteredLoader label={t('entry.loadingWorkspace')} />
          ) : systems.length === 0 ? (
            <div className="tab-empty">{t('ds.emptyNoMatch')}</div>
          ) : (
            <DesignSystemsTab
              systems={systems}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onPreview={setPreviewSystemId}
            />
          )}
        </div>
      </main>
      {previewSystem ? (
        <DesignSystemPreviewModal system={previewSystem} onClose={() => setPreviewSystemId(null)} />
      ) : null}
    </div>
  );
}
