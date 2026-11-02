# ito Online — Build Plan (for Claude Code)

> เว็บแอปเกม **ito** สำหรับเล่นในวงเพื่อนชีวิตจริง — ทุกคนถือมือถือตัวเองเป็น "การ์ด" แล้วคุยกันต่อหน้า
> Mobile-first, หลายเครื่อง (realtime), เลขลับปลอดภัยจริงที่ฝั่งเซิร์ฟเวอร์
> **อ่านไฟล์นี้ทั้งหมดก่อนเริ่ม และทำทีละเฟสตามลำดับ ห้ามข้ามเฟส** แต่ละเฟสมี Acceptance Criteria ต้องผ่านก่อนไปต่อ

---

## 0. TL;DR สำหรับ Claude Code

- Stack: **Vite + React 18 + TypeScript + Tailwind CSS v4 + motion (Framer Motion) + @dnd-kit + Zustand + Supabase (Auth anonymous, Postgres, Realtime, Edge Functions) + vite-plugin-pwa**
- Deploy: Vercel (frontend) + Supabase (backend)
- กฎเหล็ก: **ห้ามส่งเลขการ์ดของคนอื่นไปที่ client ก่อนช่วง reveal เด็ดขาด** (ดูหัวข้อ 4)
- UI ภาษาไทยทั้งหมด, โค้ด/คอมเมนต์ภาษาอังกฤษ
- ทุกการเปลี่ยน game state ทำผ่าน Edge Function / Postgres RPC (server-authoritative) ยกเว้นการลากการ์ดตัวเองและพิมพ์คำใบ้

---

## 1. กติกา ito (ที่ต้อง implement ให้ถูก)

**แนวคิด:** เกมร่วมมือ ทุกคนทีมเดียวกัน การ์ดเลข 1–100 (ไม่ซ้ำกันในสำรับ) ทุกคนได้การ์ดลับ ห้ามบอกเลข ต้องสื่อผ่าน "หัวข้อ" ที่เป็นสเกล 1→100 แล้วช่วยกันเรียงจากน้อยไปมาก ต่อจากการ์ด 0

### 1.1 โหมดปกติ (Classic) — ทำก่อน
1. Host ตั้งค่า: จำนวนการ์ดต่อคน (1–3, ค่าเริ่ม 1), หมวดหัวข้อ
2. เซิร์ฟเวอร์สุ่มหัวข้อ 1 ใบ (มีปลายสเกลชัด เช่น `1 = ไม่อยากเลย` / `100 = อยากสุดๆ`) ผู้เล่นโหวต "เปลี่ยนหัวข้อ" ได้ (เกินครึ่งวง = สุ่มใหม่, จำกัด 2 ครั้ง/รอบ)
3. เซิร์ฟเวอร์แจกการ์ด (สุ่มจาก 1–100 ไม่ซ้ำ)
4. แต่ละคนดูเลขตัวเอง (กดค้าง), คิดคำใบ้ตามหัวข้อ, พูดในวงจริง (พิมพ์คำใบ้สั้นๆ ลงแอปได้ — ไม่บังคับ, ≤ 24 ตัวอักษร)
5. ทุกคนลากการ์ดคว่ำของตัวเองไปวางบนโต๊ะกลาง (แถวเริ่มจากการ์ด 0) ย้ายไปมาได้ไม่จำกัดจนกว่าจะล็อก
6. ทุกคนกด "มั่นใจแล้ว" ครบ → เข้าช่วง reveal (ถ้ามีคนขยับการ์ดหลังล็อก สถานะล็อกของทุกคน reset)
7. Reveal: เปิดทีละใบจากซ้าย (ใกล้ 0) ไปขวา
8. ใบไหน **น้อยกว่าเลขสูงสุดที่เปิดไปแล้ว** = ผิด
9. ผลรอบ: ถูกหมด = ชนะ 🎉 / มีผิด = แสดงจำนวนใบที่ผิด

### 1.2 โหมดท้าทาย (Level Up) — เฟส 4 *(house rule ที่เราออกแบบเอง ให้เขียนในหน้า "วิธีเล่น" ว่าเป็นกติกาเสริม)*
- เริ่ม **3 หัวใจ**, Level 1 = การ์ด 1 ใบ/คน, Level 2 = 2 ใบ, Level 3 = 3 ใบ … (สูงสุดที่ 100/จำนวนผู้เล่น)
- ทุกใบที่ผิดตามข้อ 8 = เสีย 1 หัวใจ
- ผ่านเลเวล (หัวใจ > 0 หลัง reveal) → ไปเลเวลถัดไป, ผ่านแบบ perfect = ได้หัวใจคืน 1 (สูงสุด 3)
- หัวใจหมด = Game Over แสดง "ไปได้ไกลสุด Level X"

