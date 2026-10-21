import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { TooltipProvider } from './components/ui/tooltip'
import { IngestionPage } from './features/ingestion/pages/IngestionPage'
import { ChatPage } from './pages/ChatPage'
import './AppShell.css'

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<ChatPage />} />
          </Route>
          <Route path="/ingestion" element={<IngestionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            color: '#153b72',
            background: '#fff',
            border: '1px solid #cbdcf6',
            boxShadow: '0 0.5rem 1.5rem rgb(26 53 91 / 15%)',
          },
        }}
      />
    </TooltipProvider>
  )
}

export default App
