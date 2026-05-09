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
import {
  EMBEDDING_SETUP_STORAGE_KEY,
  LLM_SETUP_STORAGE_KEY,
  readSavedEmbeddingSetup,
  readSavedLlmSetup,
} from '../lib/storage.js';
import './SettingsPage.css';

const OLLAMA_BASE_URL = 'http://localhost:11434';

const settingTabs = [
  { id: 'embedding', label: 'Embedding Model', icon: Zap },
  { id: 'retrieval', label: 'Retrieval', icon: Search },
  { id: 'generation', label: 'Generation', icon: WandSparkles },
  { id: 'vector-db', label: 'VectorDB', icon: Database },
  { id: 'data-sources', label: 'Data Sources', icon: Database },
  { id: 'security', label: 'Security', icon: LockKeyhole },
  { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
  { id: 'about', label: 'About', icon: CircleHelp },
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

const llmProviders = [
  {
    id: 'ollama',
    name: 'Ollama',
    summary: 'Use local language models served by Ollama for generation.',
    icon: Server,
    component: OllamaLlmSetup,
  },
];

const vectorDbProviders = [
  {
    id: 'sqlite',
    name: 'SQLite',
    summary: 'Use a local SQLite database for vector indexes and metadata.',
    icon: Database,
    component: SQLiteVectorDbSetup,
  },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('embedding');
  const [embeddingSetup, setEmbeddingSetup] = useState(readSavedEmbeddingSetup);
  const [llmSetup, setLlmSetup] = useState(readSavedLlmSetup);
  const [selectedProvider, setSelectedProvider] = useState(
    embeddingSetup?.provider ?? embeddingProviders[0].id,
  );
  const [selectedModel, setSelectedModel] = useState(embeddingSetup?.model ?? '');
  const [isEditingSetup, setIsEditingSetup] = useState(!embeddingSetup);
  const [selectedLlmProvider, setSelectedLlmProvider] = useState(
    llmSetup?.provider ?? llmProviders[0].id,
  );
  const [selectedLlmModel, setSelectedLlmModel] = useState(llmSetup?.model ?? '');
  const [isEditingLlmSetup, setIsEditingLlmSetup] = useState(!llmSetup);
  const [selectedVectorDbProvider, setSelectedVectorDbProvider] = useState(
    vectorDbProviders[0].id,
  );
  const [advancedOptionsEnabled, setAdvancedOptionsEnabled] = useState(true);
  const activeProvider = embeddingProviders.find((provider) => provider.id === selectedProvider);
  const ActiveProviderSetup = activeProvider?.component;
  const activeLlmProvider = llmProviders.find((provider) => provider.id === selectedLlmProvider);
  const ActiveLlmProviderSetup = activeLlmProvider?.component;
  const activeVectorDbProvider = vectorDbProviders.find(
    (provider) => provider.id === selectedVectorDbProvider,
  );
  const ActiveVectorDbSetup = activeVectorDbProvider?.component;

  const handleSaveEmbeddingChanges = () => {
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

  const handleSaveLlmChanges = () => {
    if (!selectedLlmProvider || !selectedLlmModel) {
      return;
    }

    const nextSetup = {
      provider: selectedLlmProvider,
      model: selectedLlmModel,
      endpoint: OLLAMA_BASE_URL,
    };

    window.localStorage.setItem(LLM_SETUP_STORAGE_KEY, JSON.stringify(nextSetup));
    setLlmSetup(nextSetup);
    setIsEditingLlmSetup(false);
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
              {settingTabs.map(({ id, label, icon: Icon }) => (
                <button
                  className={`settings-nav-item${activeSection === id ? ' is-active' : ''}`}
                  key={label}
                  type="button"
                  onClick={() => setActiveSection(id)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            {activeSection === 'embedding' && (
              <EmbeddingSettingsPanel
                embeddingSetup={embeddingSetup}
                selectedProvider={selectedProvider}
                selectedModel={selectedModel}
                isEditingSetup={isEditingSetup}
                advancedOptionsEnabled={advancedOptionsEnabled}
                ActiveProviderSetup={ActiveProviderSetup}
                onAdvancedOptionsChange={setAdvancedOptionsEnabled}
                onEditSetup={() => setIsEditingSetup(true)}
                onSave={handleSaveEmbeddingChanges}
                onSelectModel={setSelectedModel}
                onSelectProvider={(providerId) => {
                  setSelectedProvider(providerId);
                  setSelectedModel('');
                }}
              />
            )}

            {activeSection === 'generation' && (
              <GenerationSettingsPanel
                llmSetup={llmSetup}
                selectedProvider={selectedLlmProvider}
                selectedModel={selectedLlmModel}
                isEditingSetup={isEditingLlmSetup}
                advancedOptionsEnabled={advancedOptionsEnabled}
                ActiveProviderSetup={ActiveLlmProviderSetup}
                onAdvancedOptionsChange={setAdvancedOptionsEnabled}
                onEditSetup={() => setIsEditingLlmSetup(true)}
                onSave={handleSaveLlmChanges}
                onSelectModel={setSelectedLlmModel}
                onSelectProvider={(providerId) => {
                  setSelectedLlmProvider(providerId);
                  setSelectedLlmModel('');
                }}
              />
            )}

            {activeSection === 'vector-db' && (
              <VectorDbSettingsPanel
                selectedProvider={selectedVectorDbProvider}
                ActiveProviderSetup={ActiveVectorDbSetup}
                onSelectProvider={setSelectedVectorDbProvider}
              />
            )}

            {activeSection !== 'embedding'
              && activeSection !== 'generation'
              && activeSection !== 'vector-db' && (
              <PlaceholderSettingsPanel section={settingTabs.find((tab) => tab.id === activeSection)} />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function VectorDbSettingsPanel({
  selectedProvider,
  ActiveProviderSetup,
  onSelectProvider,
}) {
  return (
    <section className="settings-detail" aria-labelledby="vector-db-title">
      <div className="settings-detail-heading">
        <h2 id="vector-db-title">VectorDB</h2>
        <p>
          Choose where Embeddly stores vector indexes, chunk metadata, and retrieval-ready
          embeddings.
        </p>
      </div>

      <ProviderOptions
        legend="Vector database options"
        name="vector-db-provider"
        providers={vectorDbProviders}
        selectedProvider={selectedProvider}
        onSelectProvider={onSelectProvider}
      />

      {ActiveProviderSetup && <ActiveProviderSetup />}
    </section>
  );
}

function ConfiguredModelCard({ setup, onEdit }) {
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

function EmbeddingSettingsPanel({
  embeddingSetup,
  selectedProvider,
  selectedModel,
  isEditingSetup,
  advancedOptionsEnabled,
  ActiveProviderSetup,
  onAdvancedOptionsChange,
  onEditSetup,
  onSave,
  onSelectModel,
  onSelectProvider,
}) {
  return (
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
        <ConfiguredModelCard setup={embeddingSetup} onEdit={onEditSetup} />
      ) : (
        <>
          <ProviderOptions
            legend="Embedding provider options"
            name="embedding-provider"
            providers={embeddingProviders}
            selectedProvider={selectedProvider}
            onSelectProvider={onSelectProvider}
          />

          {ActiveProviderSetup && (
            <ActiveProviderSetup
              endpoint={OLLAMA_BASE_URL}
              selectedModel={selectedModel}
              onSelectModel={onSelectModel}
            />
          )}
        </>
      )}

      <AdvancedOption
        enabled={advancedOptionsEnabled}
        label="Advanced options"
        summary="Fine-tune batch size, dimensions, and other model parameters."
        onChange={onAdvancedOptionsChange}
      />

      <SaveSettingsButton
        disabled={!selectedModel}
        label={embeddingSetup ? 'Save changes' : 'Save setup'}
        onClick={onSave}
      />
    </section>
  );
}

function GenerationSettingsPanel({
  llmSetup,
  selectedProvider,
  selectedModel,
  isEditingSetup,
  advancedOptionsEnabled,
  ActiveProviderSetup,
  onAdvancedOptionsChange,
  onEditSetup,
  onSave,
  onSelectModel,
  onSelectProvider,
}) {
  return (
    <section className="settings-detail" aria-labelledby="generation-title">
      <div className="settings-detail-heading">
        <h2 id="generation-title">Generation</h2>
        <p>
          {llmSetup
            ? 'Manage the language model used to generate answers from retrieved context.'
            : 'Set up a local language model before generated answers can run.'}
        </p>
      </div>

      {llmSetup && !isEditingSetup ? (
        <ConfiguredModelCard setup={llmSetup} onEdit={onEditSetup} />
      ) : (
        <>
          <ProviderOptions
            legend="Generation provider options"
            name="generation-provider"
            providers={llmProviders}
            selectedProvider={selectedProvider}
            onSelectProvider={onSelectProvider}
          />

          {ActiveProviderSetup && (
            <ActiveProviderSetup
              endpoint={OLLAMA_BASE_URL}
              selectedModel={selectedModel}
              onSelectModel={onSelectModel}
            />
          )}
        </>
      )}

      <AdvancedOption
        enabled={advancedOptionsEnabled}
        label="Generation options"
        summary="Tune context window, temperature, and response behavior."
        onChange={onAdvancedOptionsChange}
      />

      <SaveSettingsButton
        disabled={!selectedModel}
        label={llmSetup ? 'Save changes' : 'Save setup'}
        onClick={onSave}
      />
    </section>
  );
}

function ProviderOptions({ legend, name, providers, selectedProvider, onSelectProvider }) {
  return (
    <fieldset className="model-options provider-options">
      <legend className="sr-only">{legend}</legend>
      {providers.map((provider) => {
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
              name={name}
              checked={selectedProvider === provider.id}
              onChange={() => onSelectProvider(provider.id)}
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
  );
}

function AdvancedOption({ enabled, label, summary, onChange }) {
  return (
    <label className={`advanced-option${enabled ? ' is-on' : ''}`}>
      <span>
        <strong>{label}</strong>
        <small>{summary}</small>
      </span>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span className="toggle" aria-hidden="true" />
    </label>
  );
}

function SaveSettingsButton({ disabled, label, onClick }) {
  return (
    <button
      className="save-button"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      <Save size={18} />
      <span>{label}</span>
    </button>
  );
}

function PlaceholderSettingsPanel({ section }) {
  return (
    <section className="settings-detail" aria-labelledby="placeholder-settings-title">
      <div className="settings-detail-heading">
        <h2 id="placeholder-settings-title">{section?.label ?? 'Settings'}</h2>
        <p>This settings section is ready for configuration controls.</p>
      </div>
    </section>
  );
}

function OllamaEmbeddingSetup({ endpoint, selectedModel, onSelectModel }) {
  return (
    <OllamaModelSetup
      endpoint={endpoint}
      selectedModel={selectedModel}
      onSelectModel={onSelectModel}
      title="Available Ollama embedding models"
      emptyMessage="No embedding-capable Ollama models were found."
      installHint="Install one locally, for example: ollama pull nomic-embed-text"
      radioName="ollama-embedding-model"
      isSupportedModel={isEmbeddingModel}
    />
  );
}

function OllamaLlmSetup({ endpoint, selectedModel, onSelectModel }) {
  return (
    <OllamaModelSetup
      endpoint={endpoint}
      selectedModel={selectedModel}
      onSelectModel={onSelectModel}
      title="Available Ollama language models"
      emptyMessage="No generation-capable Ollama models were found."
      installHint="Install one locally, for example: ollama pull llama3.2"
      radioName="ollama-llm-model"
      isSupportedModel={isLlmModel}
    />
  );
}

function SQLiteVectorDbSetup() {
  return (
    <section className="provider-setup" aria-label="SQLite vector database setup">
      <div className="provider-setup-header">
        <span>
          <strong>SQLite vector store</strong>
          <small>Local file-backed storage for private, single-user retrieval workflows.</small>
        </span>
      </div>

      <div className="setup-message">
        <Database size={18} />
        <span>
          SQLite is ready to use as the local VectorDB option.
          <small>Additional providers can be added through the vectorDbProviders list.</small>
        </span>
      </div>
    </section>
  );
}

function OllamaModelSetup({
  endpoint,
  selectedModel,
  onSelectModel,
  title,
  emptyMessage,
  installHint,
  radioName,
  isSupportedModel,
}) {
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
      const supportedModels = modelsWithCapabilities.filter(isSupportedModel);

      setModels(supportedModels);
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
  }, [endpoint, isSupportedModel]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      onSelectModel(models[0].name);
    }
  }, [models, onSelectModel, selectedModel]);

  return (
    <section className="provider-setup" aria-label={title}>
      <div className="provider-setup-header">
        <span>
          <strong>{title}</strong>
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
            {emptyMessage}
            <small>{installHint}</small>
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
                name={radioName}
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

function isEmbeddingModel(model) {
  const capabilities = Array.isArray(model.capabilities) ? model.capabilities : [];
  const hasEmbeddingCapability = capabilities.includes('embedding');
  const modelName = `${model.name ?? ''} ${model.model ?? ''}`.toLowerCase();

  return hasEmbeddingCapability || (capabilities.length === 0 && modelName.includes('embed'));
}

function isLlmModel(model) {
  const capabilities = Array.isArray(model.capabilities) ? model.capabilities : [];
  const hasCompletionCapability = capabilities.includes('completion');
  const modelName = `${model.name ?? ''} ${model.model ?? ''}`.toLowerCase();
  const looksEmbeddingOnly = modelName.includes('embed');

  return hasCompletionCapability || (capabilities.length === 0 && !looksEmbeddingOnly);
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