### 1.3 กติกาที่ต้องเตือนบนจอ (Rule chips)
- ห้ามบอกเลข / ห้ามบอกช่วง (เช่น "สูงๆ", "เกือบร้อย") / ห้ามโชว์จอให้คนอื่นดู
- พูดเป็นตัวอย่างตามหัวข้อเท่านั้น

ผู้เล่น: 2–10 คน (แนะนำ 3+)

---

## 2. Design System — "ด้ายแดง" (Red Thread)

**คอนเซ็ปต์:** ito แปลว่า "ด้าย" — แอปให้ความรู้สึกเหมือนการ์ดกระดาษคุณภาพดีวางบนโต๊ะไม้ มีด้ายสีแดงร้อยความคิดทุกคนเข้าด้วยกัน
**คีย์เวิร์ด:** อบอุ่น, tactile, clean, มีจังหวะลุ้น, ไม่รก ไม่เกมมิ่งจัด

### 2.1 สี (CSS variables บน `:root`, รองรับ dark mode)
| Token | Light | Dark (โหมด "โต๊ะกลางคืน") | ใช้ทำอะไร |
|---|---|---|---|
| `--bg` | `#F5EFE4` (กระดาษวาชิ) | `#17140F` | พื้นหลัง |
| `--surface` | `#FFFBF4` | `#221E18` | การ์ด, sheet |
| `--surface-2` | `#EDE4D3` | `#2C2720` | โต๊ะกลาง, ช่องว่าง |
| `--ink` | `#1E1A15` | `#F3EDE2` | ตัวหนังสือหลัก |
| `--ink-muted` | `#6E6457` | `#A89E90` | ตัวหนังสือรอง |
| `--thread` | `#E0393E` | `#FF5A5F` | สีหลัก: ด้าย, ปุ่มหลัก |
| `--success` | `#2F9E6B` | `#3DBE85` | ถูก |
| `--danger` | `#D6453D` | `#FF6B61` | ผิด / เสียหัวใจ |
| `--line` | `#DDD2BF` | `#3A342B` | เส้นขอบ |

**สีผู้เล่น 10 สี** (ใช้คู่กับอักษรย่อชื่อเสมอ — ห้ามพึ่งสีอย่างเดียว):
`#E0393E` แดง, `#F08C2E` ส้ม, `#E9B92F` เหลือง, `#5BAE4C` เขียว, `#2BA5A0` ฟ้าเขียว, `#3C7DD9` น้ำเงิน, `#7A5AD8` ม่วง, `#D15BA8` ชมพู, `#8B6A4F` น้ำตาล, `#4A4A4A` เทาเข้ม

### 2.2 ตัวอักษร (Google Fonts)
- UI ทั้งหมด: **Anuphan** (ไทย+ละติน อ่านง่าย ทันสมัย) — weight 400/500/700
- ตัวเลขบนการ์ด / ตัวเลขใหญ่: **Fraunces** (serif มีคาแรกเตอร์เหมือนการ์ดพิมพ์) — weight 600–800, `font-variant-numeric: tabular-nums`
- Scale: 12 / 14 / 16 (body) / 20 / 24 / 32 / 48 / 96 (เลขบนการ์ดตอนดู)
- line-height ภาษาไทย ≥ 1.5 กันสระลอยชนกัน

### 2.3 รูปทรง & ระยะ
- Radius: การ์ด 20px, ปุ่ม 16px, chip 999px
- Spacing ฐาน 4px; ขอบจอข้าง 16px; safe-area-inset ทุกด้าน
- Touch target ≥ 48×48px; ปุ่มหลักสูง 56px เต็มความกว้าง อยู่ล่างจอ (thumb zone)
- เงาการ์ด: `0 1px 0 rgba(0,0,0,.04), 0 8px 24px -8px rgba(60,40,20,.25)` — ยกขึ้นตอนลากเงาลึกขึ้น
- พื้นหลังมี texture กระดาษจางๆ (SVG noise opacity 3–4%)

### 2.4 การ์ด (หัวใจของ UI)
- สัดส่วน 5:7 เหมือนการ์ดจริง
- **หลังการ์ด (คว่ำ):** สี `--surface` ลายเส้นด้ายแดงขดเป็นวงเล็กๆ ตรงกลาง + แถบสีผู้เล่นด้านบน + อักษรย่อ
- **หน้าการ์ด (เปิด):** เลขใหญ่ Fraunces กลางการ์ด, มุมบนซ้าย/ล่างขวาเลขเล็ก (เหมือนไพ่), แถบสีผู้เล่น
- **การ์ด 0:** สีด้ายแดงทึบ ตัวเลข 0 สีขาว เป็นจุดเริ่มต้นของด้าย
- คำใบ้แสดงเป็นป้ายกระดาษเล็กๆ ใต้การ์ด (ตัดคำเกินด้วย … แตะเพื่อดูเต็ม)

