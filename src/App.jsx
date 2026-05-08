import { useEffect, useState } from 'react';
import { Search, Settings, Shield, Sparkles, Layers } from 'lucide-react';
import logoSrc from '../ref/embedly.png';
import './index.css';
import './App.css';
import SettingsPage from './components/SettingsPage';

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

  useEffect(() => {
    const handleHashChange = () => {
      setPage(window.location.hash === '#settings' ? 'settings' : 'search');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (page === 'settings') {
    return <SettingsPage />;
  }

  return (
    <main className="app">
      <section className="landing-shell" aria-label="Embeddly search">
        <header className="topbar">
          <img className="brand-logo" src={logoSrc} alt="Embeddly" />
          <a className="icon-button" href="#settings" aria-label="Open settings">
            <Settings size={20} />
          </a>
        </header>

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

      </section>
    </main>
  );
}

