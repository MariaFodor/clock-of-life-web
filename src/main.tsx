import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import { createQueryClient } from './app/queryClient'
import { AuthProvider } from './app/auth'
import { ProfileProvider } from './app/profile'
import { ThemeProvider } from './app/theme'
import { provideClient } from './api/client'
import { createHttpClient } from './api/httpClient'
import { createMockClient } from './api/mockClient'
import './index.css'

// Real backend by default (clock-of-life-service via the /api proxy); set VITE_USE_MOCK=1 to run the
// in-memory mock instead. Same ApiClient seam either way, so pages and hooks are unchanged.
provideClient(import.meta.env.VITE_USE_MOCK === '1' ? createMockClient() : createHttpClient())

const queryClient = createQueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ThemeProvider>
          <AuthProvider>
            <ProfileProvider>
              <App />
            </ProfileProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
