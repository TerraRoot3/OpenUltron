/**
 * 返回 logo 图片的完整 URL，兼容开发环境（带路由时 ./ 会错）和 Electron 打包（file: 协议）。
 * 开发用 origin + '/logo.png'，打包后用 base + 'logo.png'。
 */
export function useLogoUrl() {
  if (typeof window === 'undefined') {
    return (import.meta.env.BASE_URL || './') + 'logo.png'
  }
  const base = window.location.protocol === 'file:'
    ? (import.meta.env.BASE_URL || './')
    : window.location.origin + '/'
  return base + 'logo.png'
}
