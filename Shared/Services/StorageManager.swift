import Foundation

/// App Group 共享存储与缓存管理器
public final class StorageManager: @unchecked Sendable {
    public static let shared = StorageManager()
    
    private let userDefaults: UserDefaults
    private let tokensKey = "user_traffic_tokens"
    private let accountsCacheKey = "accounts_traffic_cache"
    
    private init() {
        // 尝试加载 App Group 共享容器，若在独立开发或调试环境下则回退到 standard
        if let groupDefaults = UserDefaults(suiteName: AppConfig.appGroupId) {
            self.userDefaults = groupDefaults
        } else {
            self.userDefaults = .standard
        }
        
        // 首次初始化默认双账号
        if savedTokens.isEmpty {
            saveTokens(AppConfig.defaultTokens)
        }
    }
    
    // MARK: - Token 管理
    
    public var savedTokens: [String] {
        return userDefaults.stringArray(forKey: tokensKey) ?? []
    }
    
    public func saveTokens(_ tokens: [String]) {
        let cleaned = tokens.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        userDefaults.set(cleaned, forKey: tokensKey)
    }
    
    public func addToken(_ token: String) {
        var current = savedTokens
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty && !current.contains(trimmed) {
            current.append(trimmed)
            saveTokens(current)
        }
    }
    
    public func removeToken(at index: Int) {
        var current = savedTokens
        guard current.indices.contains(index) else { return }
        current.remove(at: index)
        saveTokens(current)
    }
    
    // MARK: - 账号数据快照缓存
    
    public func saveAccountsCache(_ accounts: [AccountTraffic]) {
        guard let data = try? JSONEncoder().encode(accounts) else { return }
        userDefaults.set(data, forKey: accountsCacheKey)
    }
    
    public func loadAccountsCache() -> [AccountTraffic] {
        guard let data = userDefaults.data(forKey: accountsCacheKey),
              let accounts = try? JSONDecoder().decode([AccountTraffic].self, from: data) else {
            return []
        }
        return accounts
    }
}
