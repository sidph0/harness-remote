import { registerPlugin } from "@capacitor/core"

interface SecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}

const plugin = registerPlugin<SecureStoragePlugin>("SecureStorage")

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    return (await plugin.get({ key })).value
  },
  set(key: string, value: string): Promise<void> {
    return plugin.set({ key, value })
  },
  remove(key: string): Promise<void> {
    return plugin.remove({ key })
  }
}
