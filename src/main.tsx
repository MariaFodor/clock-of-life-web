import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import { createQueryClient } from './app/queryClient'
import { AuthProvider } from './app/auth'
import { ProfileProvider } from './app/profile'
import { provideClient } from './api/client'
import { createMockClient } from './api/mockClient'
import './index.css'

// Until the generated OpenAPI client lands (ARCH-04), the app runs against the in-memory mock. Swapping
// to the real client is a one-line change here — pages and hooks go through the same seam.
provideClient(createMockClient())

const queryClient = createQueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <ProfileProvider>
            <App />
          </ProfileProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