### 2.5 Motion (ใช้ `motion` library)
- หลักการ: นุ่ม มีน้ำหนักเหมือนกระดาษ — spring `{ stiffness: 400, damping: 30 }`
- แจกการ์ด: การ์ดบินจากกองกลางเข้ามือ + หมุนเล็กน้อย (stagger 80ms)
- กดค้างดูเลข: การ์ดพลิก 3D (rotateY 180°, 350ms) + scale 1.05
- ลาก: การ์ดยกขึ้น scale 1.06 เอียง 3°, ช่องปลายทางขยายรอ
- Reveal: พลิกทีละใบ (ช่วงห่าง ~900ms ให้ลุ้น), เส้นด้ายแดงวิ่ง (SVG path `pathLength` 0→1) เชื่อมจากใบก่อนหน้า; ใบผิด → ด้ายขาดเป็นเส้นประสีเทา + การ์ดสั่นเบาๆ + ขอบ `--danger`
- ชนะ: ด้ายทั้งเส้นเรืองแสง + confetti เส้นด้ายเล็กๆ (ไม่ใช่ confetti สี่เหลี่ยมทั่วไป)
- เคารพ `prefers-reduced-motion` → ใช้ fade แทน

### 2.6 Haptics & เสียง
- `navigator.vibrate` (Android; iOS ไม่รองรับ — fail เงียบ): แตะ 10ms, วางการ์ด 15ms, ผิด [30,40,30], ชนะ [20,30,20,30,60]
- เสียงสร้างด้วย Web Audio (ไม่ต้องมีไฟล์): ป๊อกตอนวาง, ฟลิปกระดาษตอนพลิก, โน้ตไล่ขึ้นทีละขั้นตอน reveal ถูก, เสียงต่ำตอนผิด
- ปุ่มปิดเสียงที่มุมบนขวาเสมอ (จำค่าใน localStorage แบบ try/catch)

### 2.7 Game Clarity — กฎ UI ที่ห้ามละเมิด
1. **หัวข้อ + สเกลปักบนสุดทุกหน้าระหว่างรอบ** (Topic bar: ชื่อหัวข้อ + `1 · ไม่อยากเลย ←→ อยากสุดๆ · 100`)
2. **1 หน้าจอ = 1 ปุ่มหลัก** ปุ่มอื่นเป็น secondary/ghost
3. **Status line ใต้ topic bar** บอกเสมอว่ากำลังรออะไร: "รอ บอส, มิ้นท์ วางการ์ด (4/6)"
4. **เลขลับไม่โผล่โดยไม่ตั้งใจ:** แสดงเฉพาะตอนกดค้าง, ซ่อนทันทีเมื่อ `visibilitychange` (สลับแอป), ไม่ใส่เลขใน `<title>`/notification
5. **การ์ดของฉัน** บนโต๊ะมีวงแหวนด้ายแดงรอบ + ป้าย "ของฉัน"
6. **Empty / loading / error state ทุกหน้า** เขียนเป็นภาษาคน ("กำลังต่อเน็ตใหม่…" ไม่ใช่ "Error 500")
7. ข้อความทุกปุ่มเป็นคำกริยาสั้น: "สร้างห้อง", "เข้าห้อง", "เริ่มเกม", "มั่นใจแล้ว", "เปิดการ์ด"

---

## 3. หน้าจอ & Flow

```
Home → (สร้างห้อง | เข้าห้อง) → Lobby → Topic → Play(Hand+Table) → Reveal → Result → (Next round | Level up | Lobby)
                                                                           ↘ How to play (เปิดได้ทุกที่จากปุ่ม ?)
```

### 3.1 Home
- โลโก้ "ito" ตัวพิมพ์เล็ก Fraunces + ด้ายแดงขดใต้โลโก้ (animate วาดเส้นตอนเข้า)
- Tagline: "ร้อยความคิดให้ตรงกัน"
- ช่องชื่อเล่น (จำไว้ในเครื่อง)
- ปุ่มหลัก **สร้างห้อง** / ปุ่มรอง **เข้าห้อง** (เปิด sheet กรอกโค้ด 4 ตัว — ตัวอักษรใหญ่ แยกช่อง, รองรับวางจากคลิปบอร์ด) / ลิงก์ "วิธีเล่น"
- รองรับ deep link `/r/ABCD` → เด้งไปกรอกชื่อแล้วเข้าห้องเลย

