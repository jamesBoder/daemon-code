import { useAuthStore } from '../stores/authStore'

export function useAuth() {
  const { token, onboardingComplete, setAuth, logout } = useAuthStore()
  return {
    token,
    onboardingComplete,
    isAuthenticated: token !== null,
    login: setAuth,
    logout,
  }
}
