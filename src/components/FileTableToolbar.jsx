import { Search, Sparkles, Trash2 } from 'lucide-react';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'embedding', label: 'Embedding' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

export default function FileTableToolbar({
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  sortBy,
  onSortByChange,
  selectedCount,
  canEmbedSelected,
  failedVisibleCount,
  onEmbedSelected,
  onRetryFailed,
  onDeleteSelected,
}) {
  return (
    <div className="file-toolbar" aria-label="File controls">
      <label className="file-toolbar-search">
        <Search size={16} />
        <input
          type="search"
          value={searchQuery}
          placeholder="Search files..."
          onChange={(event) => onSearchQueryChange(event.target.value)}
        />
      </label>

      <div className="file-status-tabs" aria-label="Filter by status">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            className={`file-status-tab${statusFilter === tab.value ? ' is-active' : ''}`}
            type="button"
            onClick={() => onStatusFilterChange(tab.value)}
          >
            <span>{tab.label}</span>
            <span className="file-status-tab-count">{statusCounts[tab.value] ?? 0}</span>
          </button>
        ))}
      </div>

      <label className="file-sort-select">
        <span>Sort</span>
        <select value={sortBy} onChange={(event) => onSortByChange(event.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name (A-Z)</option>
          <option value="size">Size (largest)</option>
        </select>
      </label>

      {(selectedCount > 0 || failedVisibleCount > 0) && (
        <div className="bulk-action-bar" role="status" aria-live="polite">
          {selectedCount > 0 && (
            <span className="bulk-action-count">{selectedCount} selected</span>
          )}

          {selectedCount > 0 && canEmbedSelected && (
            <button className="bulk-action-button is-primary" type="button" onClick={onEmbedSelected}>
              <Sparkles size={14} />
              <span>Embed selected</span>
            </button>
          )}

          {failedVisibleCount > 0 && (
            <button className="bulk-action-button" type="button" onClick={onRetryFailed}>
              <Sparkles size={14} />
              <span>Retry failed</span>
            </button>
          )}

          {selectedCount > 0 && (
            <button className="bulk-action-button is-danger" type="button" onClick={onDeleteSelected}>
              <Trash2 size={14} />
              <span>Delete selected</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
