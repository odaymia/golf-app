import '../polyfills.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/montserrat/latin-700.css';
import '../styles.css';
import './admin.css';
import Admin from './Admin.jsx';

// Owner dashboard at /admin/ (desktop). Same sign-in as the app.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Admin />
  </StrictMode>,
);
