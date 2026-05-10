import { SendHorizontal } from 'lucide-react';
import './ChatInput.css';

export default function ChatInput({
  value,
  disabled,
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
      <button
        className="chat-input__send"
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
      >
        <SendHorizontal size={20} />
      </button>
    </form>
  );
}
