import Foundation

/// 订阅与流量统计异步网络服务
public final class SubscriptionService: @unchecked Sendable {
    public static let shared = SubscriptionService()
    
    private let session: URLSession
    
    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 8
        config.timeoutIntervalForResource = 12
        self.session = URLSession(configuration: config)
    }
    
    public var lastError: String?
    
    /// 获取所有指定 Tokens 的账号数据（并发拉取）
    public func fetchAllAccounts(tokens: [String]? = nil) async -> [AccountTraffic] {
        lastError = nil
        let targetTokens = (tokens != nil && !tokens!.isEmpty) ? tokens! : StorageManager.shared.savedTokens
        guard !targetTokens.isEmpty else {
            lastError = "未配置任何 Token"
            return StorageManager.shared.loadAccountsCache()
        }
        
        var results: [AccountTraffic] = []
        var latestErr: String? = nil
        
        await withTaskGroup(of: (Int, AccountTraffic?, Error?).self) { group in
            for (idx, token) in targetTokens.enumerated() {
                group.addTask {
                    do {
                        let acc = try await self.fetchSingleAccount(token: token, index: idx)
                        return (idx, acc, nil)
                    } catch {
                        return (idx, nil, error)
                    }
                }
            }
            
            var indexedResults: [(Int, AccountTraffic)] = []
            for await (idx, acc, err) in group {
                if let acc = acc {
                    indexedResults.append((idx, acc))
                }
                if let err = err {
                    latestErr = err.localizedDescription
                }
            }
            
            // 按原始 Token 顺序重排
            indexedResults.sort { $0.0 < $1.0 }
            results = indexedResults.map { $0.1 }
        }
        
        if results.isEmpty {
            self.lastError = latestErr ?? "网络连接失败或订阅数据解析错误"
            return StorageManager.shared.loadAccountsCache()
        } else {
            StorageManager.shared.saveAccountsCache(results)
            return results
        }
    }
    
    /// 拉取单个账号的完整数据 (订阅信息 + 每日用量统计)
    public func fetchSingleAccount(token: String, index: Int) async throws -> AccountTraffic {
        async let subReq = fetchSubscribeData(token: token)
        async let logReq = fetchTrafficLogs(token: token)
        
        let (subData, logData) = try await (subReq, logReq)
        return parseAccount(sub: subData, logs: logData, token: token, index: index, isFromCache: false)
    }
    
    // MARK: - 底层 HTTP 请求
    
    private func fetchSubscribeData(token: String) async throws -> SubscribeData {
        guard let url = URL(string: "\(AppConfig.subscribeApiUrl)?t=\(Int(Date().timeIntervalSince1970 * 1000))") else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.setValue("application/json, text/plain, */*", forHTTPHeaderField: "accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        request.setValue("https://ptt.ixlmo.com/", forHTTPHeaderField: "referer")
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)", forHTTPHeaderField: "user-agent")
        
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            throw URLError(.badServerResponse)
        }
        
        let apiRes = try JSONDecoder().decode(SubscribeApiResponse.self, from: data)
        guard let sub = apiRes.data else {
            let msg = apiRes.message ?? "订阅数据为空"
            throw NSError(domain: "PTTSubscription", code: 401, userInfo: [NSLocalizedDescriptionKey: msg])
        }
        return sub
    }
    
    private func fetchTrafficLogs(token: String) async throws -> [RawTrafficLogItem] {
        guard let url = URL(string: "\(AppConfig.trafficLogApiUrl)?t=\(Int(Date().timeIntervalSince1970 * 1000))") else {
            return []
        }
        
        var request = URLRequest(url: url)
        request.setValue("application/json, text/plain, */*", forHTTPHeaderField: "accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        request.setValue("https://ptt.ixlmo.com/", forHTTPHeaderField: "referer")
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)", forHTTPHeaderField: "user-agent")
        
        guard let (data, response) = try? await session.data(for: request),
              let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode),
              let apiRes = try? JSONDecoder().decode(TrafficLogApiResponse.self, from: data),
              let logs = apiRes.data else {
            return []
        }
        return logs
    }
    
    // MARK: - 业务逻辑解析与热力图计算
    
    private func parseAccount(
        sub: SubscribeData,
        logs: [RawTrafficLogItem],
        token: String,
        index: Int,
        isFromCache: Bool
    ) -> AccountTraffic {
        let u = sub.u ?? 0
        let d = sub.d ?? 0
        let transferEnable = sub.transfer_enable ?? 0
        
        let totalGB = max(0, bytesToGB(transferEnable))
        let usedGB = max(0, bytesToGB(u + d))
        let remainingGB = max(0, Double(round((totalGB - usedGB) * 100) / 100))
        let usedPercent = totalGB > 0 ? min(100, max(0, Int(round((usedGB / totalGB) * 100)))) : 0
        
        let planName = sub.plan?.name ?? "月度流量套餐"
        let email = sub.email ?? "账号 \(index + 1)"
        let resetDays = calculateResetDays(resetDay: sub.reset_day, nextResetAt: sub.next_reset_at)
        let expireDateStr = formatExpireDate(timestamp: sub.expired_at)
        
        let isLow = remainingGB < 5.0 || usedPercent > 90
        let dailyStats = generateDailyStats(logs: logs, sub: sub)
        
        return AccountTraffic(
            token: token,
            accountIndex: index,
            accountTag: "A\(index + 1)",
            email: email,
            planName: planName,
            totalGB: totalGB,
            usedGB: usedGB,
            remainingGB: remainingGB,
            usedPercent: usedPercent,
            resetDaysLeft: resetDays,
            expireDateStr: expireDateStr,
            isWarning: isLow,
            dailyStats: dailyStats,
            isFromCache: isFromCache
        )
    }
    
    private func bytesToGB(_ bytes: Int64) -> Double {
        let gb = Double(bytes) / (1024.0 * 1024.0 * 1024.0)
        return Double(round(gb * 100) / 100)
    }
    
    private func formatExpireDate(timestamp: Int64?) -> String {
        guard let ts = timestamp, ts > 0 else { return "长期有效" }
        let date = Date(timeIntervalSince1970: TimeInterval(ts))
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
    
    private func calculateResetDays(resetDay: Int?, nextResetAt: Int64?) -> Int {
        let calendar = Calendar.current
        let now = Date()
        
        if let nextReset = nextResetAt, nextReset > 0 {
            let nextDate = Date(timeIntervalSince1970: TimeInterval(nextReset))
            let diff = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: nextDate)).day ?? 0
            if diff >= 0 { return diff }
        }
        
        guard let rDay = resetDay, rDay > 0 && rDay <= 31 else { return 30 }
        let currentDay = calendar.component(.day, from: now)
        
        if rDay > currentDay {
            return rDay - currentDay
        } else if rDay == currentDay {
            return 0
        } else {
            guard let nextMonth = calendar.date(byAdding: .month, value: 1, to: now) else { return 30 }
            var components = calendar.dateComponents([.year, .month], from: nextMonth)
            components.day = min(rDay, calendar.range(of: .day, in: .month, for: nextMonth)?.count ?? 30)
            if let targetDate = calendar.date(from: components) {
                return calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: targetDate)).day ?? 30
            }
            return 30
        }
    }
    
    /// 构建周期热力图数据 (100% 完整复刻原 JS parseDailyStats 逻辑：周期对齐、缺失平摊、防稀释色阶)
    private func generateDailyStats(logs: [RawTrafficLogItem], sub: SubscribeData) -> DailyStats {
        let now = Date()
        let calendar = Calendar.current
        let GB: Double = 1024.0 * 1024.0 * 1024.0
        let totalUsedBytes = Double((sub.u ?? 0) + (sub.d ?? 0))
        
        // 1. 确定计费周期起止时间（以套餐实际重置日期 next_reset_at 为准，对齐 JS）
        var startDate: Date
        var endDate: Date
        
        if let nextReset = sub.next_reset_at, nextReset > 0 {
            var end = Date(timeIntervalSince1970: TimeInterval(nextReset))
            var start = calendar.date(byAdding: .month, value: -1, to: end) ?? end.addingTimeInterval(-30 * 86400)
            while start > now {
                end = start
                start = calendar.date(byAdding: .month, value: -1, to: end) ?? end.addingTimeInterval(-30 * 86400)
            }
            startDate = calendar.startOfDay(for: start)
            endDate = calendar.startOfDay(for: end)
        } else {
            // 降级为当前自然月
            let comp = calendar.dateComponents([.year, .month], from: now)
            startDate = calendar.date(from: comp) ?? now
            endDate = calendar.date(byAdding: .month, value: 1, to: startDate) ?? now
        }
        
        // 周期标签与范围描述（如 "08/26 - 09/26"）
        let mFormatter = DateFormatter()
        mFormatter.dateFormat = "MM/dd"
        let cycleLabel = "\(mFormatter.string(from: startDate)) - \(mFormatter.string(from: endDate))"
        
        // 2. 映射每日流量明细日志
        var logMap: [String: Double] = [:]
        var logSumBytes: Double = 0.0
        let keyFormatter = DateFormatter()
        keyFormatter.dateFormat = "yyyy-MM-dd"
        
        for item in logs {
            guard item.record_at > 0 else { continue }
            let itemDate = Date(timeIntervalSince1970: TimeInterval(item.record_at))
            let key = keyFormatter.string(from: itemDate)
            let bytes = Double((item.u) + (item.d))
            logMap[key, default: 0.0] += bytes
            logSumBytes += bytes
        }
        
        // 3. 构建周期内全部天数序列（从 startDate 到 endDate 前一天）
        var dayItems: [(date: Date, key: String, dayNum: Int, isToday: Bool, isFuture: Bool)] = []
        var cur = startDate
        let todayStr = keyFormatter.string(from: now)
        var missingPastDays: [String] = []
        var pastDaysCount = 0
        
        while cur < endDate {
            let key = keyFormatter.string(from: cur)
            let isToday = (key == todayStr)
            let isFuture = (cur > now && !isToday)
            let dayNum = calendar.component(.day, from: cur)
            
            if !isFuture {
                pastDaysCount += 1
                if logMap[key] == nil {
                    missingPastDays.append(key)
                }
            }
            
            dayItems.append((date: cur, key: key, dayNum: dayNum, isToday: isToday, isFuture: isFuture))
            guard let next = calendar.date(byAdding: .day, value: 1, to: cur) else { break }
            cur = next
        }
        
        // 4. 周期用量对齐：将总已用与日志累加进行精准对齐与自然加权平摊 (对齐 JS)
        let diffBytes = max(0.0, totalUsedBytes - logSumBytes)
        var fillMap: [String: Double] = [:]
        if !missingPastDays.isEmpty && diffBytes > 0 {
            let baseBytes = diffBytes / Double(missingPastDays.count)
            var assigned: Double = 0.0
            let weights: [Double] = [0.88, 1.06, 0.93, 1.12, 0.95, 1.08, 1.00]
            for (idx, k) in missingPastDays.enumerated() {
                if idx == missingPastDays.count - 1 {
                    fillMap[k] = max(0.0, diffBytes - assigned)
                } else {
                    let w = weights[idx % weights.count]
                    let val = round(baseBytes * w)
                    fillMap[k] = val
                    assigned += val
                }
            }
        }
        
        var maxBytes: Double = 0.0
        var todayBytes: Double = 0.0
        var recordedDays: [(date: Date, key: String, dayNum: Int, bytes: Double, gb: Double, isToday: Bool, isFuture: Bool)] = []
        
        for item in dayItems {
            var bytes: Double = 0.0
            if !item.isFuture {
                if let b = logMap[item.key] {
                    bytes = b
                } else if let b = fillMap[item.key] {
                    bytes = b
                }
                if bytes > maxBytes {
                    maxBytes = bytes
                }
                if item.isToday {
                    todayBytes = bytes
                }
            }
            let gb = bytes / GB
            recordedDays.append((date: item.date, key: item.key, dayNum: item.dayNum, bytes: bytes, gb: gb, isToday: item.isToday, isFuture: item.isFuture))
        }
        
        let finalCycleTotalGB = totalUsedBytes / GB
        let avgGB = pastDaysCount > 0 ? (totalUsedBytes / GB / Double(pastDaysCount)) : 0.0
        let maxGB = maxBytes / GB
        let todayGB = todayBytes / GB
        
        // 5. 流量预警判定与标记 (支持单日预警阈值，如超过 10GB)
        let warnThreshold = AppConfig.dailyWarningThresholdGB
        let isTodayWarning = warnThreshold > 0 && todayGB >= warnThreshold
        let isMaxWarning = warnThreshold > 0 && maxGB >= warnThreshold
        
        // 6. GitHub 贡献图精准比例色阶与防稀释基准标尺计算 (解决极端超量日导致常规天色阶全部退化为 Level 1 的关键逻辑)
        let normalMaxGB = warnThreshold > 0 ? min(maxGB, warnThreshold) : maxGB
        let refScale = max(normalMaxGB, avgGB * 1.3, 1.0)
        
        var cells: [HeatmapCell] = []
        for item in recordedDays {
            var level = 0
            if !item.isFuture && item.gb > 0 {
                let ratio = item.gb / refScale
                if ratio <= 0.25 {
                    level = 1
                } else if ratio <= 0.50 {
                    level = 2
                } else if ratio <= 0.75 {
                    level = 3
                } else {
                    level = 4
                }
            }
            let isCellWarning = (!item.isFuture && warnThreshold > 0 && item.gb >= warnThreshold)
            cells.append(HeatmapCell(
                dateStr: item.key,
                dayNumber: item.dayNum,
                trafficGB: Double(round(item.gb * 100) / 100),
                level: level,
                isToday: item.isToday,
                isWarning: isCellWarning,
                isFuture: item.isFuture
            ))
        }
        
        let firstDate = dayItems.first?.date ?? now
        let firstDayOfWeek = calendar.component(.weekday, from: firstDate) // 1 是周日
        
        return DailyStats(
            cycleRangeLabel: cycleLabel,
            firstDayOfWeek: firstDayOfWeek,
            totalDaysInCycle: dayItems.count,
            todayGB: Double(round(todayGB * 100) / 100),
            cycleTotalGB: Double(round(finalCycleTotalGB * 100) / 100),
            maxGB: Double(round(maxGB * 100) / 100),
            avgGB: Double(round(avgGB * 100) / 100),
            isTodayWarning: isTodayWarning,
            isMaxWarning: isMaxWarning,
            cells: cells
        )
    }
    
    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}
