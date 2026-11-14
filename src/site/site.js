// Website entry: fonts and styles, plus the "Log in" / "Open app" button.
import '@fontsource/fraunces/latin-500.css';
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/fraunces/latin-500-italic.css';
import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/montserrat/latin-700.css';
import './site.css';

// Already signed in on this device? The button goes straight into the app.
try {
  if (localStorage.getItem('sb-qdnrmeipmggpxynggsnl-auth-token')) {
    document.getElementById('login').textContent = 'Open app';
  }
} catch {
  // storage blocked: keep "Log in"
}
