const { requestJson, withTenantToken } = require('../feishu-openapi')

const definition = {
  description: '飞书电子表格(Sheets)能力：读取单元格范围、写入单元格范围。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read_values', 'write_values'],
        description: 'read_values 读取范围；write_values 写入范围。'
      },
      spreadsheet_token: {
        type: 'string',
        description: '电子表格 token'
      },
      range: {
        type: 'string',
        description: '范围，例如 Sheet1!A1:C10'
      },
      values: {
        type: 'array',
        description: '写入二维数组，例如 [[\"姓名\",\"分数\"],[\"张三\",95]]',
        items: { type: 'array', items: {} }
      }
    },
    required: ['action', 'spreadsheet_token', 'range']
  }
}

async function execute(args = {}) {
  const action = String(args.action || '').trim()
  const token = String(args.spreadsheet_token || '').trim()
  const range = String(args.range || '').trim()
  if (!action) return { success: false, error: '缺少 action' }
  if (!token) return { success: false, error: '缺少 spreadsheet_token' }
  if (!range) return { success: false, error: '缺少 range' }
  const tenantToken = await withTenantToken()
  const encodedRange = encodeURIComponent(range)

  if (action === 'read_values') {
    const res = await requestJson({
      method: 'GET',
      path: `/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(token)}/values/${encodedRange}`,
      token: tenantToken
    })
    return { success: true, action, data: res.data || {}, raw: res }
  }

  if (action === 'write_values') {
    if (!Array.isArray(args.values)) return { success: false, error: 'write_values 需要 values 二维数组' }
    const payload = {
      range,
      values: args.values
    }
    const res = await requestJson({
      method: 'PUT',
      path: `/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(token)}/values`,
      token: tenantToken,
      body: {
        valueRange: payload,
        value_range: payload
      }
    })
    return { success: true, action, data: res.data || {}, raw: res }
  }

  return { success: false, error: `不支持的 action: ${action}` }
}

module.exports = { definition, execute }
