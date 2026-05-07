import { Search, Settings, Shield, Sparkles, Layers } from 'lucide-react';
import logoSrc from '../ref/embedly.png';
import './index.css';

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
  return (
    <main className="app">
      <section className="landing-shell" aria-label="Embeddly search">
        <header className="topbar">
          <img className="brand-logo" src={logoSrc} alt="Embeddly" />
          <button className="icon-button" type="button" aria-label="Open settings">
            <Settings size={20} />
          </button>
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

      </section>
    </main>
  );
}
