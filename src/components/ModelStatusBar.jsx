import { AlertCircle, Database, WandSparkles, Zap } from 'lucide-react';
import './ModelStatusBar.css';

function formatProviderName(provider) {
  if (provider === 'ollama') {
    return 'Ollama';
  }

  if (provider === 'api') {
    return 'External API';
  }

  if (provider === 'sqlite') {
    return 'SQLite';
  }

  return provider;
}

export default function ModelStatusBar({ embeddingSetup, llmSetup, vectorDbSetup }) {
  const hasEmbedding = Boolean(embeddingSetup?.model);
  const hasLlm = Boolean(llmSetup?.model);
  const hasVectorDb = Boolean(vectorDbSetup?.provider || vectorDbSetup?.name);

  if (!hasEmbedding && !hasLlm && !hasVectorDb) {
    return (
      <div className="model-status-bar">
        <span className="model-status-pill is-unconfigured">
          <AlertCircle size={14} />
          <span className="model-status-name">No models configured</span>
        </span>
      </div>
    );
  }

  return (
    <div className="model-status-bar">
      {hasEmbedding && (
        <span className="model-status-pill">
          <Zap size={14} />
          <span className="model-status-name">{embeddingSetup.model}</span>
          <span className="model-status-provider">
            {formatProviderName(embeddingSetup.provider)}
          </span>
        </span>
      )}
      {hasLlm && (
        <span className="model-status-pill">
          <WandSparkles size={14} />
          <span className="model-status-name">{llmSetup.model}</span>
          <span className="model-status-provider">
            {formatProviderName(llmSetup.provider)}
          </span>
        </span>
      )}
      {hasVectorDb && (
        <span className="model-status-pill">
          <Database size={14} />
          <span className="model-status-name">
            {vectorDbSetup.name ?? formatProviderName(vectorDbSetup.provider)}
          </span>
          <span className="model-status-provider">
            VectorDB
          </span>
        </span>
      )}
    </div>
  );
}
