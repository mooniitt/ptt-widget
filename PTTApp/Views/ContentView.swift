import SwiftUI
import WidgetKit

/// iOS 主 App 流量仪表盘视图 - 搭载高保真骨架屏与流畅交互动效
public struct ContentView: View {
    @State private var accounts: [AccountTraffic] = []
    @State private var isLoading: Bool = false
    @State private var isRotating: Bool = false
    @State private var showSettings: Bool = false
    @State private var errorMessage: String? = nil
    
    public init() {}
    
    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // 同步状态异常横幅 (在有旧缓存时若后台同步报错展示)
                    if let err = errorMessage, !accounts.isEmpty {
                        errorBannerView(error: err)
                    }
                    
                    if isLoading && accounts.isEmpty {
                        // 1. 首次加载：呈现双账号高保真骨架屏 (消除突兀白屏与布局跳跃)
                        VStack(spacing: 16) {
                            SkeletonTrafficCardView()
                            SkeletonTrafficCardView()
                        }
                    } else if accounts.isEmpty {
                        emptyStateView
                    } else {
                        // 2. 真实账号卡片列表 (平滑淡入)
                        ForEach(accounts) { acc in
                            accountDetailCard(acc: acc)
                        }
                        
                        // 3. 底部时间与刷新提示联动
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
                            .font(.system(size: 16, weight: .semibold))
                            .rotationEffect(.degrees(isRotating ? 360 : 0))
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
                let cached = StorageManager.shared.loadAccountsCache()
                if !cached.isEmpty {
                    accounts = cached
                }
                await refreshData()
            }
        }
    }
    
    // MARK: - 账号详情全景卡片
    
    @ViewBuilder
    private func accountDetailCard(acc: AccountTraffic) -> some View {
        let statusColor = TrafficTheme.statusColor(remainingGB: acc.remainingGB, usedPercent: acc.usedPercent)
        
        VStack(alignment: .leading, spacing: 12) {
            // 卡片头部
            HStack {
                HStack(spacing: 6) {
                    TrafficTag(text: acc.accountTag, fontSize: 11, hPad: 6, vPad: 2.5, cornerRadius: 4.0)
                    
                    Text(acc.planName)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(TrafficTheme.primaryText)
                        .lineLimit(1)
                }
                
                Spacer()
                
                TrafficResetBadge(text: "\(acc.resetDaysLeft) 天后重置", fontSize: 11, hPad: 8, vPad: 3, cornerRadius: 6.0)
            }
            
            Divider()
            
            // 核心指标行
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("剩余可用")
                        .font(.system(size: 11))
                        .foregroundStyle(TrafficTheme.secondaryText)
                    HStack(spacing: 2) {
                        Text("\(acc.remainingGB, specifier: "%.2f")")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundStyle(statusColor)
                        Text("GB")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(statusColor)
                    }
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 3) {
                    Text("已用: \(acc.usedGB, specifier: "%.2f") GB / \(acc.totalGB, specifier: "%.0f") GB")
                        .font(.system(size: 12, weight: .medium))
                    Text("使用率: \(acc.usedPercent)% · 到期: \(acc.expireDateStr)")
                        .font(.system(size: 11))
                        .foregroundStyle(TrafficTheme.secondaryText)
                }
            }
            
            // 细胶囊进度条
            TrafficProgressBar(percent: acc.usedPercent, height: 7.0, customColor: statusColor)
            
            // 周期热力图板块
            if let daily = acc.dailyStats {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Label("周期每日用量分布", systemImage: "calendar")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(TrafficTheme.secondaryText)
                        Spacer()
                        Text("今日已用: \(daily.todayGB, specifier: "%.2f") GB")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(daily.isTodayWarning ? TrafficTheme.trafficRed : TrafficTheme.secondaryText)
                    }
                    
                    SwiftUIHeatmapView(stats: daily, compact: false, cellSize: 13.0, cellGap: 3.5)
                        .padding(.vertical, 4)
                }
                .padding(10)
                .background(TrafficTheme.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding(14)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)
    }
    
    // MARK: - 辅助与提示视图
    
    private func errorBannerView(error: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(TrafficTheme.trafficOrange)
            Text("同步提示: \(error)")
                .font(.system(size: 12))
                .foregroundStyle(.primary)
                .lineLimit(1)
            Spacer()
            Button("更新") {
                showSettings = true
            }
            .font(.system(size: 12, weight: .bold))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(TrafficTheme.trafficOrange.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
    
    private var emptyStateView: some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.shield.fill")
                .font(.system(size: 48))
                .foregroundStyle(TrafficTheme.trafficOrange)
            
            Text("无法获取订阅数据")
                .font(.system(size: 17, weight: .bold))
            
            if let err = errorMessage {
                Text(err.contains("未登录") ? "内置的订阅 Token 已过期或失效（服务端提示：未登录或登陆已过期）。\n请在 PTT 官网复制最新的订阅链接粘贴到 App 中。" : "错误详情: \(err)")
                    .font(.system(size: 13))
                    .foregroundStyle(TrafficTheme.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)
            } else {
                Text("请点击下方按钮，添加您的 PTT 订阅链接或 Token。")
                    .font(.system(size: 13))
                    .foregroundStyle(TrafficTheme.secondaryText)
                    .multilineTextAlignment(.center)
            }
            
            Button {
                showSettings = true
            } label: {
                HStack {
                    Image(systemName: "gearshape.fill")
                    Text("前往配置订阅链接 / Token")
                }
                .font(.system(size: 14, weight: .bold))
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .padding(.top, 4)
            
            Text("💡 提示：在机场官网复制完整的订阅链接直接粘贴即可，系统会自动提取 Token。")
                .font(.system(size: 11))
                .foregroundStyle(TrafficTheme.secondaryText)
                .multilineTextAlignment(.center)
                .padding(.top, 8)
        }
        .padding(28)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: Color.black.opacity(0.04), radius: 6, x: 0, y: 2)
    }
    
    private var footerView: some View {
        HStack {
            if isLoading {
                HStack(spacing: 6) {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("正在同步最新订阅数据...")
                        .font(.system(size: 11))
                        .foregroundStyle(TrafficTheme.secondaryText)
                }
            } else {
                Text("最近同步: \(Date(), style: .time)")
                    .font(.system(size: 11))
                    .foregroundStyle(TrafficTheme.secondaryText)
            }
            
            Spacer()
            
            HStack(spacing: 4) {
                Circle()
                    .fill(isLoading ? Color.orange : TrafficTheme.trafficGreen)
                    .frame(width: 6, height: 6)
                Text(isLoading ? "同步中" : "小组件已同步")
                    .font(.system(size: 11))
                    .foregroundStyle(TrafficTheme.secondaryText)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 4)
    }
    
    // MARK: - 数据刷新与交互动效联动
    
    private func refreshData() async {
        isLoading = true
        withAnimation(Animation.linear(duration: 0.85).repeatForever(autoreverses: false)) {
            isRotating = true
        }
        
        let newAccounts = await SubscriptionService.shared.fetchAllAccounts()
        
        withAnimation(.easeInOut(duration: 0.3)) {
            accounts = newAccounts
            errorMessage = SubscriptionService.shared.lastError
            isRotating = false
            isLoading = false
        }
        
        WidgetCenter.shared.reloadAllTimelines()
    }
}
