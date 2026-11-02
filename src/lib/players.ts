/** The 10 player colors (§2.1). Always render together with initials — never color alone. */
export const PLAYER_COLORS = [
  { hex: '#E0393E', name: 'แดง' },
  { hex: '#F08C2E', name: 'ส้ม' },
  { hex: '#E9B92F', name: 'เหลือง' },
  { hex: '#5BAE4C', name: 'เขียว' },
  { hex: '#2BA5A0', name: 'ฟ้าเขียว' },
  { hex: '#3C7DD9', name: 'น้ำเงิน' },
  { hex: '#7A5AD8', name: 'ม่วง' },
  { hex: '#D15BA8', name: 'ชมพู' },
  { hex: '#8B6A4F', name: 'น้ำตาล' },
  { hex: '#4A4A4A', name: 'เทาเข้ม' },
] as const

// Thai combining marks (vowels above/below, tone marks) can't stand alone as an initial.
const THAI_COMBINING = /[ัิ-ฺ็-๎]/

/** First visible character of a nickname, e.g. "บอส" → "บ", "mint" → "M". */
export function initialOf(name: string): string {
  const trimmed = name.trim()
  for (const ch of trimmed) {
    if (!THAI_COMBINING.test(ch) && ch !== 'เ' && ch !== 'แ' && ch !== 'โ' && ch !== 'ใ' && ch !== 'ไ') {
      return ch.toLocaleUpperCase('th')
    }
  }
  return trimmed.charAt(0).toLocaleUpperCase('th') || '?'
}

/** Pick black or white text for legibility on a player color. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#1E1A15' : '#FFFFFF'
}
