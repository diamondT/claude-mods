import { describe, expect, test } from 'claude-code/testing'

import { hash, split } from '../hooks/fences'

const DOC = [
  '## Summary',
  '',
  'Orders keep a record of the **approval**.',
  '',
  '```diff',
  ' OrderValidateAndSyncStep (500)',
  '+OrderDiscountApprovalStep (550)',
  '```',
  '',
  '## Evidence',
].join('\n')

const reply = (fence: string, lang = 'markdown') =>
  ['Here is the body:', '', `${fence}${lang}`, DOC, fence, '', 'Want changes?'].join('\n')

describe('split', () => {
  test('plain markdown stays one segment', () => {
    expect(split('# hi\n\n```ts\nconst a = 1\n```')).toEqual([
      { kind: 'md', text: '# hi\n\n```ts\nconst a = 1\n```' },
    ])
  })

  test('a 4-backtick doc holds its 3-backtick fences', () => {
    expect(split(reply('````'))).toEqual([
      { kind: 'md', text: 'Here is the body:\n' },
      { kind: 'doc', id: hash(DOC), body: DOC },
      { kind: 'md', text: '\nWant changes?' },
    ])
  })

  test('a 3-backtick doc holds nested fences that carry a language', () => {
    expect(split(reply('```'))[1]).toEqual({ kind: 'doc', id: hash(DOC), body: DOC })
  })

  test('tildes and the md alias', () => {
    expect(split(reply('~~~', 'md'))[1]).toEqual({ kind: 'doc', id: hash(DOC), body: DOC })
  })

  test('an unclosed doc (still streaming) stays markdown', () => {
    const text = 'intro\n````markdown\n## Summary\n```diff\n+x\n```'
    expect(split(text)).toEqual([{ kind: 'md', text }])
  })

  test('a markdown fence inside another language is not a doc', () => {
    const text = '````text\n```markdown\n# x\n```\n````'
    expect(split(text)).toEqual([{ kind: 'md', text }])
  })
})

const MESSAGE = {
  plugin: 'markdown-cards',
  component: 'AssistantMessage',
  surface: 'terminal',
  props: { text: reply('````'), isFirstOfReply: true },
} as const

test('a doc draws rendered in a card and toggles to raw', async $ => {
  const ui = await $.ui.mount(MESSAGE)
  const key = `toggle-${hash(DOC)}`

  expect((await ui.findAll({ type: 'Markdown' })).map(m => m.text)).toEqual([
    'Here is the body:\n',
    DOC,
    '\nWant changes?',
  ])
  expect((await ui.find({ key }))?.text).toBe('raw')

  await ui.press({ key })

  expect((await ui.find({ type: 'Code' }))?.text).toBe(DOC)
  expect((await ui.find({ key }))?.text).toBe('rendered')
  await ui.unmount()
})

test('a reply with no doc goes to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...MESSAGE, props: { text: '# hi', isFirstOfReply: true } })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})
