import './i18n/config'
import './index.css'

import React from 'react'
import ReactDOM from 'react-dom/client'

import Application from './Application.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Application />
  </React.StrictMode>,
)
