import { Route, Routes } from 'react-router-dom'
import { DevUI } from './screens/DevUI'
import { Home } from './screens/Home'
import { NotFound } from './screens/NotFound'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dev/ui" element={<DevUI />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
