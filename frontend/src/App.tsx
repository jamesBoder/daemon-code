import './App.css'
import { CompileScreen } from './components/daemon/CompileScreen'
import type { CompileData } from './types'

const testData: CompileData = {
  day: 1,
  processingSignals: 12,
  analystTime: '0.41s',
  stats: [
    { label: 'fragments decoded',    value: 4,  delta: 4 },
    { label: 'processes identified', text: '1 new' },
    { label: 'kernel access',        value: 4,  delta: 4, suffix: '%' },
  ],
  daemonProse: 'Something moved quickly when approached. I am not yet sure what it is. But I have been watching.',
  dailySignalQuote: 'The most common form of despair is not being who you are.',
  dailySignalAuthor: 'Kierkegaard',
  orbState: 'cold',
}

function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <CompileScreen data={testData} />
    </div>
  )
}

export default App
