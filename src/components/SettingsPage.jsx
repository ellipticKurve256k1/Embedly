import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CircleHelp,
  Database,
  RefreshCw,
  Save,
  Search,
  Server,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import logoSrc from '../../references/embedly.png';
import {
  readSavedEmbeddingSetup,
  readSavedChunkingConfig,
  readSavedLlmSetup,
  readSavedVectorDbSetup,
  saveChunkingConfig,
  saveEmbeddingSetup,
  saveLlmSetup,
  saveVectorDbSetup,
} from '../lib/storage.js';
import './SettingsPage.css';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_OPENAI_COMPATIBLE_ENDPOINT = 'https://api.openai.com/v1';

const settingTabs = [
  { id: 'embedding', label: 'Embedding Model', icon: Zap },
  { id: 'retrieval', label: 'Retrieval', icon: Search },
  { id: 'generation', label: 'Generation', icon: WandSparkles },
  { id: 'vector-db', label: 'VectorDB', icon: Database },
  // { id: 'data-sources', label: 'Data Sources', icon: Database },
  // { id: 'security', label: 'Security', icon: LockKeyhole },
  // { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
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
    mode: 'Local',
    summary: 'Use local language models served by Ollama for generation.',
    icon: Server,
    component: OllamaLlmSetup,
  },
  {
    id: 'api',
    name: 'External API',
    mode: 'Remote',
    summary: 'Use any OpenAI-compatible API endpoint for generation.',
    icon: Zap,
    component: ApiLlmSetup,
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

function normalizeEndpointInput(endpoint) {
  return String(endpoint ?? '').trim().replace(/\/+$/, '');
}

function isValidApiEndpoint(endpoint) {
  const normalizedEndpoint = normalizeEndpointInput(endpoint);

  try {
    const url = new URL(normalizedEndpoint);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.pathname === '' || url.pathname === '/' || url.pathname.endsWith('/v1'));
  } catch {
    return false;
  }
}

function isValidLlmSetup({ provider, endpoint, apiKey }) {
  if (provider !== 'api') return true;
  return isValidApiEndpoint(endpoint) && Boolean(String(apiKey ?? '').trim());
}

function hasModelName(model) {
  return Boolean(String(model ?? '').trim());
}

