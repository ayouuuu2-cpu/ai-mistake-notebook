import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { DiagnosisPage } from './pages/DiagnosisPage'
import { IntakePage } from './pages/IntakePage'
import { SummaryPage } from './pages/SummaryPage'
import { WeaknessMapPage } from './pages/WeaknessMapPage'

function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>AI 错题本 MVP</h1>
        <nav>
          <NavLink to="/intake">错题录入</NavLink>
          <NavLink to="/diagnosis">AI 对话诊断</NavLink>
          <NavLink to="/summary">错因归纳</NavLink>
          <NavLink to="/weakness-map">薄弱点地图</NavLink>
        </nav>
      </header>

      <main className="page-container">
        <Routes>
          <Route path="/" element={<Navigate to="/intake" replace />} />
          <Route path="/intake" element={<IntakePage />} />
          <Route path="/diagnosis" element={<DiagnosisPage />} />
          <Route path="/summary" element={<SummaryPage />} />
          <Route path="/weakness-map" element={<WeaknessMapPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
