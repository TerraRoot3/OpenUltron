/**
 * 内置浏览器：收藏夹 CRUD / 导入导出；密码列表（明文存 store，与现有行为一致）。
 */

const fs = require('fs')

/**
 * @param {object} deps
 * @param {(ch: string, fn: Function) => void} deps.registerChannel
 * @param {object} deps.store
 * @param {typeof import('electron').dialog} deps.dialog
 * @param {() => import('electron').BrowserWindow | null | undefined} deps.getMainWindow
 * @param {(...args: unknown[]) => void} deps.safeLog
 * @param {(...args: unknown[]) => void} deps.safeError
 */
function registerBrowserFavoritesPasswordsIpc (deps) {
  const { registerChannel, store, dialog, getMainWindow, safeLog, safeError } = deps

  registerChannel('get-browser-favorites', async (event) => {
    try {
      const favorites = store.get('browserFavorites', [])
      return { success: true, favorites }
    } catch (error) {
      console.error('❌ 获取浏览器收藏失败:', error.message)
      return { success: false, message: `获取失败: ${error.message}`, favorites: [] }
    }
  })

  registerChannel('add-browser-favorite', async (event, { title, url, icon }) => {
    try {
      if (!url) {
        return { success: false, message: 'URL 不能为空' }
      }

      const favorites = store.get('browserFavorites', [])

      const existing = favorites.find(fav => fav.url === url)
      if (existing) {
        return { success: false, message: '该网址已收藏' }
      }

      let domain = ''
      try {
        const urlObj = new URL(url)
        domain = urlObj.hostname
      } catch (e) {
        domain = url
      }

      const newFavorite = {
        id: Date.now().toString(),
        title: title || url,
        url,
        domain,
        icon: icon || null,
        createdAt: new Date().toISOString()
      }

      favorites.push(newFavorite)
      store.set('browserFavorites', favorites)

      console.log(`✅ 添加浏览器收藏: ${url}`)
      return { success: true, favorite: newFavorite }
    } catch (error) {
      console.error('❌ 添加浏览器收藏失败:', error.message)
      return { success: false, message: `添加失败: ${error.message}` }
    }
  })

  registerChannel('remove-browser-favorite', async (event, { id }) => {
    try {
      if (!id) {
        return { success: false, message: 'ID 不能为空' }
      }

      const favorites = store.get('browserFavorites', [])
      const index = favorites.findIndex(fav => fav.id === id)

      if (index === -1) {
        return { success: false, message: '收藏不存在' }
      }

      favorites.splice(index, 1)
      store.set('browserFavorites', favorites)

      safeLog(`✅ 删除浏览器收藏: ${id}`)
      return { success: true }
    } catch (error) {
      safeError('❌ 删除浏览器收藏失败:', error.message)
      return { success: false, message: `删除失败: ${error.message}` }
    }
  })

  registerChannel('update-browser-favorite', async (event, { id, title, customColor, icon, sortOrder }) => {
    try {
      if (!id) {
        return { success: false, message: 'ID 不能为空' }
      }

      const favorites = store.get('browserFavorites', [])
      const index = favorites.findIndex(fav => fav.id === id)

      if (index === -1) {
        return { success: false, message: '收藏不存在' }
      }

      if (title !== undefined) {
        favorites[index].title = title || favorites[index].url
      }

      if (customColor !== undefined) {
        favorites[index].customColor = customColor
      }

      if (icon !== undefined) {
        favorites[index].icon = icon
        favorites[index].iconError = false
      }

      if (sortOrder !== undefined) {
        favorites[index].sortOrder = sortOrder
      }

      favorites[index].updatedAt = new Date().toISOString()
      store.set('browserFavorites', favorites)

      safeLog(`✅ 更新浏览器收藏: ${id}`)
      return { success: true, favorite: favorites[index] }
    } catch (error) {
      safeError('❌ 更新浏览器收藏失败:', error.message)
      return { success: false, message: `更新失败: ${error.message}` }
    }
  })

  registerChannel('save-browser-favorites-order', async (event, orderedIds) => {
    try {
      if (!Array.isArray(orderedIds)) {
        return { success: false, message: '排序数据格式错误' }
      }

      const favorites = store.get('browserFavorites', [])

      orderedIds.forEach((id, index) => {
        const favIndex = favorites.findIndex(fav => fav.id === id)
        if (favIndex !== -1) {
          favorites[favIndex].sortOrder = index
        }
      })

      store.set('browserFavorites', favorites)

      safeLog(`✅ 批量更新收藏排序: ${orderedIds.length} 个`)
      return { success: true }
    } catch (error) {
      safeError('❌ 批量更新收藏排序失败:', error.message)
      return { success: false, message: `更新失败: ${error.message}` }
    }
  })

  registerChannel('export-browser-favorites', async (event) => {
    try {
      const favorites = store.get('browserFavorites', [])
      const parent = getMainWindow()

      const result = await dialog.showSaveDialog(parent, {
        title: '导出收藏数据',
        defaultPath: 'browser-favorites.json',
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (result.canceled) {
        return { success: false, message: '用户取消导出' }
      }

      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        favorites: favorites.map(fav => ({
          id: fav.id,
          title: fav.title,
          url: fav.url,
          icon: fav.icon,
          domain: fav.domain,
          customColor: fav.customColor,
          createdAt: fav.createdAt,
          updatedAt: fav.updatedAt
        }))
      }

      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')

      safeLog(`✅ 导出浏览器收藏成功: ${result.filePath}`)
      return { success: true, filePath: result.filePath, count: favorites.length }
    } catch (error) {
      safeError('❌ 导出浏览器收藏失败:', error.message)
      return { success: false, message: `导出失败: ${error.message}` }
    }
  })

  registerChannel('import-browser-favorites', async (event) => {
    try {
      const parent = getMainWindow()
      const result = await dialog.showOpenDialog(parent, {
        title: '导入收藏数据',
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      })

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, message: '用户取消导入' }
      }

      const filePath = result.filePaths[0]

      const fileContent = fs.readFileSync(filePath, 'utf-8')
      const importData = JSON.parse(fileContent)

      if (!importData.favorites || !Array.isArray(importData.favorites)) {
        return { success: false, message: '无效的收藏数据格式' }
      }

      const existingFavorites = store.get('browserFavorites', [])
      const importedFavorites = importData.favorites

      let addedCount = 0
      let updatedCount = 0

      importedFavorites.forEach((importedFav) => {
        const existingIndex = existingFavorites.findIndex(fav => fav.url === importedFav.url)

        if (existingIndex >= 0) {
          existingFavorites[existingIndex] = {
            ...existingFavorites[existingIndex],
            title: importedFav.title || existingFavorites[existingIndex].title,
            icon: importedFav.icon || existingFavorites[existingIndex].icon,
            domain: importedFav.domain || existingFavorites[existingIndex].domain,
            customColor: importedFav.customColor || existingFavorites[existingIndex].customColor,
            updatedAt: new Date().toISOString()
          }
          updatedCount++
        } else {
          const newFavorite = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            title: importedFav.title || importedFav.url,
            url: importedFav.url,
            icon: importedFav.icon || null,
            domain: importedFav.domain || null,
            customColor: importedFav.customColor || null,
            createdAt: importedFav.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }

          if (!newFavorite.domain && newFavorite.url) {
            try {
              const urlObj = new URL(newFavorite.url)
              newFavorite.domain = urlObj.hostname
            } catch (e) {
              newFavorite.domain = '其他'
            }
          }

          existingFavorites.push(newFavorite)
          addedCount++
        }
      })

      store.set('browserFavorites', existingFavorites)

      safeLog(`✅ 导入浏览器收藏成功: 新增 ${addedCount} 个，更新 ${updatedCount} 个`)
      return {
        success: true,
        addedCount,
        updatedCount,
        totalCount: existingFavorites.length
      }
    } catch (error) {
      safeError('❌ 导入浏览器收藏失败:', error.message)
      return { success: false, message: `导入失败: ${error.message}` }
    }
  })

  registerChannel('get-browser-passwords', async (event) => {
    try {
      const passwords = store.get('browserPasswords', [])
      if (passwords.length > 0) {
        const firstPassword = passwords[0]
        console.log('🔐 读取密码数据:', {
          count: passwords.length,
          firstPasswordLength: firstPassword.password ? firstPassword.password.length : 0,
          firstPasswordPreview: firstPassword.password ? firstPassword.password.substring(0, 3) + '...' : 'null',
          firstPasswordType: typeof firstPassword.password
        })
      }
      return { success: true, passwords }
    } catch (error) {
      console.error('❌ 获取浏览器密码失败:', error.message)
      return { success: false, message: `获取失败: ${error.message}`, passwords: [] }
    }
  })

  registerChannel('save-browser-password', async (event, { username, password, domain }) => {
    try {
      if (!username || !password || !domain) {
        return { success: false, message: '用户名、密码和域名不能为空' }
      }

      const passwords = store.get('browserPasswords', [])

      const existingIndex = passwords.findIndex(
        pwd => pwd.domain === domain && pwd.username === username
      )

      const passwordData = {
        id: existingIndex !== -1 ? passwords[existingIndex].id : Date.now().toString(),
        username,
        password,
        domain,
        updatedAt: new Date().toISOString(),
        lastUsed: existingIndex !== -1 ? passwords[existingIndex].lastUsed : null
      }

      console.log('🔐 保存密码数据:', {
        domain,
        username,
        passwordLength: password ? password.length : 0,
        passwordPreview: password ? password.substring(0, 3) + '...' : 'null',
        passwordType: typeof password
      })

      if (existingIndex !== -1) {
        passwordData.createdAt = passwords[existingIndex].createdAt
        passwords[existingIndex] = passwordData
        console.log(`✅ 更新浏览器密码: ${domain} - ${username}`)
      } else {
        passwordData.createdAt = new Date().toISOString()
        passwords.push(passwordData)
        console.log(`✅ 新增浏览器密码: ${domain} - ${username}`)
      }

      store.set('browserPasswords', passwords)

      const savedPasswords = store.get('browserPasswords', [])
      const savedPassword = savedPasswords.find(pwd => pwd.id === passwordData.id)
      if (savedPassword) {
        console.log('🔐 验证保存的密码:', {
          savedPasswordLength: savedPassword.password ? savedPassword.password.length : 0,
          savedPasswordPreview: savedPassword.password ? savedPassword.password.substring(0, 3) + '...' : 'null',
          savedPasswordType: typeof savedPassword.password,
          matches: savedPassword.password === password
        })
      }

      return { success: true }
    } catch (error) {
      console.error('❌ 保存浏览器密码失败:', error.message)
      return { success: false, message: `保存失败: ${error.message}` }
    }
  })

  registerChannel('get-browser-password', async (event, { domain, username }) => {
    try {
      const passwords = store.get('browserPasswords', [])
      const password = passwords.find(
        (pwd) => {
          const domainMatch = pwd.domain === domain || domain.includes(pwd.domain) || pwd.domain.includes(domain)
          if (username) {
            return domainMatch && pwd.username === username
          }
          return domainMatch
        }
      )

      if (password) {
        return {
          success: true,
          username: password.username,
          password: password.password
        }
      }

      return { success: false, message: '未找到匹配的密码' }
    } catch (error) {
      console.error('❌ 获取浏览器密码失败:', error.message)
      return { success: false, message: `获取失败: ${error.message}` }
    }
  })

  registerChannel('update-browser-password-used', async (event, { id }) => {
    try {
      if (!id) {
        return { success: false, message: 'ID 不能为空' }
      }

      const passwords = store.get('browserPasswords', [])
      const index = passwords.findIndex(pwd => pwd.id === id)

      if (index === -1) {
        return { success: false, message: '密码不存在' }
      }

      passwords[index].lastUsed = new Date().toISOString()
      store.set('browserPasswords', passwords)

      console.log(`✅ 更新密码使用时间: ${id}`)
      return { success: true }
    } catch (error) {
      console.error('❌ 更新密码使用时间失败:', error.message)
      return { success: false, message: `更新失败: ${error.message}` }
    }
  })

  registerChannel('clear-browser-passwords', async (event) => {
    try {
      store.set('browserPasswords', [])
      console.log('✅ 已清除所有浏览器密码')
      return { success: true }
    } catch (error) {
      console.error('❌ 清除浏览器密码失败:', error.message)
      return { success: false, message: `清除失败: ${error.message}` }
    }
  })

  registerChannel('delete-browser-password', async (event, { id }) => {
    try {
      if (!id) {
        return { success: false, message: 'ID 不能为空' }
      }

      const passwords = store.get('browserPasswords', [])
      const index = passwords.findIndex(pwd => pwd.id === id)

      if (index === -1) {
        return { success: false, message: '密码不存在' }
      }

      passwords.splice(index, 1)
      store.set('browserPasswords', passwords)

      console.log(`✅ 删除浏览器密码: ${id}`)
      return { success: true }
    } catch (error) {
      console.error('❌ 删除浏览器密码失败:', error.message)
      return { success: false, message: `删除失败: ${error.message}` }
    }
  })

  registerChannel('delete-browser-password-by-domain', async (event, { domain }) => {
    try {
      if (!domain) {
        return { success: false, message: '域名不能为空' }
      }

      const passwords = store.get('browserPasswords', [])
      const beforeCount = passwords.length

      const filtered = passwords.filter(pwd => pwd.domain !== domain)
      const deletedCount = beforeCount - filtered.length

      store.set('browserPasswords', filtered)

      console.log(`✅ 删除域名 ${domain} 的密码: ${deletedCount} 个`)
      return { success: true, deletedCount }
    } catch (error) {
      console.error('❌ 删除域名密码失败:', error.message)
      return { success: false, message: `删除失败: ${error.message}` }
    }
  })
}

module.exports = { registerBrowserFavoritesPasswordsIpc }