### 3.2 Lobby
- โค้ดห้องตัวใหญ่ + QR (แตะเพื่อขยายเต็มจอให้เพื่อนสแกน) + ปุ่ม "แชร์ลิงก์" (Web Share API)
- รายชื่อผู้เล่นเป็น avatar วงกลมสี + อักษรย่อ, จุดเขียว/เทาสถานะออนไลน์, มงกุฎเล็กที่ host
- แตะ avatar ตัวเอง = เปลี่ยนสี (สีที่คนอื่นใช้แล้วกดไม่ได้)
- Host เห็นการตั้งค่า (segmented control): โหมด Classic / Level Up, การ์ดต่อคน 1·2·3 (Classic), หมวดหัวข้อ (multi-select chips)
- คนอื่นเห็นการตั้งค่าแบบ read-only
- ปุ่มหลัก (host): **เริ่มเกม** — disabled จนกว่าจะมี ≥ 2 คน พร้อมข้อความเหตุผล

### 3.3 Topic (เปิดหัวข้อ)
- การ์ดหัวข้อใหญ่พลิกเข้ากลางจอ: ชื่อหัวข้อ + สเกลแนวนอน 1 ←→ 100 พร้อมป้ายปลายทั้งสอง
- ปุ่มรอง "ขอเปลี่ยนหัวข้อ" (แสดงคะแนนโหวต x/y)
- ปุ่มหลัก (host) "ใช้หัวข้อนี้" → แจกการ์ด

### 3.4 Play — หน้าหลักของเกม (แบ่ง 2 โซนแนวตั้ง)
**บน:** Topic bar + status line + หัวใจ/เลเวล (ถ้าโหมด Level Up)
**กลาง: โต๊ะ (Table)** — แถวการ์ดแนวนอนเลื่อนซ้ายขวาได้ เริ่มด้วยการ์ด 0 ทางซ้ายสุด มีด้ายแดงจางๆ ลากผ่านทั้งแถว; การ์ดบนโต๊ะเป็นการ์ดคว่ำของแต่ละคน (สี + อักษรย่อ + คำใบ้)
  - เมื่อมีการ์ดเยอะ (>6) สลับเป็น layout 2 แถวแบบ snake ได้ หรือ zoom out อัตโนมัติ
**ล่าง: มือฉัน (Hand)** — การ์ดของฉัน (1–3 ใบ) ขนาดใหญ่
  - **กดค้าง = ดูเลข** (พลิกการ์ด) ปล่อย = คว่ำกลับ, มี hint ครั้งแรก "กดค้างเพื่อดูเลข"
  - แตะ = เปิดช่องพิมพ์คำใบ้ของใบนั้น
  - **ลากขึ้นไปที่โต๊ะ** = วาง; บนโต๊ะลากเพื่อย้ายตำแหน่งได้ (ย้ายได้เฉพาะการ์ดตัวเอง)
**ปุ่มหลักล่างสุด:** วางยังไม่ครบ → "วางการ์ดให้ครบก่อน" (disabled) / ครบแล้ว → **มั่นใจแล้ว** / กดแล้ว → "รอเพื่อน… (แตะเพื่อยกเลิก)"

### 3.5 Reveal
- ซ่อนโซน Hand, โต๊ะขยายเต็มจอ
- ทุกเครื่องเห็นพร้อมกัน: พลิกทีละใบ + ด้ายวิ่ง + เสียง + สั่น
- ตัวนับด้านบน "เปิดแล้ว 3/7"
- Host มีปุ่มเล็ก "เร่ง" (เปิดที่เหลือทั้งหมดทันที)

### 3.6 Result
- หัวใหญ่: "ร้อยด้ายสำเร็จ!" (ชนะ) / "ด้ายขาด 2 จุด" (ผิด)
- รายการการ์ดเรียงตามเลขจริง: เลข · ชื่อ · คำใบ้ — จุดฮาของวง ให้เห็นว่าใครพูดอะไรกับเลขอะไร; ใบที่วางผิดที่มีลูกศรบอกว่าควรอยู่ตรงไหน
- โหมด Level Up: หัวใจที่เหลือ animate ลด/เพิ่ม, "ไป Level ถัดไป" หรือ "Game Over · ไปได้ถึง Level X"
- ปุ่มหลัก (host): **เล่นรอบต่อไป** / ปุ่มรอง: กลับ Lobby

### 3.7 How to play
- 4 สไลด์ (swipe) มีภาพประกอบเป็นการ์ดจริงจากระบบ ไม่ใช่ข้อความยาว:
  1. ทุกคนได้เลขลับ 1–100
  2. ตอบตามหัวข้อ ห้ามบอกเลข
  3. ช่วยกันเรียงจากน้อยไปมาก
  4. เปิดการ์ด — ร้อยด้ายให้ครบ!

