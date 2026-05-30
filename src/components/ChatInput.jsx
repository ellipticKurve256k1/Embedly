import { SendHorizontal, Square } from 'lucide-react';
import './ChatInput.css';

export default function ChatInput({
  value,
  disabled,
  isStreaming = false,
  onStop,
  placeholder = 'Ask your knowledge base...',
  onChange,
  onSubmit,
}) {
  const canSend = value.trim().length > 0 && !disabled;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (canSend) {
      onSubmit(value);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        onSubmit(value);
      }
    }
  };

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <label className="chat-input__field">
        <span className="sr-only">Chat message</span>
        <textarea
          value={value}
          rows={1}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </label>
      {isStreaming ? (
        <button
          className="chat-input__stop"
          type="button"
          onClick={onStop}
          aria-label="Stop generating"
        >
          <Square size={20} />
        </button>
      ) : (
        <button
          className="chat-input__send"
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
        >
          <SendHorizontal size={20} />
        </button>
      )}
    </form>
  );
}
