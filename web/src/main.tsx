import { lazy, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { readLanguage, saveLanguage, setLanguage, type Language } from '@shared/i18n';
import { tg, watchSafeArea } from '@shared/tg';
import '@shared/styles.css';
import './language.css';

if (tg) {
  tg.ready();
  tg.expand();
  watchSafeArea();
  document.documentElement.dataset.theme = tg.colorScheme;
  tg.onEvent?.('themeChanged', () => (document.documentElement.dataset.theme = tg!.colorScheme));
  try {
    tg.setHeaderColor?.(tg.colorScheme === 'dark' ? '#0a131b' : '#eef3f7');
    tg.setBackgroundColor?.(tg.colorScheme === 'dark' ? '#0a131b' : '#eef3f7');
  } catch {
    /* старые клиенты */
  }
}

const App = lazy(() => import('./App'));
const savedLanguage = readLanguage();
if (savedLanguage) setLanguage(savedLanguage);

function MiniApp() {
  const [selected, setSelected] = useState(savedLanguage);

  function choose(value: Language) {
    saveLanguage(value);
    setLanguage(value);
    setSelected(value);
  }

  if (!selected) {
    return (
      <main className="gate language-gate" aria-labelledby="language-heading">
        <img className="logo" src="/logo.png" alt="Falcons" />
        <div>
          <h1 id="language-heading" lang="ru">Выберите язык</h1>
          <p lang="en">Choose a language</p>
        </div>
        <div className="vstack language-options">
          <button className="btn secondary block" lang="ru" onClick={() => choose('ru')}>Русский</button>
          <button className="btn secondary block" lang="en" onClick={() => choose('en')}>English</button>
        </div>
      </main>
    );
  }

  return (
    <HashRouter>
      <Suspense fallback={<div className="gate"><div className="spinner" aria-hidden="true" /></div>}>
        <App />
      </Suspense>
    </HashRouter>
  );
}

createRoot(document.getElementById('root')!).render(<MiniApp />);
