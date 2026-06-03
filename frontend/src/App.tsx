import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ui/ProtectedRoute'
import { useAuthStore } from './stores/authStore'
import { Welcome } from './screens/Welcome'
import { Register } from './screens/auth/Register'
import { Login } from './screens/auth/Login'
import { Onboarding } from './screens/Onboarding'
import { Home } from './screens/Home'
import { Session } from './screens/Session'
import { SessionComplete } from './screens/SessionComplete'
import { ProcessLog } from './screens/ProcessLog'
import { Settings } from './screens/Settings'


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
        <ProtectedRoute><Onboarding /></ProtectedRoute>
      } />
      <Route path="/home" element={
        <ProtectedRoute><Home /></ProtectedRoute>
      } />
      <Route path="/session" element={
        <ProtectedRoute><Session /></ProtectedRoute>
      } />
      <Route path="/session/complete" element={
        <ProtectedRoute><SessionComplete /></ProtectedRoute>
      } />
      <Route path="/processes" element={
        <ProtectedRoute><ProcessLog /></ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute><Settings /></ProtectedRoute>
      } />

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
