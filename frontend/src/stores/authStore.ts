import { create } from 'zustand'

interface AuthState {
  token: string | null
  onboardingComplete: boolean | null
  setAuth: (token: string, onboardingComplete: boolean) => void
  logout: () => void
}

function readOnboardingComplete(): boolean | null {
  const stored = localStorage.getItem('onboarding_complete')
  if (stored === null) return null
  return stored === 'true'
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: localStorage.getItem('token'),
  onboardingComplete: readOnboardingComplete(),

  setAuth: (token, onboardingComplete) => {
    localStorage.setItem('token', token)
    localStorage.setItem('onboarding_complete', String(onboardingComplete))
    set({ token, onboardingComplete })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('onboarding_complete')
    set({ token: null, onboardingComplete: null })
  },
}))
