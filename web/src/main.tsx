import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { tg } from './tg';
import './styles.css';

if (tg) {
  tg.ready();
  tg.expand();
  document.documentElement.dataset.theme = tg.colorScheme;
  tg.onEvent?.('themeChanged', () => (document.documentElement.dataset.theme = tg!.colorScheme));
  try {
    tg.setHeaderColor?.(tg.colorScheme === 'dark' ? '#0a131b' : '#eef3f7');
    tg.setBackgroundColor?.(tg.colorScheme === 'dark' ? '#0a131b' : '#eef3f7');
  } catch {
    /* старые клиенты */
  }
}

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>,
);
