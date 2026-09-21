import Foundation

/// 单账号订阅与流量全景实体
public struct AccountTraffic: Identifiable, Codable, Hashable {
    public var id: String { token }
    public let token: String
    public let accountIndex: Int          // 账号序号 0, 1
    public let accountTag: String          // "A1", "A2"
    public let email: String               // 账号邮箱
    public let planName: String            // 套餐名称
    public let totalGB: Double             // 总额度 (GB)
    public let usedGB: Double              // 已用流量 (GB)
    public let remainingGB: Double         // 剩余流量 (GB)
    public let usedPercent: Int            // 使用百分比 (0~100)
    public let resetDaysLeft: Int          // 距离重置天数
    public let expireDateStr: String       // 到期日期 "YYYY-MM-DD"
    public let isWarning: Bool             // 剩余不足 5GB 或用量 > 90%
    public let dailyStats: DailyStats?     // 周期每日统计与热力图数据
    public let isFromCache: Bool           // 是否为离线缓存数据
    public let lastUpdated: Date           // 最近更新时间
    
    public init(
        token: String,
        accountIndex: Int,
        accountTag: String,
        email: String,
        planName: String,
        totalGB: Double,
        usedGB: Double,
        remainingGB: Double,
        usedPercent: Int,
        resetDaysLeft: Int,
        expireDateStr: String,
        isWarning: Bool,
        dailyStats: DailyStats?,
        isFromCache: Bool,
        lastUpdated: Date = Date()
    ) {
        self.token = token
        self.accountIndex = accountIndex
        self.accountTag = accountTag
        self.email = email
        self.planName = planName
        self.totalGB = totalGB
        self.usedGB = usedGB
        self.remainingGB = remainingGB
        self.usedPercent = usedPercent
        self.resetDaysLeft = resetDaysLeft
        self.expireDateStr = expireDateStr
        self.isWarning = isWarning
        self.dailyStats = dailyStats
        self.isFromCache = isFromCache
        self.lastUpdated = lastUpdated
    }
}

// MARK: - 原始 API 解析模型

public struct SubscribeApiResponse: Codable {
    public let data: SubscribeData?
}

public struct SubscribeData: Codable {
    public let plan_id: Int?
    public let token: String?
    public let expired_at: Int64?
    public let u: Int64?
    public let d: Int64?
    public let transfer_enable: Int64?
    public let email: String?
    public let reset_day: Int?
    public let next_reset_at: Int64?
    public let plan: PlanInfo?
}

public struct PlanInfo: Codable {
    public let id: Int?
    public let name: String?
    public let transfer_enable: Int?
}

public struct TrafficLogApiResponse: Codable {
    public let data: [RawTrafficLogItem]?
}
