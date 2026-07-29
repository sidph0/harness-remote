import Capacitor
import Foundation
import Security

@objc(SecureStoragePlugin)
public final class SecureStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureStoragePlugin"
    public let jsName = "SecureStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private let service = "ai.harness.remote.collab"

    private func key(from call: CAPPluginCall) -> String? {
        guard let key = call.getString("key"),
              !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !key.contains("\0") else {
            call.reject("Invalid key")
            return nil
        }
        return key
    }

    private func query(for key: String) -> [CFString: Any] {
        [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key
        ]
    }

    @objc public func get(_ call: CAPPluginCall) {
        guard let key = key(from: call) else { return }
        var query = query(for: key)
        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            call.resolve(["value": NSNull()])
            return
        }
        guard status == errSecSuccess else {
            call.reject("Keychain read failed (\(status))")
            return
        }
        guard let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
            call.reject("Stored value is not valid UTF-8")
            return
        }
        call.resolve(["value": value])
    }

    @objc public func set(_ call: CAPPluginCall) {
        guard let key = key(from: call) else { return }
        guard let value = call.getString("value") else {
            call.reject("Missing value")
            return
        }

        let query = query(for: key)
        let data = Data(value.utf8)
        let updateStatus = SecItemUpdate(
            query as CFDictionary,
            [kSecValueData: data] as CFDictionary
        )
        if updateStatus == errSecSuccess {
            call.resolve()
            return
        }
        guard updateStatus == errSecItemNotFound else {
            call.reject("Keychain update failed (\(updateStatus))")
            return
        }

        var item = query
        item[kSecValueData] = data
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            call.reject("Keychain write failed (\(addStatus))")
            return
        }
        call.resolve()
    }

    @objc public func remove(_ call: CAPPluginCall) {
        guard let key = key(from: call) else { return }
        let status = SecItemDelete(query(for: key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Keychain delete failed (\(status))")
            return
        }
        call.resolve()
    }
}

@objc(SecureStorageViewController)
public final class SecureStorageViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SecureStoragePlugin())
    }
}
