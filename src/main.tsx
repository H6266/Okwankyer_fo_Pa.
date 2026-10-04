import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercept and swallow noise from third-party browser extensions (e.g. MetaMask/Web3 injected into iframe)
if (typeof window !== 'undefined') {
  const isExtensionNoise = (err: any) => {
    const msg = String(err?.message || err?.reason?.message || err?.reason || err || '').toLowerCase();
    return msg.includes('metamask') || msg.includes('ethereum') || msg.includes('web3') || msg.includes('chrome-extension');
  };

  window.addEventListener('error', (e) => {
    if (isExtensionNoise(e.error || e.message)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    if (isExtensionNoise(e.reason)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
