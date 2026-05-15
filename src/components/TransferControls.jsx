import { ChevronLeft, ChevronRight } from 'lucide-react';

function TransferButton({ label, children, disabled, onClick }) {
  return (
    <button
      className="transfer-control-button"
      type="button"
      aria-label={label}
      title={label}
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
        disabled={!canMoveSelectedRight}
        onClick={onMoveSelectedRight}
      >
        <ChevronRight size={18} />
      </TransferButton>

      <TransferButton
        label="Move selected files back to available files"
        disabled={!canMoveSelectedLeft}
        onClick={onMoveSelectedLeft}
      >
        <ChevronLeft size={18} />
      </TransferButton>
    </div>
  );
}
