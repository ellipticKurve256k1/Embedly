import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChatResponse } from '../lib/api.js';
import {
  ACTIVE_CONVERSATION_KEY,
  SIDEBAR_OPEN_KEY,
  generateTitle,
  getAllConversations,
  getChatState,
  initDB,
  deleteConversation,
  persistConversationStart,
  saveConversation,
  setChatState,
  trimConversationMessages,
} from '../lib/chatDB.js';
import ChatInput from './ChatInput.jsx';
import ChatSidebar from './ChatSidebar.jsx';
import MessageList from './MessageList.jsx';
import DatasetScopeControl from './DatasetScopeControl.jsx';
import SourcesPanel from './SourcesPanel.jsx';
import SetupRequiredNotice from './SetupRequiredNotice.jsx';
import './ChatPanel.css';

const MAX_SERVER_HISTORY_MESSAGES = 6;

function createMessage(role, content, extra = {}) {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

function toRenderableMessages(messages) {
  return (messages ?? []).map((message) => ({
    ...message,
    createdAt: message.createdAt ? new Date(message.createdAt) : new Date(),
  }));
}

function toStoredMessages(messages) {
  return (messages ?? []).map((message) => ({
    ...message,
    createdAt: message.createdAt instanceof Date
      ? message.createdAt.toISOString()
      : message.createdAt,
  }));
}

function buildServerHistory(messages) {
  return messages
    .filter((message) => (
      (message.role === 'user' || message.role === 'assistant')
      && String(message.content ?? '').trim()
      && !message.isStreaming
      && !message.isError
    ))
    .slice(-MAX_SERVER_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

export default function ChatPanel({
  settingsReady = true,
  missingSettings = [],
  projects = [],
  selectedProjectId = null,
  scopeFlashKey,
  onProjectChange,
}) {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isStorageReady, setIsStorageReady] = useState(true);
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
  const [deleteTarget, setDeleteTarget] = useState(null);

  const abortControllerRef = useRef(null);
  const messagesRef = useRef([]);
  const conversationsRef = useRef([]);
  const activeConversationIdRef = useRef(null);
  const previousProjectIdRef = useRef(undefined);

  const setMessagesState = useCallback((nextMessages) => {
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
  }, []);

  const setConversationsState = useCallback((nextConversations) => {
    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
  }, []);

  const setActiveConversationState = useCallback((nextConversationId) => {
    activeConversationIdRef.current = nextConversationId;
    setActiveConversationId(nextConversationId);
    setChatState(ACTIVE_CONVERSATION_KEY, nextConversationId);
  }, []);

  const resetContextState = useCallback(() => {
    setRetrievedChunks([]);
    setCitedIndices([]);
    setRetrievalQuery('');
    setOriginalQuery('');
    setWasRewritten(false);
    setSourcesCollapsed(true);
    setContextStatus(null);
    setChatError('');
    setIsSearching(false);
  }, []);

  const refreshConversationList = useCallback(async () => {
    const savedConversations = await getAllConversations();
    setConversationsState(savedConversations);
    return savedConversations;
  }, [setConversationsState]);

  useEffect(() => {
    resetContextState();
  }, [resetContextState, selectedProjectId]);

  useEffect(() => {
    if (previousProjectIdRef.current === undefined) {
      previousProjectIdRef.current = selectedProjectId;
      return;
    }

    if (previousProjectIdRef.current === selectedProjectId) {
      return;
    }

    previousProjectIdRef.current = selectedProjectId;

    if (messagesRef.current.length === 0) {
      return;
    }

    const selectedProject = projects.find((project) => project.id === selectedProjectId);
    const scopeName = selectedProject?.name ?? 'All Documents';
    setMessagesState([
      ...messagesRef.current,
      createMessage('system', `Retrieval scope changed to ${scopeName}.`),
    ]);
  }, [projects, selectedProjectId, setMessagesState]);

  const persistConversation = useCallback(async (conversationId, nextMessages, overrides = {}) => {
    if (!conversationId || nextMessages.length === 0) return null;

    const storedMessages = trimConversationMessages(toStoredMessages(nextMessages));
    const existingConversation = conversationsRef.current.find(
      (conversation) => conversation.id === conversationId,
    );
    const firstUserMessage = storedMessages.find((message) => message.role === 'user');
    const savedConversation = await saveConversation({
      id: conversationId,
      title: overrides.title ?? existingConversation?.title ?? generateTitle(firstUserMessage?.content),
      messages: storedMessages,
      createdAt: overrides.createdAt ?? existingConversation?.createdAt ?? new Date().toISOString(),
      updatedAt: overrides.preserveUpdatedAt
        ? existingConversation?.updatedAt
        : overrides.updatedAt,
    });

    if (!savedConversation) return null;

    const savedConversations = await refreshConversationList();
    if (activeConversationIdRef.current === conversationId) {
      const currentConversation = savedConversations.find(
        (conversation) => conversation.id === conversationId,
      ) ?? savedConversation;
      setMessagesState(toRenderableMessages(currentConversation.messages));
    }

    return savedConversation;
  }, [refreshConversationList, setMessagesState]);

  const persistActiveConversation = useCallback(() => (
    persistConversation(activeConversationIdRef.current, messagesRef.current, {
      preserveUpdatedAt: true,
    })
  ), [persistConversation]);

  const updateAssistantMessage = useCallback((messageId, updater) => {
    const nextMessages = messagesRef.current.map((message) => (
      message.id === messageId ? updater(message) : message
    ));
    setMessagesState(nextMessages);
  }, [setMessagesState]);

  useEffect(() => {
    let isMounted = true;

    async function loadChatState() {
      const hasIndexedDB = await initDB();
      const [savedConversations, savedActiveConversationId, savedSidebarOpen] = await Promise.all([
        getAllConversations(),
        getChatState(ACTIVE_CONVERSATION_KEY, null),
        getChatState(SIDEBAR_OPEN_KEY, true),
      ]);

      if (!isMounted) return;

      setIsStorageReady(hasIndexedDB);
      setConversationsState(savedConversations);
      setSidebarOpen(savedSidebarOpen !== false);

      const activeConversation = savedConversations.find(
        (conversation) => conversation.id === savedActiveConversationId,
      ) ?? savedConversations[0] ?? null;

      if (activeConversation) {
        setActiveConversationState(activeConversation.id);
        setMessagesState(toRenderableMessages(activeConversation.messages));
      } else {
        setActiveConversationState(null);
        setMessagesState([]);
      }
    }

    loadChatState();

    const handleWindowFocus = () => {
      refreshConversationList();
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleWindowFocus);
      if (activeConversationIdRef.current && messagesRef.current.length > 0) {
        void saveConversation({
          id: activeConversationIdRef.current,
          title: conversationsRef.current.find(
            (conversation) => conversation.id === activeConversationIdRef.current,
          )?.title ?? generateTitle(messagesRef.current.find((message) => message.role === 'user')?.content),
          messages: trimConversationMessages(toStoredMessages(messagesRef.current)),
          createdAt: conversationsRef.current.find(
            (conversation) => conversation.id === activeConversationIdRef.current,
          )?.createdAt ?? new Date().toISOString(),
        }).then(() => refreshConversationList());
      }
      abortControllerRef.current?.abort();
    };
  }, [
    refreshConversationList,
    setActiveConversationState,
    setConversationsState,
    setMessagesState,
  ]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((current) => {
      const next = !current;
      setChatState(SIDEBAR_OPEN_KEY, next);
      return next;
    });
  }, []);

  const handleNewConversation = useCallback(async () => {
    abortControllerRef.current?.abort();
    await persistActiveConversation();
    setActiveConversationState(null);
    setMessagesState([]);
    resetContextState();
    setInputValue('');
    setIsStreaming(false);
  }, [persistActiveConversation, resetContextState, setActiveConversationState, setMessagesState]);

  const handleSelectConversation = useCallback(async (conversationId) => {
    if (conversationId === activeConversationIdRef.current || isStreaming) return;

    abortControllerRef.current?.abort();
    await persistActiveConversation();

    const selectedConversation = await getAllConversations()
      .then((items) => {
        setConversationsState(items);
        return items.find((conversation) => conversation.id === conversationId);
      });

    if (!selectedConversation) return;

    setActiveConversationState(conversationId);
    setMessagesState(toRenderableMessages(selectedConversation.messages));
    resetContextState();
    setInputValue('');
  }, [
    isStreaming,
    persistActiveConversation,
    resetContextState,
    setActiveConversationState,
    setConversationsState,
    setMessagesState,
  ]);

  const handleRenameConversation = useCallback(async (conversationId, title) => {
    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    if (!conversation) return;

    await saveConversation({
      ...conversation,
      title,
    });
    await refreshConversationList();
  }, [refreshConversationList]);

  const handleRequestDeleteConversation = useCallback((conversationId, title) => {
    setDeleteTarget({ id: conversationId, title });
  }, []);

  const handleConfirmDeleteConversation = useCallback(async () => {
    if (!deleteTarget) return;

    await deleteConversation(deleteTarget.id);
    const savedConversations = await refreshConversationList();

    if (deleteTarget.id === activeConversationIdRef.current) {
      const nextConversation = savedConversations[0] ?? null;
      setActiveConversationState(nextConversation?.id ?? null);
      setMessagesState(toRenderableMessages(nextConversation?.messages ?? []));
      resetContextState();
      setInputValue('');
    }
    setDeleteTarget(null);
  }, [
    deleteTarget,
    refreshConversationList,
    resetContextState,
    setActiveConversationState,
    setMessagesState,
  ]);

  const handleSend = useCallback(async (rawMessage) => {
    if (!settingsReady) return;

    const messageText = rawMessage.trim();
    if (!messageText || isStreaming) return;

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const isFirstMessage = !activeConversationIdRef.current;
    const conversationId = activeConversationIdRef.current ?? crypto.randomUUID();
    if (isFirstMessage) {
      setActiveConversationState(conversationId);
    }

    const history = buildServerHistory(messagesRef.current);
    const userMessage = createMessage('user', messageText);
    const assistantMessage = createMessage('assistant', '', { isStreaming: true });
    const optimisticMessages = [...messagesRef.current, userMessage, assistantMessage];

    setMessagesState(optimisticMessages);
    setInputValue('');
    setChatError('');
    setContextStatus({ type: 'info', message: 'Retrieving relevant chunks...' });
    setRetrievedChunks([]);
    setCitedIndices([]);
    setRetrievalQuery('');
    setOriginalQuery('');
    setWasRewritten(false);
    setIsSearching(true);
    setIsStreaming(true);

    try {
      if (isFirstMessage) {
        await persistConversationStart(conversationId, messageText, selectedProjectId);
        await refreshConversationList();
      }

      await streamChatResponse({
        message: messageText,
        conversationId,
        history,
        projectId: selectedProjectId,
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
          if (payload?.citedIndices) {
            setCitedIndices(payload.citedIndices);
            updateAssistantMessage(assistantMessage.id, (message) => ({
              ...message,
              citedIndices: payload.citedIndices,
            }));
          }
        },
      });

      const completedMessages = messagesRef.current.map((message) => (
        message.id === assistantMessage.id ? { ...message, isStreaming: false } : message
      ));
      setMessagesState(completedMessages);
      await persistConversation(conversationId, completedMessages);
    } catch (error) {
      if (error.name === 'AbortError') return;

      const errorMessage = error instanceof Error ? error.message : 'Chat generation failed.';
      setIsSearching(false);
      setChatError(errorMessage);
      const failedMessages = messagesRef.current.map((message) => (
        message.id === assistantMessage.id
          ? {
            ...message,
            content: message.content || errorMessage,
            isStreaming: false,
            isError: true,
          }
          : message
      ));
      setMessagesState(failedMessages);
      await persistConversation(conversationId, failedMessages);
    } finally {
      setIsSearching(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [
    isStreaming,
    persistConversation,
    refreshConversationList,
    selectedProjectId,
    setActiveConversationState,
    setMessagesState,
    settingsReady,
    updateAssistantMessage,
  ]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  const chatContent = settingsReady ? (
    <>
      <div className="chat-panel__scope">
        <DatasetScopeControl
          projects={projects}
          value={selectedProjectId}
          label="Dataset Scope"
          contextLabel="Retrieving from"
          flashKey={scopeFlashKey}
          onChange={onProjectChange}
        />
      </div>
      <MessageList messages={messages} isSearching={isSearching} />
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
    </>
  ) : (
    <SetupRequiredNotice feature="chat" missingSettings={missingSettings} />
  );

  return (
    <section className="chat-panel" aria-label="Knowledge chat">
      <div className="chat-panel__body">
        <ChatSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          isOpen={sidebarOpen}
          isStorageReady={isStorageReady}
          onToggle={handleToggleSidebar}
          onNewConversation={handleNewConversation}
          onSelectConversation={handleSelectConversation}
          onRenameConversation={handleRenameConversation}
          onDeleteConversation={handleRequestDeleteConversation}
        />

        <div className="chat-panel__conversation">
          {chatContent}
        </div>

        {settingsReady && (
          <SourcesPanel
            isOpen={!sourcesCollapsed}
            chunks={retrievedChunks}
            citedIndices={citedIndices}
            retrievalQuery={retrievalQuery}
            originalQuery={originalQuery}
            wasRewritten={wasRewritten}
            project={selectedProject}
            projectName={selectedProject?.name ?? 'All Documents'}
            status={contextStatus}
            onClose={() => setSourcesCollapsed(!sourcesCollapsed)}
          />
        )}
      </div>

      {deleteTarget && (
        <div className="chat-panel__dialog-backdrop" role="presentation">
          <div
            className="chat-panel__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
          >
            <h2 id="delete-chat-title">Delete conversation?</h2>
            <p>"{deleteTarget.title}" will be removed from this browser.</p>
            <div className="chat-panel__dialog-actions">
              <button type="button" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                className="chat-panel__dialog-delete"
                type="button"
                onClick={handleConfirmDeleteConversation}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
