import LandingPage from './LandingPage'
import LabPage from './LabPage'

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  return pathname === '/lab' ? <LabPage /> : <LandingPage />
}
