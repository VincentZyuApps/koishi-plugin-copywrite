import { describe, expect, it } from 'vitest'

import type { Session } from 'koishi'

import {
  applyPassiveRef,
  DEFAULT_BUTTON_ROWS,
  normalizeQQOpenid,
  pickRandomType,
  QQButtonsConfigError,
  QQ_BUTTONS_HINT,
  resolveCopywriteRows,
  stringifyCompact,
  type QQMessagePayload,
} from '../src/qq'
import type { PatternEntry } from '../src/types'

function entry(name: string, keywords = 1): PatternEntry {
  return {
    rawName: name,
    name: name.toLowerCase(),
    category: 'Test',
    source: `/tmp/${name}.yaml`,
    examples: ['example'],
    model: 'gpt-4o-mini',
    addition: '',
    keywords,
  }
}

function session(overrides: Record<string, unknown> = {}): Session {
  return {
    platform: 'qq',
    isDirect: false,
    channelId: 'group-openid',
    messageId: 'message-1',
    timestamp: Date.now(),
    seq: 0,
    ...overrides,
  } as unknown as Session
}

const vars = { commandName: 'copywrite', randomType: '恩情' }

describe('pickRandomType', () => {
  it('只从单关键词模板里挑', () => {
    const entries = [entry('单条'), entry('多词', 2)]
    expect(pickRandomType(entries, undefined, () => 0.99)).toBe('单条')
  })

  it('优先避开当前模板', () => {
    const entries = [entry('甲'), entry('乙')]
    expect(pickRandomType(entries, '甲', () => 0)).toBe('乙')
  })

  it('只有一个候选时允许重复当前模板', () => {
    expect(pickRandomType([entry('甲')], '甲', () => 0)).toBe('甲')
  })

  it('没有单关键词模板时返回 undefined', () => {
    expect(pickRandomType([entry('多词', 2)])).toBeUndefined()
    expect(pickRandomType([])).toBeUndefined()
  })
})

describe('resolveCopywriteRows', () => {
  it('默认 JSON 会替换命令名与随机类型', () => {
    const rows = resolveCopywriteRows(stringifyCompact(DEFAULT_BUTTON_ROWS), vars)
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].buttons).toHaveLength(2)

    const [help, retry] = rows.rows[0].buttons
    expect(help.render_data.label).toBe('查看文案')
    expect(help.render_data.style).toBe(0)
    expect(help.action).toMatchObject({
      type: 2,
      permission: { type: 2 },
      data: 'copywrite',
      enter: true,
      reply: false,
    })

    expect(retry.render_data.style).toBe(1)
    expect(retry.action).toMatchObject({
      type: 2,
      permission: { type: 2 },
      data: 'copywrite 恩情 请输入你的主题',
      enter: false,
      reply: false,
    })
  })

  it('只替换 commandName 与 randomType，其它变量保持原样', () => {
    const template = JSON.stringify({
      rows: [
        {
          buttons: [
            {
              id: 'x',
              render_data: { label: '测试', visited_label: '测试', style: 0 },
              action: {
                type: 2,
                permission: { type: 2 },
                data: '${commandName} ${userId}',
                enter: false,
                reply: false,
              },
            },
          ],
        },
      ],
    })

    const rows = resolveCopywriteRows(template, vars)
    expect(rows.rows[0].buttons[0].action.data).toBe('copywrite ${userId}')
  })

  it('兼容 { content: { rows } } 写法', () => {
    const template = JSON.stringify({
      content: {
        rows: [
          {
            buttons: [
              {
                id: 'x',
                render_data: { label: '测试', visited_label: '测试', style: 0 },
                action: {
                  type: 2,
                  permission: { type: 2 },
                  data: '${commandName}',
                  enter: false,
                  reply: false,
                },
              },
            ],
          },
        ],
      },
    })

    expect(resolveCopywriteRows(template, vars).rows).toHaveLength(1)
  })

  it('空串与纯空白直接报错，不回退默认值', () => {
    expect(() => resolveCopywriteRows('', vars)).toThrow(QQButtonsConfigError)
    expect(() => resolveCopywriteRows('   \n ', vars)).toThrow(
      QQButtonsConfigError,
    )
  })

  it('非法 JSON 直接报错', () => {
    expect(() => resolveCopywriteRows('{ rows: ', vars)).toThrow(
      QQButtonsConfigError,
    )
  })

  it('缺少 rows 或按钮字段不完整时直接报错', () => {
    expect(() => resolveCopywriteRows('{"buttons":[]}', vars)).toThrow(
      QQButtonsConfigError,
    )
    expect(() =>
      resolveCopywriteRows(
        '{"rows":[{"buttons":[{"render_data":{"label":"测试"}}]}]}',
        vars,
      ),
    ).toThrow(QQButtonsConfigError)
  })

  it('按钮文字超过 10 个字符时直接报错', () => {
    const template = JSON.stringify({
      rows: [
        {
          buttons: [
            {
              id: 'x',
              render_data: {
                label: '这是一个超过十个字符的按钮',
                visited_label: 'x',
                style: 0,
              },
              action: {
                type: 2,
                permission: { type: 2 },
                data: 'x',
                enter: false,
                reply: false,
              },
            },
          ],
        },
      ],
    })

    expect(() => resolveCopywriteRows(template, vars)).toThrow(
      /超过 10 个字符/,
    )
  })

  it('按钮消息使用标题 + 引用块 + 蓝字链接', () => {
    expect(QQ_BUTTONS_HINT).toContain('## 还想来点什么文案？')
    expect(QQ_BUTTONS_HINT).toContain('> 你说的对')
    expect(QQ_BUTTONS_HINT).toContain(
      '[Yan 自主研发的一款nonebot 插件](https://github.com/Yan-Zero/nonebot-plugin-copywrite)',
    )
  })
})

describe('QQ passive reply', () => {
  it('单聊去掉 private: 前缀', () => {
    expect(normalizeQQOpenid('private:ABC')).toBe('ABC')
    expect(normalizeQQOpenid('ABC')).toBe('ABC')
  })

  it('5 分钟内补上 msg_id 并递增 msg_seq', () => {
    const s = session({ seq: 0 })
    const first: QQMessagePayload = {}
    applyPassiveRef(s, first)
    expect(first.msg_id).toBe('message-1')
    expect(first.msg_seq).toBe(1)

    const second: QQMessagePayload = {}
    applyPassiveRef(s, second)
    expect(second.msg_seq).toBe(2)
  })

  it('过期后不补 msg_id', () => {
    const s = session({
      timestamp: Date.now() - 10 * 60 * 1000,
      qq: undefined,
      event: undefined,
    })
    const payload: QQMessagePayload = {}
    applyPassiveRef(s, payload)
    expect(payload.msg_id).toBeUndefined()
    expect(payload.event_id).toBeUndefined()
  })
})
