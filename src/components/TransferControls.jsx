import { ChevronLeft, ChevronRight } from 'lucide-react';
import './TransferControls.css';

function TransferButton({ label, disabledLabel, children, disabled, onClick }) {
  const activeLabel = disabled && disabledLabel ? disabledLabel : label;
  return (
    <button
      className="transfer-control-button"
      type="button"
      aria-label={label}
      title={activeLabel}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function TransferControls({
  canMoveSelectedRight,
  canMoveSelectedLeft,
  onMoveSelectedRight,
  onMoveSelectedLeft,
}) {
  return (
    <div className="transfer-controls" aria-label="Move files between panes">
      <TransferButton
        label="Move selected files to Knowledge Base"
        disabledLabel="Select files in Available to move them"
        disabled={!canMoveSelectedRight}
        onClick={onMoveSelectedRight}
      >
        <ChevronRight size={18} />
      </TransferButton>

      <TransferButton
        label="Move selected files back to Available"
        disabledLabel="Select files in Knowledge Base to return them"
        disabled={!canMoveSelectedLeft}
        onClick={onMoveSelectedLeft}
      >
        <ChevronLeft size={18} />
      </TransferButton>
    </div>
  );
}
