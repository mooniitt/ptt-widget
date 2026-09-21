import Foundation

/// 单日热力图网格单元模型
public struct HeatmapCell: Identifiable, Codable, Hashable {
    public var id: String { dateStr }
    public let dateStr: String        // "YYYY-MM-DD"
    public let dayNumber: Int         // 日期数字 (1~31)
    public let trafficGB: Double      // 当天消耗流量 (GB)
    public let level: Int             // 贡献度等级 (0: 无/未来, 1~4: 浅绿到深绿)
    public let isToday: Bool          // 是否为今天
    public let isWarning: Bool        // 是否超过单日预警阈值
    public let isFuture: Bool         // 是否为未来未到日期
    
    public init(
        dateStr: String,
        dayNumber: Int,
        trafficGB: Double,
        level: Int,
        isToday: Bool,
        isWarning: Bool,
        isFuture: Bool
    ) {
        self.dateStr = dateStr
        self.dayNumber = dayNumber
        self.trafficGB = trafficGB
        self.level = level
        self.isToday = isToday
        self.isWarning = isWarning
        self.isFuture = isFuture
    }
}

/// 周期每日用量统计数据
public struct DailyStats: Codable, Hashable {
    public let cycleRangeLabel: String     // 周期标签如 "08/26 - 09/26"
    public let firstDayOfWeek: Int         // 周期起始日星期几 (1: 周日, 2: 周一 ... 7: 周六)
    public let totalDaysInCycle: Int       // 周期总天数 (如 30 或 31)
    public let todayGB: Double             // 今日消耗 GB
    public let cycleTotalGB: Double        // 周期累计消耗 GB
    public let maxGB: Double               // 单日峰值 GB
    public let avgGB: Double               // 日均消耗 GB
    public let isTodayWarning: Bool        // 今日是否超标
    public let isMaxWarning: Bool          // 峰值是否超标
    public let cells: [HeatmapCell]        // 周期内所有天的单元格列表
    
    public init(
        cycleRangeLabel: String,
        firstDayOfWeek: Int,
        totalDaysInCycle: Int,
        todayGB: Double,
        cycleTotalGB: Double,
        maxGB: Double,
        avgGB: Double,
        isTodayWarning: Bool,
        isMaxWarning: Bool,
        cells: [HeatmapCell]
    ) {
        self.cycleRangeLabel = cycleRangeLabel
        self.firstDayOfWeek = firstDayOfWeek
        self.totalDaysInCycle = totalDaysInCycle
        self.todayGB = todayGB
        self.cycleTotalGB = cycleTotalGB
        self.maxGB = maxGB
        self.avgGB = avgGB
        self.isTodayWarning = isTodayWarning
        self.isMaxWarning = isMaxWarning
        self.cells = cells
    }
}

/// 原始 API 返回的流量日志项
public struct RawTrafficLogItem: Codable {
    public let u: Int64
    public let d: Int64
    public let record_at: Int64
    public let server_rate: String?
    public let user_id: Int?
}
