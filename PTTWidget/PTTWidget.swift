import WidgetKit
import SwiftUI

// MARK: - Timeline Entry

public struct PTTWidgetEntry: TimelineEntry {
    public let date: Date
    public let accounts: [AccountTraffic]
    
    public init(date: Date, accounts: [AccountTraffic]) {
        self.date = date
        self.accounts = accounts
    }
}

// MARK: - Timeline Provider

public struct PTTWidgetProvider: TimelineProvider {
    public init() {}
    
    public func placeholder(in context: Context) -> PTTWidgetEntry {
        let mockAccounts = createMockAccounts()
        return PTTWidgetEntry(date: Date(), accounts: mockAccounts)
    }
    
    public func getSnapshot(in context: Context, completion: @escaping (PTTWidgetEntry) -> Void) {
        let cached = StorageManager.shared.loadAccountsCache()
        let accounts = cached.isEmpty ? createMockAccounts() : cached
        completion(PTTWidgetEntry(date: Date(), accounts: accounts))
    }
    
    public func getTimeline(in context: Context, completion: @escaping (Timeline<PTTWidgetEntry>) -> Void) {
        Task {
            let accounts = await SubscriptionService.shared.fetchAllAccounts()
            let currentDate = Date()
            let entry = PTTWidgetEntry(date: currentDate, accounts: accounts)
            
            // 设定下一次定时刷新 (15 分钟后由 iOS 系统自动唤醒拉取)
            let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: currentDate) ?? currentDate.addingTimeInterval(900)
            let timeline = Timeline(entries: [entry], policy: .after(nextRefresh))
            completion(timeline)
        }
    }
    
    private func createMockAccounts() -> [AccountTraffic] {
        let acc1 = AccountTraffic(
            token: "mock1",
            accountIndex: 0,
            accountTag: "A1",
            email: "user1@demo.com",
            planName: "🥕 200G/月流量套餐",
            totalGB: 200.0,
            usedGB: 116.8,
            remainingGB: 83.2,
            usedPercent: 58,
            resetDaysLeft: 14,
            expireDateStr: "2026-10-01",
            isWarning: false,
            dailyStats: nil,
            isFromCache: true
        )
        let acc2 = AccountTraffic(
            token: "mock2",
            accountIndex: 1,
            accountTag: "A2",
            email: "user2@demo.com",
            planName: "🥕 300G/月流量套餐",
            totalGB: 300.0,
            usedGB: 15.0,
            remainingGB: 285.0,
            usedPercent: 5,
            resetDaysLeft: 9,
            expireDateStr: "2026-10-01",
            isWarning: false,
            dailyStats: nil,
            isFromCache: true
        )
        return [acc1, acc2]
    }
}

// MARK: - Widget Entry View

public struct PTTWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    public let entry: PTTWidgetProvider.Entry
    
    public init(entry: PTTWidgetProvider.Entry) {
        self.entry = entry
    }
    
    public var body: some View {
        Group {
            switch family {
            case .systemSmall:
                SmallWidgetView(accounts: entry.accounts)
            case .systemMedium:
                MediumWidgetView(accounts: entry.accounts)
            case .systemLarge, .systemExtraLarge:
                LargeWidgetView(accounts: entry.accounts)
            @unknown default:
                MediumWidgetView(accounts: entry.accounts)
            }
        }
        .containerBackground(for: .widget) {
            Color(uiColor: .systemBackground)
        }
    }
}

// MARK: - Widget 主体定义

public struct PTTWidget: Widget {
    public let kind: String = "PTTWidget"
    
    public init() {}
    
    public var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PTTWidgetProvider()) { entry in
            PTTWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("PTT 流量监控")
        .description("实时监控订阅流量配额、重置天数与每日贡献热力图")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}
