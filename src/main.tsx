import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Placeholder entry. The real app shell (UrlInput, RestoredPane, ReaderPane,
// DeathCertificate, StatusBanner) is built in Phase 4. For now this only
// proves the toolchain wires React into index.html.
function Placeholder() {
  return <main>Seance is not built yet.</main>;
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Placeholder />
    </StrictMode>,
  );
}
