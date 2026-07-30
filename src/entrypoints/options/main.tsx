import React from 'react';
import ReactDOM from 'react-dom/client';

import { OptionsApp } from './App';
import './style.css';
import '../../ui/guided-tour.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>,
);