function getSaveStatus(section, saveStatus) {
  if (saveStatus.section !== section) {
    return null;
  }

  return saveStatus;
}

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
  const [selectedLlmEndpoint, setSelectedLlmEndpoint] = useState(
    llmSetup?.endpoint ?? (
      llmSetup?.provider === 'api' ? DEFAULT_OPENAI_COMPATIBLE_ENDPOINT : OLLAMA_BASE_URL
    ),
  );
  const [selectedLlmApiKey, setSelectedLlmApiKey] = useState(llmSetup?.apiKey ?? '');
  const [isEditingLlmSetup, setIsEditingLlmSetup] = useState(!llmSetup);
  const [vectorDbSetup, setVectorDbSetup] = useState(readSavedVectorDbSetup);
  const [selectedVectorDbProvider, setSelectedVectorDbProvider] = useState(
    vectorDbSetup?.provider ?? vectorDbProviders[0].id,
  );
  const [chunkingConfig, setChunkingConfig] = useState(readSavedChunkingConfig);
  const [advancedOptionsEnabled, setAdvancedOptionsEnabled] = useState(true);
  const [savingSection, setSavingSection] = useState(null);
  const [saveStatus, setSaveStatus] = useState({ section: null, type: null, message: '' });
  const activeProvider = embeddingProviders.find((provider) => provider.id === selectedProvider);
  const ActiveProviderSetup = activeProvider?.component;
  const activeLlmProvider = llmProviders.find((provider) => provider.id === selectedLlmProvider);
  const ActiveLlmProviderSetup = activeLlmProvider?.component;
  const activeVectorDbProvider = vectorDbProviders.find(
    (provider) => provider.id === selectedVectorDbProvider,
  );
  const ActiveVectorDbSetup = activeVectorDbProvider?.component;

  const saveWithStatus = useCallback(async (section, action, successMessage) => {
    setSavingSection(section);
    setSaveStatus({ section: null, type: null, message: '' });

    try {
      const result = await action();
      setSaveStatus({ section, type: 'success', message: successMessage });
      return result;
    } catch (error) {
      setSaveStatus({
        section,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to save settings.',
      });
      return null;
    } finally {
      setSavingSection(null);
    }
  }, []);

  const handleSaveEmbeddingChanges = async () => {
    if (!selectedProvider || !selectedModel) {
      return;
    }

    const nextSetup = {
      provider: selectedProvider,
      model: selectedModel,
      endpoint: OLLAMA_BASE_URL,
    };

    const savedSetup = await saveWithStatus(
      'embedding',
      () => saveEmbeddingSetup(nextSetup),
      'Embedding settings saved.',
    );

    if (savedSetup) {
      setEmbeddingSetup(savedSetup);
      setIsEditingSetup(false);
    }
  };

  const handleSaveLlmChanges = async () => {
    if (!selectedLlmProvider || !hasModelName(selectedLlmModel) || !isValidLlmSetup({
      provider: selectedLlmProvider,
      endpoint: selectedLlmEndpoint,
      apiKey: selectedLlmApiKey,
    })) {
      return;
    }

    const nextSetup = selectedLlmProvider === 'api'
      ? {
        provider: selectedLlmProvider,
        model: selectedLlmModel.trim(),
        endpoint: normalizeEndpointInput(selectedLlmEndpoint),
        apiKey: selectedLlmApiKey.trim(),
      }
      : {
        provider: selectedLlmProvider,
        model: selectedLlmModel.trim(),
        endpoint: OLLAMA_BASE_URL,
      };

    const savedSetup = await saveWithStatus(
      'generation',
      () => saveLlmSetup(nextSetup),
      'Generation settings saved.',
    );

    if (savedSetup) {
      setLlmSetup(savedSetup);
      setSelectedLlmApiKey(savedSetup.apiKey ?? '');
      setIsEditingLlmSetup(false);
    }
  };

  const handleSelectVectorDbProvider = async (providerId) => {
    const selectedProviderConfig = vectorDbProviders.find((provider) => provider.id === providerId);

    if (!selectedProviderConfig) {
      return;
    }

    const nextSetup = {
      provider: selectedProviderConfig.id,
      name: selectedProviderConfig.name,
    };

    setSelectedVectorDbProvider(providerId);

    const savedSetup = await saveWithStatus(
      'vector-db',
      () => saveVectorDbSetup(nextSetup),
      'Vector database settings saved.',
    );

    if (savedSetup) {
      setVectorDbSetup(savedSetup);
    }
  };

  const handleSaveChunkingConfig = async () => {
    const savedConfig = await saveWithStatus(
      'retrieval',
      () => saveChunkingConfig(chunkingConfig),
      'Retrieval settings saved.',
    );

    if (savedConfig) {
      setChunkingConfig(savedConfig);
    }
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
                isSaving={savingSection === 'embedding'}
                saveStatus={getSaveStatus('embedding', saveStatus)}
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
                isSaving={savingSection === 'generation'}
                saveStatus={getSaveStatus('generation', saveStatus)}
                onAdvancedOptionsChange={setAdvancedOptionsEnabled}
                onEditSetup={() => setIsEditingLlmSetup(true)}
                onSave={handleSaveLlmChanges}
                onSelectModel={setSelectedLlmModel}
                onSelectProvider={(providerId) => {
                  setSelectedLlmProvider(providerId);
                  setSelectedLlmModel('');
                  setSelectedLlmEndpoint(providerId === 'api'
                    ? DEFAULT_OPENAI_COMPATIBLE_ENDPOINT
                    : OLLAMA_BASE_URL);
                }}
                selectedEndpoint={selectedLlmEndpoint}
                selectedApiKey={selectedLlmApiKey}
                onEndpointChange={setSelectedLlmEndpoint}
                onApiKeyChange={setSelectedLlmApiKey}
              />
            )}

            {activeSection === 'retrieval' && (
              <RetrievalSettingsPanel
                chunkingConfig={chunkingConfig}
                isSaving={savingSection === 'retrieval'}
                saveStatus={getSaveStatus('retrieval', saveStatus)}
                onChange={setChunkingConfig}
                onSave={handleSaveChunkingConfig}
              />
            )}

            {activeSection === 'vector-db' && (
              <VectorDbSettingsPanel
                selectedProvider={selectedVectorDbProvider}
                ActiveProviderSetup={ActiveVectorDbSetup}
                saveStatus={getSaveStatus('vector-db', saveStatus)}
                onSelectProvider={handleSelectVectorDbProvider}
              />
            )}

            {activeSection !== 'embedding'
              && activeSection !== 'generation'
              && activeSection !== 'retrieval'
              && activeSection !== 'vector-db' && (
              <PlaceholderSettingsPanel section={settingTabs.find((tab) => tab.id === activeSection)} />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function RetrievalSettingsPanel({ chunkingConfig, isSaving, saveStatus, onChange, onSave }) {
  const updateConfig = (field, value) => {
    onChange((currentConfig) => ({
      ...currentConfig,
      [field]: value,
    }));
  };

  return (
    <section className="settings-detail" aria-labelledby="retrieval-title">
      <div className="settings-detail-heading">
        <h2 id="retrieval-title">Retrieval</h2>
        <p>Configure how uploaded documents are split before embedding and indexing.</p>
      </div>

      <div className="settings-field-grid">
        <label className="settings-field">
          <span>
            <strong>Split strategy</strong>
            <small>Recursive keeps structure first, then splits oversized sections safely.</small>
          </span>
          <select
            value={chunkingConfig.strategy}
            onChange={(event) => updateConfig('strategy', event.target.value)}
          >
            <option value="recursive">Recursive</option>
            <option value="paragraph">Paragraph</option>
            <option value="fixed">Fixed</option>
          </select>
        </label>

        {chunkingConfig.strategy === 'fixed' ? (
          <label className="settings-field">
            <span>
              <strong>Max chunk size</strong>
              <small>Maximum characters per fixed chunk.</small>
            </span>
            <input
              min="100"
              step="50"
              type="number"
              value={chunkingConfig.maxChunkSize}
              onChange={(event) => updateConfig('maxChunkSize', Number(event.target.value))}
            />
          </label>
        ) : (
          <>
            <label className="settings-field">
              <span>
                <strong>Target chunk size</strong>
                <small>Approximate token budget for each semantic chunk.</small>
              </span>
              <input
                min="100"
                step="25"
                type="number"
                value={chunkingConfig.targetTokens}
                onChange={(event) => updateConfig('targetTokens', Number(event.target.value))}
              />
            </label>

            <label className="settings-field">
              <span>
                <strong>Hard max size</strong>
                <small>Oversized sections are recursively split under this limit.</small>
              </span>
              <input
                min="100"
                step="25"
                type="number"
                value={chunkingConfig.maxTokens}
                onChange={(event) => updateConfig('maxTokens', Number(event.target.value))}
              />
            </label>
          </>
        )}

        <label className="settings-field">
          <span>
            <strong>{chunkingConfig.strategy === 'fixed' ? 'Min chunk size' : 'Min token size'}</strong>
            <small>
              {chunkingConfig.strategy === 'fixed'
                ? 'Discard chunks shorter than this many characters.'
                : 'Merge or discard fragments below this approximate token count.'}
            </small>
          </span>
          <input
            min="1"
            step="10"
            type="number"
            value={chunkingConfig.strategy === 'fixed'
              ? chunkingConfig.minChunkSize
              : chunkingConfig.minTokens}
            onChange={(event) => updateConfig(
              chunkingConfig.strategy === 'fixed' ? 'minChunkSize' : 'minTokens',
              Number(event.target.value),
            )}
          />
        </label>

        <label className="settings-field">
          <span>
            <strong>Overlap</strong>
            <small>
              {chunkingConfig.strategy === 'fixed'
                ? 'Characters repeated between adjacent fixed chunks.'
                : 'Approximate tokens repeated between adjacent semantic chunks.'}
            </small>
          </span>
          <input
            min="0"
            max={chunkingConfig.strategy === 'fixed' ? '500' : '200'}
            step="10"
            type="range"
            value={chunkingConfig.strategy === 'fixed'
              ? chunkingConfig.overlap
              : chunkingConfig.overlapTokens}
            onChange={(event) => updateConfig(
              chunkingConfig.strategy === 'fixed' ? 'overlap' : 'overlapTokens',
              Number(event.target.value),
            )}
          />
          <em>
            {chunkingConfig.strategy === 'fixed'
              ? `${chunkingConfig.overlap} characters`
              : `${chunkingConfig.overlapTokens} tokens`}
          </em>
        </label>
      </div>

      <SaveSettingsButton
        disabled={isSaving}
        isSaving={isSaving}
        label={isSaving ? 'Saving...' : 'Save retrieval settings'}
        onClick={onSave}
      />
      <SaveStatusMessage status={saveStatus} />
    </section>
  );
}

function VectorDbSettingsPanel({
  selectedProvider,
  ActiveProviderSetup,
  saveStatus,
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
      <SaveStatusMessage status={saveStatus} />
    </section>
  );
}

function ConfiguredModelCard({ setup, onEdit }) {
  const providerName = setup.provider === 'api'
    ? 'External API'
    : setup.provider === 'ollama'
      ? 'Ollama'
      : setup.provider;

  return (
    <article className="configured-model-card">
      <span className="provider-icon" aria-hidden="true">
        <Server size={20} />
      </span>
      <span>
        <strong>{setup.model}</strong>
        <small>
          {providerName} at {setup.endpoint}
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
  isSaving,
  saveStatus,
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
        disabled={!selectedModel || isSaving}
        isSaving={isSaving}
        label={isSaving ? 'Saving...' : embeddingSetup ? 'Save changes' : 'Save setup'}
        onClick={onSave}
      />
      <SaveStatusMessage status={saveStatus} />
    </section>
  );
}

function GenerationSettingsPanel({
  llmSetup,
  selectedProvider,
  selectedModel,
  selectedEndpoint,
  selectedApiKey,
  isEditingSetup,
  advancedOptionsEnabled,
  ActiveProviderSetup,
  isSaving,
  saveStatus,
  onAdvancedOptionsChange,
  onEditSetup,
  onSave,
  onSelectModel,
  onSelectProvider,
  onEndpointChange,
  onApiKeyChange,
}) {
  const canSave = hasModelName(selectedModel)
    && isValidLlmSetup({
      provider: selectedProvider,
      endpoint: selectedEndpoint,
      apiKey: selectedApiKey,
    });

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
              endpoint={selectedProvider === 'api' ? selectedEndpoint : OLLAMA_BASE_URL}
              selectedModel={selectedModel}
              apiKey={selectedApiKey}
              onSelectModel={onSelectModel}
              onEndpointChange={onEndpointChange}
              onApiKeyChange={onApiKeyChange}
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
        disabled={!canSave || isSaving}
        isSaving={isSaving}
        label={isSaving ? 'Saving...' : llmSetup ? 'Save changes' : 'Save setup'}
        onClick={onSave}
      />
      <SaveStatusMessage status={saveStatus} />
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
                <em>{provider.mode ?? 'Local'}</em>
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

function SaveSettingsButton({ disabled, isSaving = false, label, onClick }) {
  return (
    <button
      className="save-button"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {isSaving ? <RefreshCw size={18} /> : <Save size={18} />}
      <span>{label}</span>
    </button>
  );
}

function SaveStatusMessage({ status }) {
  if (!status?.message) {
    return null;
  }

  return (
    <div className={`setup-message is-${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>
      {status.type === 'error' ? <AlertCircle size={18} /> : <Save size={18} />}
      <span>{status.message}</span>
    </div>
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

function ApiLlmSetup({
  endpoint,
  selectedModel,
  apiKey,
  onSelectModel,
  onEndpointChange,
  onApiKeyChange,
}) {
  const [isWarningVisible, setIsWarningVisible] = useState(true);
  const isEndpointValid = !endpoint || isValidApiEndpoint(endpoint);

  return (
    <section className="provider-setup" aria-label="External API generation setup">
      <div className="provider-setup-header">
        <span>
          <strong>OpenAI-compatible API</strong>
          <small>Use OpenAI, Moonshot, Groq, vLLM, or another /v1/chat/completions-compatible provider.</small>
        </span>
      </div>

      {isWarningVisible && (
        <div className="setup-message is-warning">
          <AlertTriangle size={18} />
          <span>
            External API privacy warning
            <small>
              Using an external API sends your chat messages and retrieved document context
              to a third-party server. This is not a fully local workflow.
            </small>
          </span>
          <button
            className="setup-message-dismiss"
            type="button"
            aria-label="Dismiss privacy warning"
            onClick={() => setIsWarningVisible(false)}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="settings-field-grid">
        <label className="settings-field">
          <span>
            <strong>Endpoint URL</strong>
            <small>Base URL for an OpenAI-compatible API, usually ending in /v1.</small>
          </span>
          <input
            type="url"
            value={endpoint}
            placeholder={DEFAULT_OPENAI_COMPATIBLE_ENDPOINT}
            aria-invalid={!isEndpointValid}
            onChange={(event) => onEndpointChange(event.target.value)}
          />
        </label>

        {!isEndpointValid && (
          <div className="setup-message is-error">
            <AlertCircle size={18} />
            <span>
              Endpoint must be an http(s) URL.
              <small>Use a base URL such as https://api.openai.com/v1 or http://localhost:8000/v1.</small>
            </span>
          </div>
        )}

        <label className="settings-field">
          <span>
            <strong>Model name</strong>
            <small>Enter the exact model identifier expected by the provider.</small>
          </span>
          <input
            type="text"
            value={selectedModel}
            placeholder="moonshotai/kimi-k2.6"
            onChange={(event) => onSelectModel(event.target.value)}
          />
        </label>

        <label className="settings-field">
          <span>
            <strong>API key</strong>
            <small>Stored encrypted on the local server and masked after saving.</small>
          </span>
          <input
            type="password"
            value={apiKey}
            placeholder="sk-..."
            autoComplete="off"
            onChange={(event) => onApiKeyChange(event.target.value)}
          />
        </label>
      </div>
    </section>
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
