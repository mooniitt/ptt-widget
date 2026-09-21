import Foundation

/// 全局基础配置
public enum AppConfig {
    /// 订阅基础 API
    public static let subscribeApiUrl = "https://ptt.ixlmo.com/api/v1/user/getSubscribe"
    
    /// 每日流量统计 API
    public static let trafficLogApiUrl = "https://ptt.ixlmo.com/api/v1/user/stat/getTrafficLog"
    
    /// 默认内置的双账号 Token（首次安装时使用）
    public static let defaultTokens = [
        "f4XTTjtgVDFAUV79FgDp7i2hEF2w7sUvpGiNmeZkce4f55bb", // 账号 1 (200G)
        "ltSOzTIW6LqUNtWGt2Tl89mCkRy53iMUUMvedXtY062087e9"  // 账号 2 (300G)
    ]
    
    /// 单日用量告警阈值 (GB)
    public static let dailyWarningThresholdGB: Double = 10.0
    
    /// App Group 标识符 (主 App 与小组件共享存储)
    public static let appGroupId = "group.com.mooniitt.pttwidget"
    
    /// 缓存过期与刷新间隔 (秒)
    public static let cacheRefreshInterval: TimeInterval = 600
}
