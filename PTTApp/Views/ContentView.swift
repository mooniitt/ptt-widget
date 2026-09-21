import SwiftUI
import WidgetKit

/// iOS 主 App 流量仪表盘视图
public struct ContentView: View {
    @State private var accounts: [AccountTraffic] = []
    @State private var isLoading: Bool = false
    @State private var showSettings: Bool = false
    @State private var errorMessage: String? = nil
    
    public init() {}
    
    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if isLoading && accounts.isEmpty {
                        ProgressView("正在同步订阅数据...")
                            .padding(.top, 40)
                    } else if accounts.isEmpty {
                        emptyStateView
                    } else {
                        // 账号卡片列表
                        ForEach(accounts) { acc in
                            accountDetailCard(acc: acc)
                        }
                        
                        // 底部时间与刷新提示
                        footerView
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("PTT 流量监控")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        Task { await refreshData() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(isLoading)
                }
                
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape.fill")
                    }
                }
            }
            .sheet(isPresented: $showSettings, onDismiss: {
                Task { await refreshData() }
            }) {
                SettingsView()
            }
            .refreshable {
                await refreshData()
            }
            .task {
                accounts = StorageManager.shared.loadAccountsCache()
                await refreshData()
            }
        }
    }
    
    // MARK: - 账号详情全景卡片
    
    @ViewBuilder
    private func accountDetailCard(acc: AccountTraffic) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            // 卡片头部
            HStack {
                HStack(spacing: 6) {
                    Text(acc.accountTag)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2.5)
                        .background(Color.blue)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                    
                    Text(acc.planName)
                        .font(.system(size: 15, weight: .bold))
                        .lineLimit(1)
                }
                
                Spacer()
                
                Text("\(acc.resetDaysLeft) 天后重置")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.blue)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.blue.opacity(0.1))
                    .clipShape(Capsule())
            }
            
            Divider()
            
            // 核心指标行
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("剩余可用")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                    HStack(spacing: 2) {
                        Text("\(acc.remainingGB, specifier: "%.2f")")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundStyle(acc.isWarning ? .red : .green)
                        Text("GB")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(acc.isWarning ? .red : .green)
                    }
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 3) {
                    Text("已用: \(acc.usedGB, specifier: "%.2f") GB / \(acc.totalGB, specifier: "%.0f") GB")
                        .font(.system(size: 12, weight: .medium))
                    Text("使用率: \(acc.usedPercent)% · 到期: \(acc.expireDateStr)")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
            }
            
            // 渐变进度条
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color(uiColor: .systemGray5))
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: acc.isWarning ? [.orange, .red] : [.green, .mint],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * CGFloat(min(1.0, Double(acc.usedPercent) / 100.0)))
                }
            }
            .frame(height: 7)
            
            // 周期热力图板块
            if let daily = acc.dailyStats {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Label("周期每日用量分布", systemImage: "calendar")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("今日已用: \(daily.todayGB, specifier: "%.2f") GB")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(daily.isTodayWarning ? .red : .secondary)
                    }
                    
                    SwiftUIHeatmapView(stats: daily, compact: false, cellSize: 13.0, cellGap: 3.5)
                        .padding(.vertical, 4)
                }
                .padding(10)
                .background(Color(uiColor: .tertiarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding(14)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)
    }
    
    // MARK: - 辅助视图
    
    private var emptyStateView: some View {
        VStack(spacing: 12) {
            Image(systemName: "antenna.radiowaves.left.and.right.slash")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
            Text("暂未获取到订阅数据")
                .font(.system(size: 16, weight: .bold))
            Text("请点击右上角设置，检查并添加你的订阅 Token。")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("前往配置 Token") {
                showSettings = true
            }
            .buttonStyle(.borderedProminent)
            .padding(.top, 8)
        }
        .padding(32)
    }
    
    private var footerView: some View {
        HStack {
            Text("最近同步: \(Date(), style: .time)")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
            Spacer()
            HStack(spacing: 4) {
                Circle()
                    .fill(Color.green)
                    .frame(width: 6, height: 6)
                Text("桌面小组件已就绪")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 4)
    }
    
    // MARK: - 数据刷新
    
    private func refreshData() async {
        isLoading = true
        let newAccounts = await SubscriptionService.shared.fetchAllAccounts()
        accounts = newAccounts
        WidgetCenter.shared.reloadAllTimelines()
        isLoading = false
    }
}
