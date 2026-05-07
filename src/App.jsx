import logoSrc from '../ref/embedly.png';
import './index.css';

const features = [
  {
    title: 'Private & Secure',
    subtitle: 'Your data stays yours',
    icon: 'shield',
  },
  {
    title: 'AI Powered',
    subtitle: 'Semantic search',
    icon: 'spark',
  },
  {
    title: 'Connected',
    subtitle: 'Smart relationships',
    icon: 'layers',
  },
];

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m21 21-4.35-4.35" />
      <circle cx="11" cy="11" r="7" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.04.04a2 2 0 0 1-2.83 2.83l-.04-.04a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.06a1.7 1.7 0 0 0-1.02-1.56 1.7 1.7 0 0 0-1.89.34l-.04.04a2 2 0 1 1-2.83-2.83l.04-.04A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 0 1 0-4h.06A1.7 1.7 0 0 0 4.6 8.95a1.7 1.7 0 0 0-.34-1.88l-.04-.04a2 2 0 1 1 2.83-2.83l.04.04a1.7 1.7 0 0 0 1.89.34A1.7 1.7 0 0 0 10 3.06V3a2 2 0 0 1 4 0v.06a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.04-.04a2 2 0 1 1 2.83 2.83l-.04.04a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.02H21a2 2 0 0 1 0 4h-.06A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}

function FeatureIcon({ name }) {
  if (name === 'shield') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 3 5 6v5c0 4.55 2.92 8.57 7 10 4.08-1.43 7-5.45 7-10V6l-7-3Z" />
        <path d="m9.3 12 1.9 1.9 3.9-4.2" />
      </svg>
    );
  }

  if (name === 'spark') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 3v4" />
        <path d="M12 17v4" />
        <path d="M3 12h4" />
        <path d="M17 12h4" />
        <path d="m5.7 5.7 2.8 2.8" />
        <path d="m15.5 15.5 2.8 2.8" />
        <path d="m18.3 5.7-2.8 2.8" />
        <path d="m8.5 15.5-2.8 2.8" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
      <path d="m4 12 8 4.5 8-4.5" />
      <path d="m4 16.5 8 4.5 8-4.5" />
    </svg>
  );
}

export default function App() {
  return (
    <main className="app">
      <section className="landing-shell" aria-label="Embeddly search">
        <header className="topbar">
          <img className="brand-logo" src={logoSrc} alt="Embeddly" />
          <button className="icon-button" type="button" aria-label="Open settings">
            <GearIcon />
          </button>
        </header>

        <div className="search-stage">
          <div className="orbital-field" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <label className="search-box">
            <SearchIcon />
            <input type="search" placeholder="Search your knowledge base..." />
          </label>
        </div>

        <div className="feature-row" aria-label="Platform qualities">
          {features.map((feature) => (
            <div className="feature-pill" key={feature.title}>
              <FeatureIcon name={feature.icon} />
              <span>
                <strong>{feature.title}</strong>
                <small>{feature.subtitle}</small>
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
