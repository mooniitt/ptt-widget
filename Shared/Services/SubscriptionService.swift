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
        guard var components = URLComponents(string: AppConfig.subscribeApiUrl) else {
            throw URLError(.badURL)
        }
        components.queryItems = [URLQueryItem(name: "token", value: token)]
        guard let url = components.url else { throw URLError(.badURL) }
        
        var request = URLRequest(url: url)
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15", forHTTPHeaderField: "User-Agent")
        
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
        guard var components = URLComponents(string: AppConfig.trafficLogApiUrl) else {
            return []
        }
        components.queryItems = [URLQueryItem(name: "token", value: token)]
        guard let url = components.url else { return [] }
        
        var request = URLRequest(url: url)
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15", forHTTPHeaderField: "User-Agent")
        
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
        let dailyStats = generateDailyStats(logs: logs, resetDay: sub.reset_day)
        
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
    
    /// 构建周期热力图数据
    private func generateDailyStats(logs: [RawTrafficLogItem], resetDay: Int?) -> DailyStats {
        let calendar = Calendar.current
        let now = Date()
        let todayStr = formatDate(now)
        
        // 聚合日志：按 "YYYY-MM-DD" 汇总流量
        var dateTrafficMap: [String: Double] = [:]
        for item in logs {
            let recordDate = Date(timeIntervalSince1970: TimeInterval(item.record_at))
            let key = formatDate(recordDate)
            let gb = bytesToGB(item.u + item.d)
            dateTrafficMap[key, default: 0.0] += gb
        }
        
        // 计算周期范围：本月第 1 天到最后 1 天
        let range = calendar.range(of: .day, in: .month, for: now) ?? 1..<31
        let totalDays = range.count
        
        var components = calendar.dateComponents([.year, .month], from: now)
        components.day = 1
        let firstDate = calendar.date(from: components) ?? now
        let firstDayOfWeek = calendar.component(.weekday, from: firstDate) // 1 是周日
        
        let monthFormatter = DateFormatter()
        monthFormatter.dateFormat = "MM/01 - MM/\(totalDays)"
        let cycleLabel = monthFormatter.string(from: now)
        
        var maxTraffic: Double = 0.0
        var totalCycleTraffic: Double = 0.0
        var recordedDaysCount = 0
        
        var dayRecords: [(dateStr: String, dayNum: Int, traffic: Double, isToday: Bool, isFuture: Bool)] = []
        let currentDayNum = calendar.component(.day, from: now)
        
        for day in 1...totalDays {
            components.day = day
            let cellDate = calendar.date(from: components) ?? now
            let dStr = formatDate(cellDate)
            let traffic = dateTrafficMap[dStr] ?? 0.0
            let isToday = (day == currentDayNum)
            let isFuture = (day > currentDayNum)
            
            if !isFuture {
                totalCycleTraffic += traffic
                recordedDaysCount += 1
                if traffic > maxTraffic {
                    maxTraffic = traffic
                }
            }
            
            dayRecords.append((dStr, day, traffic, isToday, isFuture))
        }
        
        let todayGB = dateTrafficMap[todayStr] ?? 0.0
        let avgGB = recordedDaysCount > 0 ? (totalCycleTraffic / Double(recordedDaysCount)) : 0.0
        let isTodayWarning = todayGB >= AppConfig.dailyWarningThresholdGB
        let isMaxWarning = maxTraffic >= AppConfig.dailyWarningThresholdGB
        
        // 计算色阶
        var cells: [HeatmapCell] = []
        for rec in dayRecords {
            var level = 0
            if !rec.isFuture && rec.traffic > 0 {
                if maxTraffic > 0 {
                    let ratio = rec.traffic / maxTraffic
                    if ratio <= 0.25 { level = 1 }
                    else if ratio <= 0.50 { level = 2 }
                    else if ratio <= 0.75 { level = 3 }
                    else { level = 4 }
                } else {
                    level = 1
                }
            }
            let isCellWarning = rec.traffic >= AppConfig.dailyWarningThresholdGB
            cells.append(HeatmapCell(
                dateStr: rec.dateStr,
                dayNumber: rec.dayNum,
                trafficGB: Double(round(rec.traffic * 100) / 100),
                level: level,
                isToday: rec.isToday,
                isWarning: isCellWarning,
                isFuture: rec.isFuture
            ))
        }
        
        return DailyStats(
            cycleRangeLabel: cycleLabel,
            firstDayOfWeek: firstDayOfWeek,
            totalDaysInCycle: totalDays,
            todayGB: Double(round(todayGB * 100) / 100),
            cycleTotalGB: Double(round(totalCycleTraffic * 100) / 100),
            maxGB: Double(round(maxTraffic * 100) / 100),
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
