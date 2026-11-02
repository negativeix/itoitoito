import { expect, test, type Page } from '@playwright/test'
import { createRoom, dragToTable, joinByCode, joinByLink, lockIn, newPhone, peekValue, shot } from './helpers'

test.describe.configure({ mode: 'serial' })

/** Every player peeks, then players place their single card in the given value order. */
async function playRound(phones: Page[], order: 'asc' | 'desc') {
  for (const p of phones) await expect(p.getByText('มือของฉัน')).toBeVisible()
  const values = []
  for (const p of phones) values.push({ p, v: await peekValue(p) })
  values.sort((a, b) => (order === 'asc' ? a.v - b.v : b.v - a.v))
  for (const { p } of values) {
    await dragToTable(p, 'end')
    await expect(p.getByText('การ์ดของคุณอยู่บนโต๊ะครบแล้ว')).toBeVisible()
  }
  // Everyone sees every card on the table.
  for (const p of phones) await expect(p.getByRole('region', { name: 'โต๊ะกลาง' }).getByRole('img', { name: /^การ์ดคว่ำของ/ })).toHaveCount(phones.length)
  return values.map((x) => x.v)
}

test('classic: create, join (code + link), topic vote, place, lock, reveal, result, next round', async ({ browser }) => {
  const host = await newPhone(browser)
  const p2 = await newPhone(browser)
  const p3 = await newPhone(browser)

  // Home
  await host.goto('/')
  await shot(host, '01-home')

  const code = await createRoom(host, 'บอส')
  await shot(host, '02-lobby-host-alone')
  await expect(host.getByRole('button', { name: 'เริ่มเกม' })).toBeDisabled()

  await p2.goto('/')
  await p2.getByLabel('ชื่อเล่นของคุณ').fill('มิ้นท์')
  await p2.getByRole('button', { name: 'เข้าห้อง' }).click()
  await shot(p2, '03-join-sheet')
  await p2.getByLabel('ตัวที่ 1').fill(code)
  await p2.waitForURL(new RegExp(`/r/${code}$`))

  await joinByLink(p3, 'เจ', code)

  // All three see each other within the realtime window.
  for (const p of [host, p2, p3]) {
    await expect(p.getByText('3/10')).toBeVisible({ timeout: 5000 })
    for (const n of ['บอส', 'มิ้นท์', 'เจ']) await expect(p.getByRole('list').getByText(new RegExp(`^${n}`))).toBeVisible()
  }
  await shot(host, '04-lobby-host')
  await shot(p2, '05-lobby-guest')

  // QR full screen
  await host.getByRole('button', { name: 'ขยาย QR ให้เพื่อนสแกน' }).click()
  await shot(host, '06-qr-fullscreen')
  await host.getByRole('button', { name: 'ปิด QR' }).click()

  // Guest changes colour
  await p2.getByRole('button', { name: /มิ้นท์ \(คุณ\)/ }).click()
  await shot(p2, '07-color-picker')
  await p2.getByRole('button', { name: 'ม่วง' }).click()

  // Start → topic
  await host.getByRole('button', { name: 'เริ่มเกม' }).click()
  for (const p of [host, p2, p3]) await expect(p.getByText('หัวข้อรอบนี้')).toBeVisible()
  const firstTitle = await host.locator('article h2').textContent()

  // Two of three vote → reroll
  await p2.getByRole('button', { name: /ขอเปลี่ยนหัวข้อ/ }).click()
  await expect(host.getByRole('button', { name: /ขอเปลี่ยนหัวข้อ \(1\/2\)/ })).toBeVisible()
  await shot(p2, '08-topic-voted')
  await p3.getByRole('button', { name: /ขอเปลี่ยนหัวข้อ/ }).click()
  await expect(host.locator('article h2')).not.toHaveText(firstTitle!)
  await shot(host, '09-topic-host')

  await host.getByRole('button', { name: 'ใช้หัวข้อนี้' }).click()

  // Play
  await expect(p2.getByText('กดค้างเพื่อดูเลข · แตะเพื่อพิมพ์คำใบ้ · ลากขึ้นไปวางบนโต๊ะ')).toBeVisible()
  await shot(p2, '10-play-hand')

  // Clue
  await p2.getByRole('button', { name: 'ใส่คำใบ้', exact: true }).click()
  await p2.getByPlaceholder('เช่น ต้มยำกุ้ง').fill('ข้าวมันไก่')
  await shot(p2, '11-clue-sheet')
  await p2.getByRole('button', { name: 'บันทึกคำใบ้' }).click()
  await expect(p2.getByRole('button', { name: '“ข้าวมันไก่”' })).toBeVisible()

  // Peek screenshot while holding
  const box = (await p3.getByRole('button', { name: /^การ์ดของฉัน/ }).boundingBox())!
  await p3.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await p3.mouse.down()
  await p3.waitForTimeout(600)
  await shot(p3, '12-play-peek')
  await p3.mouse.up()

  const placed = await playRound([host, p2, p3], 'asc')
  await expect(host.getByText(/รอ .* กดมั่นใจแล้ว \(0\/3\)/)).toBeVisible()
  await expect(host.getByRole('button', { name: 'คำใบ้ของ มิ้นท์: ข้าวมันไก่' })).toBeVisible() // other players see the clue
  await shot(host, '13-play-table-full')

  // Lock, then a move resets everyone's lock
  await lockIn(host)
  await lockIn(p2)
  await expect(p3.getByText(/กดมั่นใจแล้ว \(2\/3\)/)).toBeVisible()
  await shot(p3, '14-play-waiting-lock')

  await lockIn(p3)

  // Reveal on every phone
  for (const p of [host, p2, p3]) await expect(p.getByText(/เปิดแล้ว \d\/3/)).toBeVisible()
  await expect(p2.getByText('เปิดแล้ว 1/3')).toBeVisible({ timeout: 6000 })
  await shot(p2, '15-reveal-progress')

  for (const p of [host, p2, p3]) await expect(p.getByRole('heading', { name: 'ร้อยด้ายสำเร็จ!' })).toBeVisible({ timeout: 20_000 })
  await shot(host, '16-result-win')

  // Result list is sorted by value and shows the clue
  const listNumbers = await host.locator('ol li span.num.w-11').allTextContents()
  expect(listNumbers.map(Number)).toEqual([...placed].sort((a, b) => a - b))
  await expect(host.getByText('“ข้าวมันไก่”').first()).toBeVisible()
  await expect(p2.getByText(/รอ บอส ไปรอบต่อไป/)).toBeVisible()

  // Round 2, deliberately reversed → broken thread
  await host.getByRole('button', { name: 'เล่นรอบต่อไป' }).click()
  for (const p of [host, p2, p3]) await expect(p.getByText('รอบที่ 2 · หัวข้อรอบนี้')).toBeVisible()
  await host.getByRole('button', { name: 'ใช้หัวข้อนี้' }).click()
  await playRound([host, p2, p3], 'desc')
  for (const p of [host, p2, p3]) await lockIn(p)
  for (const p of [host, p2, p3]) await expect(p.getByRole('heading', { name: 'ด้ายขาด 2 จุด' })).toBeVisible({ timeout: 20_000 })
  await shot(p3, '17-result-broken')

  // Rejoin after refresh (screen lock / reload)
  await p2.reload()
  await expect(p2.getByRole('heading', { name: 'ด้ายขาด 2 จุด' })).toBeVisible()

  // Back to lobby
  await host.getByRole('button', { name: 'กลับล็อบบี้' }).click()
  for (const p of [host, p2, p3]) await expect(p.getByText('โค้ดห้อง')).toBeVisible()
})

