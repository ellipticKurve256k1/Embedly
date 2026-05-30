import { AlertCircle, BarChart3, Database, WandSparkles, Zap } from 'lucide-react';
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

  if (provider === 'supabase') {
    return 'Supabase';
  }

  return provider;
}

function formatRerankerModel(model) {
  const name = String(model ?? '').trim();
  if (name.startsWith('Xenova/')) {
    return name.slice(7);
  }

  return name || 'bge-reranker-v2-m3';
}

export default function ModelStatusBar({ embeddingSetup, llmSetup, vectorDbSetup, rerankerSetup }) {
  const hasEmbedding = Boolean(embeddingSetup?.model);
  const hasLlm = Boolean(llmSetup?.model);
  const hasVectorDb = Boolean(vectorDbSetup?.provider || vectorDbSetup?.name);
  const hasReranker = Boolean(rerankerSetup?.model);

  if (!hasEmbedding && !hasLlm && !hasVectorDb && !hasReranker) {
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
      {hasReranker && (
        <span className="model-status-pill">
          <BarChart3 size={14} />
          <span className="model-status-name">{formatRerankerModel(rerankerSetup.model)}</span>
          <span className="model-status-provider">Rerank</span>
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