---

## 4. สถาปัตยกรรม Backend (Supabase)

### 4.1 Auth
- ใช้ **Anonymous Sign-in** — ทุกเครื่องได้ `auth.uid()` ถาวร (session เก็บใน localStorage) → กลับเข้าห้องเดิมได้หลังจอดับ/รีเฟรช

### 4.2 Schema (`supabase/migrations/0001_init.sql`)

```sql
create type room_status as enum ('lobby','choosing_theme','placing','revealing','result','game_over');
create type game_mode as enum ('classic','levelup');

create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,               -- 4 ตัว A-Z ไม่รวม I,O (กันสับสนกับ 1,0)
  status room_status not null default 'lobby',
  mode game_mode not null default 'classic',
  host_user_id uuid not null,
  cards_per_player int not null default 1 check (cards_per_player between 1 and 10),
  level int not null default 1,
  lives int not null default 3,
  round int not null default 0,
  theme_categories text[] not null default '{general}',
  current_theme_id text,
  theme_rerolls int not null default 0,
  reveal_index int not null default -1,    -- ใบล่าสุดที่เปิดแล้ว
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 16),
  color text not null,
  seat int not null,
  locked boolean not null default false,
  wants_reroll boolean not null default false,
  joined_at timestamptz default now(),
  unique (room_id, user_id),
  unique (room_id, color)
);

-- ส่วนลับ: เลขจริง (อ่านได้เฉพาะเจ้าของ)
create table hands (
  card_id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  round int not null,
  owner_user_id uuid not null,
  value int not null check (value between 1 and 100)
);

-- ส่วนสาธารณะบนโต๊ะ (ไม่มีเลข จนกว่าจะ reveal)
create table board_cards (
  card_id uuid primary key references hands(card_id) on delete cascade,
  room_id uuid references rooms(id) on delete cascade,
  round int not null,
  owner_player_id uuid references players(id) on delete cascade,
  position double precision,               -- null = ยังอยู่ในมือ; ใช้ fractional index กันชน
  clue text check (char_length(clue) <= 24),
  revealed_value int,                      -- null จนกว่าเซิร์ฟเวอร์จะเปิด
  is_wrong boolean
);
```

### 4.3 RLS (สำคัญที่สุด)
- เปิด RLS ทุกตาราง
- `rooms`, `players`, `board_cards`: **select** ได้ถ้าเป็นสมาชิกห้อง (`exists (select 1 from players p where p.room_id = X.room_id and p.user_id = auth.uid())`)
- `hands`: **select** ได้เฉพาะ `owner_user_id = auth.uid()` — **ไม่มี policy อื่นเลย**
- `board_cards` **update** โดย client: เฉพาะคอลัมน์ `position`, `clue` และเฉพาะการ์ดของตัวเอง และเฉพาะตอน `rooms.status = 'placing'` → ทำเป็น **RPC `security definer`** `move_card(card_id, position)` และ `set_clue(card_id, clue)` แทนการ update ตรง (ตรวจสิทธิ์ในฟังก์ชัน + reset `locked` ของทุกคนเมื่อมีการขยับ)
- ทุกอย่างที่เหลือ insert/update ผ่าน Edge Functions ด้วย service role เท่านั้น
- **เขียน test ยืนยัน**: login เป็น user B แล้ว query `hands` ต้องไม่เห็นการ์ดของ user A, และ `board_cards.revealed_value` ต้องเป็น null ก่อน reveal

### 4.4 Edge Functions (`supabase/functions/*`, Deno + TS)
ทุกฟังก์ชัน: ตรวจ JWT → หา player → ตรวจ state ปัจจุบันว่าทำ action นี้ได้ไหม → ทำงานใน transaction (เรียก Postgres function) → คืนผล

