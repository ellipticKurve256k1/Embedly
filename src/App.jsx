import { useEffect, useState, useCallback } from 'react';
import { Search, Settings, LoaderCircle } from 'lucide-react';
import logoSrc from '../references/embedly.png';
import {
  initializeSettings,
  loadSettings,
  readSavedEmbeddingSetup,
  readSavedLlmSetup,
  readSavedVectorDbSetup,
  readSavedRerankerSetup,
} from './lib/storage.js';
import { getProjects, searchQuery } from './lib/api.js';
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
import ScopeToggle from './components/ScopeToggle';
import EmbeddingIndicator from './components/EmbeddingIndicator';

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

function normalizeRoutePage(location) {
  const rawHash = location.hash || '';

  if (rawHash) {
    const hashRoute = rawHash
      .slice(1)
      .split('?')[0]
      .replace(/^\/+|\/+$/g, '');

    return hashRoute === 'settings' ? 'settings' : 'search';
  }

  const pathname = (location.pathname || '/').replace(/\/+$/g, '') || '/';
  return pathname === '/settings' ? 'settings' : 'search';
}

export default function App() {
  const [page, setPage] = useState(() => normalizeRoutePage(window.location));

  const [mode, setMode] = useState('chat');
  const [embeddingSetup, setEmbeddingSetup] = useState(() => readSavedEmbeddingSetup());
  const [llmSetup, setLlmSetup] = useState(() => readSavedLlmSetup());
  const [vectorDbSetup, setVectorDbSetup] = useState(() => readSavedVectorDbSetup());
  const [rerankerSetup, setRerankerSetup] = useState(() => readSavedRerankerSetup());
  const [settingsStatus, setSettingsStatus] = useState('loading');
  const [settingsError, setSettingsError] = useState('');

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selectedResult, setSelectedResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [scopeNotice, setScopeNotice] = useState(null);

  const refreshConfiguredSettings = useCallback(() => {
    setEmbeddingSetup(readSavedEmbeddingSetup());
    setLlmSetup(readSavedLlmSetup());
    setVectorDbSetup(readSavedVectorDbSetup());
    setRerankerSetup(readSavedRerankerSetup());
  }, []);

  const refreshProjects = useCallback(async () => {
    const payload = await getProjects();
    const nextProjects = payload.projects ?? [];

    setProjects(nextProjects);
    setSelectedProjectId((currentProjectId) => (
      currentProjectId && !nextProjects.some((project) => project.id === currentProjectId)
        ? null
        : currentProjectId
    ));
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

    refreshProjects().catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [refreshConfiguredSettings, refreshProjects]);

  useEffect(() => {
    const handleRouteChange = () => {
      setPage(normalizeRoutePage(window.location));
      setMode('chat');
      refreshConfiguredSettings();
      refreshProjects().catch(() => {});
    };

    const handleSettingsChange = () => {
      refreshConfiguredSettings();
    };

    const handleAuthChange = () => {
      loadSettings()
        .then(refreshConfiguredSettings)
        .catch(refreshConfiguredSettings);
      refreshProjects().catch(() => {});
    };

    const handleProjectsChange = () => {
      refreshProjects().catch(() => {});
    };

    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('embeddly:settings-changed', handleSettingsChange);
    window.addEventListener('embeddly:auth-changed', handleAuthChange);
    window.addEventListener('embeddly:projects-changed', handleProjectsChange);
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('embeddly:settings-changed', handleSettingsChange);
      window.removeEventListener('embeddly:auth-changed', handleAuthChange);
      window.removeEventListener('embeddly:projects-changed', handleProjectsChange);
    };
  }, [refreshConfiguredSettings, refreshProjects]);

  const { settingsReady, requiredSettingsMissing } = computeSettingsStatus({
    embeddingSetup,
    llmSetup,
    vectorDbSetup,
  });
  const hasReranker = rerankerSetup?.enabled === true;
  const guardedModes = settingsReady ? [] : ['chat', 'search'];

  const handleNavigateToSettings = useCallback(() => {
    window.location.hash = '#settings';
  }, []);

  const handleSearch = useCallback(async (queryText, projectId = selectedProjectId) => {
    if (!settingsReady) return;

    const trimmedQuery = queryText.trim();
    if (!trimmedQuery) return;

    setIsSearching(true);
    setSearchError('');
    setSelectedResult(null);

    try {
      const payload = await searchQuery(trimmedQuery, projectId);
      setSearchResults(payload.results ?? []);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Search failed');
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }, [selectedProjectId, settingsReady]);

  const handleProjectChange = useCallback((projectId) => {
    setSelectedProjectId(projectId);
    setSelectedResult(null);
    const nextProject = projects.find((project) => project.id === projectId);
    const nextScopeName = nextProject?.name ?? 'All Documents';
    const noticeId = `${projectId ?? 'all'}-${Date.now()}`;

    setScopeNotice({
      id: noticeId,
      message: `Now retrieving from ${nextScopeName}.`,
    });
    window.setTimeout(() => {
      setScopeNotice((currentNotice) => (
        currentNotice?.id === noticeId ? null : currentNotice
      ));
    }, 2000);

    if (mode === 'search' && searchResults && query.trim()) {
      handleSearch(query, projectId);
    }
  }, [handleSearch, mode, projects, query, searchResults]);

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
        <div className="topbar-status">
          <ModelStatusBar
            embeddingSetup={embeddingSetup}
            llmSetup={llmSetup}
            vectorDbSetup={vectorDbSetup}
            rerankerSetup={hasReranker ? rerankerSetup : null}
          />
        </div>
        <header className="topbar">
          <img className="brand-logo" src={logoSrc} alt="Embeddly" />
          <ModeTabs
            activeMode={mode}
            disabledModes={guardedModes}
            onModeChange={setMode}
            onNavigateToSettings={handleNavigateToSettings}
          />
          <div className="topbar-actions">
            <EmbeddingIndicator />
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
            projects={projects}
            selectedProjectId={selectedProjectId}
            scopeFlashKey={scopeNotice?.id}
            onProjectChange={handleProjectChange}
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

                <div className="search-box">
                  <Search size={20} />
                  <input
                    type="search"
                    aria-label="Search your knowledge base"
                    placeholder="Search your knowledge base..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSearching}
                  />
                  {isSearching && (
                    <LoaderCircle size={20} className="search-spinner" />
                  )}
                  {!hasResults && (
                    <ScopeToggle
                      projects={projects}
                      value={selectedProjectId}
                      flashKey={scopeNotice?.id}
                      onChange={handleProjectChange}
                    />
                  )}
                </div>

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
                    projects={projects}
                    selectedProjectId={selectedProjectId}
                    scopeFlashKey={scopeNotice?.id}
                    isSearching={isSearching}
                    onProjectChange={handleProjectChange}
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

        {mode === 'upload' && (
          <UploadBox
            projects={projects}
          />
        )}

        {scopeNotice && (
          <div className="scope-feedback" role="status">
            {scopeNotice.message}
          </div>
        )}
      </section>
    </main>
  );
}
