import SwiftUI

/// 大尺寸桌面小组件视图 (Large) - 全景数据工作台 (彻底消除上下多余留白)
public struct LargeWidgetView: View {
    public let accounts: [AccountTraffic]
    
    public init(accounts: [AccountTraffic]) {
        self.accounts = accounts
    }
    
    public var body: some View {
        if accounts.count > 1 {
            dualAccountsView(acc1: accounts[0], acc2: accounts[1])
        } else if let acc = accounts.first {
            singleAccountView(acc: acc)
        } else {
            emptyView
        }
    }
    
    // MARK: - 双账号全景大组件
    
    private func dualAccountsView(acc1: AccountTraffic, acc2: AccountTraffic) -> some View {
        VStack(spacing: 8) {
            // 1. 顶部状态栏
            HStack {
                Text("流量监控")
                    .font(.system(size: 15, weight: .bold))
                
                Spacer()
                
                let minReset = min(acc1.resetDaysLeft, acc2.resetDaysLeft)
                Text("双账号 · \(minReset)天后重置")
                    .font(.system(size: 10.5, weight: .medium))
                    .foregroundStyle(.blue)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color(uiColor: .systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            
            // 2. 中部指标对比卡片 (左右并列)
            HStack(spacing: 8) {
                metricCard(acc: acc1, tag: "A1")
                metricCard(acc: acc2, tag: "A2")
            }
            
            // 3. 下半部：左右双并排周期热力图 (自适应大网格方块)
            HStack(spacing: 8) {
                heatmapCard(acc: acc1)
                heatmapCard(acc: acc2)
            }
            
            Spacer(minLength: 2)
            
            // 4. 底部状态栏 (彻底杜绝悬空留白)
            HStack {
                Text(Date(), style: .time)
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                
                Spacer()
                
                HStack(spacing: 3) {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 5, height: 5)
                    Text("数据已同步")
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 2)
        .padding(.vertical, 2)
    }
    
    private func metricCard(acc: AccountTraffic, tag: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            // 顶部 A1 标 + 重置天数
            HStack {
                Text(tag)
                    .font(.system(size: 9.5, weight: .bold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(Color(uiColor: .systemGray5))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                
                Spacer()
                
                Text("\(acc.resetDaysLeft)天后重置")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
            
            // 核心剩余大字
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("剩余")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                
                Text("\(acc.remainingGB, specifier: "%.1f")")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(acc.isWarning ? .red : .green)
                
                Text("GB")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(acc.isWarning ? .red : .green)
                
                Spacer()
                
                Text("\(acc.usedPercent)%")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            
            // 进度条
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color(uiColor: .systemGray5))
                    Capsule()
                        .fill(acc.isWarning ? Color.red : Color.green)
                        .frame(width: geo.size.width * CGFloat(min(1.0, Double(acc.usedPercent) / 100.0)))
                }
            }
            .frame(height: 5.5)
            
            // 底部已用与今日统计
            HStack {
                Text("用 \(acc.usedGB, specifier: "%.1f") / \(acc.totalGB, specifier: "%.0f")G")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                
                Spacer()
                
                if let daily = acc.dailyStats {
                    Text("今日 \(daily.todayGB, specifier: "%.1f")G")
                        .font(.system(size: 9))
                        .foregroundStyle(daily.isTodayWarning ? .red : .secondary)
                }
            }
        }
        .padding(9)
        .background(Color(uiColor: .secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 11))
    }
    
    private func heatmapCard(acc: AccountTraffic) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let daily = acc.dailyStats {
                SwiftUIHeatmapView(stats: daily, compact: true, cellSize: 11.5, cellGap: 3.0)
                    .frame(maxWidth: .infinity, alignment: .center)
            } else {
                Spacer()
                Text("暂无当月记录")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                Spacer()
            }
        }
        .padding(8)
        .background(Color(uiColor: .secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 11))
    }
    
    // MARK: - 单账号模式
    
    private func singleAccountView(acc: AccountTraffic) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // 顶部栏
            HStack {
                Text(acc.planName)
                    .font(.system(size: 14, weight: .bold))
                Spacer()
                Text("\(acc.resetDaysLeft) 天后重置")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.blue)
            }
            
            // 核心卡片
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("剩余流量")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                        HStack(spacing: 2) {
                            Text("\(acc.remainingGB, specifier: "%.1f")")
                                .font(.system(size: 26, weight: .bold))
                                .foregroundStyle(acc.isWarning ? .red : .green)
                            Text("GB")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(acc.isWarning ? .red : .green)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("总量 \(acc.totalGB, specifier: "%.0f") GB")
                            .font(.system(size: 11, weight: .medium))
                        Text("已用 \(acc.usedGB, specifier: "%.1f") GB (\(acc.usedPercent)%)")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                    }
                }
                
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color(uiColor: .systemGray5))
                        Capsule()
                            .fill(acc.isWarning ? Color.red : Color.green)
                            .frame(width: geo.size.width * CGFloat(min(1.0, Double(acc.usedPercent) / 100.0)))
                    }
                }
                .frame(height: 6)
            }
            .padding(10)
            .background(Color(uiColor: .secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 11))
            
            // 热力图
            if let daily = acc.dailyStats {
                SwiftUIHeatmapView(stats: daily, compact: false, cellSize: 12.0, cellGap: 3.5)
                    .padding(8)
                    .background(Color(uiColor: .secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 11))
            }
            
            Spacer()
            
            // 底部到期栏
            HStack {
                Text("到期: \(acc.expireDateStr)")
                    .font(.system(size: 9.5))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("正常运行")
                    .font(.system(size: 9.5))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(2)
    }
    
    private var emptyView: some View {
        VStack(spacing: 4) {
            Text("暂无数据")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.red)
            Text("请在 App 中配置 Token")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
        }
    }
}
