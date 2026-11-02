import { MotionConfig } from 'motion/react'
import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Toasts } from './components/Toasts'
import { Home } from './screens/Home'
import { HowToPage } from './screens/HowTo'
import { NotFound } from './screens/NotFound'

const RoomScreen = lazy(() => import('./screens/RoomScreen').then((m) => ({ default: m.RoomScreen })))
const DevUI = lazy(() => import('./screens/DevUI').then((m) => ({ default: m.DevUI })))

export function App() {
  return (
    // "user": every motion animation falls back to instant/fade when the OS asks for reduced motion.
    <MotionConfig reducedMotion="user">
      <Suspense fallback={<p className="p-6 text-center text-ink-muted">กำลังโหลด…</p>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/r/:code" element={<RoomScreen />} />
          <Route path="/how" element={<HowToPage />} />
          <Route path="/dev/ui" element={<DevUI />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toasts />
    </MotionConfig>
  )
}
