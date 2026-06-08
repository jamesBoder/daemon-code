import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
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
import { Chronicle } from './screens/Chronicle'
import { Codex } from './screens/Codex'
import { ROUTE_TRANSITION_MS } from './lib/constants'

// BottomNav destinations share a key — AnimatePresence never crossfades between them
const BOTTOM_NAV_PATHS = new Set(['/home', '/chronicle', '/processes', '/settings'])

function TransitionPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: ROUTE_TRANSITION_MS / 1000, ease: 'easeInOut' }}
      style={{ position: 'fixed', inset: 0 }}
    >
      {children}
    </motion.div>
  )
}

function RootRedirect() {
  const { token, onboardingComplete } = useAuthStore()
  if (!token) return <Navigate to="/welcome" replace />
  // If stored flag is absent (legacy user), default to true → go to home
  if (onboardingComplete === false) return <Navigate to="/onboarding" replace />
  return <Navigate to="/home" replace />
}

function App() {
  const location = useLocation()
  const transitionKey = BOTTOM_NAV_PATHS.has(location.pathname) ? '__nav' : location.pathname

  return (
    <AnimatePresence mode="sync" initial={false}>
      <Routes location={location} key={transitionKey}>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/auth/register" element={<Register />} />
        <Route path="/auth/login" element={<Login />} />

        <Route path="/onboarding" element={
          <TransitionPage>
            <ProtectedRoute><Onboarding /></ProtectedRoute>
          </TransitionPage>
        } />

        {/* BottomNav routes — instant swap, no crossfade */}
        <Route path="/home" element={
          <ProtectedRoute><Home /></ProtectedRoute>
        } />
        <Route path="/chronicle" element={
          <ProtectedRoute><Chronicle /></ProtectedRoute>
        } />
        <Route path="/processes" element={
          <ProtectedRoute><ProcessLog /></ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute><Settings /></ProtectedRoute>
        } />

        {/* Codex — reference screen, accessed from Settings */}
        <Route path="/codex" element={
          <TransitionPage>
            <ProtectedRoute><Codex /></ProtectedRoute>
          </TransitionPage>
        } />

        {/* Session flow — crossfades between states */}
        <Route path="/session" element={
          <TransitionPage>
            <ProtectedRoute><Session /></ProtectedRoute>
          </TransitionPage>
        } />
        <Route path="/session/complete" element={
          <TransitionPage>
            <ProtectedRoute><SessionComplete /></ProtectedRoute>
          </TransitionPage>
        } />

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

export default App
