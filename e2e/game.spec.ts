import { expect, test, type Page } from '@playwright/test'
import { createRoom, dragToTable, flipInOrder, joinByCode, joinByLink, newPhone, peekValue, setCustomTopic, shot } from './helpers'

test.describe.configure({ mode: 'serial' })

const counts = (p: Page) => p.getByRole('list', { name: 'การ์ดที่ยังไม่เปิดของแต่ละคน' })

/** Every player peeks, then players place their single card in the given value order. */
async function playRound(phones: Page[], order: 'asc' | 'desc') {
  for (const p of phones) await expect(p.getByText('มือของฉัน')).toBeVisible()
  const values = []
  for (const p of phones) values.push({ p, v: await peekValue(p) })
  values.sort((a, b) => (order === 'asc' ? a.v - b.v : b.v - a.v))
  const faceDown = (p: Page) => p.getByRole('region', { name: 'โต๊ะกลาง' }).getByRole('img', { name: /^การ์ดคว่ำของ/ })
  await expect(counts(phones[0]).getByLabel(/เหลือ \d ใบที่ยังไม่เปิด/)).toHaveCount(phones.length)
  for (const [i, { p }] of values.entries()) {
    await dragToTable(p, 'end')
    await expect(p.getByText('การ์ดของคุณอยู่บนโต๊ะครบแล้ว')).toBeVisible()
    // Like people at a table, the next player places after seeing this card land on their own screen.
    for (const q of phones) await expect(faceDown(q)).toHaveCount(i + 1)
    if (i === 0) await shot(values[1].p, `hand-counts-${order}`)
  }
  return values
}

test('classic: create, join (code + link), custom topic, place, flip in table order, result, next round', async ({ browser }) => {
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
  for (const p of [host, p2, p3]) await expect(p.getByText('รอบนี้เล่นหัวข้ออะไรดี?')).toBeVisible()
  await expect(host.getByRole('button', { name: 'แจกการ์ด' })).toBeDisabled()
  await shot(host, '08-topic-empty')

  // A guest taps a suggestion, then another guest writes their own idea; everyone sees the latest.
  await p2.getByRole('tab', { name: 'ปั่นๆ' }).click()
  await p2.getByRole('button', { name: /เมนูแก้แฮงค์/ }).click()
  await expect(host.locator('article h2')).toHaveText('เมนูแก้แฮงค์')
  await setCustomTopic(p3, 'ความเมาของเพื่อนแต่ละคน', 'กรึ่มๆ', 'คลานกลับบ้าน')
  for (const p of [host, p2]) await expect(p.locator('article h2')).toHaveText('ความเมาของเพื่อนแต่ละคน')
  await expect(host.getByText('ตั้งโดย เจ')).toBeVisible()
  await shot(host, '09-topic-host')

  await host.getByRole('button', { name: 'แจกการ์ด' }).click()

  // Play
  await expect(p2.getByText('แตะเพื่อพิมพ์คำใบ้ · ลากขึ้นไปวางบนโต๊ะ (บนโต๊ะจะคว่ำไว้)')).toBeVisible()
  await shot(p2, '10-play-hand')

  // Clue
  await p2.getByRole('button', { name: 'ใส่คำใบ้', exact: true }).click()
  await p2.getByPlaceholder('เช่น ต้มยำกุ้ง').fill('ข้าวมันไก่')
  await shot(p2, '11-clue-sheet')
  await p2.getByRole('button', { name: 'บันทึกคำใบ้' }).click()
  await expect(p2.getByRole('button', { name: '“ข้าวมันไก่”' })).toBeVisible()

  // Nothing on the table yet: nobody can flip blind from the hand.
  await expect(p3.getByRole('button', { name: 'วางการ์ดบนโต๊ะก่อน' })).toBeDisabled()
  await shot(p3, '12-play-peek')

  const phones = [host, p2, p3]
  const placed = await playRound(phones, 'asc')
  await expect(host.getByRole('button', { name: 'คำใบ้ของ มิ้นท์: ข้าวมันไก่' })).toBeVisible() // other players see the clue

  // Only the owner of the leftmost card can flip; everyone else waits for them.
  const lowest = placed[0].p
  await expect(lowest.getByText(/ถึงคิวคุณ/)).toBeVisible()
  for (const { p } of placed.slice(1)) await expect(p.getByRole('button', { name: /^รอ .+ เปิดก่อน$/ })).toBeDisabled()
  await shot(host, '13-play-ready-to-flip')

  // First tap arms the button, second tap flips.
  await lowest.getByRole('button', { name: 'เปิดการ์ดของฉัน' }).click()
  await expect(lowest.getByRole('button', { name: 'แตะอีกครั้งเพื่อเปิด' })).toBeVisible()
  await shot(lowest, '14-play-confirm-flip')
  await lowest.getByRole('button', { name: 'แตะอีกครั้งเพื่อเปิด' }).click()
  for (const p of phones) await expect(p.getByText('เปิดแล้ว 1/3')).toBeVisible()
  await expect(lowest.getByText('คุณเปิดครบแล้ว ลุ้นเพื่อนต่อ')).toBeVisible()
  await expect(counts(host).getByLabel(/เปิดครบแล้ว$/)).toHaveCount(1)
  await shot(placed[1].p, '15-play-after-first-flip')

  await flipInOrder(phones, placed.slice(1).map((x) => x.p))
  for (const p of phones) await expect(p.getByRole('heading', { name: 'ร้อยด้ายสำเร็จ!' })).toBeVisible({ timeout: 20_000 })
  await shot(host, '16-result-win')

  // Result list is sorted by value and shows the clue
  const listNumbers = await host.locator('ol li span.num.w-11').allTextContents()
  expect(listNumbers.map(Number)).toEqual(placed.map((x) => x.v).sort((a, b) => a - b))
  await expect(host.getByText('“ข้าวมันไก่”').first()).toBeVisible()
  await expect(p2.getByText(/รอ บอส ไปรอบต่อไป/)).toBeVisible()

  // Round 2: the room remembers round 1's topic; pick it again from "วงนี้เคยเล่น".
  await host.getByRole('button', { name: 'เล่นรอบต่อไป' }).click()
  for (const p of phones) await expect(p.getByText('รอบที่ 2 · หัวข้อรอบนี้')).toBeVisible()
  await p2.getByRole('tab', { name: /วงนี้เคยเล่น/ }).click()
  await p2.getByRole('button', { name: /ความเมาของเพื่อนแต่ละคน/ }).click()
  await expect(host.locator('article h2')).toHaveText('ความเมาของเพื่อนแต่ละคน')
  await host.getByRole('button', { name: 'แจกการ์ด' }).click()

  // Placed highest first: the first flip is fine, then a lower one snaps the thread.
  // The round ends at once and every number is shown.
  const vals = await playRound(phones, 'desc')
  await flipInOrder(phones, vals.map((x) => x.p))
  for (const p of phones) await expect(p.getByRole('heading', { name: 'ด้ายขาด!' })).toBeVisible({ timeout: 20_000 })
  await expect(p3.locator('ol li')).toHaveCount(3)
  await expect(p3.getByText(/ไม่ทันได้เปิด/)).toBeVisible()
  await shot(p3, '17-result-broken')

  // Rejoin after refresh (screen lock / reload)
  await p2.reload()
  await expect(p2.getByRole('heading', { name: 'ด้ายขาด!' })).toBeVisible()

  // Back to lobby
  await host.getByRole('button', { name: 'กลับล็อบบี้' }).click()
  for (const p of [host, p2, p3]) await expect(p.getByText('โค้ดห้อง')).toBeVisible()
})

