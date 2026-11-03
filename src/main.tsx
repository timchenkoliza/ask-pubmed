import { createRoot } from 'react-dom/client';
import App from './App';

/* Язык документа для скринридеров и переносов (WCAG 3.1.1) */
document.documentElement.lang = 'ru';

createRoot(document.getElementById('root')!).render(<App />);
