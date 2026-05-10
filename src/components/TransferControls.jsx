import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from 'lucide-react';

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
  canMoveAllRight,
  canMoveSelectedLeft,
  canMoveAllLeft,
  onMoveSelectedRight,
  onMoveAllRight,
  onMoveSelectedLeft,
  onMoveAllLeft,
}) {
  return (
    <div className="transfer-controls" aria-label="Move files between panes">
      <TransferButton
        label="Move selected files to embed queue"
        disabled={!canMoveSelectedRight}
        onClick={onMoveSelectedRight}
      >
        <ChevronRight size={18} />
      </TransferButton>

      <TransferButton
        label="Move all eligible files to embed queue"
        disabled={!canMoveAllRight}
        onClick={onMoveAllRight}
      >
        <ChevronsRight size={18} />
      </TransferButton>

      <TransferButton
        label="Move selected files back to available files"
        disabled={!canMoveSelectedLeft}
        onClick={onMoveSelectedLeft}
      >
        <ChevronLeft size={18} />
      </TransferButton>

      <TransferButton
        label="Move all files back to available files"
        disabled={!canMoveAllLeft}
        onClick={onMoveAllLeft}
      >
        <ChevronsLeft size={18} />
      </TransferButton>
    </div>
  );
}
