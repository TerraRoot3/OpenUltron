/**
 * 内置 ffmpeg 工具：使用应用打包的 ffmpeg-static 或系统 PATH 中的 ffmpeg 执行转码/处理。
 * 优先用内置二进制，若内置失败可让模型通过 execute_command 安装或调用系统 ffmpeg。
 */
const { execFile } = require('child_process')
const { promisify } = require('util')
const feishuNotify = require('../feishu-notify')

const execFileAsync = promisify(execFile)

const definition = {
  description: '使用内置 ffmpeg 执行音视频转码或处理。传入参数数组（如 ["-y", "-i", "输入路径", "-c:a", "libopus", "输出路径"]）。优先使用应用内置 ffmpeg，无需系统安装。若本工具报错（如未检测到 ffmpeg），可改用 execute_command 安装系统 ffmpeg 后重试。',
  parameters: {
    type: 'object',
    properties: {
      args: {
        type: 'array',
        items: { type: 'string' },
        description: '传给 ffmpeg 的参数列表，例如 ["-y", "-i", "/path/in.mp3", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "/path/out.opus"]'
      },
      cwd: { type: 'string', description: '可选。工作目录（绝对路径）' },
      timeout: { type: 'number', description: '可选。超时毫秒数，默认 120000' }
    },
    required: ['args']
  }
}

async function execute(args, context = {}) {
  const { args: ffmpegArgs, cwd, timeout = 120000 } = args || {}
  if (!Array.isArray(ffmpegArgs) || ffmpegArgs.length === 0) {
    return { success: false, error: '请提供 args 数组且至少包含一个参数' }
  }

  const ffmpegBin = feishuNotify.resolveFfmpegPath()
  const options = {
    timeout: Math.max(5000, Math.min(600000, Number(timeout) || 120000)),
    maxBuffer: 8 * 1024 * 1024
  }
  if (cwd && String(cwd).trim()) options.cwd = String(cwd).trim()

  try {
    const { stdout, stderr } = await execFileAsync(ffmpegBin, ffmpegArgs, options)
    return {
      success: true,
      stdout: (stdout || '').trim().slice(-2000),
      stderr: (stderr || '').trim().slice(-2000),
      message: 'ffmpeg 执行完成。若未检测到内置 ffmpeg 或需系统版本，可用 execute_command 安装或调用系统 ffmpeg。'
    }
  } catch (e) {
    const stderrTail = String(e?.stderr || e?.message || '').trim().slice(-500)
    const notFound = /not found|enoent|no such file/i.test(stderrTail) || e.code === 'ENOENT'
    return {
      success: false,
      error: notFound
        ? '未检测到 ffmpeg。可改用 execute_command 安装系统 ffmpeg（如 macOS: brew install ffmpeg）后重试。'
        : `ffmpeg 执行失败: ${stderrTail || e.message || String(e)}`
    }
  }
}

module.exports = { definition, execute }
