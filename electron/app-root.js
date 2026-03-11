/**
 * 应用数据根目录（全局唯一配置）
 * 原 ~/.gitManager，现改为 ~/.openultron，所有持久化路径均基于此目录。
 */
const path = require('path')
const os = require('os')

/** 应用数据目录名（位于用户 home 下） */
const APP_ROOT_DIRNAME = '.openultron'

/**
 * 返回应用数据根目录的完整路径，例如 /Users/xxx/.openultron
 */
function getAppRoot() {
  return path.join(os.homedir(), APP_ROOT_DIRNAME)
}

/**
 * 返回根目录下某子路径，例如 getAppRootPath('conversations') => .../conversations
 */
function getAppRootPath(...segments) {
  return path.join(getAppRoot(), ...segments)
}

module.exports = {
  APP_ROOT_DIRNAME,
  getAppRoot,
  getAppRootPath
}