test('level up: hearts, level 2 with two cards, game over', async ({ browser }) => {
  const host = await newPhone(browser, { dark: true })
  const p2 = await newPhone(browser, { dark: true })
  const code = await createRoom(host, 'แพร')
  await joinByCode(p2, 'ต้น', code)
  await host.getByRole('radio', { name: 'ท้าทาย (Level Up)' }).click()
  await expect(p2.getByRole('radio', { name: 'ท้าทาย (Level Up)' })).toHaveAttribute('aria-checked', 'true')
  await shot(host, '18-lobby-levelup-dark')

  await host.getByRole('button', { name: 'เริ่มเกม' }).click()
  await expect(host.getByText(/คนละ 1 ใบ/)).toBeVisible()
  await shot(host, '19-topic-levelup-dark')
  await host.getByRole('button', { name: 'ใช้หัวข้อนี้' }).click()

  // Level 1 perfect
  await playRound([host, p2], 'asc')
  await shot(host, '20-play-levelup-dark')
  for (const p of [host, p2]) await lockIn(p)
  await expect(host.getByRole('heading', { name: 'ร้อยด้ายสำเร็จ!' })).toBeVisible({ timeout: 20_000 })
  await shot(host, '21-result-levelup-win-dark', 1600)
  await host.getByRole('button', { name: 'ไป Level 2' }).click()

  // Level 2: two cards each, place everything descending → 3 wrong ≥ 3 hearts → game over
  await expect(host.getByText(/คนละ 2 ใบ/)).toBeVisible()
  await host.getByRole('button', { name: 'ใช้หัวข้อนี้' }).click()
  for (const p of [host, p2]) await expect(p.getByRole('button', { name: /^การ์ดของฉัน/ })).toHaveCount(2)
  const all: { p: Page; v: number }[] = []
  for (const p of [host, p2]) for (let i = 0; i < 2; i++) all.push({ p, v: await peekValue(p, i) })
  all.sort((a, b) => b.v - a.v)
  // Each drag removes a card from the hand, so peek order shifts; drag whichever card has value v.
  for (const { p, v } of all) {
    const cards = p.getByRole('button', { name: /^การ์ดของฉัน/ })
    const count = await cards.count()
    let idx = 0
    for (let i = 0; i < count; i++) if ((await peekValue(p, i)) === v) idx = i
    await dragToTable(p, 'end', idx)
  }
  for (const p of [host, p2]) await lockIn(p)
  await expect(host.getByRole('heading', { name: 'Game Over' })).toBeVisible({ timeout: 25_000 })
  await expect(host.getByText('ไปได้ไกลสุด Level 2')).toBeVisible()
  await shot(host, '22-game-over-dark', 1600)
})

