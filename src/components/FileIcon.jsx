import { File, FileCode, FileText, Table } from 'lucide-react';

function getFileMeta(filename = '', mimeType = '') {
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  if (extension === 'pdf' || mimeType === 'application/pdf') {
    return { Icon: FileText, label: 'PDF', tone: 'pdf' };
  }

  if (extension === 'md' || mimeType.includes('markdown')) {
    return { Icon: FileCode, label: 'MD', tone: 'md' };
  }

  if (extension === 'csv' || mimeType.includes('csv')) {
    return { Icon: Table, label: 'CSV', tone: 'csv' };
  }

  if (extension === 'txt' || mimeType.startsWith('text/')) {
    return { Icon: FileText, label: 'TXT', tone: 'txt' };
  }

  return { Icon: File, label: extension ? extension.toUpperCase() : 'FILE', tone: 'file' };
}

export function getFileTypeLabel(filename, mimeType) {
  return getFileMeta(filename, mimeType).label;
}

export default function FileIcon({ filename, mimeType, size = 18 }) {
  const { Icon, label, tone } = getFileMeta(filename, mimeType);

  return (
    <span className={`file-type-icon is-${tone}`} aria-label={`${label} file`}>
      <Icon size={size} />
    </span>
  );
}
