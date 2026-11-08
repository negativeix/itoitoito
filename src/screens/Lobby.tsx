import { useState } from 'react'
import { BottomBar } from '../components/BottomBar'
import { IconShare } from '../components/icons'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { PrimaryButton } from '../components/PrimaryButton'
import { QRFull, QRThumb } from '../components/QRSheet'
import { Segmented } from '../components/Segmented'
import { Sheet } from '../components/Sheet'
import { StatusLine } from '../components/StatusLine'
import { api } from '../lib/api'
import { haptics } from '../lib/haptics'
import { PLAYER_COLORS } from '../lib/players'
import type { GameKind, GameMode, Player } from '../lib/types'
import { myPlayer, useRoom } from '../store/roomStore'
import { toast } from '../store/toastStore'

const fail = (e: Error) => toast(e.message, 'error')

export function Lobby() {
  const room = useRoom((s) => s.room)!
  const players = useRoom((s) => s.players).filter((p) => !p.left_at)
  const online = useRoom((s) => s.online)
  const me = useRoom(myPlayer)!
  const isHost = room.host_user_id === me.user_id
  const host = players.find((p) => p.user_id === room.host_user_id)
  const [qr, setQr] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const [manage, setManage] = useState<Player | null>(null)
  const [starting, setStarting] = useState(false)

  const url = `${window.location.origin}/r/${room.code}`
  const share = async () => {
    const data = { title: 'มาเล่น ito กัน', text: `เข้าห้อง ${room.code} ใน ito`, url }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard.writeText(url)
        toast('คัดลอกลิงก์แล้ว')
      }
    } catch {
      // user cancelled the share sheet
    }
  }

  const settings = (patch: Partial<{ mode: GameMode; cards: number }>) => {
    const next = { mode: room.mode, cards: room.cards_per_player, ...patch }
    useRoom.getState().patchRoom({ id: room.id, mode: next.mode, cards_per_player: next.cards })
    api.updateSettings(room.id, next.mode, next.cards).catch(fail)
  }

  const start = async () => {
    setStarting(true)
    haptics.tap()
    try {
      await (iknow ? api.ik.start(room.id) : api.startRound(room.id))
    } catch (e) {
      fail(e as Error)
    } finally {
      setStarting(false)
    }
  }

  const pickGame = (game: GameKind) => {
    useRoom.getState().patchRoom({ id: room.id, game })
    api.setGame(room.id, game).catch(fail)
  }

  const taken = new Set(players.filter((p) => p.id !== me.id).map((p) => p.color))
  const iknow = room.game === 'iknow'
  const need = iknow ? 3 : 2
  const enough = players.length >= need

  return (
    <>
      <section className="mt-2 flex items-center gap-4 rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-muted">โค้ดห้อง</p>
          <p className="num text-[44px] leading-none font-bold tracking-[0.18em]" aria-label={`โค้ดห้อง ${room.code.split('').join(' ')}`}>
            {room.code}
          </p>
          <PrimaryButton variant="ghost" className="mt-1 -ml-2 px-2 text-thread-ink" onClick={share}>
            <IconShare /> แชร์ลิงก์
          </PrimaryButton>
        </div>
        <QRThumb url={url} onClick={() => setQr(true)} />
      </section>

      <section className="mt-6">
        <h2 className="mb-3 flex items-baseline justify-between text-lg font-bold">
          ผู้เล่น <span className="num text-sm font-medium text-ink-muted">{players.length}/10</span>
        </h2>
        <ul className="grid grid-cols-4 gap-x-2 gap-y-4">
          {players.map((p) => {
            const self = p.id === me.id
            const canManage = isHost && !self
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-center gap-1.5 rounded-btn py-1 disabled:cursor-default"
                  disabled={!self && !canManage}
                  onClick={() => (self ? setColorOpen(true) : setManage(p))}
                  aria-label={self ? `${p.name} (คุณ) แตะเพื่อเปลี่ยนสี` : canManage ? `จัดการ ${p.name}` : p.name}
                >
                  <PlayerAvatar player={p} online={online.includes(p.user_id)} host={p.user_id === room.host_user_id} me={self} />
                  <span className="w-full truncate text-center text-sm">{self ? `${p.name} (คุณ)` : p.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">แตะรูปของตัวเองเพื่อเปลี่ยนสี</p>
      </section>

      <section className="mt-6 flex flex-col gap-4">
        <h2 className="text-lg font-bold">ตั้งค่าเกม {!isHost && <span className="text-sm font-medium text-ink-muted">(เจ้าของห้องเป็นคนตั้ง)</span>}</h2>
        <div>
          <p className="mb-1.5 text-sm font-bold text-ink-muted">เกม</p>
          <Segmented<GameKind>
            label="เกม"
            value={room.game}
            disabled={!isHost}
            onChange={pickGame}
            options={[
              { value: 'ito', label: 'ito' },
              { value: 'iknow', label: 'ใครไม่รู้' },
            ]}
          />
          {iknow && (
            <p className="mt-1.5 text-xs text-ink-muted">ผู้คุมรู้กฎลับคนเดียว คนอื่นลงการ์ดสัตว์ให้ผ่าน แล้วแข่งกันทายว่ากฎคืออะไร · 3–10 คน</p>
          )}
        </div>
        {!iknow && (
          <div>
            <p className="mb-1.5 text-sm font-bold text-ink-muted">โหมด</p>
            <Segmented<GameMode>
              label="โหมด"
              value={room.mode}
              disabled={!isHost}
              onChange={(mode) => settings({ mode })}
              options={[
                { value: 'classic', label: 'ปกติ' },
                { value: 'levelup', label: 'ท้าทาย (Level Up)' },
              ]}
            />
            <p className="mt-1.5 text-xs text-ink-muted">
              {room.mode === 'classic' ? 'เล่นเป็นรอบๆ เรียงให้ถูกหมดคือชนะ' : 'เริ่ม 3 หัวใจ เลเวลยิ่งสูงยิ่งได้การ์ดเยอะ ผิดใบละ 1 หัวใจ'}
            </p>
          </div>
        )}
        {!iknow && room.mode === 'classic' && (
          <div>
            <p className="mb-1.5 text-sm font-bold text-ink-muted">การ์ดต่อคน</p>
            <Segmented<number>
              label="การ์ดต่อคน"
              value={room.cards_per_player}
              disabled={!isHost}
              onChange={(cards) => settings({ cards })}
              options={[1, 2, 3].map((n) => ({ value: n, label: `${n} ใบ` }))}
            />
          </div>
        )}
        {!iknow && <p className="text-sm text-ink-muted">หัวข้อแต่ละรอบ ทุกคนในวงช่วยกันคิดเองได้ หรือเลือกจากไอเดียที่แอปแนะนำ</p>}
      </section>

      <BottomBar>
        {isHost ? (
          <>
            <StatusLine>{enough ? `พร้อมเล่น ${players.length} คน` : `ต้องมีผู้เล่นอย่างน้อย ${need} คน ชวนเพื่อนด้วยโค้ดหรือ QR`}</StatusLine>
            <PrimaryButton onClick={start} disabled={!enough || starting}>
              {starting ? 'กำลังเริ่ม…' : 'เริ่มเกม'}
            </PrimaryButton>
          </>
        ) : (
          <StatusLine>รอ {host?.name ?? 'เจ้าของห้อง'} เริ่มเกม…</StatusLine>
        )}
      </BottomBar>

      <QRFull open={qr} onClose={() => setQr(false)} url={url} code={room.code} />

      <Sheet open={colorOpen} onClose={() => setColorOpen(false)} title="เลือกสีของคุณ">
        <ul className="grid grid-cols-5 gap-3 pb-4">
          {PLAYER_COLORS.map((c) => {
            const used = taken.has(c.hex)
            const current = me.color === c.hex
            return (
              <li key={c.hex} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  disabled={used}
                  aria-pressed={current}
                  aria-label={`${c.name}${used ? ' (มีคนใช้แล้ว)' : ''}`}
                  onClick={() => {
                    useRoom.getState().upsertPlayer({ ...me, color: c.hex })
                    api.setColor(room.id, c.hex).catch((e) => {
                      useRoom.getState().upsertPlayer(me)
                      fail(e)
                    })
                    setColorOpen(false)
                  }}
                  className={`size-12 rounded-full disabled:opacity-25 ${current ? 'ring-[3px] ring-ink ring-offset-2 ring-offset-surface' : ''}`}
                  style={{ background: c.hex }}
                />
                <span className="text-xs text-ink-muted">{c.name}</span>
              </li>
            )
          })}
        </ul>
      </Sheet>

      <Sheet open={!!manage} onClose={() => setManage(null)} title={manage ? `จัดการ ${manage.name}` : ''}>
        <div className="flex flex-col gap-3 pb-2">
          <PrimaryButton
            variant="secondary"
            onClick={() => {
              if (manage) api.transferHost(room.id, manage.id).catch(fail)
              setManage(null)
            }}
          >
            ให้เป็นเจ้าของห้อง
          </PrimaryButton>
          <PrimaryButton
            variant="secondary"
            className="text-danger"
            onClick={() => {
              if (manage) api.kickPlayer(room.id, manage.id).catch(fail)
              setManage(null)
            }}
          >
            เชิญออกจากห้อง
          </PrimaryButton>
        </div>
      </Sheet>
    </>
  )
}
