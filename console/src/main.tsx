import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import '@shared/styles.css';
import './console.css';

createRoot(document.getElementById('root')!).render(
  // в проде консоль живёт на /console/ (собирается с --base=/console/), в dev — в корне
  <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
    <App />
  </BrowserRouter>,
);
