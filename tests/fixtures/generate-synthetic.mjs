// 합성(synthetic) 샘플 파일 생성기. 의존성 없이 Node만으로 실행해요.
//   node tests/fixtures/generate-synthetic.mjs <rpack_map.bin 경로>
// rpack_map.bin은 RisuAI 저장소 src/ts/rpack/rpack_map.bin (AGPL-3.0)
// 형식 근거: src/formats/*.md
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { deflateRawSync, crc32 } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const mapPath = process.argv[2]
if (!mapPath) {
  console.error('usage: node generate-synthetic.mjs <rpack_map.bin>')
  process.exit(1)
}
const map = readFileSync(mapPath)
const encodeMap = map.subarray(0, 256)
const rpack = (buf) => Uint8Array.from(buf, (b) => encodeMap[b])

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'synthetic')
mkdirSync(outDir, { recursive: true })

// 1x1 투명 PNG
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const lorebook = [
  {
    key: '마을, 광장',
    secondkey: '',
    insertorder: 100,
    comment: '마을 소개',
    content: '작은 마을이에요. 광장에는 오래된 분수가 있어요.\n{{char}}는 이곳에서 자랐어요.',
    mode: 'normal',
    alwaysActive: false,
    selective: false,
    extentions: { risu_case_sensitive: false },
    useRegex: false,
    bookVersion: 2,
    id: 'lore-0001',
    unknownFieldForRoundTrip: { keep: true },
  },
  {
    key: '',
    secondkey: '',
    insertorder: 50,
    comment: '세계관',
    content: '항상 활성화되는 세계관 설명.',
    mode: 'constant',
    alwaysActive: true,
    selective: false,
  },
  {
    key: '검, 칼',
    secondkey: '전설',
    insertorder: 80,
    comment: '전설의 검',
    content: '"따옴표", 백슬래시\\, 이모지 🗡️ 테스트.',
    mode: 'normal',
    alwaysActive: false,
    selective: true,
    folder: '',
  },
]

const regex = [
  { comment: '괄호 제거', in: '\\(.*?\\)', out: '', type: 'editdisplay', flag: 'g', ableFlag: true },
]

const trigger = [
  {
    comment: '시작 트리거',
    type: 'start',
    conditions: [],
    effect: [{ type: 'setvar', operator: '=', var: 'visited', value: '1' }],
  },
]

// ---------- lorebook.json ----------
writeFileSync(
  join(outDir, 'sample.lorebook.json'),
  JSON.stringify({ type: 'risu', ver: 1, data: lorebook }),
)

// ---------- risum ----------
function buildRisum(module, assetBlobs) {
  const parts = []
  const u8 = (n) => parts.push(Buffer.from([n]))
  const u32 = (n) => {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(n)
    parts.push(b)
  }
  const main = rpack(Buffer.from(JSON.stringify({ module, type: 'risuModule' }, null, 2), 'utf-8'))
  u8(111)
  u8(0)
  u32(main.length)
  parts.push(Buffer.from(main))
  for (const blob of assetBlobs) {
    const enc = rpack(blob)
    u8(1)
    u32(enc.length)
    parts.push(Buffer.from(enc))
  }
  u8(0)
  return Buffer.concat(parts)
}

const risumModule = {
  name: '샘플 모듈',
  description: '합성 테스트용 모듈',
  lorebook,
  regex,
  trigger,
  id: '00000000-0000-4000-8000-000000000001',
  lowLevelAccess: false,
  assets: [['dot', '', 'png']],
  namespace: '',
}
writeFileSync(join(outDir, 'sample.risum'), buildRisum(risumModule, [png]))

// ---------- charx ----------
function buildZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf-8')
    const comp = deflateRawSync(data)
    const crc = crc32(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0x0800, 6) // UTF-8 이름
    lh.writeUInt16LE(8, 8) // deflate
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(comp.length, 18)
    lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    locals.push(lh, nameBuf, comp)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(8, 10)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(comp.length, 20)
    ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt32LE(offset, 42)
    centrals.push(ch, nameBuf)
    offset += 30 + nameBuf.length + comp.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

// RisuAI 내보내기와 같이: card.json에는 정규식/트리거 없음, 로어북은 양쪽에
const card = {
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: {
    name: '샘플 캐릭터',
    description: '합성 테스트용 캐릭터 설명.\n여러 줄.',
    personality: '',
    scenario: '',
    first_mes: '안녕하세요, {{user}}.',
    mes_example: '',
    creator_notes: '',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: ['두 번째 인사말'],
    character_book: {
      scan_depth: 5,
      token_budget: 2048,
      recursive_scanning: false,
      extensions: { risu_fullWordMatching: false },
      entries: lorebook.map((l) => ({
        keys: l.key.split(',').map((r) => r.trim()),
        secondary_keys: l.selective ? l.secondkey.split(',').map((r) => r.trim()) : undefined,
        content: l.content,
        extensions: { ...(l.extentions ?? {}) },
        enabled: true,
        insertion_order: l.insertorder,
        constant: l.alwaysActive,
        selective: l.selective,
        name: l.comment,
        comment: l.comment,
        case_sensitive: false,
        use_regex: l.useRegex ?? false,
        mode: l.mode ?? 'normal',
        folder: l.folder,
      })),
    },
    tags: ['sample'],
    creator: 'SoleneEditor fixtures',
    character_version: '1',
    extensions: { risuai: { bias: [], viewScreen: 'none', utilityBot: false, lowLevelAccess: false } },
    assets: [{ type: 'icon', uri: 'embeded://assets/icon/image/main.png', name: 'main', ext: 'png' }],
  },
}

const charxModule = {
  name: '샘플 캐릭터 Module',
  description: 'Module for 샘플 캐릭터',
  id: '00000000-0000-4000-8000-000000000002',
  trigger,
  regex,
  lorebook,
}

const charxEntries = [
  { name: 'x_meta/main.json', data: Buffer.from(JSON.stringify({ type: 'PNG' })) },
  { name: 'assets/icon/image/main.png', data: png },
  { name: 'module.risum', data: buildRisum(charxModule, []) },
  { name: 'card.json', data: Buffer.from(JSON.stringify(card, null, 4)) },
]
writeFileSync(join(outDir, 'sample.charx'), buildZip(charxEntries))

// module.risum 없는 charx (다른 앱에서 만든 카드 가정)
const plainCard = structuredClone(card)
writeFileSync(
  join(outDir, 'sample-no-module.charx'),
  buildZip([
    { name: 'card.json', data: Buffer.from(JSON.stringify(plainCard, null, 4)) },
    { name: 'assets/icon/image/main.png', data: png },
  ]),
)

console.log('written to', outDir)
