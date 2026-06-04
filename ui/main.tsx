import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import "@radix-ui/themes/styles.css";
import './index.scss'
import { Theme } from '@radix-ui/themes';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme
      accentColor='amber'
      grayColor='slate'
      panelBackground='solid'
      appearance='dark'
    >
      <App />
    </Theme>
  </StrictMode>,
)