| Function | ใครเรียก | ทำอะไร |
|---|---|---|
| `create-room` | ใครก็ได้ | สร้าง code ไม่ซ้ำ, สร้าง room + player (host) |
| `join-room` | ใครก็ได้ | เข้าห้องด้วย code (เฉพาะ status lobby/result; ถ้าเคยอยู่แล้ว = rejoin), ≤ 10 คน, จัดสีว่างให้ |
| `update-settings` | host | แก้ mode / cards_per_player / categories ตอน lobby |
| `start-round` | host | สุ่มหัวข้อ (ไม่ซ้ำกับที่ใช้ไปในห้องนี้), status → `choosing_theme` |
| `vote-reroll` | ผู้เล่น | toggle โหวต; เกินครึ่ง & rerolls < 2 → สุ่มใหม่ |
| `confirm-theme` | host | **แจกการ์ด**: สุ่ม `n × players` เลขไม่ซ้ำจาก 1–100 ด้วย `crypto.getRandomValues`, insert `hands` + `board_cards` (position null), status → `placing` |
| `lock` | ผู้เล่น | ตั้ง `locked` (ต้องวางครบทุกใบ) ; ถ้าล็อกครบทุกคน → status `revealing` และเริ่ม reveal |
| `reveal-next` | host client เรียกทุก ~900ms (หรือ `reveal-all`) | เปิดใบถัดไปตามลำดับ position: copy `value` → `revealed_value`, คำนวณ `is_wrong`; ใบสุดท้าย → คำนวณผล, หักหัวใจ (levelup), status → `result` หรือ `game_over` |
| `next-round` | host | levelup: ผ่าน → level+1 (cards_per_player = level); round+1, reset locked/reroll, ลบการ์ดรอบเก่า, → `choosing_theme` |
| `back-to-lobby` / `kick` / `transfer-host` | host | จัดการห้อง |

> `reveal-next` ต้อง idempotent (ส่ง `expected_index` มาด้วย กันกดซ้ำ) และถ้า host หลุดระหว่าง reveal ให้ host ใหม่เรียกต่อได้

### 4.5 Realtime
- Subscribe **Postgres Changes** ของ `rooms`, `players`, `board_cards` filter `room_id=eq.{id}` → อัปเดต Zustand store
- ใช้ **Presence** channel `room:{id}` สำหรับสถานะออนไลน์ (ไม่เขียนลง DB)
- ใช้ **Broadcast** สำหรับสิ่งชั่วคราวที่ไม่ต้องเก็บ: ตำแหน่งการ์ดระหว่างกำลังลาก (ghost preview ให้คนอื่นเห็นแบบลื่นๆ, throttle 50ms) — ค่าจริงยังบันทึกผ่าน `move_card` ตอนปล่อยนิ้ว
- **Optimistic update**: การ์ดขยับบนจอตัวเองทันที, ถ้า RPC fail ค่อย rollback + toast
- เมื่อ reconnect: refetch snapshot ทั้งห้อง (room + players + board + hand ของฉัน) แล้วค่อยฟัง event ต่อ

### 4.6 Host migration
- ถ้า host ไม่อยู่ใน Presence > 20 วิ → client ที่ seat ต่ำสุดที่ออนไลน์เรียก `transfer-host` (ฟังก์ชันตรวจซ้ำว่า host หายจริง)

---

## 5. โครงโปรเจกต์

```
ito/
├─ CLAUDE.md                 # สรุปกฎสั้นๆ จากไฟล์นี้ (ข้อ 0, 2.7, 4.3)
├─ ITO_PLAN.md               # ไฟล์นี้
├─ index.html
├─ src/
│  ├─ main.tsx, App.tsx      # router: /, /r/:code, /how
│  ├─ lib/
│  │  ├─ supabase.ts         # client + anonymous auth bootstrap
│  │  ├─ api.ts              # wrappers เรียก edge functions/RPC (typed)
│  │  ├─ realtime.ts         # subscribe/unsubscribe ห้อง, presence, broadcast
│  │  ├─ fractional.ts       # คำนวณ position ระหว่างสองใบ
│  │  ├─ haptics.ts, sound.ts
│  │  └─ wakeLock.ts         # navigator.wakeLock ระหว่างอยู่ในห้อง
│  ├─ store/roomStore.ts     # Zustand: room, players, board, myHand, presence
│  ├─ screens/               # Home, Lobby, Topic, Play, Reveal, Result, HowTo
│  ├─ components/
│  │  ├─ Card.tsx            # หน้า/หลัง/การ์ด 0, flip
│  │  ├─ HandCard.tsx        # กดค้างดูเลข + ลาก
│  │  ├─ Table.tsx           # แถวการ์ด + เส้นด้าย SVG
│  │  ├─ Thread.tsx          # SVG path เชื่อมการ์ด (animate)
│  │  ├─ TopicBar.tsx, StatusLine.tsx, Hearts.tsx
│  │  ├─ PlayerAvatar.tsx, RoomCode.tsx, QRSheet.tsx
│  │  ├─ PrimaryButton.tsx, Sheet.tsx, Toast.tsx
│  │  └─ RuleChips.tsx
│  ├─ data/themes.ts         # คลังหัวข้อ (ดูข้อ 7)
│  └─ styles/index.css       # tokens ข้อ 2.1, fonts, texture
├─ supabase/
│  ├─ migrations/0001_init.sql, 0002_rls.sql, 0003_rpc.sql
│  ├─ functions/<ชื่อ>/index.ts
│  └─ tests/rls.test.ts
└─ vite.config.ts            # vite-plugin-pwa (manifest: name "ito", theme #E0393E, bg #F5EFE4)
```

