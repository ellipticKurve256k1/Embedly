import { Search } from 'lucide-react';
import FileTransferRow, { UploadingTransferRow } from './FileTransferRow.jsx';

export default function TransferPane({
  title,
  count,
  variant,
  views = [],
  uploadingFiles = [],
  isLoading = false,
  searchValue,
  onSearchChange,
  selectedIds,
  allSelectableSelected,
  selectableCount,
  onSelectAll,
  onSelectFile,
  onRemoveFile,
  onEmbedFile,
  isActionDisabled = false,
  onClearAll,
  searchPlaceholder = 'Search files...',
  emptyTitle,
  emptyBody,
}) {
  const showSearch = typeof searchValue === 'string' && onSearchChange;
  const hasRows = views.length > 0 || uploadingFiles.length > 0;
  const showClear = Boolean(onClearAll) && count > 0;

  return (
    <section className={`transfer-pane is-${variant}`} aria-label={title}>
      <header className="transfer-pane-header">
        <div className="transfer-pane-title">
          <strong>{title}</strong>
          <span>{count}</span>
        </div>

        {showClear && (
          <button className="transfer-clear-button" type="button" onClick={onClearAll}>
            Clear all
          </button>
        )}
      </header>

      <div className="transfer-pane-tools">
        <label className="transfer-select-all">
          <input
            type="checkbox"
            checked={allSelectableSelected}
            disabled={selectableCount === 0}
            onChange={(event) => onSelectAll(event.target.checked)}
          />
          <span>Select all</span>
        </label>

        {showSearch && (
          <label className="transfer-search">
            <Search size={15} />
            <input
              type="search"
              value={searchValue}
              placeholder={searchPlaceholder}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>
        )}
      </div>

      <div className="transfer-pane-scroll">
        {uploadingFiles.map((file) => (
          <UploadingTransferRow key={file.id} file={file} />
        ))}

        {isLoading ? (
          <div className="transfer-empty-state">
            <strong>Loading files</strong>
            <span>Checking the document pool.</span>
          </div>
        ) : (
          views.map((view) => (
            <FileTransferRow
              key={view.document.id}
              view={view}
              variant={variant}
              isSelected={selectedIds.has(view.document.id)}
              onSelect={onSelectFile}
              onRemove={onRemoveFile}
              onEmbed={onEmbedFile}
              isActionDisabled={isActionDisabled}
            />
          ))
        )}

        {!isLoading && !hasRows && (
          <div className="transfer-empty-state">
            <strong>{emptyTitle}</strong>
            <span>{emptyBody}</span>
          </div>
        )}
      </div>
    </section>
  );
}
