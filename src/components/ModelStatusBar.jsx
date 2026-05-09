import { Zap, WandSparkles, AlertCircle } from 'lucide-react';
import './ModelStatusBar.css';

export default function ModelStatusBar({ embeddingSetup, llmSetup }) {
  const hasEmbedding = Boolean(embeddingSetup?.model);
  const hasLlm = Boolean(llmSetup?.model);

  if (!hasEmbedding && !hasLlm) {
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
            {embeddingSetup.provider === 'ollama' ? 'Ollama' : embeddingSetup.provider}
          </span>
        </span>
      )}
      {hasLlm && (
        <span className="model-status-pill">
          <WandSparkles size={14} />
          <span className="model-status-name">{llmSetup.model}</span>
          <span className="model-status-provider">
            {llmSetup.provider === 'ollama' ? 'Ollama' : llmSetup.provider}
          </span>
        </span>
      )}
    </div>
  );
}