Packages: `react react-dom react-router-dom @supabase/supabase-js zustand motion @dnd-kit/core @dnd-kit/sortable qrcode.react nanoid` + dev: `tailwindcss @tailwindcss/vite vite-plugin-pwa typescript vitest`

---

## 6. ลำดับการพัฒนา + Acceptance Criteria

### เฟส 0 — Setup & Design system
- Vite+TS+Tailwind v4, fonts, tokens ข้อ 2.1 (light/dark), texture, `PrimaryButton`, `Sheet`, `Card` (หน้า/หลัง/0 + flip), หน้า `/dev/ui` โชว์ component ทั้งหมด
- ✅ เปิดบนมือถือจริง (iPhone Safari + Android Chrome) ผ่าน LAN: การ์ดพลิกลื่น 60fps, ไม่มี horizontal scroll, dark mode ถูก

### เฟส 1 — ห้อง & Lobby
- Supabase project, migrations, RLS, anonymous auth, `create-room`, `join-room`, `update-settings`, Presence, QR + share, deep link `/r/:code`, rejoin, wake lock
- ✅ 3 เครื่องเข้าห้องเดียวกันได้ เห็นรายชื่อ/สถานะออนไลน์ตรงกันภายใน 1 วิ
- ✅ ล็อกจอ 1 นาทีแล้วเปิดกลับมา → กลับเข้าห้องเดิมอัตโนมัติ
- ✅ ปิดแท็บ host → host ย้ายไปคนถัดไป

### เฟส 2 — Core loop (Classic)
- `start-round`, `vote-reroll`, `confirm-theme`, TopicBar, Hand (กดค้างดู/พิมพ์คำใบ้/ลาก), Table (fractional position, ghost drag ผ่าน broadcast), `move_card`, `set_clue`, `lock`
- ✅ **RLS test ผ่าน**: user B มองไม่เห็นเลขของ A ทั้งจาก query ตรงและ realtime payload
- ✅ สลับแอป/ล็อกจอ ขณะกดดูเลข → เลขหายทันที
- ✅ ขยับการ์ดหลังทุกคนล็อก → ล็อกถูก reset ทุกคน และ status line อัปเดต
- ✅ 6 คนลากพร้อมกัน ตำแหน่งสุดท้ายตรงกันทุกเครื่อง

### เฟส 3 — Reveal & Result
- `reveal-next`/`reveal-all`, Thread animation, เสียง, haptics, Result list, `next-round`, `back-to-lobby`
- ✅ ทุกเครื่องเห็นการพลิกใบเดียวกันห่างกันไม่เกิน ~300ms
- ✅ ตัดสินถูก/ผิดตรงกฎข้อ 1.1.8 (เขียน unit test ของฟังก์ชันตัดสิน: ลำดับถูกหมด, ผิด 1 ใบกลางแถว, ใบแรกสูงมาก ฯลฯ)
- ✅ host หลุดกลาง reveal → host ใหม่เปิดต่อได้ ไม่เปิดซ้ำ

### เฟส 4 — Level Up, หัวข้อ, PWA, ขัดเงา
- โหมด Level Up (ข้อ 1.2), Hearts, Game Over, หมวดหัวข้อ + หัวข้อกำหนดเอง (host พิมพ์ชื่อ + ปลายสเกล 2 ฝั่ง), HowTo, PWA installable, ปุ่มเสียง, reduced motion
- ✅ Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, PWA installable
- ✅ ทดสอบเล่นจริงกับเพื่อน 4–8 คน 3 รอบติด โดยไม่มีใครถามว่า "ตอนนี้ต้องทำอะไร"

---

## 7. คลังหัวข้อเริ่มต้น (`src/data/themes.ts`)

รูปแบบ: `{ id, category, title, low, high }` — `low` = ความหมายของ 1, `high` = ความหมายของ 100

**general — ทั่วไป**
1. ของกินที่อยากกินหลังเลิกงาน · ไม่อยากเลย → อยากสุดๆ
2. ความแพงของของที่ซื้อแล้วเสียดาย · ถูกมาก → แพงหูฉี่
3. ความน่ากลัวของสถานที่ · ไม่น่ากลัว → กลัวจนไม่กล้าไป
4. ความแข็งแรงของสัตว์ · อ่อนแอ → แข็งแกร่งสุดๆ
5. ความดังของคนดัง · ไม่มีใครรู้จัก → ระดับโลก
6. ความอร่อยของเมนูร้านสะดวกซื้อ · ไม่อร่อย → อร่อยมาก
7. ความน่ารักของสิ่งต่างๆ · ไม่น่ารัก → น่ารักจนละลาย
8. ความยากของงานบ้าน · ง่ายมาก → ยากที่สุด
9. ขนาดของสิ่งของ · เล็กจิ๋ว → ใหญ่มหึมา
10. ความเผ็ดของอาหาร · ไม่เผ็ดเลย → เผ็ดจนน้ำตาไหล
11. สถานที่เที่ยวที่อยากไป · ไม่อยากไป → อยากไปที่สุด
12. ความสำคัญของของที่ต้องพกออกจากบ้าน · ไม่จำเป็น → ขาดไม่ได้
13. ความมีประโยชน์ของพลังพิเศษ · ไร้ประโยชน์ → โคตรเทพ
14. อาชีพที่อยากลองทำ · ไม่อยากเลย → อยากทำที่สุด
15. ความหวานของขนม · จืด → หวานเจี๊ยบ

