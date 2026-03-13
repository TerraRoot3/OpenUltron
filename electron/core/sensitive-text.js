function redactSensitiveText(text) {
  if (!text || typeof text !== 'string') return text
  let s = String(text)
  s = s.replace(/(Bearer\s+)[A-Za-z0-9._\-]{8,}/gi, '$1[REDACTED]')
  s = s.replace(/("?(?:api[_-]?key|app[_-]?secret|access[_-]?token|refresh[_-]?token|secret|password|passwd|token)"?\s*:\s*")([^"]+)(")/gi, '$1[REDACTED]$3')
  s = s.replace(/((?:api[_-]?key|app[_-]?secret|access[_-]?token|refresh[_-]?token|secret|password|passwd|token)\s*=\s*)([^\s"'`,;}{]{4,})/gi, '$1[REDACTED]')
  s = s.replace(/((?:x-api-key|authorization)\s*[:=]\s*)([^\s"'`,;}{]{4,})/gi, '$1[REDACTED]')
  s = s.replace(/\bsk-[A-Za-z0-9]{8,}\b/g, 'sk-[REDACTED]')
  s = s.replace(/([?&](?:api[_-]?key|access[_-]?token|token|secret|password)=)([^&\s]+)/gi, '$1[REDACTED]')
  return s
}

module.exports = {
  redactSensitiveText
}

