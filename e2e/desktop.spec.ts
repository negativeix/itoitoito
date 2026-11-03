import { expect, test, type Browser } from '@playwright/test'
import { createRoom, dragToTable, setCustomTopic } from './helpers'

async function newDesktop(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'th-TH' })
  await ctx.addInitScript(() => localStorage.setItem('ito.muted', '1'))
  return ctx.newPage()
}

// Real key presses (not fill): a sheet must keep focus while the parent re-renders.
test('desktop keyboard: type the room code and a clue while others move cards', async ({ browser }) => {
  const host = await newDesktop(browser)
  const guest = await newDesktop(browser)
  const code = await createRoom(host, 'บอส')

  await guest.goto('/')
  await guest.getByLabel('ชื่อเล่นของคุณ').fill('มิ้นท์')
  await guest.getByRole('button', { name: 'เข้าห้อง' }).click()
  await expect(guest.getByLabel('ตัวที่ 1')).toBeFocused()
  await guest.keyboard.type(code, { delay: 80 })
  await guest.waitForURL(new RegExp(`/r/${code}$`))

  await host.getByRole('button', { name: 'เริ่มเกม' }).click()
  await setCustomTopic(host, 'ความเผ็ด', 'ไม่เผ็ด', 'เผ็ดตาย')
  await host.getByRole('button', { name: 'แจกการ์ด' }).click()

  await guest.getByRole('button', { name: 'ใส่คำใบ้', exact: true }).click()
  const input = guest.getByPlaceholder('เช่น ต้มยำกุ้ง')
  await expect(input).toBeFocused()
  await guest.keyboard.type('ข้าว', { delay: 50 })
  await dragToTable(host) // realtime update re-renders the guest's screen mid-typing
  await guest.waitForTimeout(800)
  await guest.keyboard.type('มันไก่', { delay: 50 })
  await expect(input).toHaveValue('ข้าวมันไก่')
  await guest.keyboard.press('Enter')
  await expect(guest.getByRole('button', { name: '“ข้าวมันไก่”' })).toBeVisible()
})