**friends — วงเพื่อน**
16. ความโสดของนิสัย · มีแฟนแน่นอน → โสดถาวร
17. ข้ออ้างตอนมาสาย · ไม่มีใครเชื่อ → น่าเชื่อสุดๆ
18. ความเกรียนของการกระทำ · สุภาพมาก → เกรียนขั้นสุด
19. สิ่งที่ทำตอนเมา · ปกติ → ลืมไม่ลงทั้งชีวิต
20. ความน่าอายของเหตุการณ์ · เฉยๆ → อยากแทรกแผ่นดินหนี
21. เมนูที่เหมาะกับวงเหล้า · ไม่เข้า → เข้ากันที่สุด
22. ความจำเป็นของแอปในมือถือ · ลบได้เลย → ขาดไม่ได้

**family — ครอบครัว/เด็กเล่นได้**
23. สัตว์ที่อยากเลี้ยง · ไม่อยากเลี้ยง → อยากเลี้ยงที่สุด
24. ความเร็วของยานพาหนะ · ช้ามาก → เร็วสุดๆ
25. ความหนาวของสถานที่ · ร้อน → หนาวจัด
26. ความสนุกของกิจกรรมวันหยุด · น่าเบื่อ → สนุกสุดๆ
27. ผลไม้ที่ชอบ · ไม่ชอบ → ชอบที่สุด

**action — ต้องทำท่า/ทำเสียงประกอบคำใบ้**
28. ความดังของเสียงสัตว์ (ทำเสียงประกอบ) · เบามาก → ดังสุดๆ
29. ท่าเต้นที่ดูเท่ (ทำท่าประกอบ) · ไม่เท่ → เท่ที่สุด
30. ความเจ็บของอุบัติเหตุ (แสดงสีหน้า) · ไม่เจ็บ → เจ็บสุดๆ

(Claude Code: เพิ่มให้ครบอย่างน้อย 25 ข้อต่อหมวด ในสไตล์เดียวกัน ภาษาไทยเป็นกันเอง ปลายสเกลต้องชัดและเป็นสเกลเดียว)

---

## 8. Edge cases ที่ต้องจัดการ
- ห้องร้าง > 6 ชม. → ลบอัตโนมัติ (pg_cron) ; code ว่างกลับมาใช้ได้
- ชื่อซ้ำในห้อง → ต่อท้ายเลข "บอส 2"
- ผู้เล่นออกระหว่าง `placing` → การ์ดของเขาถูกลบออกจากรอบ (แจ้ง toast) ; ระหว่าง `revealing` → การ์ดยังอยู่
- ผู้เล่นใหม่เข้าระหว่างรอบ → รอที่หน้า "รอรอบถัดไป" (spectator เห็นโต๊ะแบบคว่ำ)
- เลขไม่พอ (levelup: players × level > 100) → จบเกมแบบชนะ "ร้อยด้ายครบทั้งสำรับ!"
- เน็ตหลุด → แถบด้านบน "กำลังเชื่อมต่อใหม่…" + ปิดการกระทำที่ต้องใช้เน็ตชั่วคราว
- กันการซูมหน้าจอโดยไม่ตั้งใจตอนลาก (`touch-action: none` เฉพาะการ์ด ไม่ล็อก zoom ทั้งหน้า)

---

## 9. Prompt แรกที่แนะนำให้ส่งใน Claude Code

```
อ่าน ITO_PLAN.md ทั้งหมด แล้วสร้าง CLAUDE.md สรุปกฎสำคัญ (ข้อ 0, 2.7, 4.3)
จากนั้นเริ่มเฟส 0 ตามแผน ทำให้ผ่าน Acceptance Criteria ของเฟส 0 แล้วหยุดรอให้ฉันทดสอบบนมือถือก่อนไปเฟส 1 แต่ละการทำ commit ให้ฉันด้วยนะ ไม่ต้องใส่claude co author จัดการ
```
