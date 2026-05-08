import { useState } from 'react';
import {
  CircleHelp,
  Database,
  LockKeyhole,
  Save,
  Search,
  Shield,
  Sparkles,
  SlidersHorizontal,
  WandSparkles,
  X,
  Zap,
  Layers,
} from 'lucide-react';
import logoSrc from '../../ref/embedly.png';

const settingTabs = [
  { label: 'Embedding Model', icon: Zap, active: true },
  { label: 'Retrieval', icon: Search },
  { label: 'Generation', icon: WandSparkles },
  { label: 'Data Sources', icon: Database },
  { label: 'Security', icon: LockKeyhole },
  { label: 'Advanced', icon: SlidersHorizontal },
  { label: 'About', icon: CircleHelp },
];

const embeddingModels = [
  {
    name: 'text-embedding-3-large',
    summary: 'Highest performance for complex queries and semantic understanding.',
    recommended: true,
  },
  {
    name: 'text-embedding-3-small',
    summary: 'Balanced performance and speed for general use cases.',
  },
  {
    name: 'bge-large',
    summary: 'Strong performance across multilingual and retrieval tasks.',
  },
  {
    name: 'e5-large',
    summary: 'Optimized for retrieval quality and instruction following.',
  },
];

export default function SettingsPage() {
  const [selectedModel, setSelectedModel] = useState(embeddingModels[0].name);
  const [advancedOptionsEnabled, setAdvancedOptionsEnabled] = useState(true);

  return (
    <main className="app">
      <section className="landing-shell settings-shell" aria-label="Embeddly settings">
        <header className="topbar">
          <a className="brand-link" href="#/" aria-label="Back to search">
            <img className="brand-logo" src={logoSrc} alt="Embeddly" />
          </a>
          <a className="icon-button" href="#/" aria-label="Close settings">
            <X size={20} />
          </a>
        </header>

        <div className="settings-content">
          <div className="settings-heading">
            <h1>Settings</h1>
            <p>Configure Embeddly to match your workflow.</p>
          </div>

          <div className="settings-panel">
            <nav className="settings-nav" aria-label="Settings sections">
              {settingTabs.map(({ label, icon: Icon, active }) => (
                <a
                  className={`settings-nav-item${active ? ' is-active' : ''}`}
                  href="#settings"
                  key={label}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </a>
              ))}
            </nav>

            <section className="settings-detail" aria-labelledby="embedding-model-title">
              <div className="settings-detail-heading">
                <h2 id="embedding-model-title">Embedding Model</h2>
                <p>Choose the embedding model used for indexing and semantic search.</p>
              </div>

              <fieldset className="model-options">
                <legend className="sr-only">Embedding model options</legend>
                {embeddingModels.map((model, index) => (
                  <label
                    className={`model-card${selectedModel === model.name ? ' is-selected' : ''}`}
                    key={model.name}
                  >
                    <input
                      type="radio"
                      name="embedding-model"
                      checked={selectedModel === model.name}
                      onChange={() => setSelectedModel(model.name)}
                    />
                    <span className="model-radio" aria-hidden="true" />
                    <span className="model-copy">
                      <span className="model-title-row">
                        <strong>{model.name}</strong>
                        {model.recommended && <em>Recommended</em>}
                      </span>
                      <small>{model.summary}</small>
                    </span>
                  </label>
                ))}
              </fieldset>

              <label className={`advanced-option${advancedOptionsEnabled ? ' is-on' : ''}`}>
                <span>
                  <strong>Advanced options</strong>
                  <small>Fine-tune batch size, dimensions, and other model parameters.</small>
                </span>
                <input
                  type="checkbox"
                  checked={advancedOptionsEnabled}
                  onChange={(event) => setAdvancedOptionsEnabled(event.target.checked)}
                  aria-label="Enable advanced options"
                />
                <span className="toggle" aria-hidden="true" />
              </label>

              <button className="save-button" type="button">
                <Save size={18} />
                <span>Save changes</span>
              </button>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
