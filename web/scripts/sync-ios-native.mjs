import { existsSync } from "node:fs"
import { resolve } from "node:path"

const ios = resolve(import.meta.dirname, "../ios")

if (!existsSync(ios)) throw new Error("iOS project not found; run npx cap add ios first")
console.log("Synced iOS native sources and Info.plist")