test('level up: hearts, level 2 with two cards each', async ({ browser }) => {
  const host = await newPhone(browser, { dark: true })
  const p2 = await newPhone(browser, { dark: true })
  const code = await createRoom(host, 'แพร')
  await joinByCode(p2, 'ต้น', code)
  await host.getByRole('radio', { name: 'ท้าทาย (Level Up)' }).click()
  await expect(p2.getByRole('radio', { name: 'ท้าทาย (Level Up)' })).toHaveAttribute('aria-checked', 'true')
  await shot(host, '19-lobby-levelup-dark')

  await host.getByRole('button', { name: 'เริ่มเกม' }).click()
  await expect(host.getByText(/คนละ 1 ใบ/)).toBeVisible()
  await p2.getByRole('button', { name: 'สุ่มหัวข้อจากไอเดีย' }).click()
  await expect(host.locator('article h2')).toBeVisible()
  await shot(host, '20-topic-levelup-dark')
  await host.getByRole('button', { name: 'แจกการ์ด' }).click()

  // Level 1 perfect
  const placed = await playRound([host, p2], 'asc')
  await shot(host, '21-play-levelup-dark')
  await flipInOrder([host, p2], placed.map((x) => x.p))
  await expect(host.getByRole('heading', { name: 'ร้อยด้ายสำเร็จ!' })).toBeVisible({ timeout: 20_000 })
  await shot(host, '22-result-levelup-win-dark', 1600)
  await host.getByRole('button', { name: 'ไป Level 2' }).click()

  // Level 2: two cards each, flipped straight from the hand until the round is over.
  await expect(host.getByText(/คนละ 2 ใบ/)).toBeVisible()
  await host.getByRole('button', { name: 'สุ่มหัวข้อจากไอเดีย' }).click()
  await host.getByRole('button', { name: 'แจกการ์ด' }).click()
  for (const p of [host, p2]) await expect(p.getByRole('button', { name: /^การ์ดของฉัน/ })).toHaveCount(2)
  const tableCards = (p: Page) => p.getByRole('region', { name: 'โต๊ะกลาง' }).getByRole('img', { name: /^การ์ดคว่ำของ/ })
  for (const [i, p] of [host, host, p2, p2].entries()) {
    await dragToTable(p, 'end')
    for (const q of [host, p2]) await expect(tableCards(q)).toHaveCount(i + 1)
  }
  await flipInOrder([host, p2], [host, host, p2, p2])
  await expect(host.getByRole('heading', { name: /ร้อยด้ายสำเร็จ!|ด้ายขาด|Game Over/ })).toBeVisible({ timeout: 20_000 })
  await expect(host.getByText('Level 2').first()).toBeVisible()
  await shot(host, '23-levelup-level2-end-dark', 1600)
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
  await shot(p, '24-howto-1')
  for (let i = 0; i < 3; i++) await p.getByRole('button', { name: 'ถัดไป' }).click()
  await shot(p, '25-howto-4')
  await p.goto('/r/ZZZZ')
  await p.getByLabel('ชื่อเล่นของคุณ').fill('หลงทาง')
  await p.getByRole('button', { name: 'เข้าห้อง' }).click()
  await expect(p.getByText('ไม่เจอห้องนี้ ลองเช็กโค้ดอีกทีนะ')).toBeVisible()
  await shot(p, '26-room-not-found')
})
