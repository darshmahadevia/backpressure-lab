import LandingPage from './LandingPage'
import LabPage from './LabPage'
import { ThemeProvider } from './Theme'

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  return (
    <ThemeProvider>
      {pathname === '/lab' ? <LabPage /> : <LandingPage />}
    </ThemeProvider>
  )
}
