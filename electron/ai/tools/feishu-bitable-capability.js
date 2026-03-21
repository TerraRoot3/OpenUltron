const { requestJson, withTenantToken } = require('../feishu-openapi')

const definition = {
  description: '飞书多维表格(Bitable)能力：列出表、查询记录、新增记录、更新记录。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list_tables', 'list_fields', 'search_records', 'create_record', 'update_record'],
        description: '操作类型'
      },
      app_token: { type: 'string', description: 'Bitable app token' },
      table_id: { type: 'string', description: 'table id' },
      record_id: { type: 'string', description: 'record id（update_record 需要）' },
      view_id: { type: 'string', description: '可选 view id' },
      page_size: { type: 'number', description: '分页大小，默认 100' },
      page_token: { type: 'string', description: '分页 token' },
      filter: { type: 'object', description: 'search_records 过滤条件' },
      sort: {
        type: 'array',
        description: 'search_records 排序条件（飞书 API：每项含 field_name、desc）',
        items: {
          type: 'object',
          properties: {
            field_name: { type: 'string', description: '列字段名' },
            desc: { type: 'boolean', description: '是否降序，默认 false' }
          }
        }
      },
      fields: { type: 'object', description: 'create/update 记录字段对象' }
    },
    required: ['action', 'app_token']
  }
}

function q(params = {}) {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    usp.set(k, String(v))
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

async function execute(args = {}) {
  const action = String(args.action || '').trim()
  const appToken = String(args.app_token || '').trim()
  const tableId = String(args.table_id || '').trim()
  if (!action) return { success: false, error: '缺少 action' }
  if (!appToken) return { success: false, error: '缺少 app_token' }
  const token = await withTenantToken()
  const pageSize = Number.isFinite(Number(args.page_size)) ? Math.max(1, Math.min(500, Number(args.page_size))) : 100

  if (action === 'list_tables') {
    const res = await requestJson({
      method: 'GET',
      path: `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables${q({
        page_size: pageSize,
        page_token: args.page_token || ''
      })}`,
      token
    })
    return { success: true, action, data: res.data || {}, raw: res }
  }

  if (action === 'list_fields') {
    if (!tableId) return { success: false, error: 'list_fields 需要 table_id' }
    const res = await requestJson({
      method: 'GET',
      path: `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields${q({
        page_size: pageSize,
        page_token: args.page_token || '',
        view_id: args.view_id || ''
      })}`,
      token
    })
    return { success: true, action, data: res.data || {}, raw: res }
  }

  if (action === 'search_records') {
    if (!tableId) return { success: false, error: 'search_records 需要 table_id' }
    const res = await requestJson({
      method: 'POST',
      path: `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/search${q({
        page_size: pageSize,
        page_token: args.page_token || ''
      })}`,
      token,
      body: {
        view_id: args.view_id || undefined,
        filter: args.filter || undefined,
        sort: Array.isArray(args.sort) ? args.sort : undefined
      }
    })
    return { success: true, action, data: res.data || {}, raw: res }
  }

  if (action === 'create_record') {
    if (!tableId) return { success: false, error: 'create_record 需要 table_id' }
    if (!args.fields || typeof args.fields !== 'object') return { success: false, error: 'create_record 需要 fields 对象' }
    const res = await requestJson({
      method: 'POST',
      path: `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records`,
      token,
      body: { fields: args.fields }
    })
    return { success: true, action, data: res.data || {}, raw: res }
  }

  if (action === 'update_record') {
    const recordId = String(args.record_id || '').trim()
    if (!tableId) return { success: false, error: 'update_record 需要 table_id' }
    if (!recordId) return { success: false, error: 'update_record 需要 record_id' }
    if (!args.fields || typeof args.fields !== 'object') return { success: false, error: 'update_record 需要 fields 对象' }
    const res = await requestJson({
      method: 'PUT',
      path: `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`,
      token,
      body: { fields: args.fields }
    })
    return { success: true, action, data: res.data || {}, raw: res }
  }

  return { success: false, error: `不支持的 action: ${action}` }
}

module.exports = { definition, execute }

