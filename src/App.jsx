import { useEffect, useState, useCallback } from 'react';
import { Search, Settings, LoaderCircle } from 'lucide-react';
import logoSrc from '../ref/embedly.png';
import {
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

export default function App() {
  const [page, setPage] = useState(() => (
    window.location.hash === '#settings' ? 'settings' : 'search'
  ));

  const [mode, setMode] = useState('search');
  const [embeddingSetup, setEmbeddingSetup] = useState(() => readSavedEmbeddingSetup());
  const [llmSetup, setLlmSetup] = useState(() => readSavedLlmSetup());
  const [vectorDbSetup, setVectorDbSetup] = useState(() => readSavedVectorDbSetup());

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selectedResult, setSelectedResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    const handleHashChange = () => {
      setPage(window.location.hash === '#settings' ? 'settings' : 'search');
      setMode('search');
      setEmbeddingSetup(readSavedEmbeddingSetup());
      setLlmSetup(readSavedLlmSetup());
      setVectorDbSetup(readSavedVectorDbSetup());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSearch = useCallback(async (queryText) => {
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
  }, []);

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

  if (page === 'settings') {
    return <SettingsPage />;
  }

  const hasResults = searchResults && searchResults.length > 0;

  return (
    <main className="app">
      <section className="landing-shell" aria-label="Embeddly">
        <header className="topbar">
          <img className="brand-logo" src={logoSrc} alt="Embeddly" />
          <div className="topbar-actions">
            <ModelStatusBar
              embeddingSetup={embeddingSetup}
              llmSetup={llmSetup}
              vectorDbSetup={vectorDbSetup}
            />
            <a className="icon-button" href="#settings" aria-label="Open settings">
              <Settings size={20} />
            </a>
          </div>
        </header>

        <ModeTabs activeMode={mode} onModeChange={setMode} />

        {mode === 'search' && (
          <div className={`search-stage${hasResults ? ' has-results' : ''}`}>
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
          </div>
        )}

        {mode === 'upload' && <UploadBox />}
      </section>
    </main>
  );
}
