import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { jwtDecode } from 'jwt-decode'
import { apiFetch } from './lib/api'
import { useAuthStore } from './stores/authStore'
import { TOKEN_REFRESH_WINDOW_MS } from './lib/constants'
import './index.css'
import App from './App.tsx'

async function refreshIfExpiringSoon() {
  const token = localStorage.getItem('token')
  if (!token) return
  try {
    const { exp } = jwtDecode<{ exp: number }>(token)
    if ((exp * 1000) - Date.now() < TOKEN_REFRESH_WINDOW_MS) {
      const r = await apiFetch('/auth/refresh')
      if (r.ok) {
        const { token: newToken } = await r.json() as { token: string }
        const onboardingComplete = useAuthStore.getState().onboardingComplete ?? true
        useAuthStore.getState().setAuth(newToken, onboardingComplete)
      }
    }
  } catch { /* malformed token or network error — continue with existing token */ }
}

refreshIfExpiringSoon()  // fire-and-forget, does not block render

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
