import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const webRoot = resolve(import.meta.dirname, "..")
const sourcePath = resolve(webRoot, "native-ios/SecureStoragePlugin.swift")
const appDelegatePath = resolve(webRoot, "ios/App/App/AppDelegate.swift")
const storyboardPath = resolve(webRoot, "ios/App/App/Base.lproj/Main.storyboard")

for (const path of [sourcePath, appDelegatePath, storyboardPath]) {
  if (!existsSync(path)) throw new Error(`Required iOS file not found: ${path}`)
}

const begin = "// BEGIN HARNESS SECURE STORAGE"
const end = "// END HARNESS SECURE STORAGE"
const source = readFileSync(sourcePath, "utf8").trim()
const block = `${begin}\n${source}\n${end}`
let appDelegate = readFileSync(appDelegatePath, "utf8")
const beginIndex = appDelegate.indexOf(begin)
const endIndex = appDelegate.indexOf(end)

if ((beginIndex < 0) !== (endIndex < 0) || (beginIndex >= 0 && endIndex < beginIndex)) {
  throw new Error("AppDelegate.swift contains incomplete secure-storage sync markers")
}

if (beginIndex >= 0) {
  appDelegate = appDelegate.slice(0, beginIndex) + block + appDelegate.slice(endIndex + end.length)
} else {
  appDelegate = `${appDelegate.trimEnd()}\n\n${block}\n`
}
writeFileSync(appDelegatePath, appDelegate)

let storyboard = readFileSync(storyboardPath, "utf8")
const controllerPattern = /<viewController\b[^>]*\bcustomClass="(?:CAPBridgeViewController|SecureStorageViewController)"[^>]*>/
const controller = storyboard.match(controllerPattern)?.[0]
if (!controller) throw new Error("Main.storyboard bridge view controller not found")

let updatedController = controller.replace(
  /\bcustomClass="(?:CAPBridgeViewController|SecureStorageViewController)"/,
  'customClass="SecureStorageViewController"'
)
if (/\bcustomModule="[^"]*"/.test(updatedController)) {
  updatedController = updatedController.replace(/\bcustomModule="[^"]*"/, 'customModule="App"')
} else {
  updatedController = updatedController.replace(/>$/, ' customModule="App">')
}
storyboard = storyboard.replace(controller, updatedController)
writeFileSync(storyboardPath, storyboard)
