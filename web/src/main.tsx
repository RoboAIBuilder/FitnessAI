import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { installApiActions } from './apiActions';

installApiActions();

declare const __DEMO__: boolean;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Installable PWA build registers the service worker (the hosted demo is a single file without one).
if (!__DEMO__ && 'serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {});
}
