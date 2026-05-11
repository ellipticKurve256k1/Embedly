import { useCallback, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { streamChatResponse } from '../lib/api.js';
import ChatInput from './ChatInput.jsx';
import MessageList from './MessageList.jsx';
import SourcesPanel from './SourcesPanel.jsx';
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
  const [citedIndices, setCitedIndices] = useState([]);
  const [retrievalQuery, setRetrievalQuery] = useState('');
  const [originalQuery, setOriginalQuery] = useState('');
  const [wasRewritten, setWasRewritten] = useState(false);
  const [sourcesCollapsed, setSourcesCollapsed] = useState(true);
  const [contextStatus, setContextStatus] = useState(null);
  const [chatError, setChatError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef(null);

  const resetConversation = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setRetrievedChunks([]);
    setCitedIndices([]);
    setRetrievalQuery('');
    setOriginalQuery('');
    setWasRewritten(false);
    setSourcesCollapsed(true);
    setContextStatus(null);
    setChatError('');
    setIsSearching(false);
    setIsStreaming(false);
  }, []);

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
    setRetrievedChunks([]);
    setCitedIndices([]);
    setRetrievalQuery('');
    setMessages((currentMessages) => [...currentMessages, userMessage, assistantMessage]);
    setIsSearching(true);
    setIsStreaming(true);

    try {
      await streamChatResponse({
        message: messageText,
        conversationId,
        signal: abortController.signal,
        onContext: (payload) => {
          const chunks = payload?.chunks ?? [];
          const nextCitedIndices = payload?.citedIndices ?? [];
          setRetrievedChunks(chunks);
          setCitedIndices(nextCitedIndices);
          setRetrievalQuery(payload?.rewrittenQuery ?? '');
          setOriginalQuery(payload?.originalQuery ?? '');
          setWasRewritten(payload?.wasRewritten ?? false);
          setIsSearching(false);

          updateAssistantMessage(assistantMessage.id, (message) => ({
            ...message,
            sourceChunks: chunks,
            citedIndices: nextCitedIndices,
          }));

          if (payload?.error) {
            setContextStatus({
              type: 'error',
              message: payload.error,
            });
          } else if (chunks.length > 0) {
            setContextStatus(null);
          } else {
            setContextStatus({
              type: 'warning',
              message: 'No matching chunks were found. The answer will not have document context.',
            });
          }
        },
        onToken: (content) => {
          updateAssistantMessage(assistantMessage.id, (message) => ({
            ...message,
            content: `${message.content}${content}`,
          }));
        },
        onCitations: (payload) => {
          const nextCitedIndices = payload?.citedIndices ?? [];
          setCitedIndices(nextCitedIndices);
          updateAssistantMessage(assistantMessage.id, (message) => ({
            ...message,
            citedIndices: nextCitedIndices,
          }));
        },
        onDone: (payload) => {
          if (payload?.conversationId) {
            setConversationId(payload.conversationId);
          }
          if (payload?.citedIndices) {
            setCitedIndices(payload.citedIndices);
            updateAssistantMessage(assistantMessage.id, (message) => ({
              ...message,
              citedIndices: payload.citedIndices,
            }));
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
      setIsSearching(false);
      setChatError(errorMessage);
      updateAssistantMessage(assistantMessage.id, (message) => ({
        ...message,
        content: message.content || errorMessage,
        isStreaming: false,
        isError: true,
      }));
    } finally {
      setIsSearching(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [conversationId, isStreaming, updateAssistantMessage]);

  return (
    <section className="chat-panel" aria-label="Knowledge chat">
      <div className="chat-panel__body">
        <MessageList messages={messages} isSearching={isSearching} />
        <SourcesPanel
          isOpen={!sourcesCollapsed}
          chunks={retrievedChunks}
          citedIndices={citedIndices}
          retrievalQuery={retrievalQuery}
          originalQuery={originalQuery}
          wasRewritten={wasRewritten}
          status={contextStatus}
          onClose={() => setSourcesCollapsed(!sourcesCollapsed)}
        />
      </div>

      {chatError && (
        <div className="chat-panel__error" role="alert">
          {chatError}
        </div>
      )}

      <div className="chat-panel__footer">
        {messages.length > 0 && (
          <button
            className="chat-panel__new-btn"
            type="button"
            onClick={resetConversation}
            disabled={isStreaming}
            aria-label="Start new conversation"
          >
            <Plus size={18} />
          </button>
        )}
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
