#!/usr/bin/env node
'use strict'

const fs = require('fs')
const http = require('http')
const path = require('path')

function getPort() {
  const port = process.env.GIT_MANAGER_MCP_PORT
  if (!port) {
    throw new Error('GIT_MANAGER_MCP_PORT not set – this MCP server only works inside Git Manager terminal')
  }
  return parseInt(port, 10)
}

// ---- JSON-RPC helpers ----

function jsonrpcResponse(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

function jsonrpcError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })
}

// ---- HTTP bridge caller ----

function callBridge(action, params) {
  return new Promise((resolve, reject) => {
    let port
    try {
      port = getPort()
    } catch {
      return reject(new Error('GitManager app is not running'))
    }

    const body = JSON.stringify({ action, params })
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 3000
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            resolve({ ok: true, raw: data })
          }
        })
      }
    )
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timed out'))
    })
    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error('GitManager app is not running'))
      } else {
        reject(err)
      }
    })
    req.write(body)
    req.end()
  })
}

// ---- Tool definitions ----

const TOOLS = [
  {
    name: 'open_file',
    description: 'Open a file in GitManager code editor',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to open' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'open_diff',
    description: 'Open a file in GitManager code editor in diff mode (compare working copy vs Git HEAD)',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to diff' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'refresh',
    description: 'Refresh GitManager UI (file tree, status, etc.)',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
]

// ---- Tool execution ----

async function executeTool(name, args) {
  try {
    if (name === 'open_file') {
      await callBridge('open_file', { filePath: args.file_path })
      return { content: [{ type: 'text', text: `Opened ${args.file_path}` }] }
    }
    if (name === 'open_diff') {
      await callBridge('open_diff', { filePath: args.file_path })
      return { content: [{ type: 'text', text: `Opened diff for ${args.file_path}` }] }
    }
    if (name === 'refresh') {
      await callBridge('refresh', {})
      return { content: [{ type: 'text', text: 'UI refreshed' }] }
    }
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
  } catch (err) {
    return { content: [{ type: 'text', text: err.message }], isError: true }
  }
}

// ---- MCP protocol handler ----

async function handleMessage(msg) {
  const { id, method, params } = msg

  if (method === 'initialize') {
    return jsonrpcResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'git-manager', version: '1.0.0' }
    })
  }

  if (method === 'notifications/initialized') {
    return null // no response for notifications
  }

  if (method === 'tools/list') {
    return jsonrpcResponse(id, { tools: TOOLS })
  }

  if (method === 'tools/call') {
    const result = await executeTool(params.name, params.arguments || {})
    return jsonrpcResponse(id, result)
  }

  if (method === 'ping') {
    return jsonrpcResponse(id, {})
  }

  return jsonrpcError(id, -32601, `Method not found: ${method}`)
}

// ---- stdio transport ----

let buffer = ''

process.stdin.setEncoding('utf-8')
process.stdin.on('data', async (chunk) => {
  buffer += chunk
  // Process all complete messages (delimited by newlines)
  let newlineIdx
  while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIdx).trim()
    buffer = buffer.slice(newlineIdx + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      const response = await handleMessage(msg)
      if (response) {
        process.stdout.write(response + '\n')
      }
    } catch (err) {
      // Parse error
      const errResp = jsonrpcError(null, -32700, 'Parse error')
      process.stdout.write(errResp + '\n')
    }
  }
})

process.stdin.on('end', () => process.exit(0))
