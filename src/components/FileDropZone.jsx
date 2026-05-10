import { LoaderCircle, UploadCloud } from 'lucide-react';

export default function FileDropZone({
  inputRef,
  isDragOver,
  isUploading,
  uploadingCount,
  onClick,
  onKeyDown,
  onDragOver,
  onDragLeave,
  onDrop,
  onFilesSelected,
}) {
  return (
    <section
      className={`file-drop-zone${isDragOver ? ' is-drag-over' : ''}${isUploading ? ' is-loading' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Drop files here or click to upload"
    >
      <input
        ref={inputRef}
        className="upload-input"
        type="file"
        multiple
        accept=".pdf,.txt,.md,.csv"
        onChange={(event) => {
          if (event.target.files.length) onFilesSelected(event.target.files);
          event.target.value = '';
        }}
      />

      <span className="file-drop-zone-icon">
        {isUploading ? <LoaderCircle size={22} /> : <UploadCloud size={22} />}
      </span>

      <div className="file-drop-zone-copy">
        <strong>{isUploading ? 'Uploading files' : 'Drop files here or click to upload'}</strong>
        <span>
          {isUploading && uploadingCount > 0
            ? `${uploadingCount} file${uploadingCount === 1 ? '' : 's'} being added`
            : 'Accepted: PDF, TXT, MD, CSV'}
        </span>
      </div>
    </section>
  );
}
