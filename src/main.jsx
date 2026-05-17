import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { EmbeddingProvider } from './lib/embeddingContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <EmbeddingProvider>
      <App />
    </EmbeddingProvider>
  </StrictMode>,
);
