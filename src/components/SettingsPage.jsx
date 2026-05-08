import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CircleHelp,
  Database,
  LockKeyhole,
  RefreshCw,
  Save,
  Search,
  Server,
  SlidersHorizontal,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import logoSrc from '../../ref/embedly.png';
import './SettingsPage.css';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const EMBEDDING_SETUP_STORAGE_KEY = 'embeddly.embeddingSetup';

const settingTabs = [
  { label: 'Embedding Model', icon: Zap, active: true },
  { label: 'Retrieval', icon: Search },
  { label: 'Generation', icon: WandSparkles },
  { label: 'Data Sources', icon: Database },
  { label: 'Security', icon: LockKeyhole },
  { label: 'Advanced', icon: SlidersHorizontal },
  { label: 'About', icon: CircleHelp },
];

const embeddingProviders = [
  {
    id: 'ollama',
    name: 'Ollama',
    summary: 'Use local embedding models served by Ollama.',
    icon: Server,
    component: OllamaEmbeddingSetup,
  },
];

export default function SettingsPage() {
  const [embeddingSetup, setEmbeddingSetup] = useState(readSavedEmbeddingSetup);
  const [selectedProvider, setSelectedProvider] = useState(
    embeddingSetup?.provider ?? embeddingProviders[0].id,
  );
  const [selectedModel, setSelectedModel] = useState(embeddingSetup?.model ?? '');
  const [isEditingSetup, setIsEditingSetup] = useState(!embeddingSetup);
  const [advancedOptionsEnabled, setAdvancedOptionsEnabled] = useState(true);
  const activeProvider = embeddingProviders.find((provider) => provider.id === selectedProvider);
  const ActiveProviderSetup = activeProvider?.component;

  const handleSaveChanges = () => {
    if (!selectedProvider || !selectedModel) {
      return;
    }

    const nextSetup = {
      provider: selectedProvider,
      model: selectedModel,
      endpoint: OLLAMA_BASE_URL,
    };

    window.localStorage.setItem(EMBEDDING_SETUP_STORAGE_KEY, JSON.stringify(nextSetup));
    setEmbeddingSetup(nextSetup);
    setIsEditingSetup(false);
  };

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
                <p>
                  {embeddingSetup
                    ? 'Manage the embedding provider used for indexing and semantic search.'
                    : 'Set up an embedding provider before indexing and semantic search can run.'}
                </p>
              </div>

              {embeddingSetup && !isEditingSetup ? (
                <ConfiguredEmbeddingModel
                  setup={embeddingSetup}
                  onEdit={() => setIsEditingSetup(true)}
                />
              ) : (
                <>
                  <fieldset className="model-options provider-options">
                    <legend className="sr-only">Embedding provider options</legend>
                    {embeddingProviders.map((provider) => {
                      const Icon = provider.icon;

                      return (
                        <label
                          className={`model-card provider-card${
                            selectedProvider === provider.id ? ' is-selected' : ''
                          }`}
                          key={provider.id}
                        >
                          <input
                            type="radio"
                            name="embedding-provider"
                            checked={selectedProvider === provider.id}
                            onChange={() => {
                              setSelectedProvider(provider.id);
                              setSelectedModel('');
                            }}
                          />
                          <span className="provider-icon" aria-hidden="true">
                            <Icon size={20} />
                          </span>
                          <span className="model-copy">
                            <span className="model-title-row">
                              <strong>{provider.name}</strong>
                              <em>Local</em>
                            </span>
                            <small>{provider.summary}</small>
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>

                  {ActiveProviderSetup && (
                    <ActiveProviderSetup
                      endpoint={OLLAMA_BASE_URL}
                      selectedModel={selectedModel}
                      onSelectModel={setSelectedModel}
                    />
                  )}
                </>
              )}

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

              <button
                className="save-button"
                type="button"
                disabled={!selectedModel}
                onClick={handleSaveChanges}
              >
                <Save size={18} />
                <span>{embeddingSetup ? 'Save changes' : 'Save setup'}</span>
              </button>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

function ConfiguredEmbeddingModel({ setup, onEdit }) {
  return (
    <article className="configured-model-card">
      <span className="provider-icon" aria-hidden="true">
        <Server size={20} />
      </span>
      <span>
        <strong>{setup.model}</strong>
        <small>
          {setup.provider === 'ollama' ? 'Ollama' : setup.provider} at {setup.endpoint}
        </small>
      </span>
      <button type="button" onClick={onEdit}>
        Change
      </button>
    </article>
  );
}

function OllamaEmbeddingSetup({ endpoint, selectedModel, onSelectModel }) {
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const loadModels = useCallback(async () => {
    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch(`${endpoint}/api/tags`);

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
      }

      const payload = await response.json();
      const localModels = Array.isArray(payload.models) ? payload.models : [];
      const modelsWithCapabilities = await Promise.all(
        localModels.map(async (model) => {
          try {
            const showResponse = await fetch(`${endpoint}/api/show`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: model.name }),
            });

            if (!showResponse.ok) {
              return model;
            }

            const showPayload = await showResponse.json();
            return {
              ...model,
              capabilities: showPayload.capabilities ?? [],
            };
          } catch {
            return model;
          }
        }),
      );
      const embeddingModels = modelsWithCapabilities.filter(isEmbeddingModel);

      setModels(embeddingModels);
      setStatus('ready');
    } catch (error) {
      setModels([]);
      setStatus('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to connect to Ollama.',
      );
    }
  }, [endpoint]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      onSelectModel(models[0].name);
    }
  }, [models, onSelectModel, selectedModel]);

  return (
    <section className="provider-setup" aria-label="Ollama embedding model setup">
      <div className="provider-setup-header">
        <span>
          <strong>Available Ollama embedding models</strong>
          <small>{endpoint}</small>
        </span>
        <button type="button" onClick={loadModels} disabled={status === 'loading'}>
          <RefreshCw size={16} />
          <span>{status === 'loading' ? 'Checking' : 'Refresh'}</span>
        </button>
      </div>

      {status === 'error' && (
        <div className="setup-message is-error">
          <AlertCircle size={18} />
          <span>
            Could not connect to Ollama. Make sure Ollama is running at {endpoint}.
            <small>{errorMessage}</small>
          </span>
        </div>
      )}

      {status === 'ready' && models.length === 0 && (
        <div className="setup-message">
          <AlertCircle size={18} />
          <span>
            No embedding-capable Ollama models were found.
            <small>Install one locally, for example: ollama pull nomic-embed-text</small>
          </span>
        </div>
      )}

      {models.length > 0 && (
        <fieldset className="model-options">
          <legend className="sr-only">Ollama embedding models</legend>
          {models.map((model) => (
            <label
              className={`model-card${selectedModel === model.name ? ' is-selected' : ''}`}
              key={model.digest ?? model.name}
            >
              <input
                type="radio"
                name="ollama-embedding-model"
                checked={selectedModel === model.name}
                onChange={() => onSelectModel(model.name)}
              />
              <span className="model-radio" aria-hidden="true" />
              <span className="model-copy">
                <span className="model-title-row">
                  <strong>{model.name}</strong>
                  <em>{model.details?.parameter_size ?? 'Local'}</em>
                </span>
                <small>
                  {formatModelSize(model.size)}
                  {model.details?.quantization_level
                    ? ` · ${model.details.quantization_level}`
                    : ''}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </section>
  );
}

function readSavedEmbeddingSetup() {
  try {
    const savedSetup = window.localStorage.getItem(EMBEDDING_SETUP_STORAGE_KEY);
    return savedSetup ? JSON.parse(savedSetup) : null;
  } catch {
    return null;
  }
}

function isEmbeddingModel(model) {
  const capabilities = Array.isArray(model.capabilities) ? model.capabilities : [];
  const hasEmbeddingCapability = capabilities.includes('embedding');
  const modelName = `${model.name ?? ''} ${model.model ?? ''}`.toLowerCase();

  return hasEmbeddingCapability || (capabilities.length === 0 && modelName.includes('embed'));
}

function formatModelSize(size) {
  if (!Number.isFinite(size)) {
    return 'Local Ollama model';
  }

  const gibibytes = size / 1024 ** 3;
  if (gibibytes >= 1) {
    return `${gibibytes.toFixed(1)} GB`;
  }

  return `${(size / 1024 ** 2).toFixed(0)} MB`;
}
