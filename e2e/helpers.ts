import { expect, type Browser, type Page } from '@playwright/test'

export const SHOTS = 'docs/screenshots'

export async function shot(page: Page, name: string, settleMs = 450) {
  await page.waitForTimeout(settleMs) // let springs settle
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

export async function newPhone(browser: Browser, opts: { dark?: boolean } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'th-TH',
    colorScheme: opts.dark ? 'dark' : 'light',
  })
  // Keep sounds off in automated runs.
  await ctx.addInitScript(() => localStorage.setItem('ito.muted', '1'))
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  return page
}

export async function createRoom(page: Page, name: string) {
  await page.goto('/')
  await page.getByLabel('ชื่อเล่นของคุณ').fill(name)
  await page.getByRole('button', { name: 'สร้างห้อง' }).click()
  await page.waitForURL(/\/r\/[A-Z]{4}$/)
  await expect(page.getByText('โค้ดห้อง')).toBeVisible()
  return page.url().split('/r/')[1]
}

export async function joinByCode(page: Page, name: string, code: string) {
  await page.goto('/')
  await page.getByLabel('ชื่อเล่นของคุณ').fill(name)
  await page.getByRole('button', { name: 'เข้าห้อง' }).click()
  await page.getByLabel('ตัวที่ 1').fill(code) // paste-style fill spreads over the 4 boxes
  await page.waitForURL(new RegExp(`/r/${code}$`))
  await expect(page.getByText('โค้ดห้อง')).toBeVisible()
}

export async function joinByLink(page: Page, name: string, code: string) {
  await page.goto(`/r/${code}`)
  await page.getByLabel('ชื่อเล่นของคุณ').fill(name)
  await page.getByRole('button', { name: 'เข้าห้อง' }).click()
  await expect(page.getByText('โค้ดห้อง')).toBeVisible()
}

const handCards = (page: Page) => page.getByRole('button', { name: /^การ์ดของฉัน/ })

/** Press and hold the n-th hand card, read the number, release. */
export async function peekValue(page: Page, n = 0): Promise<number> {
  const card = handCards(page).nth(n)
  const box = (await card.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  const face = card.getByRole('img', { name: /^การ์ดเลข \d+$/ })
  await expect(face).toBeVisible()
  const label = (await face.getAttribute('aria-label'))!
  await page.mouse.up()
  await expect(card.getByRole('img', { name: /^การ์ดเลข/ })).toHaveCount(0)
  return Number(label.match(/\d+/)![0])
}

/** Drag the n-th hand card onto the table at a given insertion slot ('end' = after the last card). */
export async function dragToTable(page: Page, where: 'end' | 'start' = 'end', n = 0) {
  const card = handCards(page).nth(n)
  const box = (await card.boundingBox())!
  const table = (await page.getByRole('region', { name: 'โต๊ะกลาง' }).boundingBox())!
  const sx = box.x + box.width / 2
  const sy = box.y + box.height / 2
  const tx = where === 'end' ? table.x + table.width - 8 : table.x + 70
  const ty = table.y + table.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx, sy - 20, { steps: 4 })
  await page.mouse.move(tx, ty, { steps: 18 })
  await page.waitForTimeout(150)
  await page.mouse.up()
}

/** Anyone sets their own topic through the form. */
export async function setCustomTopic(page: Page, title: string, low: string, high: string) {
  await page.getByRole('button', { name: 'ตั้งหัวข้อเอง' }).click()
  await page.getByPlaceholder('เช่น ความเมาของเพื่อนแต่ละคน').fill(title)
  await page.getByPlaceholder('สร่างเป๊ะ').fill(low)
  await page.getByPlaceholder('คลานกลับบ้าน').fill(high)
  await page.getByRole('button', { name: 'ใช้หัวข้อนี้' }).click()
}

const RESULT = /ร้อยด้ายสำเร็จ!|ด้ายขาด|Game Over|ร้อยด้ายครบทั้งสำรับ!/

/** Flip my lowest face-down card: first tap arms the button, second tap flips. */
export async function flipMine(page: Page) {
  await page.getByRole('button', { name: 'เปิดการ์ดของฉัน' }).click()
  await page.getByRole('button', { name: 'แตะอีกครั้งเพื่อเปิด' }).click()
}

/** Each listed phone flips its lowest card in turn, stopping early if the round ends. */
export async function flipInOrder(phones: Page[], order: Page[]) {
  for (const [i, p] of order.entries()) {
    if (await phones[0].getByRole('heading', { name: RESULT }).isVisible()) return
    await flipMine(p)
    await expect(phones[0].getByText(new RegExp(`เปิดแล้ว ${i + 1}/`)).or(phones[0].getByRole('heading', { name: RESULT }))).toBeVisible()
  }
}
