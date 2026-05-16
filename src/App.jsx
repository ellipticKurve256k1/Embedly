import { useEffect, useState, useCallback } from 'react';
import { Search, Settings, LoaderCircle } from 'lucide-react';
import logoSrc from '../references/embedly.png';
import {
  initializeSettings,
  loadSettings,
  readSavedEmbeddingSetup,
  readSavedLlmSetup,
  readSavedVectorDbSetup,
} from './lib/storage.js';
import { searchQuery } from './lib/api.js';
import './index.css';
import './App.css';
import SettingsPage from './components/SettingsPage';
import ModeTabs from './components/ModeTabs';
import UploadBox from './components/UploadBox';
import ModelStatusBar from './components/ModelStatusBar';
import SearchResults from './components/SearchResults';
import ChatPanel from './components/ChatPanel';
import LoginButton from './components/LoginButton';
import SetupRequiredNotice from './components/SetupRequiredNotice';

function computeSettingsStatus({ embeddingSetup, llmSetup, vectorDbSetup }) {
  const missingSettings = [];

  if (!embeddingSetup?.model) {
    missingSettings.push('Embedding model');
  }

  if (!llmSetup?.model) {
    missingSettings.push('LLM');
  }

  if (!(vectorDbSetup?.provider || vectorDbSetup?.name)) {
    missingSettings.push('VectorDB');
  }

  return {
    settingsReady: missingSettings.length === 0,
    requiredSettingsMissing: missingSettings,
  };
}

export default function App() {
  const [page, setPage] = useState(() => (
    window.location.hash === '#settings' ? 'settings' : 'search'
  ));

  const [mode, setMode] = useState('chat');
  const [embeddingSetup, setEmbeddingSetup] = useState(() => readSavedEmbeddingSetup());
  const [llmSetup, setLlmSetup] = useState(() => readSavedLlmSetup());
  const [vectorDbSetup, setVectorDbSetup] = useState(() => readSavedVectorDbSetup());
  const [settingsStatus, setSettingsStatus] = useState('loading');
  const [settingsError, setSettingsError] = useState('');

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selectedResult, setSelectedResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const refreshConfiguredSettings = useCallback(() => {
    setEmbeddingSetup(readSavedEmbeddingSetup());
    setLlmSetup(readSavedLlmSetup());
    setVectorDbSetup(readSavedVectorDbSetup());
  }, []);

  useEffect(() => {
    let isMounted = true;

    initializeSettings()
      .then(() => {
        if (!isMounted) return;
        refreshConfiguredSettings();
        setSettingsStatus('ready');
      })
      .catch((error) => {
        if (!isMounted) return;
        setSettingsError(error instanceof Error ? error.message : 'Unable to load settings.');
        setSettingsStatus('error');
      });

    return () => {
      isMounted = false;
    };
  }, [refreshConfiguredSettings]);

  useEffect(() => {
    const handleHashChange = () => {
      setPage(window.location.hash === '#settings' ? 'settings' : 'search');
      setMode('chat');
      refreshConfiguredSettings();
    };

    const handleSettingsChange = () => {
      refreshConfiguredSettings();
    };

    const handleAuthChange = () => {
      loadSettings()
        .then(refreshConfiguredSettings)
        .catch(refreshConfiguredSettings);
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('embeddly:settings-changed', handleSettingsChange);
    window.addEventListener('embeddly:auth-changed', handleAuthChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('embeddly:settings-changed', handleSettingsChange);
      window.removeEventListener('embeddly:auth-changed', handleAuthChange);
    };
  }, [refreshConfiguredSettings]);

  const { settingsReady, requiredSettingsMissing } = computeSettingsStatus({
    embeddingSetup,
    llmSetup,
    vectorDbSetup,
  });
  const guardedModes = settingsReady ? [] : ['chat', 'search'];

  const handleNavigateToSettings = useCallback(() => {
    window.location.hash = '#settings';
  }, []);

  const handleSearch = useCallback(async (queryText) => {
    if (!settingsReady) return;

    const trimmedQuery = queryText.trim();
    if (!trimmedQuery) return;

    setIsSearching(true);
    setSearchError('');
    setSelectedResult(null);

    try {
      const payload = await searchQuery(trimmedQuery);
      setSearchResults(payload.results ?? []);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Search failed');
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }, [settingsReady]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      handleSearch(query);
    }
  }, [query, handleSearch]);

  const handleSelectResult = useCallback((result) => {
    setSelectedResult(result);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedResult(null);
  }, []);

  const handleClearSearch = useCallback(() => {
    setQuery('');
    setSearchResults(null);
    setSelectedResult(null);
    setSearchError('');
  }, []);

  if (settingsStatus !== 'ready') {
    return (
      <main className="app">
        <section className="landing-shell" aria-label="Embeddly">
          <header className="topbar">
            <img className="brand-logo" src={logoSrc} alt="Embeddly" />
          </header>
          <div className="search-stage">
            <div className="search-empty" role={settingsStatus === 'error' ? 'alert' : 'status'}>
              <p>
                {settingsStatus === 'error'
                  ? `Settings could not be loaded. ${settingsError}`
                  : 'Loading settings...'}
              </p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (page === 'settings') {
    return <SettingsPage />;
  }

  const hasResults = searchResults && searchResults.length > 0;

  return (
    <main className="app">
      <section className="landing-shell" aria-label="Embeddly">
        <header className="topbar">
          <img className="brand-logo" src={logoSrc} alt="Embeddly" />
          <ModeTabs
            activeMode={mode}
            disabledModes={guardedModes}
            onModeChange={setMode}
            onNavigateToSettings={handleNavigateToSettings}
          />
          <div className="topbar-actions">
            <ModelStatusBar
              embeddingSetup={embeddingSetup}
              llmSetup={llmSetup}
              vectorDbSetup={vectorDbSetup}
            />
            <LoginButton />
            <a className="icon-button" href="#settings" aria-label="Open settings">
              <Settings size={20} />
            </a>
          </div>
        </header>

        {mode === 'chat' && (
          <ChatPanel
            settingsReady={settingsReady}
            missingSettings={requiredSettingsMissing}
          />
        )}

        {mode === 'search' && (
          <div className={`search-stage${hasResults ? ' has-results' : ''}`}>
            {!settingsReady ? (
              <SetupRequiredNotice
                feature="search"
                missingSettings={requiredSettingsMissing}
              />
            ) : (
              <>
                {!hasResults && (
                  <div className="orbital-field" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                )}

                <label className="search-box">
                  <Search size={20} />
                  <input
                    type="search"
                    placeholder="Search your knowledge base..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSearching}
                  />
                  {isSearching && (
                    <LoaderCircle size={20} className="search-spinner" />
                  )}
                </label>

                {searchError && (
                  <div className="search-error" role="alert">
                    {searchError}
                  </div>
                )}

                {hasResults && (
                  <SearchResults
                    query={query}
                    results={searchResults}
                    selectedResult={selectedResult}
                    onSelectResult={handleSelectResult}
                    onClosePreview={handleClosePanel}
                  />
                )}

                {searchResults && searchResults.length === 0 && !isSearching && (
                  <div className="search-empty">
                    <p>No matching results found.</p>
                    <button type="button" onClick={handleClearSearch}>
                      Clear search
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {mode === 'upload' && <UploadBox />}
      </section>
    </main>
  );
}
