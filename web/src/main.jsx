import '@fontsource-variable/inter'
import '@fontsource/fredoka/latin-500.css'
import '@fontsource/fredoka/latin-600.css'
import '@fontsource/fredoka/latin-700.css'
import './i18n/config'
import './index.css'
import './utils/familyTime'

import React from 'react'
import ReactDOM from 'react-dom/client'

import Application from './Application.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Application />
  </React.StrictMode>,
)
