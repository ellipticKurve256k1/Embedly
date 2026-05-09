import { useEffect, useState } from 'react';
import { Search, Settings } from 'lucide-react';
import logoSrc from '../ref/embedly.png';
import {
  readSavedEmbeddingSetup,
  readSavedLlmSetup,
  readSavedVectorDbSetup,
} from './lib/storage.js';
import './index.css';
import './App.css';
import SettingsPage from './components/SettingsPage';
import ModeTabs from './components/ModeTabs';
import UploadBox from './components/UploadBox';
import ModelStatusBar from './components/ModelStatusBar';

export default function App() {
  const [page, setPage] = useState(() => (
    window.location.hash === '#settings' ? 'settings' : 'search'
  ));

  const [mode, setMode] = useState('search');
  const [embeddingSetup, setEmbeddingSetup] = useState(() => readSavedEmbeddingSetup());
  const [llmSetup, setLlmSetup] = useState(() => readSavedLlmSetup());
  const [vectorDbSetup, setVectorDbSetup] = useState(() => readSavedVectorDbSetup());

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

  if (page === 'settings') {
    return <SettingsPage />;
  }

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
          <div className="search-stage">
            <div className="orbital-field" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>

            <label className="search-box">
              <Search size={20} />
              <input type="search" placeholder="Search your knowledge base..." />
            </label>
          </div>
        )}

        {mode === 'upload' && <UploadBox />}
      </section>
    </main>
  );
}