test('host migration: closing the host tab hands the room to the next player', async ({ browser }) => {
  test.setTimeout(90_000)
  const host = await newPhone(browser)
  const p2 = await newPhone(browser)
  const p3 = await newPhone(browser)
  const code = await createRoom(host, 'โฮสต์')
  await joinByCode(p2, 'คนที่สอง', code)
  await joinByCode(p3, 'คนที่สาม', code)
  await expect(p2.getByText('3/10')).toBeVisible()
  await host.context().close()
  await expect(p2.getByText('ตอนนี้คุณเป็นเจ้าของห้องแล้ว')).toBeVisible({ timeout: 45_000 })
  await expect(p2.getByRole('button', { name: 'เริ่มเกม' })).toBeVisible()
  await expect(p3.getByText(/รอ คนที่สอง เริ่มเกม/)).toBeVisible()
})

test('how-to slides and 404', async ({ browser }) => {
  const p = await newPhone(browser)
  await p.goto('/how')
  await shot(p, '23-howto-1')
  for (let i = 0; i < 3; i++) await p.getByRole('button', { name: 'ถัดไป' }).click()
  await shot(p, '24-howto-4')
  await p.goto('/r/ZZZZ')
  await p.getByLabel('ชื่อเล่นของคุณ').fill('หลงทาง')
  await p.getByRole('button', { name: 'เข้าห้อง' }).click()
  await expect(p.getByText('ไม่เจอห้องนี้ ลองเช็กโค้ดอีกทีนะ')).toBeVisible()
  await shot(p, '25-room-not-found')
})
