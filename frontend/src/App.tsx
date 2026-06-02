import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ui/ProtectedRoute'
import { useAuthStore } from './stores/authStore'
import { Welcome } from './screens/Welcome'
import { Register } from './screens/auth/Register'
import { Login } from './screens/auth/Login'

// Screens — stubbed until their steps are implemented
const ComingSoon = ({ name }: { name: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
    {name} — coming soon
  </div>
)

function RootRedirect() {
  const { token, onboardingComplete } = useAuthStore()
  if (!token) return <Navigate to="/welcome" replace />
  // If stored flag is absent (legacy user), default to true → go to home
  if (onboardingComplete === false) return <Navigate to="/onboarding" replace />
  return <Navigate to="/home" replace />
}

function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/auth/register" element={<Register />} />
      <Route path="/auth/login" element={<Login />} />

      <Route path="/onboarding" element={
        <ProtectedRoute><ComingSoon name="Onboarding" /></ProtectedRoute>
      } />
      <Route path="/home" element={
        <ProtectedRoute><ComingSoon name="Home" /></ProtectedRoute>
      } />
      <Route path="/session" element={
        <ProtectedRoute><ComingSoon name="Session" /></ProtectedRoute>
      } />
      <Route path="/session/complete" element={
        <ProtectedRoute><ComingSoon name="Session Complete" /></ProtectedRoute>
      } />
      <Route path="/processes" element={
        <ProtectedRoute><ComingSoon name="Process Log" /></ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute><ComingSoon name="Settings" /></ProtectedRoute>
      } />

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
