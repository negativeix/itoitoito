import { expect, test, type Browser, type Page } from '@playwright/test'
import { SHOTS } from './helpers'

async function newDesktop(browser: Browser, phone = false) {
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, locale: 'th-TH', hasTouch: phone })
  await ctx.addInitScript(() => localStorage.setItem('ito.muted', '1'))
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  return page
}

async function enter(page: Page, name: string, code?: string) {
  await page.goto(code ? `/r/${code}` : '/')
  await page.getByLabel('ชื่อเล่นของคุณ').fill(name)
  await page.getByRole('button', { name: code ? 'เข้าห้อง' : 'สร้างห้อง' }).click()
  await expect(page.getByText('โค้ดห้อง')).toBeVisible()
  return page.url().split('/r/')[1]
}

/** The one page among `pages` that currently shows `text`. */
async function whoSees(pages: Page[], text: string | RegExp): Promise<Page> {
  let found: Page | undefined
  await expect
    .poll(async () => {
      for (const p of pages) if (await p.getByText(text).first().isVisible()) return (found = p) && true
      return false
    }, { timeout: 15_000 })
    .toBe(true)
  return found!
}

const shot = (p: Page, name: string) => p.screenshot({ path: `${SHOTS}/${name}.png` })

test('ใครไม่รู้: a full round, two computers and a phone', async ({ browser }) => {
  test.setTimeout(150_000)
  const a = await newDesktop(browser)
  const b = await newDesktop(browser)
  const c = await newDesktop(browser, true)
  const pages = [a, b, c]
  const code = await enter(a, 'บอส')
  await enter(b, 'มิ้นท์', code)
  await enter(c, 'เจ', code)
  await expect(a.getByText('3/10')).toBeVisible()

  await a.getByRole('radio', { name: 'ใครไม่รู้' }).click()
  await expect(b.getByRole('radio', { name: 'ใครไม่รู้' })).toHaveAttribute('aria-checked', 'true')
  await a.getByRole('button', { name: 'เริ่มเกม' }).click()

  // Keeper: pick 1 of 3 secret rules, then the first card from the deck.
  const keeper = await whoSees(pages, 'เลือกกฎลับรอบนี้')
  const players = pages.filter((p) => p !== keeper)
  for (const p of players) await expect(p.getByText(/กำลังเลือกกฎลับ/)).toBeVisible()
  await expect(players[0].getByRole('img', { name: /^(หมู|หมา|กา|ไก่) \d สี/ })).toHaveCount(7) // own hand, face up
  await keeper.getByRole('radio').first().check()
  await shot(keeper, 'iknow-01-pick-rule')
  await keeper.getByRole('button', { name: 'ใช้กฎนี้' }).click()
  await expect(keeper.getByText('เลือกการ์ดใบแรกบนโต๊ะ')).toBeVisible()
  await expect(keeper.getByRole('button', { name: /^เลือก / })).toHaveCount(72 - 14)
  await keeper.getByRole('button', { name: /^เลือก / }).first().click()
  await keeper.getByRole('button', { name: /เป็นใบแรก$/ }).click()
  for (const p of pages) await expect(p.getByText('โต๊ะ · 1 ใบ')).toBeVisible()

  // Turn player stages one card: everyone sees it live; the keeper approves.
  const first = await whoSees(players, /^ตาคุณ เรียงการ์ดแล้วส่งให้/)
  const second = players.find((p) => p !== first)!
  await first.getByRole('button', { name: /ต่อท้ายชุด$/ }).first().click()
  await expect(second.getByRole('region', { name: /กำลังเรียง$/ }).getByRole('img')).toHaveCount(1)
  await shot(first, 'iknow-02-arrange')
  await shot(c, 'iknow-02b-phone')
  await first.getByRole('button', { name: /^ส่งให้ .+ ตรวจ · 1 ใบ$/ }).click()
  await expect(keeper.getByText(/ส่งมา 1 ใบ/)).toBeVisible()
  await shot(keeper, 'iknow-03-judge')
  await keeper.getByRole('button', { name: 'ผ่าน', exact: true }).click()
  for (const p of pages) await expect(p.getByText('โต๊ะ · 2 ใบ')).toBeVisible()

  // Second player says they can't: the keeper plays one of their cards, they draw one.
  await expect(second.getByText(/^ตาคุณ/)).toBeVisible()
  await second.getByRole('button', { name: 'ลงไม่ได้' }).click()
  await second.getByRole('button', { name: /แตะอีกครั้ง/ }).click()
  await expect(keeper.getByText(/บอกว่าลงไม่ได้ · เช็กมือ/)).toBeVisible()
  await keeper.getByRole('button', { name: /^เลือก / }).first().click()
  await shot(keeper, 'iknow-04-check')
  await shot(c, 'iknow-04b-phone')
  await keeper.getByRole('button', { name: 'ลงใบนี้ให้' }).click()
  for (const p of pages) await expect(p.getByText('โต๊ะ · 3 ใบ')).toBeVisible()
  await expect(second.getByRole('region', { name: 'มือของฉัน' }).getByRole('img')).toHaveCount(7)

  // First player really can't: hand back to the deck, one card fewer.
  await expect(first.getByText(/^ตาคุณ/)).toBeVisible()
  await first.getByRole('button', { name: 'ลงไม่ได้' }).click()
  await first.getByRole('button', { name: /แตะอีกครั้ง/ }).click()
  await keeper.getByRole('button', { name: 'ลงไม่ได้จริง' }).click()
  await expect(first.getByText(/^รอ .+ เรียงการ์ด/)).toBeVisible()
  await expect(first.getByRole('region', { name: 'มือของฉัน' }).getByRole('img')).toHaveCount(5) // played 1, then 6 back and 5 drawn

  // Second player lays the whole hand down in one set → empty hand → guess.
  await expect(second.getByText(/^ตาคุณ/)).toBeVisible()
  for (let i = 0; i < 7; i++) await second.getByRole('button', { name: /ต่อท้ายชุด$/ }).first().click()
  await second.getByRole('button', { name: /^ส่งให้ .+ ตรวจ · 7 ใบ$/ }).click()
  await keeper.getByRole('button', { name: 'ผ่าน', exact: true }).click()
  await expect(second.getByText('หมดมือแล้ว! ทายกฎลับ')).toBeVisible()
  await shot(second, 'iknow-05-guess')

  // Pick a decoy first: only that one is shown to the room, then the chance passes on.
  const labels = second.locator('fieldset label')
  await expect(labels).toHaveCount(3)
  const texts = await labels.locator('span.flex-1').allTextContents()
  const realIndex = await (async () => {
    for (const [i, t] of texts.entries()) if (await keeper.getByText(t, { exact: true }).isVisible()) return i
    return -1
  })()
  expect(realIndex).toBeGreaterThanOrEqual(0)
  const wrongIndex = (realIndex + 1) % 3
  await labels.nth(wrongIndex).click()
  await second.getByRole('button', { name: /^ตอบข้อ/ }).click()
  for (const p of pages) await expect(p.getByText('ไม่ใช่กฎนี้')).toBeVisible()
  await expect(first.getByText(texts[realIndex])).toHaveCount(0)
  await shot(first, 'iknow-06-wrong')
  await first.getByRole('button', { name: 'ทายต่อ' }).click()

  // First player guesses right.
  await expect(first.getByText('ถึงตาคุณทายกฎลับ')).toBeVisible()
  await first.locator('fieldset label', { hasText: texts[realIndex] }).click()
  await first.getByRole('button', { name: /^ตอบข้อ/ }).click()
  for (const p of pages) await expect(p.getByRole('heading', { name: /ทายถูก!$/ })).toBeVisible()
  await expect(a.getByText('กฎจริง ·', { exact: false })).toBeVisible()
  await expect(a.getByText('ผู้คุม · ไม่คิดคะแนนรอบนี้')).toBeVisible()
  await shot(a, 'iknow-07-result')
  await shot(c, 'iknow-07b-phone')

  // Next round: a new keeper.
  await a.getByRole('button', { name: 'เริ่มรอบถัดไป' }).click()
  const keeper2 = await whoSees(pages, 'เลือกกฎลับรอบนี้')
  expect(keeper2).not.toBe(keeper)
})
