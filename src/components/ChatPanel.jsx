import { useCallback, useRef, useState } from 'react';
import { searchQuery, streamChatResponse } from '../lib/api.js';
import ChatInput from './ChatInput.jsx';
import MessageList from './MessageList.jsx';
import SearchPanel from './SearchPanel.jsx';
import './ChatPanel.css';

function createMessage(role, content, extra = {}) {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date(),
    ...extra,
  };
}

export default function ChatPanel() {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [retrievedChunks, setRetrievedChunks] = useState([]);
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [contextStatus, setContextStatus] = useState(null);
  const [chatError, setChatError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef(null);

  const updateAssistantMessage = useCallback((messageId, updater) => {
    setMessages((currentMessages) => currentMessages.map((message) => (
      message.id === messageId ? updater(message) : message
    )));
  }, []);

  const handleSend = useCallback(async (rawMessage) => {
    const messageText = rawMessage.trim();
    if (!messageText || isStreaming) return;

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const userMessage = createMessage('user', messageText);
    const assistantMessage = createMessage('assistant', '', { isStreaming: true });

    setInputValue('');
    setChatError('');
    setContextStatus({ type: 'info', message: 'Retrieving relevant chunks...' });
    setIsSearchPanelOpen(false);
    setRetrievedChunks([]);
    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setIsSearching(true);

    let chunks = [];

    try {
      const payload = await searchQuery(messageText);
      chunks = payload.results ?? [];
      setRetrievedChunks(chunks);

      if (chunks.length > 0) {
        setIsSearchPanelOpen(true);
        setContextStatus(null);
      } else {
        setIsSearchPanelOpen(true);
        setContextStatus({
          type: 'warning',
          message: 'No matching chunks were found. The answer will not have document context.',
        });
      }
    } catch (error) {
      setIsSearchPanelOpen(true);
      setContextStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Context retrieval failed.',
      });
    } finally {
      setIsSearching(false);
    }

    setMessages((currentMessages) => [...currentMessages, assistantMessage]);
    setIsStreaming(true);

    try {
      await streamChatResponse({
        message: messageText,
        conversationId,
        context: { chunks },
        signal: abortController.signal,
        onToken: (content) => {
          updateAssistantMessage(assistantMessage.id, (message) => ({
            ...message,
            content: `${message.content}${content}`,
          }));
        },
        onDone: (payload) => {
          if (payload?.conversationId) {
            setConversationId(payload.conversationId);
          }
        },
      });

      updateAssistantMessage(assistantMessage.id, (message) => ({
        ...message,
        isStreaming: false,
      }));
    } catch (error) {
      if (error.name === 'AbortError') return;

      const errorMessage = error instanceof Error ? error.message : 'Chat generation failed.';
      setChatError(errorMessage);
      updateAssistantMessage(assistantMessage.id, (message) => ({
        ...message,
        content: message.content || errorMessage,
        isStreaming: false,
        isError: true,
      }));
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [conversationId, isStreaming, updateAssistantMessage]);

  return (
    <section className="chat-panel" aria-label="Knowledge chat">
      <div className="chat-panel__body">
        <MessageList messages={messages} isSearching={isSearching} />
        <SearchPanel
          isOpen={isSearchPanelOpen}
          chunks={retrievedChunks}
          status={contextStatus}
          onClose={() => setIsSearchPanelOpen(false)}
        />
      </div>

      {chatError && (
        <div className="chat-panel__error" role="alert">
          {chatError}
        </div>
      )}

      <div className="chat-panel__footer">
        <ChatInput
          value={inputValue}
          disabled={isStreaming}
          onChange={setInputValue}
          onSubmit={handleSend}
        />
      </div>
    </section>
  );
}
