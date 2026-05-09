import { useEffect, useState } from 'react';
import { Search, Settings, Shield, Sparkles, Layers } from 'lucide-react';
import logoSrc from '../ref/embedly.png';
import { readSavedEmbeddingSetup, readSavedLlmSetup } from './lib/storage.js';
import './index.css';
import './App.css';
import SettingsPage from './components/SettingsPage';
import ModeTabs from './components/ModeTabs';
import UploadBox from './components/UploadBox';
import ModelStatusBar from './components/ModelStatusBar';

const features = [
  {
    title: 'Private & Secure',
    subtitle: 'Your data stays yours',
    icon: Shield,
  },
  {
    title: 'AI Powered',
    subtitle: 'Semantic search',
    icon: Sparkles,
  },
  {
    title: 'Connected',
    subtitle: 'Smart relationships',
    icon: Layers,
  },
];

export default function App() {
  const [page, setPage] = useState(() => (
    window.location.hash === '#settings' ? 'settings' : 'search'
  ));

  const [mode, setMode] = useState('search');
  const [embeddingSetup, setEmbeddingSetup] = useState(() => readSavedEmbeddingSetup());
  const [llmSetup, setLlmSetup] = useState(() => readSavedLlmSetup());

  useEffect(() => {
    const handleHashChange = () => {
      setPage(window.location.hash === '#settings' ? 'settings' : 'search');
      setMode('search');
      setEmbeddingSetup(readSavedEmbeddingSetup());
      setLlmSetup(readSavedLlmSetup());
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
            <ModelStatusBar embeddingSetup={embeddingSetup} llmSetup={llmSetup} />
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

        {mode === 'search' && (
          <div className="feature-row" aria-label="Product highlights">
            {features.map(({ title, subtitle, icon: Icon }) => (
              <article className="feature-pill" key={title}>
                <Icon size={20} />
                <span>
                  <strong>{title}</strong>
                  <small>{subtitle}</small>
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
