import { AnimalCard } from '../../components/iknow/AnimalCard'
import { PrimaryButton } from '../../components/PrimaryButton'
import { encodeCard } from '../../lib/iknow'

const STEPS: [string, string][] = [
  ['ผู้คุมรู้กฎลับคนเดียว', 'ทุกรอบมีผู้คุม 1 คน เลือกกฎลับ 1 จาก 3 ใบ แล้วเลือกการ์ดใบแรกบนโต๊ะที่เข้ากฎ คนอื่นได้การ์ดคนละ 7 ใบ'],
  ['ถึงตาก็ลงต่อท้าย', 'ลงกี่ใบก็ได้ เรียงลำดับเอง ทุกคนเห็นสด พอส่ง ผู้คุมจะบอกว่า "ผ่าน" หรือ "ไม่ผ่าน" ผิดใบเดียวก็เก็บคืนมือทั้งชุด'],
  ['ลงไม่ได้?', 'ส่งมือให้ผู้คุมเช็ก ถ้ามีใบที่ลงได้ ผู้คุมลงให้ แล้วคุณจั่วเพิ่ม 1 ใบ ถ้าลงไม่ได้จริง การ์ดในมือกลับเข้ากอง แล้วจั่วใหม่น้อยลง 1 ใบ'],
  ['หมดมือ = ได้ทาย', 'เลือกกฎจริง 1 จาก 3 ข้อ ถูกได้ +2 จบรอบ ผิดก็ส่งสิทธิ์ให้คนถัดไปทายต่อ จนกว่าจะมีคนทายถูก'],
  ['คะแนน', 'ทายถูก +2 · เหลือการ์ดเยอะสุด −2 · รองลงมา −1 · ที่เหลือ 0 · ผู้คุมไม่คิดคะแนน ทุกคนผลัดกันเป็นผู้คุมคนละรอบ'],
]

export function IKnowHowTo({ onDone }: { onDone?: () => void }) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex justify-center gap-2" aria-hidden="true">
        <AnimalCard card={encodeCard('pig', 1, 'pink')} className="w-14 -rotate-6" />
        <AnimalCard card={encodeCard('dog', 3, 'blue')} className="w-14" />
        <AnimalCard card={encodeCard('hen', 5, 'yellow')} className="w-14 rotate-6" />
      </div>
      <ol className="flex flex-col gap-3">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-[#4B2E83] text-sm font-bold text-white">{i + 1}</span>
            <span>
              <span className="block font-bold">{title}</span>
              <span className="block text-sm text-ink-muted">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-ink-muted">การ์ดสัตว์ 72 ใบ: หมู หมา กา ไก่ · เลข 1–6 · 3 สี (ชมพู ฟ้า เหลือง)</p>
      {onDone && <PrimaryButton onClick={onDone}>เข้าใจแล้ว</PrimaryButton>}
    </div>
  )
}
